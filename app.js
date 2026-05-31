import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js";
import { fetchFile, toBlobURL } from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js";

const els = {
  photoInput: document.querySelector("#photoInput"),
  photoStrip: document.querySelector("#photoStrip"),
  trashDrop: document.querySelector("#trashDrop"),
  durationRange: document.querySelector("#durationRange"),
  durationValue: document.querySelector("#durationValue"),
  transitionDuration: document.querySelector("#transitionDuration"),
  transitionDurationValue: document.querySelector("#transitionDurationValue"),
  qualityRange: document.querySelector("#qualityRange"),
  qualityValue: document.querySelector("#qualityValue"),
  kenBurnsToggle: document.querySelector("#kenBurnsToggle"),
  fillBackgroundToggle: document.querySelector("#fillBackgroundToggle"),
  loopControls: document.querySelector("#loopControls"),
  loopCountRange: document.querySelector("#loopCountRange"),
  loopCountValue: document.querySelector("#loopCountValue"),
  loopDurationLabel: document.querySelector("#loopDurationLabel"),
  audioInput: document.querySelector("#audioInput"),
  outputLocation: document.querySelector("#outputLocation"),
  generateButton: document.querySelector("#generateButton"),
  progressBar: document.querySelector("#progressBar"),
  statusText: document.querySelector("#statusText"),
  livePreview: document.querySelector("#livePreview"),
  previewStatus: document.querySelector("#previewStatus"),
  previewVideo: document.querySelector("#previewVideo"),
  settingsMenu: document.querySelector("#settingsMenu"),
};

const ffmpeg = new FFmpeg();
const state = {
  loaded: false,
  photos: [],
  audio: null,
  classWorkerURL: null,
  draggedPhotoId: null,
  currentRender: null,
  logText: "",
  previewDebounce: null,
  previewToken: 0,
  previewObjectUrl: null,
};

const transitionMap = {
  fade: ["fade"],
  slideleft: ["slideleft", "slideright", "slideup", "slidedown"],
  wipeleft: ["wipeleft", "wiperight", "wipeup", "wipedown"],
};

const qualityPresets = {
  1: { label: "Low", width: 640, height: 360, jpegQuality: 0.82, crf: "26" },
  2: { label: "Medium", width: 1280, height: 720, jpegQuality: 0.9, crf: "23" },
  3: { label: "High", width: 1920, height: 1080, jpegQuality: 0.96, crf: "20" },
};

els.durationRange.addEventListener("input", updateTimingLabels);
els.transitionDuration.addEventListener("input", updateTimingLabels);
els.qualityRange.addEventListener("input", handleSettingsChange);
els.photoInput.addEventListener("change", handlePhotos);
els.audioInput.addEventListener("change", handleAudio);
els.generateButton.addEventListener("click", generateSlideshow);
els.trashDrop.addEventListener("dragover", handleTrashDragOver);
els.trashDrop.addEventListener("dragleave", handleTrashDragLeave);
els.trashDrop.addEventListener("drop", handleTrashDrop);
els.loopCountRange.addEventListener("input", updateLoopControls);
document
  .querySelectorAll("input[name='orientation']")
  .forEach((input) => input.addEventListener("change", handleSettingsChange));
document
  .querySelectorAll("input[name='transition'], #kenBurnsToggle, #fillBackgroundToggle")
  .forEach((input) => input.addEventListener("change", handleSettingsChange));

updateTimingLabels();
updateOutputLocation();

function updateTimingLabels() {
  els.durationValue.textContent = `${Number(els.durationRange.value).toFixed(1)}s`;
  els.transitionDurationValue.textContent = `${Number(els.transitionDuration.value).toFixed(1)}s`;
  updateQualityLabel();
  updateLoopControls();
  updateFileSizeEstimate();
  updateLivePreview();
}

function handleSettingsChange() {
  updateQualityLabel();
  updateLoopControls();
  updateFileSizeEstimate();
  updateLivePreview();
}

function updateQualityLabel() {
  const preset = getQualityPreset();
  const geometry = getOutputGeometry();
  els.qualityValue.textContent = `${preset.label} - ${geometry.width}x${geometry.height}`;
}

function updateLoopControls() {
  const loopCount = getExtraLoopCount();
  const playCount = getTotalPlayCount();
  els.loopCountValue.textContent = `${loopCount} ${loopCount === 1 ? "loop" : "loops"}`;
  els.loopDurationLabel.textContent =
    `Total plays: ${playCount}x · Total duration: ${formatDuration(getSinglePassDuration() * playCount)}`;
  updateFileSizeEstimate();
}

function getExtraLoopCount() {
  return Number(els.loopCountRange.value);
}

function getTotalPlayCount() {
  return 1 + getExtraLoopCount();
}

function getSinglePassDuration() {
  if (state.photos.length === 0) return 0;
  const selectedTransition = document.querySelector("input[name='transition']:checked").value;
  const useHardCuts = selectedTransition === "hardcut" || state.photos.length === 1;
  const imageDuration = Number(els.durationRange.value);
  const transitionDuration = Math.min(Number(els.transitionDuration.value), imageDuration - 0.1);
  if (getExtraLoopCount() > 0 && !useHardCuts) {
    return state.photos.length * imageDuration;
  }
  return useHardCuts
    ? state.photos.length * imageDuration
    : state.photos.length * imageDuration + transitionDuration;
}

