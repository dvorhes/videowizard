import errno
import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
FONT_PATH = ROOT / "assets/fonts/TikTok_Sans/static/TikTokSans-SemiBold.ttf"
CAPTION_SNAP_TOLERANCE_FRAMES = 5
CAPTION_JOIN_GAP_SECONDS = 0.5
MIN_CAPTION_DURATION_SECONDS = 0.05
JOBS = {}


class SlideshowHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        requested_path = self.path.split("?", 1)[0].split("#", 1)[0]
        if requested_path.startswith("/api/captions/output/"):
            self.send_caption_output(requested_path.rsplit("/", 1)[-1])
            return

        local_path = self.translate_path(requested_path)
        is_app_route = not os.path.splitext(requested_path)[1]
        if is_app_route and requested_path not in ("/", "/index.html") and not os.path.exists(local_path):
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        requested_path = self.path.split("?", 1)[0].split("#", 1)[0]
        if requested_path == "/api/captions/analyze":
            self.analyze_caption_video()
            return
        if requested_path == "/api/captions/create-job":
            self.create_caption_job()
            return
        if requested_path == "/api/captions/render":
            self.render_caption_video()
            return
        self.send_json({"error": "Unknown endpoint."}, status=404)

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def analyze_caption_video(self):
        try:
            job_id, metadata, cut_points, transcript, message = self.prepare_caption_job()
        except RuntimeError as error:
            self.send_json({"error": str(error)}, status=400)
            return
        settings = {}
        settings["fps"] = metadata.get("fps") or 30
        captions = build_captions(transcript["words"], cut_points, settings)

        if captions:
            message = f"Prepared {len(captions)} captions and found {len(cut_points)} cut points."

        self.send_json(
            {
                "job_id": job_id,
                "metadata": metadata,
                "cut_points": cut_points,
                "transcript": transcript,
                "captions": captions,
                "message": message,
            },
        )

    def create_caption_job(self):
        try:
            job_id, metadata, cut_points, _transcript, _message = self.prepare_caption_job(transcribe=False)
        except RuntimeError as error:
            self.send_json({"error": str(error)}, status=400)
            return
        self.send_json(
            {
                "job_id": job_id,
                "metadata": metadata,
                "cut_points": cut_points,
            },
        )

    def prepare_caption_job(self, transcribe=True):
        form = parse_multipart_form(self.headers, self.rfile)
        video_field = form.get("video")
        if video_field is None or not video_field.get("filename"):
            raise RuntimeError("No video file was uploaded.")

        settings = parse_json_field(form.get("settings", {}).get("value"), {}) or {}
        job_id = uuid.uuid4().hex
        job_dir = Path(tempfile.mkdtemp(prefix="video-wizard-captions-"))
        suffix = Path(video_field["filename"]).suffix or ".mp4"
        video_path = job_dir / f"source{suffix}"
        with video_path.open("wb") as output:
            output.write(video_field["content"])

        metadata = probe_video(video_path)
        cut_points = detect_cut_points(video_path)
        transcript, message = transcribe_video(video_path) if transcribe else ({"text": "", "words": []}, "")
        transcript["words"] = normalize_words(transcript.get("words", []))
        metadata["fps"] = metadata.get("fps") or 30
        settings["fps"] = metadata["fps"]

        JOBS[job_id] = {
            "dir": job_dir,
            "video": video_path,
            "metadata": metadata,
            "transcript": transcript,
            "cut_points": cut_points,
        }
        return job_id, metadata, cut_points, transcript, message

    def render_caption_video(self):
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        job_id = payload.get("job_id")
        job = JOBS.get(job_id)
        if not job:
            self.send_json({"error": "Caption job not found. Transcribe the video again."}, status=404)
            return

        captions = payload.get("captions") or []
        if not captions:
            self.send_json({"error": "No captions are available to render."}, status=400)
            return

        output_path = Path(job["dir"]) / "captioned-output.mp4"
        try:
            render_with_ffmpeg(job["video"], output_path, captions)
        except RuntimeError as error:
            self.send_json({"error": str(error)}, status=500)
            return

        self.send_response(200)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Disposition", 'attachment; filename="video-wizard-captions.mp4"')
        self.send_header("Content-Length", str(output_path.stat().st_size))
        self.end_headers()
        with output_path.open("rb") as video:
            shutil.copyfileobj(video, self.wfile)

    def send_caption_output(self, job_id):
        job = JOBS.get(job_id)
        output_path = Path(job["dir"]) / "captioned-output.mp4" if job else None
        if not output_path or not output_path.exists():
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(output_path.stat().st_size))
        self.end_headers()
        with output_path.open("rb") as video:
            shutil.copyfileobj(video, self.wfile)

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def parse_json_field(value, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def parse_multipart_form(headers, rfile):
    content_type = headers.get("Content-Type", "")
    boundary_match = re.search(r"boundary=(?P<boundary>[^;]+)", content_type)
    if not boundary_match:
        return {}

    boundary = boundary_match.group("boundary").strip().strip('"').encode("utf-8")
    length = int(headers.get("Content-Length", "0"))
    body = rfile.read(length)
    form = {}

    for raw_part in body.split(b"--" + boundary):
        part = raw_part.strip(b"\r\n")
        if not part or part == b"--" or b"\r\n\r\n" not in part:
            continue
        header_blob, content = part.split(b"\r\n\r\n", 1)
        header_lines = header_blob.decode("utf-8", errors="replace").split("\r\n")
        disposition = next(
            (line for line in header_lines if line.lower().startswith("content-disposition:")),
            "",
        )
        name_match = re.search(r'name="([^"]+)"', disposition)
        if not name_match:
            continue
        filename_match = re.search(r'filename="([^"]*)"', disposition)
        name = name_match.group(1)
        if filename_match:
            form[name] = {
                "filename": Path(filename_match.group(1)).name,
                "content": content.rstrip(b"\r\n"),
            }
        else:
            form[name] = {"value": content.decode("utf-8", errors="replace").rstrip("\r\n")}
    return form


def run_command(args, timeout=600):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(detail or f"{args[0]} exited with code {result.returncode}.")
    return result


def probe_video(video_path):
    try:
        result = run_command(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height,r_frame_rate,duration",
                "-of",
                "json",
                str(video_path),
            ],
            timeout=60,
        )
        stream = json.loads(result.stdout)["streams"][0]
        fps = parse_fps(stream.get("r_frame_rate"))
        return {
            "width": int(stream.get("width") or 0),
            "height": int(stream.get("height") or 0),
            "fps": fps,
            "duration": float(stream.get("duration") or 0),
        }
    except Exception:
        return {"width": 0, "height": 0, "fps": 30, "duration": 0}


