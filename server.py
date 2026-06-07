import errno
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
ACCOUNT_STORE_PATH = DATA_DIR / "account_store.json"
DEFAULT_SUPABASE_URL = "https://ysnyzvpkazggvxewsgzn.supabase.co"
DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_9IuEfQdN5MhqPuZm4dAP3w_Jph0e1_k"
FONT_PATH = ROOT / "assets/fonts/TikTok_Sans/static/TikTokSans-SemiBold.ttf"
CAPTION_SNAP_TOLERANCE_FRAMES = 5
CAPTION_JOIN_GAP_SECONDS = 0.5
MIN_CAPTION_DURATION_SECONDS = 0.05
CUT_STRONG_THRESHOLD = 0.35
CUT_SUBTLE_THRESHOLD = 0.12
CUT_MIN_SPACING_SECONDS = 0.25
JOBS = {}
FREE_PLAN_NAME = "Free"
PREMIUM_PLAN_NAME = os.environ.get("VIDEO_WIZARD_PREMIUM_PLAN_NAME", "Video Wizard Pro")
PREMIUM_FEATURES = [
    "1080p slideshow exports",
    "Burned-in caption video export",
    "EDL + PNG caption package",
]


class SlideshowHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urlparse(self.path)
        requested_path = parsed_url.path
        if requested_path.startswith("/api/captions/output/"):
            self.send_caption_output(requested_path.rsplit("/", 1)[-1])
            return
        if requested_path == "/api/app-config":
            self.send_json(get_public_app_config())
            return
        if requested_path == "/api/account/status":
            self.send_account_status(parsed_url.query)
            return
        if requested_path == "/api/account/tool-settings":
            self.send_account_tool_settings(parsed_url.query)
            return

        local_path = self.translate_path(requested_path)
        is_app_route = not os.path.splitext(requested_path)[1]
        if is_app_route and requested_path not in ("/", "/index.html") and not os.path.exists(local_path):
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        parsed_url = urlparse(self.path)
        requested_path = parsed_url.path
        if requested_path == "/api/captions/analyze":
            self.analyze_caption_video()
            return
        if requested_path == "/api/captions/create-job":
            self.create_caption_job()
            return
        if requested_path == "/api/captions/render":
            self.render_caption_video()
            return
        if requested_path == "/api/account/status":
            self.update_account_status()
            return
        if requested_path == "/api/account/tool-settings":
            self.update_account_tool_settings()
            return
        if requested_path == "/api/billing/webhook":
            self.handle_billing_webhook()
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
        cut_points = detect_cut_points(video_path, metadata.get("fps") or 30)
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

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            return json.loads(raw_body.decode("utf-8") or "{}"), raw_body
        except json.JSONDecodeError as error:
            raise RuntimeError(f"Invalid JSON body: {error}") from error

    def send_account_status(self, query_string=""):
        params = parse_qs(query_string or "")
        user_id = first_query_value(params, "user_id")
        email = first_query_value(params, "email")
        self.send_json(build_account_status_response(user_id=user_id, email=email))

    def update_account_status(self):
        try:
            payload, _ = self.read_json_body()
        except RuntimeError as error:
            self.send_json({"error": str(error)}, status=400)
            return

        user_id = payload.get("user_id")
        email = payload.get("email")
        self.send_json(build_account_status_response(user_id=user_id, email=email))

    def send_account_tool_settings(self, query_string=""):
        params = parse_qs(query_string or "")
        user_id = first_query_value(params, "user_id")
        tool = first_query_value(params, "tool")
        try:
            self.send_json(build_account_tool_settings_response(user_id=user_id, tool=tool))
        except RuntimeError as error:
            self.send_json({"error": str(error)}, status=400)

    def update_account_tool_settings(self):
        try:
            payload, _ = self.read_json_body()
        except RuntimeError as error:
            self.send_json({"error": str(error)}, status=400)
            return

        try:
            action = str(payload.get("action") or "save").strip().lower()
            if action == "rename":
                self.send_json(rename_account_tool_settings_profile(
                    user_id=payload.get("user_id"),
                    profile_id=payload.get("profile_id"),
                    name=payload.get("name"),
                ))
                return
            if action == "delete":
                self.send_json(delete_account_tool_settings_profile(
                    user_id=payload.get("user_id"),
                    profile_id=payload.get("profile_id"),
                ))
                return
            self.send_json(save_account_tool_settings_profile(
                user_id=payload.get("user_id"),
                email=payload.get("email"),
                tool=payload.get("tool"),
                name=payload.get("name"),
                settings=payload.get("settings"),
            ))
        except RuntimeError as error:
            self.send_json({"error": str(error)}, status=400)

    def handle_billing_webhook(self):
        try:
            payload, raw_body = self.read_json_body()
            verify_paddle_signature(self.headers.get("Paddle-Signature"), raw_body)
            result = apply_billing_event(payload)
        except RuntimeError as error:
            self.send_json({"error": str(error)}, status=400)
            return

        self.send_json({"ok": True, "result": result})


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