function formatDuration(totalSeconds) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function updateFileSizeEstimate() {
  if (state.currentRender?.kind === "final") return;
  els.outputLocation.textContent = getFileSizeEstimateLabel();
}

function getFileSizeEstimateLabel() {
  if (state.photos.length === 0) {
    return "Choose filename and save location when generating.";
  }

  return `Estimated file size: ~${formatFileSize(estimateOutputBytes())}`;
}

function estimateOutputBytes() {
  const geometry = getOutputGeometry();
  const preset = getQualityPreset();
  const totalDuration = getSinglePassDuration() * getTotalPlayCount();
  const megapixels = (geometry.width * geometry.height) / 1_000_000;
  const qualityMultiplier = { Low: 0.54, Medium: 0.72, High: 0.92 }[preset.label] || 0.72;
  const motionMultiplier = els.kenBurnsToggle.checked ? 0.72 : 0.48;
  const transitionMultiplier =
    document.querySelector("input[name='transition']:checked").value === "hardcut" ? 0.86 : 1;
  const videoMbps = clampNumber(
    megapixels * 0.92 * qualityMultiplier * motionMultiplier * transitionMultiplier,
    0.22,
    4.2,
  );
  const audioMbps = state.audio ? 0.192 : 0;
  const containerOverhead = 1.05;
  return totalDuration * (videoMbps + audioMbps) * 125000 * containerOverhead;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function handlePhotos(event) {
  const addedPhotos = Array.from(event.target.files)
    .filter((file) => file.type.startsWith("image/"))
    .map((file) => ({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      interest: null,
    }));

  state.photos.push(...addedPhotos);
  event.target.value = "";
  renderPhotos();
  updateLoopControls();
  updateFileSizeEstimate();
  updateLivePreview();
}

function renderPhotos() {
  els.photoStrip.replaceChildren();
  els.trashDrop.classList.toggle("is-visible", state.photos.length > 0);

  state.photos.forEach((photo, index) => {
    const item = document.createElement("article");
    item.className = "photo-card";
    item.draggable = true;
    item.dataset.photoId = photo.id;
    item.setAttribute("aria-label", `${index + 1}. ${photo.file.name}`);

    const img = document.createElement("img");
    img.className = "thumb";
    img.src = photo.url;
    img.alt = photo.file.name;

    const order = document.createElement("span");
    order.className = "photo-order";
    order.textContent = String(index + 1);

    const name = document.createElement("span");
    name.className = "photo-name";
    name.textContent = photo.file.name;

    item.append(img, order, name);
    item.addEventListener("dragstart", handlePhotoDragStart);
    item.addEventListener("dragover", handlePhotoDragOver);
    item.addEventListener("dragleave", handlePhotoDragLeave);
    item.addEventListener("drop", handlePhotoDrop);
    item.addEventListener("dragend", handlePhotoDragEnd);
    els.photoStrip.append(item);
  });
}

function handleAudio(event) {
  state.audio = event.target.files[0] || null;
  updateFileSizeEstimate();
  updateLivePreview();
}

function updateOutputLocation() {
  updateFileSizeEstimate();
}

function updateLivePreview() {
  const orientation = getOutputGeometry().orientation;
  els.livePreview.classList.toggle("is-vertical", orientation === "vertical");

  if (state.photos.length === 0) {
    clearPreviewVideo();
    els.livePreview.classList.remove("has-images");
    setInlinePreviewStatus("Add photos to preview");
    setPreviewStatus("");
    return;
  }

  els.livePreview.classList.add("has-images");
  setInlinePreviewStatus("Rendering preview...");
  schedulePreviewRender();
}

function schedulePreviewRender() {
  window.clearTimeout(state.previewDebounce);
  state.previewDebounce = window.setTimeout(() => {
    renderPreview();
  }, 700);
}

function clearPreviewVideo() {
  window.clearTimeout(state.previewDebounce);
  state.previewDebounce = null;
  state.previewToken += 1;
  if (state.previewObjectUrl) {
    URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = null;
  }
  els.previewVideo.removeAttribute("src");
  els.previewVideo.style.display = "none";
  els.livePreview.classList.remove("has-video");
}

async function renderPreview() {
  if (state.photos.length === 0 || state.currentRender?.kind === "final") return;

  await stopPreviewRenderIfNeeded();
  const token = ++state.previewToken;
  setPreviewStatus("");
  setInlinePreviewStatus("Rendering preview · estimating...");
  state.logText = "";

  try {
    await loadFFmpeg();
    await cleanWorkspace();

    const geometry = getOutputGeometry();
    const previewGeometry =
      geometry.orientation === "vertical" ? { width: 240, height: 426 } : { width: 426, height: 240 };
    const previewPhotos = state.photos.slice(0, 4);
    const renderSettings = {
      outputName: "preview.mp4",
      width: previewGeometry.width,
      height: previewGeometry.height,
      imageDuration: Number(els.durationRange.value),
      transitionDuration: Number(els.transitionDuration.value),
      fps: 15,
      crf: "32",
      preset: "ultrafast",
      kenBurns: els.kenBurnsToggle.checked,
      fillBackground: els.fillBackgroundToggle.checked,
    };
    await renderCanvasVisualPass(previewPhotos, renderSettings, {
      framePrefix: "preview_frame",
      kind: "preview",
      showProgress: false,
      statusTarget: "preview",
      statusLabel: "Rendering preview",
      isCancelled: () => token !== state.previewToken,
    });

    if (token !== state.previewToken) return;

    const data = await ffmpeg.readFile("preview.mp4");
    const blob = new Blob([data], { type: "video/mp4" });
    if (!blob.size) {
      throw new Error("Preview render produced an empty video.");
    }
    if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = URL.createObjectURL(blob);
    els.previewVideo.src = state.previewObjectUrl;
    els.previewVideo.style.display = "block";
    els.livePreview.classList.add("has-video");
    els.previewVideo.loop = true;
    els.previewVideo.muted = true;
    await els.previewVideo.play().catch(() => undefined);
    setInlinePreviewStatus("");
    setPreviewStatus("");
  } catch (error) {
    if (token !== state.previewToken) return;
    clearPreviewVideo();
    setInlinePreviewStatus(`Preview failed. ${normalizeError(error)}`);
    handleRenderError(error);
  }
}

async function stopPreviewRenderIfNeeded() {
  if (!stopPreviewRenderNow()) return;
  await new Promise((resolve) => window.setTimeout(resolve, 50));
}

function stopPreviewRenderNow() {
  stopPreviewPlayback();
  if (state.currentRender?.kind !== "preview") return false;
  state.previewToken += 1;
  ffmpeg.terminate();
  state.loaded = false;
  state.currentRender = null;
  return true;
}

function stopPreviewPlayback() {
  window.clearTimeout(state.previewDebounce);
  state.previewDebounce = null;
  state.previewToken += 1;
  els.previewVideo.pause();
}

function showRenderWindow(message) {
  window.clearTimeout(state.previewDebounce);
  state.previewDebounce = null;
  state.previewToken += 1;
  if (state.previewObjectUrl) {
    URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = null;
  }
  els.previewVideo.pause();
  els.previewVideo.removeAttribute("src");
  els.previewVideo.style.display = "none";
  els.livePreview.classList.add("has-images");
  els.livePreview.classList.remove("has-video");
  setInlinePreviewStatus(message);
  setStatus("");
}

async function loadFFmpeg() {
  if (state.loaded) return;

  const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

  ffmpeg.on("log", ({ message }) => {
    state.logText += `${message}\n`;
    updateRenderProgressFromLog(message);
  });

  ffmpeg.on("progress", ({ progress }) => {
    if (Number.isFinite(progress) && !state.currentRender) {
      els.progressBar.value = Math.max(0, Math.min(1, progress));
    }
  });

  await ffmpeg.load({
    classWorkerURL: await getClassWorkerURL(),
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  state.loaded = true;
}

async function getClassWorkerURL() {
  if (state.classWorkerURL) return state.classWorkerURL;

  const ffmpegBaseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm";
  const response = await fetch(`${ffmpegBaseURL}/worker.js`);
  if (!response.ok) {
    throw new Error(`Could not load ffmpeg worker: ${response.status}`);
  }

  const workerSource = await response.text();
  const patchedSource = workerSource.replaceAll('from "./', `from "${ffmpegBaseURL}/`);
  state.classWorkerURL = URL.createObjectURL(
    new Blob([patchedSource], { type: "text/javascript" }),
  );
  return state.classWorkerURL;
}

async function generateSlideshow() {
  els.settingsMenu.open = false;
  if (state.photos.length === 0) {
    setStatus("Choose at least one photo first.");
    return;
  }
  if (state.currentRender?.kind === "final") return;

  const stoppedPreviewRender = stopPreviewRenderNow();
  setBusy(true);
  state.logText = "";
  els.progressBar.value = 0;
  showRenderWindow("Rendering · estimating...");

  try {
    const saveTarget = await requestSaveTarget();
    if (!saveTarget) {
      setStatus("Render canceled.");
      updateLivePreview();
      return;
    }

    if (stoppedPreviewRender) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    els.progressBar.classList.add("is-visible");
    els.outputLocation.textContent = getFileSizeEstimateLabel();

    showRenderWindow("Rendering · estimating...");
    els.progressBar.value = 0.02;

    const geometry = getOutputGeometry();
    const playCount = getTotalPlayCount();
    const { outputName: onePassOutputName, onePassEstimate } =
      await renderSinglePassWithCanvasFrames(geometry);

    const outputName = playCount > 1
      ? await concatenateSlideshowLoops(onePassOutputName, playCount, onePassEstimate)
      : onePassOutputName;
    const finalOutputName = await addContinuousAudio(outputName, onePassEstimate.durationSeconds * playCount);

    els.progressBar.value = 0.97;
    const data = await ffmpeg.readFile(finalOutputName);
    const blob = new Blob([data], { type: "video/mp4" });
    await publishOutput(blob, saveTarget);
    els.progressBar.value = 1;
    els.outputLocation.textContent = getFileSizeEstimateLabel();
    setInlinePreviewStatus("Render Complete");
    setStatus("Render Complete");
  } catch (error) {
    handleRenderError(error);
  } finally {
    setBusy(false);
  }
}

async function runFFmpeg(args, statusMessage, estimate, options = {}) {
  state.logText += `\nffmpeg ${args.join(" ")}\n\n`;
  if (options.showStatus && statusMessage) {
    setStatus(statusMessage);
  }
  state.currentRender = {
    ...estimate,
    kind: options.kind || "final",
    showProgress: options.showProgress !== false,
    statusTarget: options.statusTarget || "status",
    statusLabel: options.statusLabel || "Rendering",
    startedAt: performance.now(),
    lastActivityAt: performance.now(),
  };
  const softTimeoutMs = Math.min(
    Math.max(180000, estimate.durationSeconds * 1000 * 20),
    30 * 60 * 1000,
  );
  const hardTimeoutMs = softTimeoutMs + 15000;
  let hardTimeout;
  let inactivityWatchdog;

  try {
    const execPromise = ffmpeg.exec(args, softTimeoutMs);
    const timeoutPromise = new Promise((_, reject) => {
      hardTimeout = window.setTimeout(() => {
        ffmpeg.terminate();
        state.loaded = false;
        reject(new Error("Render timed out and was stopped. Try fewer photos, shorter timing, or preview first."));
      }, hardTimeoutMs);

      inactivityWatchdog = window.setInterval(() => {
        if (!state.currentRender) return;
        const now = performance.now();
        const idleMs = now - state.currentRender.lastActivityAt;
        const ranForMs = now - state.currentRender.startedAt;
        const idleLimitMs = state.currentRender.lastFrame >= state.currentRender.totalFrames * 0.95 ? 45000 : 90000;
        if (ranForMs > 30000 && idleMs > idleLimitMs) {
          ffmpeg.terminate();
          state.loaded = false;
          reject(
            new Error(
              "Render stopped because FFmpeg stopped reporting progress. Try fewer photos, shorter timing, or turn off Ken Burns/Fill Background.",
            ),
          );
        }
      }, 5000);
    });
    const exitCode = await Promise.race([execPromise, timeoutPromise]);
    if (exitCode !== 0) {
      throw new Error(`FFmpeg exited with code ${exitCode}. ${getLogTail()}`);
    }
  } finally {
    window.clearTimeout(hardTimeout);
    window.clearInterval(inactivityWatchdog);
    state.currentRender = null;
  }
}

async function renderSinglePassWithCanvasFrames(geometry) {
  await loadFFmpeg();
  await cleanWorkspace();
  els.progressBar.value = 0.02;
  showRenderWindow("Rendering canvas frames · estimating...");

  const loopTransition = getTotalPlayCount() > 1;
  const renderSettings = {
    outputName: "output.mp4",
    width: geometry.width,
    height: geometry.height,
    imageDuration: Number(els.durationRange.value),
    transitionDuration: Number(els.transitionDuration.value),
    fps: 30,
    crf: getQualityPreset().crf,
    preset: "veryfast",
    kenBurns: els.kenBurnsToggle.checked,
    fillBackground: els.fillBackgroundToggle.checked,
    loopTransition,
  };
  const onePassEstimate = createRenderEstimate(state.photos.length, renderSettings);

  await renderCanvasVisualPass(state.photos, renderSettings, {
    framePrefix: "frame",
    kind: "final",
    showProgress: true,
    statusTarget: "preview",
    statusLabel: "Rendering",
  });

  return {
    outputName: renderSettings.outputName,
    onePassEstimate,
  };
}

async function renderCanvasVisualPass(photos, settings, options = {}) {
  const estimate = createRenderEstimate(photos.length, settings);
  const preparedPhotos = await prepareCanvasPhotos(photos);
  const framePrefix = options.framePrefix || "frame";
  const transitionPlan = createTransitionPlan(photos.length, settings);

  try {
    beginManualRender(estimate, {
      kind: options.kind || "final",
      showProgress: options.showProgress !== false,
      statusTarget: options.statusTarget || "preview",
      statusLabel: options.statusLabel || "Rendering",
    });

    await writeCanvasFrameSequence(preparedPhotos, settings, estimate, transitionPlan, {
      framePrefix,
      isCancelled: options.isCancelled,
    });
    state.currentRender = null;

    setInlinePreviewStatus(`${options.statusLabel || "Rendering"} · encoding video...`);
    const args = buildFrameSequenceEncodeArgs(framePrefix, estimate.totalFrames, settings);
    await runFFmpeg(args, "", estimate, {
      kind: options.kind || "final",
      showProgress: options.showProgress !== false,
      statusTarget: options.statusTarget || "preview",
      statusLabel: options.statusLabel || "Rendering",
    });
  } finally {
    state.currentRender = null;
    preparedPhotos.forEach((photo) => photo.bitmap.close());
    await cleanupFrameSequence(framePrefix, estimate.totalFrames);
  }
}

async function prepareCanvasPhotos(photos) {
  const prepared = [];
  for (const photo of photos) {
    const bitmap = await createImageBitmap(photo.file);
    photo.interest ||= findPointOfInterest(bitmap);
    prepared.push({
      bitmap,
      interest: photo.interest,
    });
  }
  return prepared;
}

function beginManualRender(estimate, options) {
  state.currentRender = {
    ...estimate,
    kind: options.kind,
    showProgress: options.showProgress,
    statusTarget: options.statusTarget,
    statusLabel: options.statusLabel,
    startedAt: performance.now(),
    lastActivityAt: performance.now(),
    lastFrame: 0,
    lastFps: 0,
  };
}

function updateManualRenderProgress(frameIndex, totalFrames) {
  if (!state.currentRender) return;
  const completedFrames = frameIndex + 1;
  const progress = Math.min(0.72, (completedFrames / totalFrames) * 0.72);
  state.currentRender.lastFrame = completedFrames;
  state.currentRender.lastActivityAt = performance.now();
  if (state.currentRender.showProgress) {
    els.progressBar.value = progress;
  }
  updateRenderEta(Math.max(0.02, progress));
}

async function writeCanvasFrameSequence(photos, settings, estimate, transitionPlan, options) {
  const canvas = document.createElement("canvas");
  canvas.width = settings.width;
  canvas.height = settings.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (let frameIndex = 0; frameIndex < estimate.totalFrames; frameIndex += 1) {
    if (options.isCancelled?.()) {
      throw new Error("Preview render canceled.");
    }

    drawTimelineFrame(ctx, photos, settings, transitionPlan, frameIndex, estimate.durationSeconds);
    const frameName = `${options.framePrefix}_${String(frameIndex).padStart(6, "0")}.jpg`;
    const blob = await canvasToBlob(canvas, getQualityPreset().jpegQuality);
    await ffmpeg.writeFile(frameName, await fetchFile(blob));
    updateManualRenderProgress(frameIndex, estimate.totalFrames);

    if (frameIndex % 5 === 4) {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }
}

function buildFrameSequenceEncodeArgs(framePrefix, frameCount, settings) {
  return [
    "-framerate",
    String(settings.fps),
    "-start_number",
    "0",
    "-i",
    `${framePrefix}_%06d.jpg`,
    "-frames:v",
    String(frameCount),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    settings.preset,
    "-crf",
    settings.crf,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    settings.outputName,
  ];
}

async function cleanupFrameSequence(framePrefix, frameCount) {
  const deletions = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const frameName = `${framePrefix}_${String(frameIndex).padStart(6, "0")}.jpg`;
    deletions.push(ffmpeg.deleteFile(frameName).catch(() => undefined));
  }
  await Promise.all(deletions);
}

function createTransitionPlan(photoCount, settings) {
  const selectedTransition = document.querySelector("input[name='transition']:checked").value;
  const useHardCuts = selectedTransition === "hardcut" || photoCount === 1;
  const transitionCount = settings.loopTransition ? photoCount : Math.max(0, photoCount - 1);
  return {
    useHardCuts,
    transitions: Array.from({ length: transitionCount }, () => pickTransition(selectedTransition)),
  };
}

function drawTimelineFrame(ctx, photos, settings, transitionPlan, frameIndex, durationSeconds) {
  const fps = settings.fps;
  const time = Math.min(durationSeconds - 1 / fps, frameIndex / fps);
  const transitionDuration = Math.min(settings.transitionDuration, settings.imageDuration - 0.1);
  const width = settings.width;
  const height = settings.height;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.fillStyle = "#05030a";
  ctx.fillRect(0, 0, width, height);

  if (transitionPlan.useHardCuts) {
    const index = Math.min(photos.length - 1, Math.floor(time / settings.imageDuration));
    const localTime = time - index * settings.imageDuration;
    drawPhotoFrame(ctx, photos[index], settings, getMotionProgress(localTime, settings.imageDuration), 1);
    ctx.restore();
    return;
  }

  const loopTransitionStart = photos.length * settings.imageDuration - transitionDuration;
  if (settings.loopTransition && time >= loopTransitionStart) {
    const loopTransitionFrames = Math.max(1 / fps, transitionDuration - 1 / fps);
    const progress = clampNumber((time - loopTransitionStart) / loopTransitionFrames, 0, 1);
    drawTransitionFrame(ctx, photos, settings, transitionPlan.transitions.at(-1), {
      fromIndex: photos.length - 1,
      toIndex: 0,
      fromLocalTime: settings.imageDuration - transitionDuration + time - loopTransitionStart,
      toLocalTime: 0,
      fromMotionDuration: settings.imageDuration + transitionDuration,
      toMotionDuration: settings.imageDuration + transitionDuration,
      progress,
    });
    ctx.restore();
    return;
  }

  const boundaryIndex = Math.floor(time / settings.imageDuration);
  const boundaryTime = boundaryIndex * settings.imageDuration;
  const transitionTime = time - boundaryTime;
  const isInteriorTransition =
    boundaryIndex > 0 &&
    boundaryIndex < photos.length &&
    transitionTime < transitionDuration;

  if (isInteriorTransition) {
    const progress = clampNumber(transitionTime / transitionDuration, 0, 1);
    drawTransitionFrame(ctx, photos, settings, transitionPlan.transitions[boundaryIndex - 1], {
      fromIndex: boundaryIndex - 1,
      toIndex: boundaryIndex,
      fromLocalTime: settings.imageDuration + transitionTime,
      toLocalTime: transitionTime,
      fromMotionDuration: settings.imageDuration + transitionDuration,
      toMotionDuration: settings.imageDuration + transitionDuration,
      progress,
    });
    ctx.restore();
    return;
  }

  const index = Math.min(photos.length - 1, boundaryIndex);
  const localTime = index === 0 || index === photos.length - 1
    ? Math.max(0, time - index * settings.imageDuration)
    : Math.max(transitionDuration, transitionTime);
  const motionDuration = transitionPlan.useHardCuts
    ? settings.imageDuration
    : settings.imageDuration + transitionDuration;
  drawPhotoFrame(ctx, photos[index], settings, getMotionProgress(localTime, motionDuration), 1);
  ctx.restore();
}

function drawTransitionFrame(ctx, photos, settings, transition, stateForTransition) {
  const fromPhoto = photos[stateForTransition.fromIndex];
  const toPhoto = photos[stateForTransition.toIndex];
  const fromProgress = getMotionProgress(
    stateForTransition.fromLocalTime,
    stateForTransition.fromMotionDuration || settings.imageDuration,
  );
  const toProgress = getMotionProgress(
    stateForTransition.toLocalTime,
    stateForTransition.toMotionDuration || settings.imageDuration,
  );
  const progress = easeInOut(stateForTransition.progress);

  if (transition.startsWith("slide")) {
    drawPhotoFrame(ctx, fromPhoto, settings, fromProgress, 1);
    ctx.save();
    applySlideTransform(ctx, transition, progress, settings.width, settings.height);
    drawPhotoFrame(ctx, toPhoto, settings, toProgress, 1);
    ctx.restore();
    return;
  }

  if (transition.startsWith("wipe")) {
    drawPhotoFrame(ctx, fromPhoto, settings, fromProgress, 1);
    ctx.save();
    applyWipeClip(ctx, transition, progress, settings.width, settings.height);
    drawPhotoFrame(ctx, toPhoto, settings, toProgress, 1);
    ctx.restore();
    return;
  }

  drawPhotoFrame(ctx, fromPhoto, settings, fromProgress, 1);
  drawPhotoFrame(ctx, toPhoto, settings, toProgress, progress);
}

function drawPhotoFrame(ctx, photo, settings, motionProgress, alpha) {
  const width = settings.width;
  const height = settings.height;
  const bitmap = photo.bitmap;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  if (settings.fillBackground) {
    const cover = fitRectToSize(bitmap, width, height, "cover");
    ctx.save();
    ctx.filter = "blur(18px)";
    ctx.drawImage(
      bitmap,
      cover.x - cover.width * 0.04,
      cover.y - cover.height * 0.04,
      cover.width * 1.08,
      cover.height * 1.08,
    );
    ctx.restore();
    ctx.fillStyle = "rgba(5, 3, 10, 0.12)";
    ctx.fillRect(0, 0, width, height);
  }

  const contain = fitRectToSize(bitmap, width, height, "contain");
  const zoom = settings.kenBurns ? 1 + 0.07 * motionProgress : 1;
  const drawWidth = contain.width * zoom;
  const drawHeight = contain.height * zoom;
  const maxPanX = Math.max(0, (drawWidth - contain.width) * 0.5);
  const maxPanY = Math.max(0, (drawHeight - contain.height) * 0.5);
  const panX = settings.kenBurns ? (photo.interest.x - 0.5) * maxPanX * 1.25 * motionProgress : 0;
  const panY = settings.kenBurns ? (photo.interest.y - 0.5) * maxPanY * 1.25 * motionProgress : 0;
  const x = contain.x - (drawWidth - contain.width) * 0.5 - panX;
  const y = contain.y - (drawHeight - contain.height) * 0.5 - panY;

  ctx.drawImage(bitmap, x, y, drawWidth, drawHeight);
  ctx.restore();
}

function applySlideTransform(ctx, transition, progress, width, height) {
  if (transition === "slideright") {
    ctx.translate(-width * (1 - progress), 0);
  } else if (transition === "slideup") {
    ctx.translate(0, height * (1 - progress));
  } else if (transition === "slidedown") {
    ctx.translate(0, -height * (1 - progress));
  } else {
    ctx.translate(width * (1 - progress), 0);
  }
}

function applyWipeClip(ctx, transition, progress, width, height) {
  ctx.beginPath();
  if (transition === "wiperight") {
    ctx.rect(width * (1 - progress), 0, width * progress, height);
  } else if (transition === "wipeup") {
    ctx.rect(0, height * (1 - progress), width, height * progress);
  } else if (transition === "wipedown") {
    ctx.rect(0, 0, width, height * progress);
  } else {
    ctx.rect(0, 0, width * progress, height);
  }
  ctx.clip();
}

function fitRectToSize(bitmap, width, height, mode) {
  const scale =
    mode === "cover"
      ? Math.max(width / bitmap.width, height / bitmap.height)
      : Math.min(width / bitmap.width, height / bitmap.height);
  const rectWidth = bitmap.width * scale;
  const rectHeight = bitmap.height * scale;
  return {
    width: rectWidth,
    height: rectHeight,
    x: (width - rectWidth) / 2,
    y: (height - rectHeight) / 2,
  };
}

function getMotionProgress(localTime, duration) {
  return clampNumber(localTime / duration, 0, 1);
}

function easeInOut(value) {
  const t = clampNumber(value, 0, 1);
  return t * t * (3 - 2 * t);
}

async function concatenateSlideshowLoops(sourceName, loopCount, onePassEstimate) {
  const outputName = "looped_output.mp4";
  const listName = "loop_list.txt";
  const fileList = Array.from({ length: loopCount }, () => `file '${sourceName}'`).join("\n");
  await ffmpeg.writeFile(listName, new TextEncoder().encode(`${fileList}\n`));
  await runFFmpeg(
    ["-f", "concat", "-safe", "0", "-i", listName, "-c", "copy", outputName],
    "",
    {
      ...onePassEstimate,
      durationSeconds: onePassEstimate.durationSeconds * loopCount,
      totalFrames: onePassEstimate.totalFrames * loopCount,
      lastFrame: 0,
      lastFps: 0,
    },
    {
      kind: "final",
      showProgress: true,
      statusTarget: "preview",
      statusLabel: "Rendering",
    },
  );
  return outputName;
}

async function addContinuousAudio(videoName, durationSeconds) {
  if (!state.audio) return videoName;

  const audioName = await writeAudio();
  const outputName = "audio_output.mp4";
  await runFFmpeg(
    [
      "-i",
      videoName,
      "-stream_loop",
      "-1",
      "-i",
      audioName,
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-af",
      "loudnorm=I=-10.5:TP=-1.5:LRA=11",
      "-shortest",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outputName,
    ],
    "",
    {
      durationSeconds,
      fps: 30,
      totalFrames: Math.max(1, Math.round(durationSeconds * 30)),
      lastFrame: 0,
      lastFps: 0,
    },
    {
      kind: "final",
      showProgress: true,
      statusTarget: "preview",
      statusLabel: "Rendering",
    },
  );
  return outputName;
}

function setBusy(isBusy) {
  els.generateButton.disabled = true;
  if (!isBusy) {
    els.generateButton.disabled = false;
  }
}

function createRenderEstimate(photoCount, settings) {
  const selectedTransition = document.querySelector("input[name='transition']:checked").value;
  const useHardCuts = selectedTransition === "hardcut" || photoCount === 1;
  const transitionDuration = Math.min(settings.transitionDuration, settings.imageDuration - 0.1);
  let durationSeconds = photoCount * settings.imageDuration;
  if (!useHardCuts && !settings.loopTransition) {
    durationSeconds += transitionDuration;
  }
  const totalFrames = Math.max(1, Math.round(durationSeconds * settings.fps));
  return {
    durationSeconds,
    fps: settings.fps,
    totalFrames,
    lastFrame: 0,
    lastFps: 0,
  };
}

function updateRenderProgressFromLog(message) {
  if (!state.currentRender) return;

  const frameMatch = message.match(/frame=\s*(\d+)/);
  const fpsMatch = message.match(/fps=\s*([\d.]+)/);
  const timeMatch = message.match(/time=(\d+):(\d+):([\d.]+)/);

  let frame = frameMatch ? Number(frameMatch[1]) : 0;
  if (!frame && timeMatch) {
    const seconds =
      Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]);
    frame = Math.round(seconds * state.currentRender.fps);
  }
  if (!frame) return;

  state.currentRender.lastFrame = Math.max(state.currentRender.lastFrame, frame);
  state.currentRender.lastFps = fpsMatch ? Number(fpsMatch[1]) : state.currentRender.lastFps;
  state.currentRender.lastActivityAt = performance.now();

  const progress = Math.min(0.95, state.currentRender.lastFrame / state.currentRender.totalFrames);
  if (state.currentRender.showProgress) {
    els.progressBar.value = progress;
  }
  updateRenderEta(progress);
}

function updateRenderEta(progress) {
  if (!state.currentRender || progress <= 0.01) return;

  const elapsedSeconds = (performance.now() - state.currentRender.startedAt) / 1000;
  const remainingSeconds = Math.max(0, (elapsedSeconds / progress) - elapsedSeconds);
  const percent = Math.max(1, Math.min(99, Math.round(progress * 100)));
  const message = `${state.currentRender.statusLabel} · ${percent}% · about ${formatDuration(remainingSeconds)} left`;
  if (state.currentRender.statusTarget === "preview") {
    setInlinePreviewStatus(message);
  } else {
    setStatus(message);
  }
}

function getOutputGeometry() {
  const orientation = document.querySelector("input[name='orientation']:checked")?.value || "horizontal";
  const preset = getQualityPreset();
  return orientation === "vertical"
    ? { orientation, width: preset.height, height: preset.width }
    : { orientation, width: preset.width, height: preset.height };
}

function getQualityPreset() {
  return qualityPresets[els.qualityRange.value] || qualityPresets[3];
}

function handleRenderError(error) {
  console.error(error);
  const message = normalizeError(error);
  state.logText += `\n${message}\n`;
  setInlinePreviewStatus(message);
  setStatus(message);
}

async function canvasToBlob(canvas, quality = 0.9) {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Could not prepare a canvas frame for FFmpeg."));
        }
      },
      "image/jpeg",
      quality,
    );
  });
}