def parse_fps(value):
    if not value or value == "0/0":
        return 30
    if "/" in value:
        numerator, denominator = value.split("/", 1)
        denominator = float(denominator or 1)
        return round(float(numerator) / denominator, 3) if denominator else 30
    return float(value)


def detect_cut_points(video_path):
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-i",
                str(video_path),
                "-filter:v",
                "select='gt(scene,0.35)',showinfo",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )
    except Exception:
        return []

    cut_points = []
    for line in result.stderr.splitlines():
        marker = "pts_time:"
        if marker not in line:
            continue
        value = line.split(marker, 1)[1].split(" ", 1)[0]
        try:
            cut_points.append(round(float(value), 3))
        except ValueError:
            continue
    return sorted(set(cut_points))


def transcribe_video(video_path):
    whisper_path = shutil.which("whisper")
    if not whisper_path:
        return (
            {"text": "", "words": []},
            "No local transcription engine found. Install Whisper locally to generate per-word captions.",
        )

    output_dir = video_path.parent / "transcript"
    output_dir.mkdir(exist_ok=True)
    try:
        run_command(
            [
                whisper_path,
                str(video_path),
                "--model",
                os.environ.get("VIDEO_WIZARD_WHISPER_MODEL", "base"),
                "--output_format",
                "json",
                "--output_dir",
                str(output_dir),
                "--word_timestamps",
                "True",
                "--verbose",
                "False",
            ],
            timeout=3600,
        )
    except RuntimeError as error:
        return {"text": "", "words": []}, f"Transcription failed: {error}"

    json_files = list(output_dir.glob("*.json"))
    if not json_files:
        return {"text": "", "words": []}, "Transcription did not produce a JSON transcript."

    data = json.loads(json_files[0].read_text())
    words = []
    for segment in data.get("segments", []):
        for word in segment.get("words", []):
            words.append(
                {
                    "text": word.get("word", "").strip(),
                    "start": float(word.get("start") or segment.get("start") or 0),
                    "end": float(word.get("end") or segment.get("end") or 0),
                },
            )
    return {"text": data.get("text", "").strip(), "words": words}, "Transcription complete."


def normalize_words(words):
    normalized = []
    for index, word in enumerate(words):
        text = str(word.get("text", "")).strip()
        if not text:
            continue
        start = float(word.get("start") or 0)
        end = float(word.get("end") or start + 0.1)
        normalized.append({"id": f"w{index + 1}", "text": text, "start": start, "end": max(end, start + 0.05)})
    return normalized


def build_captions(words, cut_points, settings):
    if not words:
        return []

    captions = []
    current = []
    for word in words:
        candidate = [*current, word]
        if current and caption_overflows(candidate, settings):
            captions.append(create_caption(current, cut_points, settings))
            current = [word]
        else:
            current = candidate

    if current:
        captions.append(create_caption(current, cut_points, settings))
    return apply_caption_timing_rules(captions, cut_points, settings)


def caption_overflows(words, settings):
    lines, overflow = wrap_caption_text(" ".join(word["text"] for word in words), settings)
    return overflow or len(lines) > int(settings.get("captionLines", 2))