def first_query_value(params, key):
    values = params.get(key) or []
    return values[0] if values else None


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def get_public_app_config():
    return {
        "supabaseUrl": os.environ.get("SUPABASE_URL", DEFAULT_SUPABASE_URL),
        "supabaseAnonKey": os.environ.get("SUPABASE_ANON_KEY", DEFAULT_SUPABASE_ANON_KEY),
        "paddleClientToken": os.environ.get("PADDLE_CLIENT_TOKEN", ""),
        "paddleEnvironment": os.environ.get("PADDLE_ENV", "sandbox"),
        "paddlePriceId": os.environ.get("PADDLE_PRICE_ID", ""),
        "paddleSuccessUrl": os.environ.get("PADDLE_SUCCESS_URL", ""),
        "paddleCancelUrl": os.environ.get("PADDLE_CANCEL_URL", ""),
        "billingPortalUrl": os.environ.get("PADDLE_BILLING_PORTAL_URL", ""),
        "premiumPlanName": PREMIUM_PLAN_NAME,
        "premiumFeatures": PREMIUM_FEATURES,
    }


def load_account_store():
    if not ACCOUNT_STORE_PATH.exists():
        return {"users": {}}
    try:
        return json.loads(ACCOUNT_STORE_PATH.read_text())
    except json.JSONDecodeError:
        return {"users": {}}


def save_account_store(store):
    DATA_DIR.mkdir(exist_ok=True)
    temp_path = ACCOUNT_STORE_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps(store, indent=2, sort_keys=True))
    temp_path.replace(ACCOUNT_STORE_PATH)


def default_account_record(user_id=None, email=None):
    return {
        "user_id": user_id or "",
        "email": email or "",
        "plan_name": FREE_PLAN_NAME,
        "billing_status": "free",
        "premium_access": False,
        "subscription_ends_at": "",
        "day_passes_remaining": 0,
        "subscription_id": "",
        "customer_id": "",
        "price_id": "",
        "tool_settings": {},
        "updated_at": utc_now_iso(),
        "source": "local-default",
    }


def normalize_billing_status(status):
    value = str(status or "").strip().lower()
    if not value:
        return "free"
    replacements = {
        "trial": "trialing",
        "past due": "past_due",
    }
    return replacements.get(value, value.replace(" ", "_"))


def has_active_premium(status):
    return normalize_billing_status(status) in {"active", "trialing", "past_due"}


def build_account_status_response(user_id=None, email=None):
    store = load_account_store()
    user_key = str(user_id or "").strip()
    user_record = store["users"].get(user_key) if user_key else None
    if user_key and not user_record:
        user_record = default_account_record(user_key, email=email)
        store["users"][user_key] = user_record
        save_account_store(store)
    elif user_record and email and not user_record.get("email"):
        user_record["email"] = email
        user_record["updated_at"] = utc_now_iso()
        save_account_store(store)

    account = user_record or default_account_record(user_id=user_key, email=email)
    return {
        "user_id": account.get("user_id") or user_key,
        "email": account.get("email") or email or "",
        "plan_name": account.get("plan_name") or FREE_PLAN_NAME,
        "billing_status": normalize_billing_status(account.get("billing_status")),
        "premium_access": bool(account.get("premium_access")),
        "subscription_ends_at": account.get("subscription_ends_at") or "",
        "day_passes_remaining": int(account.get("day_passes_remaining") or 0),
        "subscription_id": account.get("subscription_id") or "",
        "customer_id": account.get("customer_id") or "",
        "price_id": account.get("price_id") or "",
        "updated_at": account.get("updated_at") or utc_now_iso(),
        "premium_features": PREMIUM_FEATURES,
    }


def normalize_tool_name(tool):
    value = str(tool or "").strip().lower()
    if value not in {"slideshow", "captions"}:
        raise RuntimeError("Unknown tool.")
    return value


def sanitize_tool_settings(settings):
    if not isinstance(settings, dict):
        raise RuntimeError("Tool settings must be a JSON object.")
    sanitized = {}
    for key, value in settings.items():
        key_name = str(key).strip()
        if not key_name:
            continue
        if isinstance(value, bool):
            sanitized[key_name] = value
            continue
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            sanitized[key_name] = value
            continue
        if isinstance(value, str):
            sanitized[key_name] = value[:500]
            continue
    return sanitized