async function writeAudio() {
  if (!state.audio) return null;
  const name = `music.${extensionFromName(state.audio.name, "audio")}`;
  await ffmpeg.writeFile(name, await fetchFile(state.audio));
  return name;
}

function findPointOfInterest(bitmap) {
  const size = 72;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let bestScore = -Infinity;
  let bestX = size / 2;
  let bestY = size / 2;

  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const i = (y * size + x) * 4;
      const left = (y * size + x - 1) * 4;
      const right = (y * size + x + 1) * 4;
      const up = ((y - 1) * size + x) * 4;
      const down = ((y + 1) * size + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const edge =
        Math.abs(luminance - luma(data, left)) +
        Math.abs(luminance - luma(data, right)) +
        Math.abs(luminance - luma(data, up)) +
        Math.abs(luminance - luma(data, down));
      const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      const colorContrast =
        Math.abs(r - data[left]) +
        Math.abs(g - data[up + 1]) +
        Math.abs(b - data[right + 2]);
      const dx = x / (size - 1) - 0.5;
      const dy = y / (size - 1) - 0.5;
      const centerBias = Math.max(0, 1 - Math.hypot(dx, dy) * 1.35);
      const score = edge * 1.45 + saturation * 90 + colorContrast * 0.22 + centerBias * 44;

      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestY = y;
      }
    }
  }

  return {
    x: bestX / (size - 1),
    y: bestY / (size - 1),
  };
}