def create_caption(words, cut_points, settings):
    lines, _ = wrap_caption_text(" ".join(word["text"] for word in words), settings)
    start = words[0]["start"]
    end = words[-1]["end"]
    text = "\n".join(lines)
    return {
        "id": uuid.uuid4().hex,
        "start": max(0, start),
        "end": max(start + MIN_CAPTION_DURATION_SECONDS, end),
        "originalStart": start,
        "originalEnd": end,
        "nudged": False,
        "text": text,
        "originalText": text,
        "wordIds": [word["id"] for word in words],
        "wordMappings": [{"wordId": word["id"], "text": word["text"]} for word in words],
    }


def wrap_caption_text(text, settings):
    max_chars = int(settings.get("captionLength", 28))
    max_lines = int(settings.get("captionLines", 2))
    lines = []
    current = ""
    overflow = False
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word
        if len(word) > max_chars:
            overflow = True
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        overflow = True
    return lines[:max_lines], overflow


def apply_caption_timing_rules(captions, cut_points, settings):
    fps = float(settings.get("fps") or 30)
    tolerance = CAPTION_SNAP_TOLERANCE_FRAMES / fps
    sorted_cuts = sorted(float(cut_point) for cut_point in cut_points or [])
    timed_captions = []

    for caption in captions:
        dialogue_start = float(caption.get("originalStart", caption.get("start", 0)) or 0)
        dialogue_end = float(caption.get("originalEnd", caption.get("end", dialogue_start)) or dialogue_start)
        previous_caption = timed_captions[-1] if timed_captions else None
        previous_end = float(previous_caption["end"]) if previous_caption else None
        start = max(0, dialogue_start)
        end = max(start + MIN_CAPTION_DURATION_SECONDS, dialogue_end)
        nudged = bool(caption.get("nudged"))

        snapped_start = find_nearest_cut(
            start,
            sorted_cuts,
            tolerance,
            minimum=dialogue_start,
            maximum=start + tolerance,
        )
        if snapped_start is not None:
            start = snapped_start
            nudged = True

        snapped_end = find_nearest_cut(
            end,
            sorted_cuts,
            tolerance,
            minimum=start + MIN_CAPTION_DURATION_SECONDS,
        )
        if snapped_end is not None:
            end = snapped_end
            nudged = True

        if previous_end is not None and previous_end > start:
            previous_dialogue_end = float(previous_caption.get("originalEnd", previous_end) or previous_end)
            dialogue_gap = dialogue_start - previous_dialogue_end
            start = max(dialogue_start, previous_end) if dialogue_gap <= CAPTION_JOIN_GAP_SECONDS else dialogue_start

        start = max(dialogue_start, start)
        end = max(start + MIN_CAPTION_DURATION_SECONDS, end)
        timed_caption = {**caption, "start": start, "end": end, "nudged": nudged}
        timed_captions.append(timed_caption)

    return timed_captions


def find_nearest_cut(time, cut_points, tolerance, minimum=None, maximum=None):
    nearest = None
    nearest_distance = float("inf")
    for cut_point in cut_points:
        if minimum is not None and cut_point < minimum:
            continue
        if maximum is not None and cut_point > maximum:
            continue
        distance = abs(cut_point - time)
        if distance <= tolerance and distance < nearest_distance:
            nearest = cut_point
            nearest_distance = distance
    return nearest


def render_with_ffmpeg(video_path, output_path, captions):
    if not FONT_PATH.exists():
        raise RuntimeError(f"Caption font is missing: {FONT_PATH}")

    filters = []
    for caption in captions:
        text = escape_drawtext(caption.get("text", ""))
        start = float(caption.get("start") or 0)
        end = float(caption.get("end") or start + 0.5)
        if not text:
            continue
        filters.append(
            "drawtext="
            f"fontfile='{escape_filter_path(FONT_PATH)}':"
            f"text='{text}':"
            "fontcolor=white:"
            "bordercolor=black:"
            "borderw=5:"
            "fontsize=h/15:"
            "line_spacing=8:"
            "x=(w-text_w)/2:"
            "y=h-text_h-96:"
            f"enable='between(t,{start:.3f},{end:.3f})'",
        )

    if not filters:
        raise RuntimeError("No non-empty captions are available to render.")

    run_command(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-vf",
            ",".join(filters),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-c:a",
            "copy",
            "-movflags",
            "+faststart",
            str(output_path),
        ],
        timeout=3600,
    )


def escape_drawtext(text):
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
        .replace("\n", "\\n")
    )


def escape_filter_path(path):
    return str(path).replace("\\", "\\\\").replace(":", "\\:")


def serve():
    for port in range(8765, 8786):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), SlideshowHandler)
            break
        except OSError as error:
            if error.errno != errno.EADDRINUSE:
                raise
    else:
        raise RuntimeError("No open port found between 8765 and 8785")

    print(f"Video Wizard Slideshow Generator: http://127.0.0.1:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    serve()