def default_tool_settings_name(tool_name, timestamp=None):
    label = "Slideshow" if tool_name == "slideshow" else "Captions"
    return f"{label} settings - {timestamp or utc_now_iso()}"


def normalize_tool_settings_profiles(raw_tool_settings, tool_name=None):
    profiles = []
    if not isinstance(raw_tool_settings, dict):
        return profiles

    for stored_tool, value in raw_tool_settings.items():
        normalized_tool = normalize_tool_name(stored_tool)
        if tool_name and normalized_tool != tool_name:
            continue
        if isinstance(value, list):
            source_profiles = value
        elif isinstance(value, dict) and isinstance(value.get("profiles"), list):
            source_profiles = value.get("profiles")
        elif isinstance(value, dict) and isinstance(value.get("settings"), dict):
            source_profiles = [{
                "id": value.get("id") or uuid.uuid4().hex,
                "name": value.get("name") or default_tool_settings_name(normalized_tool, value.get("updated_at")),
                "tool": normalized_tool,
                "created_at": value.get("created_at") or value.get("updated_at") or "",
                "updated_at": value.get("updated_at") or "",
                "settings": value.get("settings") or {},
            }]
        else:
            source_profiles = []

        for profile in source_profiles:
            if not isinstance(profile, dict):
                continue
            settings = profile.get("settings") or {}
            if not isinstance(settings, dict):
                continue
            timestamp = profile.get("updated_at") or profile.get("created_at") or utc_now_iso()
            profiles.append({
                "id": str(profile.get("id") or uuid.uuid4().hex),
                "name": str(profile.get("name") or default_tool_settings_name(normalized_tool, timestamp))[:120],
                "tool": normalized_tool,
                "created_at": str(profile.get("created_at") or timestamp),
                "updated_at": str(profile.get("updated_at") or timestamp),
                "settings": sanitize_tool_settings(settings),
            })

    profiles.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
    return profiles


def build_account_tool_settings_response(user_id=None, tool=None):
    user_key = str(user_id or "").strip()
    if not user_key:
        raise RuntimeError("Missing user id.")
    tool_name = normalize_tool_name(tool) if tool else None
    store = load_account_store()
    user_record = store["users"].get(user_key)
    if not user_record:
        return {
            "user_id": user_key,
            "tool": tool_name,
            "profiles": [],
            "settings": {},
            "updated_at": "",
        }
    profiles = normalize_tool_settings_profiles(user_record.get("tool_settings", {}), tool_name=tool_name)
    return {
        "user_id": user_key,
        "tool": tool_name,
        "profiles": profiles,
        "settings": profiles[0]["settings"] if profiles else {},
        "updated_at": profiles[0]["updated_at"] if profiles else "",
    }


def save_account_tool_settings_profile(user_id=None, email=None, tool=None, name=None, settings=None):
    user_key = str(user_id or "").strip()
    if not user_key:
        raise RuntimeError("Missing user id.")
    tool_name = normalize_tool_name(tool)
    sanitized_settings = sanitize_tool_settings(settings)
    store = load_account_store()
    user_record = store["users"].get(user_key) or default_account_record(user_key, email=email)
    if email:
        user_record["email"] = email
    tool_settings = dict(user_record.get("tool_settings") or {})
    profiles = normalize_tool_settings_profiles(tool_settings, tool_name=tool_name)
    now = utc_now_iso()
    profile = {
        "id": uuid.uuid4().hex,
        "name": str(name or default_tool_settings_name(tool_name, now))[:120],
        "tool": tool_name,
        "created_at": now,
        "updated_at": now,
        "settings": sanitized_settings,
    }
    profiles.insert(0, profile)
    tool_settings[tool_name] = {"profiles": profiles[:72]}
    user_record["tool_settings"] = tool_settings
    user_record["updated_at"] = now
    store["users"][user_key] = user_record
    save_account_store(store)
    return {
        "ok": True,
        "user_id": user_key,
        "tool": tool_name,
        "profile": profile,
        "profiles": tool_settings[tool_name]["profiles"],
        "settings": sanitized_settings,
        "updated_at": now,
    }


def find_tool_profile_location(user_record, profile_id):
    wanted_id = str(profile_id or "").strip()
    if not wanted_id:
        raise RuntimeError("Missing profile id.")
    tool_settings = dict(user_record.get("tool_settings") or {})
    for tool_name in ("slideshow", "captions"):
        profiles = normalize_tool_settings_profiles(tool_settings, tool_name=tool_name)
        for index, profile in enumerate(profiles):
            if profile.get("id") == wanted_id:
                return tool_settings, tool_name, profiles, index
    raise RuntimeError("Settings profile not found.")