function luma(data, index) {
  return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickTransition(selectedTransition) {
  if (selectedTransition === "random") {
    const options = [...transitionMap.fade, ...transitionMap.slideleft, ...transitionMap.wipeleft];
    return options[Math.floor(Math.random() * options.length)];
  }
  const options = transitionMap[selectedTransition] || ["fade"];
  return options[Math.floor(Math.random() * options.length)];
}

async function publishOutput(blob, saveTarget) {
  const outputName = saveTarget.name;

  if (!saveTarget.handle) {
    const url = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = url;
    download.download = outputName;
    download.style.display = "none";
    document.body.append(download);
    download.click();
    download.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }

  const writable = await saveTarget.handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function getOutputName() {
  return "video-wizard-slideshow.mp4";
}

async function requestSaveTarget() {
  if (!("showSaveFilePicker" in window)) {
    return { handle: null, name: getOutputName() };
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: getOutputName(),
      types: [
        {
          description: "MP4 video",
          accept: { "video/mp4": [".mp4"] },
        },
      ],
    });
    return { handle, name: handle.name };
  } catch (error) {
    if (error.name === "AbortError") return null;
    throw error;
  }
}

async function cleanWorkspace() {
  const entries = await ffmpeg.listDir("/");
  await Promise.all(
    entries
      .filter((entry) => entry.name !== "." && entry.name !== "..")
      .map((entry) => ffmpeg.deleteFile(entry.name).catch(() => undefined)),
  );
}