def rename_account_tool_settings_profile(user_id=None, profile_id=None, name=None):
    user_key = str(user_id or "").strip()
    clean_name = str(name or "").strip()
    if not user_key:
        raise RuntimeError("Missing user id.")
    if not clean_name:
        raise RuntimeError("Missing profile name.")
    store = load_account_store()
    user_record = store["users"].get(user_key)
    if not user_record:
        raise RuntimeError("Account not found.")
    tool_settings, tool_name, profiles, index = find_tool_profile_location(user_record, profile_id)
    profiles[index]["name"] = clean_name[:120]
    profiles[index]["updated_at"] = utc_now_iso()
    tool_settings[tool_name] = {"profiles": profiles}
    user_record["tool_settings"] = tool_settings
    user_record["updated_at"] = utc_now_iso()
    store["users"][user_key] = user_record
    save_account_store(store)
    return {"ok": True, "profile": profiles[index], "profiles": normalize_tool_settings_profiles(tool_settings)}


def delete_account_tool_settings_profile(user_id=None, profile_id=None):
    user_key = str(user_id or "").strip()
    if not user_key:
        raise RuntimeError("Missing user id.")
    store = load_account_store()
    user_record = store["users"].get(user_key)
    if not user_record:
        raise RuntimeError("Account not found.")
    tool_settings, tool_name, profiles, index = find_tool_profile_location(user_record, profile_id)
    removed = profiles.pop(index)
    tool_settings[tool_name] = {"profiles": profiles}
    user_record["tool_settings"] = tool_settings
    user_record["updated_at"] = utc_now_iso()
    store["users"][user_key] = user_record
    save_account_store(store)
    return {"ok": True, "removed": removed, "profiles": normalize_tool_settings_profiles(tool_settings)}


def parse_paddle_signature(header_value):
    parsed = {}
    for part in str(header_value or "").split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        parsed[key.strip()] = value.strip()
    return parsed


def verify_paddle_signature(header_value, raw_body):
    secret = os.environ.get("PADDLE_WEBHOOK_SECRET", "").strip()
    if not secret:
        return
    signature = parse_paddle_signature(header_value)
    timestamp = signature.get("ts")
    digest = signature.get("h1")
    if not timestamp or not digest:
        raise RuntimeError("Missing Paddle signature headers.")
    signed_payload = timestamp.encode("utf-8") + b":" + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, digest):
        raise RuntimeError("Paddle webhook signature verification failed.")


def get_nested_value(payload, *path, default=None):
    current = payload
    for key in path:
        if isinstance(current, dict):
            current = current.get(key)
            continue
        if isinstance(current, list) and isinstance(key, int):
            if key < 0 or key >= len(current):
                return default
            current = current[key]
            continue
        return default
    return current if current is not None else default


def extract_custom_data(data):
    return (
        get_nested_value(data, "custom_data", default={})
        or get_nested_value(data, "customData", default={})
        or {}
    )


def apply_billing_event(payload):
    event_type = str(payload.get("event_type") or payload.get("eventType") or "").strip()
    data = payload.get("data") or {}
    custom_data = extract_custom_data(data)
    user_id = (
        custom_data.get("supabase_user_id")
        or custom_data.get("user_id")
        or custom_data.get("supabaseUserId")
        or ""
    )
    email = (
        get_nested_value(data, "customer", "email")
        or data.get("customer_email")
        or custom_data.get("supabase_email")
        or custom_data.get("email")
        or ""
    )
    if not user_id:
        raise RuntimeError("Webhook payload is missing custom_data.supabase_user_id.")

    subscription_id = str(data.get("id") or data.get("subscription_id") or data.get("subscriptionId") or "")
    customer_id = str(
        get_nested_value(data, "customer", "id")
        or data.get("customer_id")
        or data.get("customerId")
        or ""
    )
    status = normalize_billing_status(
        data.get("status")
        or event_type.rsplit(".", 1)[-1]
    )
    plan_name = (
        get_nested_value(data, "items", 0, "price", "name")
        if isinstance(data.get("items"), list) and data["items"]
        else None
    ) or PREMIUM_PLAN_NAME
    price_id = (
        get_nested_value(data, "items", 0, "price", "id")
        if isinstance(data.get("items"), list) and data["items"]
        else None
    ) or str(data.get("price_id") or data.get("priceId") or os.environ.get("PADDLE_PRICE_ID", ""))

    store = load_account_store()
    record = store["users"].get(user_id) or default_account_record(user_id=user_id, email=email)
    record.update(
        {
            "user_id": user_id,
            "email": email or record.get("email", ""),
            "plan_name": FREE_PLAN_NAME if not has_active_premium(status) else plan_name,
            "billing_status": status,
            "premium_access": has_active_premium(status),
            "subscription_ends_at": (
                get_nested_value(data, "current_billing_period", "ends_at")
                or data.get("next_billed_at")
                or record.get("subscription_ends_at", "")
            ),
            "subscription_id": subscription_id,
            "customer_id": customer_id,
            "price_id": price_id,
            "updated_at": utc_now_iso(),
            "source": f"paddle:{event_type or 'unknown'}",
        }
    )
    store["users"][user_id] = record
    save_account_store(store)
    return {
        "user_id": user_id,
        "billing_status": status,
        "premium_access": record["premium_access"],
    }


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
        return float(numerator) / denominator if denominator else 30
    return float(value)