function extensionFromName(name, fallback) {
  const ext = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || fallback;
}

function normalizeError(error) {
  const message = typeof error === "string" ? error : error?.message;
  return message || `Something went wrong during the render. ${getLogTail()}`;
}

function getLogTail() {
  const lines = state.logText.trim().split("\n").filter(Boolean);
  return lines.slice(-6).join(" ");
}

function handlePhotoDragStart(event) {
  const card = event.currentTarget;
  state.draggedPhotoId = card.dataset.photoId;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.draggedPhotoId);
}

function handlePhotoDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add("is-drop-target");
  event.dataTransfer.dropEffect = "move";
}

function handlePhotoDragLeave(event) {
  event.currentTarget.classList.remove("is-drop-target");
}

function handlePhotoDrop(event) {
  event.preventDefault();
  const targetId = event.currentTarget.dataset.photoId;
  const draggedId = state.draggedPhotoId || event.dataTransfer.getData("text/plain");
  event.currentTarget.classList.remove("is-drop-target");

  if (!draggedId || draggedId === targetId) return;

  const fromIndex = state.photos.findIndex((photo) => photo.id === draggedId);
  const toIndex = state.photos.findIndex((photo) => photo.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return;

  const [draggedPhoto] = state.photos.splice(fromIndex, 1);
  state.photos.splice(toIndex, 0, draggedPhoto);
  renderPhotos();
  updateLivePreview();
}

function handlePhotoDragEnd() {
  state.draggedPhotoId = null;
  els.trashDrop.classList.remove("is-drag-over");
  els.photoStrip
    .querySelectorAll(".is-dragging, .is-drop-target")
    .forEach((item) => item.classList.remove("is-dragging", "is-drop-target"));
}

function handleTrashDragOver(event) {
  if (!state.draggedPhotoId && !event.dataTransfer.getData("text/plain")) return;
  event.preventDefault();
  els.trashDrop.classList.add("is-drag-over");
  event.dataTransfer.dropEffect = "move";
}

function handleTrashDragLeave() {
  els.trashDrop.classList.remove("is-drag-over");
}

function handleTrashDrop(event) {
  event.preventDefault();
  const draggedId = state.draggedPhotoId || event.dataTransfer.getData("text/plain");
  els.trashDrop.classList.remove("is-drag-over");
  if (!draggedId) return;

  const index = state.photos.findIndex((photo) => photo.id === draggedId);
  if (index < 0) return;

  const [removedPhoto] = state.photos.splice(index, 1);
  URL.revokeObjectURL(removedPhoto.url);
  state.draggedPhotoId = null;
  renderPhotos();
  updateLoopControls();
  updateFileSizeEstimate();
  updateLivePreview();
}

function setStatus(message) {
  els.statusText.textContent = message;
}

function setPreviewStatus(message) {
  els.statusText.textContent = message;
}

function setInlinePreviewStatus(message) {
  els.previewStatus.textContent = message;
}