def collect_scene_scores(video_path):
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-i",
                str(video_path),
                "-filter:v",
                "select='gte(scene,0)',metadata=print,showinfo",
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

    scene_scores = []
    current_frame = None
    for line in result.stderr.splitlines():
        if "pts_time:" in line:
            try:
                pts_value = line.split("pts_time:", 1)[1].split(" ", 1)[0]
                current_frame = {"time": float(pts_value)}
            except ValueError:
                current_frame = None
            continue
        if "lavfi.scene_score=" not in line or current_frame is None:
            continue
        try:
            score_value = line.split("lavfi.scene_score=", 1)[1].split()[0]
            scene_scores.append(
                {
                    "time": float(current_frame["time"]),
                    "score": float(score_value),
                },
            )
        except ValueError:
            continue
        finally:
            current_frame = None
    return scene_scores


def is_local_peak(index, scene_scores):
    current_score = scene_scores[index]["score"]
    previous_score = scene_scores[index - 1]["score"] if index > 0 else -1
    next_score = scene_scores[index + 1]["score"] if index + 1 < len(scene_scores) else -1
    return current_score >= previous_score and current_score > next_score


def collapse_cut_candidates(candidates, minimum_spacing=CUT_MIN_SPACING_SECONDS):
    collapsed = []
    for candidate in sorted(candidates, key=lambda item: (item["time"], -item["score"])):
        if not collapsed:
            collapsed.append(candidate)
            continue
        previous = collapsed[-1]
        if candidate["time"] - previous["time"] < minimum_spacing:
            if candidate["score"] > previous["score"]:
                collapsed[-1] = candidate
            continue
        collapsed.append(candidate)
    return [candidate["time"] for candidate in collapsed]


def collect_luma_diff_scores(video_path, fps, width=64, height=114):
    frame_size = width * height
    try:
        process = subprocess.Popen(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                str(video_path),
                "-vf",
                f"scale={width}:{height}:flags=bilinear,format=gray",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "gray",
                "-",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except Exception:
        return []

    diffs = []
    previous_frame = None
    frame_index = 0
    try:
        while True:
            buffer = process.stdout.read(frame_size)
            if len(buffer) < frame_size:
                break
            if previous_frame is not None:
                absolute_diff = sum(abs(current - previous) for current, previous in zip(buffer, previous_frame))
                diffs.append(
                    {
                        "time": frame_index / float(fps),
                        "score": absolute_diff / frame_size / 255,
                    },
                )
            previous_frame = buffer
            frame_index += 1
    finally:
        if process.stdout:
            process.stdout.close()
        if process.stderr:
            process.stderr.close()
        process.wait(timeout=60)
    return diffs


def detect_cut_points(video_path, fps=30):
    scene_scores = collect_scene_scores(video_path)
    if not scene_scores:
        return []

    strong_candidates = [
        frame for index, frame in enumerate(scene_scores)
        if frame["score"] >= CUT_STRONG_THRESHOLD and is_local_peak(index, scene_scores)
    ]

    subtle_candidates = []
    for index, frame in enumerate(scene_scores):
        if frame["score"] < CUT_SUBTLE_THRESHOLD or not is_local_peak(index, scene_scores):
            continue
        nearest_strong_distance = min(
            (abs(frame["time"] - strong["time"]) for strong in strong_candidates),
            default=float("inf"),
        )
        if nearest_strong_distance < CUT_MIN_SPACING_SECONDS:
            continue
        subtle_candidates.append(frame)

    return collapse_cut_candidates([*strong_candidates, *subtle_candidates])


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
