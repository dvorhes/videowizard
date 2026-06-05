import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js";
import { fetchFile, toBlobURL } from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js";

const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";
const WHISPER_CHUNK_SECONDS = 24;
const WHISPER_STRIDE_SECONDS = 4;
const CAPTION_WHISPER_MODEL = "onnx-community/whisper-base.en_timestamped";
const CAPTION_WHISPER_MODEL_LABEL = "Whisper Base English";
const CAPTION_SNAP_TOLERANCE_FRAMES = 5;
const CAPTION_JOIN_GAP_SECONDS = 0.5;
const CAPTION_HOLD_SECONDS = 0.75;
const CAPTION_CUTPOINT_PIN_SECONDS = 0.12;
const MIN_CAPTION_DURATION_SECONDS = 0.05;
const ONE_WORD_CAPTION_LENGTH_THRESHOLD = 6;
const DEFAULT_CAPTION_FONT = "TikTok Sans";
const DEFAULT_CAPTION_FONT_WEIGHT = "600";
const CAPTION_SPACING_REFERENCE_FONT_SIZE = 50;
const CAPTION_FONT_LIBRARY = Object.freeze({
  "TikTok Sans": {
    defaultWeight: DEFAULT_CAPTION_FONT_WEIGHT,
    weights: [
      { value: "300", label: "Light", file: "assets/fonts/TikTok_Sans/static/TikTokSans-Light.ttf" },
      { value: "400", label: "Regular", file: "assets/fonts/TikTok_Sans/static/TikTokSans-Regular.ttf" },
      { value: "500", label: "Medium", file: "assets/fonts/TikTok_Sans/static/TikTokSans-Medium.ttf" },
      { value: "600", label: "Semi Bold", file: "assets/fonts/TikTok_Sans/static/TikTokSans-SemiBold.ttf" },
      { value: "700", label: "Bold", file: "assets/fonts/TikTok_Sans/static/TikTokSans-Bold.ttf" },
      { value: "800", label: "Extra Bold", file: "assets/fonts/TikTok_Sans/static/TikTokSans-ExtraBold.ttf" },
      { value: "900", label: "Black", file: "assets/fonts/TikTok_Sans/static/TikTokSans-Black.ttf" },
    ],
  },
  "Lato": {
    defaultWeight: "700",
    weights: [
      { value: "100", label: "Thin", file: "assets/fonts/Lato/Lato-Thin.ttf" },
      { value: "300", label: "Light", file: "assets/fonts/Lato/Lato-Light.ttf" },
      { value: "400", label: "Regular", file: "assets/fonts/Lato/Lato-Regular.ttf" },
      { value: "700", label: "Bold", file: "assets/fonts/Lato/Lato-Bold.ttf" },
      { value: "900", label: "Black", file: "assets/fonts/Lato/Lato-Black.ttf" },
    ],
  },
  "Crimson Text": {
    defaultWeight: "600",
    weights: [
      { value: "400", label: "Regular", file: "assets/fonts/Crimson_Text/CrimsonText-Regular.ttf" },
      { value: "600", label: "Semi Bold", file: "assets/fonts/Crimson_Text/CrimsonText-SemiBold.ttf" },
      { value: "700", label: "Bold", file: "assets/fonts/Crimson_Text/CrimsonText-Bold.ttf" },
    ],
  },
  "Merriweather": {
    defaultWeight: "600",
    weights: [
      { value: "300", label: "Light", file: "assets/fonts/Merriweather/static/Merriweather_24pt-Light.ttf" },
      { value: "400", label: "Regular", file: "assets/fonts/Merriweather/static/Merriweather_24pt-Regular.ttf" },
      { value: "500", label: "Medium", file: "assets/fonts/Merriweather/static/Merriweather_24pt-Medium.ttf" },
      { value: "600", label: "Semi Bold", file: "assets/fonts/Merriweather/static/Merriweather_24pt-SemiBold.ttf" },
      { value: "700", label: "Bold", file: "assets/fonts/Merriweather/static/Merriweather_24pt-Bold.ttf" },
      { value: "800", label: "Extra Bold", file: "assets/fonts/Merriweather/static/Merriweather_24pt-ExtraBold.ttf" },
      { value: "900", label: "Black", file: "assets/fonts/Merriweather/static/Merriweather_24pt-Black.ttf" },
    ],
  },
});
const CAPTION_FONT_FAMILIES = new Set(Object.keys(CAPTION_FONT_LIBRARY));
const CRC32_TABLE = new Uint32Array(Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
}));
const els = {
  appTitle: document.querySelector("#app-title"),
  brandMenuButton: document.querySelector("#brandMenuButton"),
  brandMenu: document.querySelector("#brandMenu"),
  captionHelp: document.querySelector("#captionHelp"),
  captionHelpButton: document.querySelector("#captionHelpButton"),
  captionHelpPopover: document.querySelector("#captionHelpPopover"),
  slideshowPage: document.querySelector("#slideshowPage"),
  captionsPage: document.querySelector("#captionsPage"),
  captionVideoInput: document.querySelector("#captionVideoInput"),
  captionVideoName: document.querySelector("#captionVideoName"),
  captionVideoDropIcon: document.querySelector(".captions-dropzone .drop-icon"),
  captionVideoDropTitle: document.querySelector(".captions-dropzone .drop-title"),
  renderCaptionsButton: document.querySelector("#renderCaptionsButton"),
  exportSrtButton: document.querySelector("#exportSrtButton"),
  exportEdlPngButton: document.querySelector("#exportEdlPngButton"),
  captionProgressGroup: document.querySelector("#captionProgressGroup"),
  captionProgressLabel: document.querySelector("#captionProgressLabel"),
  captionProgressPercent: document.querySelector("#captionProgressPercent"),
  captionProgressBar: document.querySelector("#captionProgressBar"),
  captionStatus: document.querySelector("#captionStatus"),
  captionDiagnostics: document.querySelector("#captionDiagnostics"),
  captionEditorContainer: document.querySelector(".caption-editor"),
  captionEditor: document.querySelector("#captionEditor"),
  captionEditorSelection: document.querySelector("#captionEditorSelection"),
  captionFont: document.querySelector("#captionFont"),
  captionFontWeight: document.querySelector("#captionFontWeight"),
  captionFontSize: document.querySelector("#captionFontSize"),
  captionFontSizeValue: document.querySelector("#captionFontSizeValue"),
  captionParagraphAlign: document.querySelector("#captionParagraphAlign"),
  captionParagraphButtons: document.querySelectorAll("[data-caption-align-value]"),
  captionColor: document.querySelector("#captionColor"),
  captionStroke: document.querySelector("#captionStroke"),
  captionStrokeValue: document.querySelector("#captionStrokeValue"),
  captionStrokeEnabled: document.querySelector("#captionStrokeEnabled"),
  captionStrokeColor: document.querySelector("#captionStrokeColor"),
  captionDropShadow: document.querySelector("#captionDropShadow"),
  captionDropShadowValue: document.querySelector("#captionDropShadowValue"),
  captionDropShadowEnabled: document.querySelector("#captionDropShadowEnabled"),
  captionDropShadowColor: document.querySelector("#captionDropShadowColor"),
  captionTracking: document.querySelector("#captionTracking"),
  captionTrackingValue: document.querySelector("#captionTrackingValue"),
  captionLeading: document.querySelector("#captionLeading"),
  captionLeadingValue: document.querySelector("#captionLeadingValue"),
  captionLeadingControl: document.querySelector("#captionLeadingControl"),
  captionPositionX: document.querySelector("#captionPositionX"),
  captionPositionXValue: document.querySelector("#captionPositionXValue"),
  captionPositionY: document.querySelector("#captionPositionY"),
  captionPositionYValue: document.querySelector("#captionPositionYValue"),
  captionTextBox: document.querySelector("#captionTextBox"),
  captionTextBoxButtons: document.querySelectorAll("[data-caption-box-value]"),
  captionTextBoxDetailRow: document.querySelector(".text-box-detail-row"),
  captionTextBoxColor: document.querySelector("#captionTextBoxColor"),
  captionTextBoxOpacity: document.querySelector("#captionTextBoxOpacity"),
  captionTextBoxOpacityValue: document.querySelector("#captionTextBoxOpacityValue"),
  captionTextBoxRoundness: document.querySelector("#captionTextBoxRoundness"),
  captionTextBoxRoundnessValue: document.querySelector("#captionTextBoxRoundnessValue"),
  captionTextBoxPadding: document.querySelector("#captionTextBoxPadding"),
  captionTextBoxPaddingValue: document.querySelector("#captionTextBoxPaddingValue"),
  captionPaddingControl: document.querySelector("#captionPaddingControl"),
  captionLength: document.querySelector("#captionLength"),
  captionLengthValue: document.querySelector("#captionLengthValue"),
  captionLines: document.querySelector("#captionLines"),
  captionLinesValue: document.querySelector("#captionLinesValue"),
  captionPreview: document.querySelector(".caption-preview"),
  captionPreviewFrame: document.querySelector(".caption-preview-frame"),
  captionPreviewVideo: document.querySelector("#captionPreviewVideo"),
  captionPreviewCanvas: document.querySelector("#captionPreviewCanvas"),
  captionPreviewStatus: document.querySelector("#captionPreviewStatus"),
  captionPreviewTime: document.querySelector("#captionPreviewTime"),
  captionPreviewTimeline: document.querySelector("#captionPreviewTimeline"),
  captionPreviewRuler: document.querySelector("#captionPreviewRuler"),
  captionPreviewCaptionLane: document.querySelector("#captionPreviewCaptionLane"),
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
  captionVideo: null,
  captionVideoUrl: null,
  captionVideoGeometry: null,
  captionJobId: null,
  captionTranscript: null,
  captionTranscriptRaw: null,
  captionSpeechOnset: null,
  captionCutPoints: [],
  captions: [],
  captionOutputUrl: null,
  transformersModule: null,
  captionTranscriber: null,
  captionTranscriberModel: null,
  captionTranscriberDevice: null,
  captionTranscriptionAbort: null,
  captionEditDebounce: null,
  captionSourceWords: [],
  captionPreviewAnimation: null,
  captionVisibleCrop: null,
  captionAnalysisToken: 0,
  captionUndoHistory: [],
  captionPendingSettingsSnapshot: null,
  isRestoringCaptionSettings: false,
  captionFontReady: false,
  captionFontReadyPromise: null,
  captionLoadedFonts: new Set(),
  captionFontReadyPromises: new Map(),
  activeInlineDrag: null,
  activeTimelineScrub: null,
  captionTimelineLastClick: null,
  captionPreviewHudTimer: null,
  captionPositionInitialized: false,
  captionProgressSmoothTimer: null,
  captionProgressSmooth: null,
  captionSelectedId: null,
  captionSelectedBoundary: null,
  captionEditorHighlightedBlockIndex: null,
  captionSelectionNeedsStartAnchor: false,
  suppressCaptionEditorCursorActivity: false,
  captionPreviewWindow: null,
  captionPreviewZoomSeconds: null,
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

const routes = {
  "/": {
    key: "slideshow",
    title: "Slideshow Generator",
    page: els.slideshowPage,
  },
  "/captions": {
    key: "captions",
    title: "Captions",
    page: els.captionsPage,
  },
};

populateCaptionFontFamilyOptions();
syncCaptionFontWeightOptions(DEFAULT_CAPTION_FONT_WEIGHT);

els.brandMenuButton.addEventListener("click", toggleBrandMenu);
els.brandMenu.addEventListener("click", handleBrandMenuClick);
els.captionHelpButton.addEventListener("click", toggleCaptionHelp);
document.addEventListener("click", closeBrandMenuOnOutsideClick);
document.addEventListener("click", closeCaptionHelpOnOutsideClick);
document.addEventListener("keydown", handleGlobalKeydown);
window.addEventListener("popstate", renderRoute);
window.addEventListener("resize", () => {
  if (state.captionVideoGeometry?.width && state.captionVideoGeometry?.height) {
    applyCaptionPreviewGeometry(state.captionVideoGeometry);
    updateCaptionOverlay();
  }
});
els.captionVideoInput.addEventListener("change", handleCaptionVideo);
els.captionVideoInput.addEventListener("click", guardCaptionVideoReplacement);
els.renderCaptionsButton.addEventListener("click", renderCaptionedVideo);
els.exportSrtButton.addEventListener("click", exportCaptionSrt);
els.exportEdlPngButton.addEventListener("click", exportCaptionEdlPng);
els.captionEditor.addEventListener("input", handleCaptionEditorInput);
els.captionEditor.addEventListener("click", handleCaptionCursorActivity);
els.captionEditor.addEventListener("keyup", handleCaptionCursorActivity);
els.captionEditor.addEventListener("keydown", handleCaptionEditorKeydown);
els.captionEditor.addEventListener("select", handleCaptionCursorActivity);
els.captionEditor.addEventListener("scroll", updateCaptionEditorSelectionHighlight);
els.captionPreviewVideo.addEventListener("timeupdate", updateCaptionOverlay);
els.captionPreviewVideo.addEventListener("seeked", updateCaptionOverlay);
els.captionPreviewVideo.addEventListener("play", () => {
  hideCaptionPreviewTimecode(true);
  updateCaptionPreviewControls();
  updateCaptionOverlay();
});
els.captionPreviewVideo.addEventListener("pause", () => {
  showCaptionPreviewTimecode();
  updateCaptionPreviewControls();
  updateCaptionOverlay();
});
els.captionPreviewVideo.addEventListener("loadeddata", updateCaptionOverlay);
els.captionPreviewVideo.addEventListener("loadedmetadata", () => {
  updateCaptionPreviewControls();
  renderCaptionPreviewTimeline();
  updateCaptionOverlay();
});
els.captionPreviewVideo.addEventListener("click", handleCaptionPreviewClick);
els.captionPreviewVideo.addEventListener("dblclick", handleCaptionPreviewDoubleClick);
els.captionPreviewCanvas.addEventListener("click", handleCaptionPreviewClick);
els.captionPreviewCanvas.addEventListener("dblclick", handleCaptionPreviewDoubleClick);
els.captionPreviewFrame.addEventListener("click", handleCaptionPreviewClick);
els.captionPreviewFrame.addEventListener("dblclick", handleCaptionPreviewDoubleClick);
els.captionPreviewFrame.addEventListener("keydown", handleCaptionPreviewKeydown);
els.captionPreviewTimeline.addEventListener("pointerdown", handleCaptionTimelinePointerDown);
els.captionPreviewTimeline.addEventListener("click", handleCaptionTimelineClick);
els.captionPreviewTimeline.addEventListener("pointermove", handleCaptionTimelinePointerMove);
els.captionPreviewTimeline.addEventListener("pointerup", endCaptionTimelineScrub);
els.captionPreviewTimeline.addEventListener("pointercancel", endCaptionTimelineScrub);
els.captionPreviewTimeline.addEventListener("pointerleave", clearCaptionTimelineHoverState);
els.captionPreviewTimeline.addEventListener("keydown", handleCaptionTimelineKeydown);
[els.captionLength, els.captionLines].forEach((input) => {
  input.addEventListener("focus", captureCaptionSettingsSnapshot);
  input.addEventListener("pointerdown", captureCaptionSettingsSnapshot);
  input.addEventListener("keydown", captureCaptionSettingsSnapshot);
  input.addEventListener("input", handleCaptionLayoutChange);
  input.addEventListener("change", commitCaptionSettingsSnapshot);
  input.addEventListener("blur", commitCaptionSettingsSnapshot);
});
els.captionFont.addEventListener("input", handleCaptionFontFamilyChange);
els.captionFont.addEventListener("change", handleCaptionFontFamilyChange);
[els.captionFont, els.captionFontWeight, els.captionFontSize, els.captionParagraphAlign, els.captionColor, els.captionStroke, els.captionStrokeEnabled, els.captionStrokeColor, els.captionDropShadow, els.captionDropShadowEnabled, els.captionDropShadowColor, els.captionTracking, els.captionLeading, els.captionPositionX, els.captionPositionY, els.captionTextBox, els.captionTextBoxColor, els.captionTextBoxOpacity, els.captionTextBoxRoundness, els.captionTextBoxPadding].forEach((input) => {
  input.addEventListener("focus", captureCaptionSettingsSnapshot);
  input.addEventListener("pointerdown", captureCaptionSettingsSnapshot);
  input.addEventListener("keydown", captureCaptionSettingsSnapshot);
  input.addEventListener("input", handleCaptionStyleChange);
  input.addEventListener("change", handleCaptionStyleChange);
  input.addEventListener("change", commitCaptionSettingsSnapshot);
  input.addEventListener("blur", commitCaptionSettingsSnapshot);
});
[
  [els.captionFontSizeValue, els.captionFontSize],
  [els.captionStrokeValue, els.captionStroke],
  [els.captionDropShadowValue, els.captionDropShadow],
  [els.captionTrackingValue, els.captionTracking],
  [els.captionLeadingValue, els.captionLeading],
  [els.captionPositionXValue, els.captionPositionX],
  [els.captionPositionYValue, els.captionPositionY],
  [els.captionTextBoxOpacityValue, els.captionTextBoxOpacity],
  [els.captionTextBoxRoundnessValue, els.captionTextBoxRoundness],
  [els.captionTextBoxPaddingValue, els.captionTextBoxPadding],
  [els.captionLengthValue, els.captionLength],
  [els.captionLinesValue, els.captionLines],
].forEach(([valueInput, slider]) => {
  valueInput.addEventListener("focus", captureCaptionSettingsSnapshot);
  valueInput.addEventListener("pointerdown", captureCaptionSettingsSnapshot);
  valueInput.addEventListener("pointerdown", (event) => beginInlineValueDrag(event, valueInput, slider));
  valueInput.addEventListener("click", (event) => handleInlineValueClick(event, valueInput));
  valueInput.addEventListener("keydown", (event) => handleInlineValueKeydown(event, valueInput, slider));
  valueInput.addEventListener("blur", () => commitInlineValueInput(valueInput, slider));
});
els.captionTextBoxButtons.forEach((button) => {
  button.addEventListener("click", () => {
    captureCaptionSettingsSnapshot();
    setCaptionTextBoxMode(button.dataset.captionBoxValue || "none");
    handleCaptionStyleChange();
    commitCaptionSettingsSnapshot();
  });
});
els.captionParagraphButtons.forEach((button) => {
  button.addEventListener("click", () => {
    captureCaptionSettingsSnapshot();
    setCaptionParagraphAlign(button.dataset.captionAlignValue || "center");
    handleCaptionStyleChange();
    commitCaptionSettingsSnapshot();
  });
});
document.addEventListener("pointermove", handleInlineValueDragMove);
document.addEventListener("pointerup", endInlineValueDrag);
document.addEventListener("pointercancel", endInlineValueDrag);
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
updateCaptionSettingsLabels();
updateCaptionActionAvailability();
resetCaptionProgress();
setCaptionTextBoxMode(els.captionTextBox.value || "none");
setCaptionParagraphAlign(els.captionParagraphAlign.value || "center");
ensureCaptionFontReady();
renderRoute();

function toggleBrandMenu(event) {
  event.stopPropagation();
  els.brandMenuButton.classList.remove("is-jittering");
  void els.brandMenuButton.offsetWidth;
  els.brandMenuButton.classList.add("is-jittering");
  setBrandMenuOpen(els.brandMenu.hidden);
}

function setBrandMenuOpen(isOpen) {
  els.brandMenu.hidden = !isOpen;
  els.brandMenuButton.setAttribute("aria-expanded", String(isOpen));
}

function closeBrandMenuOnOutsideClick(event) {
  if (els.brandMenu.hidden) return;
  if (event.target.closest(".brand-nav")) return;
  setBrandMenuOpen(false);
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape") {
    setBrandMenuOpen(false);
    closeCaptionHelp();
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && shouldHandleCaptionUndo(event.target)) {
    event.preventDefault();
    undoCaptionChange();
  }
}

function handleBrandMenuClick(event) {
  const link = event.target.closest("a[data-route]");
  if (!link) return;
  event.preventDefault();
  const url = new URL(link.href);
  if (url.pathname !== window.location.pathname) {
    history.pushState({}, "", url.pathname);
  }
  renderRoute();
  setBrandMenuOpen(false);
}

function renderRoute() {
  const route = routes[window.location.pathname] || routes["/"];
  Object.values(routes).forEach((item) => {
    item.page.hidden = item.key !== route.key;
  });
  els.appTitle.textContent = route.title;
  els.captionHelp.hidden = route.key !== "captions";
  if (route.key !== "captions") closeCaptionHelp();
  document.title = `Video Wizard ${route.title}`;
  els.brandMenu
    .querySelectorAll("a[data-route]")
    .forEach((link) => {
      link.setAttribute("aria-current", link.dataset.route === route.key ? "page" : "false");
    });
}

function toggleCaptionHelp(event) {
  event.stopPropagation();
  const shouldOpen = els.captionHelpPopover.hidden;
  els.captionHelpPopover.hidden = !shouldOpen;
  els.captionHelpButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
}

function closeCaptionHelp() {
  els.captionHelpPopover.hidden = true;
  els.captionHelpButton.setAttribute("aria-expanded", "false");
}

function closeCaptionHelpOnOutsideClick(event) {
  if (els.captionHelp.hidden || els.captionHelpPopover.hidden) return;
  if (event.target.closest("#captionHelp")) return;
  closeCaptionHelp();
}

function hasCaptionWorkInProgress() {
  return Boolean(
    state.captionVideo
    || state.captionVideoUrl
    || state.captions.length
    || state.captionTranscript
    || state.captionEditor.value.trim(),
  );
}

function guardCaptionVideoReplacement(event) {
  if (!hasCaptionWorkInProgress()) return;
  const shouldReplace = window.confirm("Replace the current video? You will lose the caption work you have done so far.");
  if (shouldReplace) {
    event.currentTarget.value = "";
    return;
  }
  event.preventDefault();
}

function handleCaptionVideo(event) {
  const file = event.target.files[0] || null;
  els.captionVideoInput.blur();
  const token = ++state.captionAnalysisToken;
  state.captionVideo = file;
  state.captionVideoGeometry = null;
  state.captionJobId = null;
  state.captionTranscript = null;
  state.captionTranscriptRaw = null;
  state.captionSpeechOnset = null;
  state.captionPositionInitialized = false;
  state.captionCutPoints = [];
  state.captions = [];
  state.captionSelectedId = null;
  state.captionPreviewWindow = null;
  state.captionPreviewZoomSeconds = null;
  state.captionSourceWords = [];
  state.captionVisibleCrop = null;
  els.captionEditor.value = "";
  setCaptionDiagnostics("");
  clearCaptionPreviewCanvas();
  updateCaptionActionAvailability();

  if (state.captionVideoUrl) URL.revokeObjectURL(state.captionVideoUrl);
  state.captionVideoUrl = file ? URL.createObjectURL(file) : null;
  resetCaptionPreviewGeometry();
  els.captionPreview.classList.toggle("has-video", Boolean(file));
  updateCaptionPreviewControls();
  renderCaptionPreviewTimeline();
  els.captionVideoName.textContent = file ? file.name : "";
  els.captionVideoDropIcon.textContent = "+";
  els.captionVideoDropIcon.hidden = Boolean(file);
  els.captionVideoDropTitle.hidden = Boolean(file);
  setCaptionStatus(file ? "" : "Load a local video file.");
  if (file) {
    setCaptionProgress(0, "Video loaded");
  } else {
    resetCaptionProgress();
  }

  if (file) {
    els.captionPreviewVideo.addEventListener("loadedmetadata", handleCaptionPreviewMetadata, {
      once: true,
    });
  }
  els.captionPreviewVideo.preload = "auto";
  els.captionPreviewVideo.src = state.captionVideoUrl || "";
  els.captionPreviewVideo.load();
  if (!file) {
    els.captionPreviewVideo.removeAttribute("src");
    els.captionPreviewVideo.load();
    setCaptionBusy(false);
    return;
  }

  els.captionPreviewFrame.focus({ preventScroll: true });
  analyzeCaptionVideo(token);
}

async function analyzeCaptionVideo(token = state.captionAnalysisToken) {
  if (!state.captionVideo) {
    setCaptionStatus("Choose a video first.");
    return;
  }

  setCaptionBusy(true);
  setCaptionProgress(3, "Preparing transcription");
  setCaptionStatus("");
  setCaptionDiagnostics("");
  state.captionJobId = null;

  try {
    const cutPointsPromise = prepareCaptionCutPoints({ silent: true, token });
    const payload = await analyzeCaptionVideoInBrowser();
    if (token !== state.captionAnalysisToken) return;
    state.captionTranscript = payload.transcript;
    state.captionTranscriptRaw = payload.transcript.raw || null;
    state.captionSourceWords = payload.transcript.words.map((word) => ({ ...word }));
    state.captionVideoGeometry = mergeCaptionVideoMetadata(payload.metadata, state.captionVideoGeometry);
    applyCaptionPreviewGeometry(state.captionVideoGeometry);
    await cutPointsPromise;
    if (token !== state.captionAnalysisToken) return;
    state.captions = buildCaptionsFromWords(
      state.captionTranscript.words,
      state.captionCutPoints,
      getCaptionSettingsWithGeometry(),
    );
    updateCaptionEditorFromCaptions();
    updateCaptionActionAvailability();
    syncCaptionSelection();
    renderCaptionPreviewTimeline();
    updateCaptionOverlay();
    setCaptionProgress(100, "Done");
    window.setTimeout(() => {
      if (token === state.captionAnalysisToken && state.captionTranscript?.words?.length) {
        setCaptionStatus("");
        setCaptionDiagnostics("");
        resetCaptionProgress();
      }
    }, 900);
  } catch (error) {
    if (token !== state.captionAnalysisToken) return;
    stopCaptionProgressSmoothing();
    setCaptionStatus(normalizeError(error));
  } finally {
    if (token === state.captionAnalysisToken) {
      setCaptionBusy(false);
    }
  }
}

async function analyzeCaptionVideoInBrowser() {
  const metadata = await getCaptionVideoMetadata();
  state.captionVideoGeometry = metadata;
  applyCaptionPreviewGeometry(metadata);
  startCaptionProgressSmoothing(estimateCaptionAnalysisDuration(metadata), "Preparing transcription");

  setCaptionProgress(8, "Reading video metadata");
  const audio = await prepareWhisperAudio(state.captionVideo);

  const transcriber = await getBrowserWhisperTranscriber();
  const startedAt = performance.now();
  const transcript = await transcribeAudioWithBuiltInChunking(transcriber, audio, 16000);
  return { metadata, transcript };
}

async function transcribeAudioWithBuiltInChunking(transcriber, audio, sampleRate) {
  const durationSeconds = audio.length / sampleRate;
  const estimatedChunks = Math.max(
    1,
    Math.ceil(durationSeconds / Math.max(1, WHISPER_CHUNK_SECONDS - WHISPER_STRIDE_SECONDS)),
  );

  setCaptionProgress(35, "Transcribing");

  const result = await transcriber(audio, {
    return_timestamps: "word",
    chunk_length_s: WHISPER_CHUNK_SECONDS,
    stride_length_s: WHISPER_STRIDE_SECONDS,
  });

  setCaptionProgress(92, "Finishing");

  const transcript = applySpeechOnsetCorrection(
    normalizeBrowserTranscript(result, 0, 0, durationSeconds, 0),
    state.captionSpeechOnset,
  );

  return {
    ...transcript,
    raw: {
      video_name: state.captionVideo?.name || null,
      model: CAPTION_WHISPER_MODEL,
      sample_rate: sampleRate,
      chunk_seconds: WHISPER_CHUNK_SECONDS,
      stride_seconds: WHISPER_STRIDE_SECONDS,
      duration_seconds: durationSeconds,
      estimated_chunks: estimatedChunks,
      result: structuredClone(result),
    },
  };
}

async function getBrowserWhisperTranscriber() {
  const model = CAPTION_WHISPER_MODEL;
  if (state.captionTranscriber && state.captionTranscriberModel === model) {
    return state.captionTranscriber;
  }

  const { pipeline, env } = await getTransformersModule();
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1));

  const supportsWebGPU = Boolean(navigator.gpu);
  const device = supportsWebGPU ? "webgpu" : "wasm";
  state.captionTranscriberDevice = device;
  setCaptionProgress(10, "Loading");

  try {
    state.captionTranscriber = await pipeline("automatic-speech-recognition", model, {
      device,
      dtype: device === "webgpu" ? "q4" : "q8",
      progress_callback: updateBrowserModelProgress,
    });
  } catch (error) {
    if (device !== "webgpu") throw error;
    state.captionTranscriberDevice = "wasm";
    setCaptionProgress(10, "Loading");
    state.captionTranscriber = await pipeline("automatic-speech-recognition", model, {
      device: "wasm",
      dtype: "q8",
      progress_callback: updateBrowserModelProgress,
    });
  }

  state.captionTranscriberModel = model;
  return state.captionTranscriber;
}

async function getTransformersModule() {
  if (!state.transformersModule) {
    state.transformersModule = await import(TRANSFORMERS_CDN);
  }
  return state.transformersModule;
}

function updateBrowserModelProgress(progress) {
  if (!progress) return;
  if (progress.status === "progress" && Number.isFinite(progress.progress)) {
    setCaptionProgress(
      12 + Math.round(Math.max(0, Math.min(100, progress.progress)) * 0.23),
      "Loading",
    );
    return;
  }
  if (progress.status === "ready") {
    setCaptionProgress(35, "Loaded");
    return;
  }
  if (progress.status) {
    setCaptionProgress(10, "Loading");
  }
}

async function prepareWhisperAudio(file) {
  setCaptionProgress(10, "Preparing");
  let audioBuffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    await audioContext.close();
  } catch (error) {
    setCaptionProgress(14, "Preparing");
    audioBuffer = await extractAudioBufferWithFFmpeg(file);
  }
  setCaptionProgress(18, "Prepared");
  const mono = resampleToMono(audioBuffer, 16000);
  state.captionSpeechOnset = detectSpeechOnset(mono, 16000);
  return mono;
}

async function extractAudioBufferWithFFmpeg(file) {
  await loadFFmpeg();
  await cleanWorkspace();
  const inputName = `caption-input.${extensionFromName(file.name, "mp4")}`;
  const outputName = "caption-audio.wav";
  await ffmpeg.writeFile(inputName, await fetchFile(file));
  await ffmpeg.exec([
    "-i",
    inputName,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "wav",
    outputName,
  ]);
  const wavData = await ffmpeg.readFile(outputName);
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioContext.decodeAudioData(wavData.buffer.slice(0));
  await audioContext.close();
  return audioBuffer;
}

function resampleToMono(audioBuffer, targetSampleRate) {
  const sourceSampleRate = audioBuffer.sampleRate;
  const sourceLength = audioBuffer.length;
  const outputLength = Math.max(1, Math.round(sourceLength * targetSampleRate / sourceSampleRate));
  const output = new Float32Array(outputLength);
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
    audioBuffer.getChannelData(index),
  );

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * (sourceSampleRate / targetSampleRate);
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(sourceLength - 1, leftIndex + 1);
    const amount = sourceIndex - leftIndex;
    let sample = 0;
    channels.forEach((channel) => {
      sample += channel[leftIndex] * (1 - amount) + channel[rightIndex] * amount;
    });
    output[index] = sample / channels.length;
  }
  return output;
}

function normalizeBrowserTranscript(
  result,
  timestampOffset = 0,
  chunkStartSeconds = 0,
  chunkDurationSeconds = Infinity,
  wordIdOffset = 0,
) {
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  const words = [];
  let previousLocalEnd = 0;

  chunks.forEach((chunk, index) => {
    const timestamp = Array.isArray(chunk?.timestamp) ? chunk.timestamp : [];
    const nextTimestamp = Array.isArray(chunks[index + 1]?.timestamp) ? chunks[index + 1].timestamp : [];
    const text = stripNonDialogueText(chunk?.text || "");
    if (!text) return;

    const rawStart = Number(timestamp[0]);
    const rawEnd = Number(timestamp[1]);
    const nextRawStart = Number(nextTimestamp[0]);
    let localStart = Number.isFinite(rawStart) ? Math.max(0, rawStart - timestampOffset) : null;
    let localEnd = Number.isFinite(rawEnd) ? Math.max(0, rawEnd - timestampOffset) : null;
    const estimatedDuration = estimateCaptionWordDuration(text);

    if (localStart == null && localEnd == null) return;
    if (localStart == null && localEnd != null) {
      localStart = Math.max(previousLocalEnd, localEnd - estimatedDuration);
    }
    if (localEnd == null && localStart != null) {
      localEnd = localStart + estimatedDuration;
    }

    if (localStart != null && localEnd != null) {
      const duration = localEnd - localStart;
      const nextStartsAtEnd = Number.isFinite(nextRawStart)
        ? Math.abs((nextRawStart - timestampOffset) - localEnd) <= 0.08
        : false;
      const hasInflatedLeadingSilence = duration >= Math.max(0.7, estimatedDuration * 3.5);
      const isStartOfFileInflation = index === 0 && localStart <= 0.02;
      const isMidSentenceInflation = nextStartsAtEnd && localStart - previousLocalEnd >= 0.35;

      if (hasInflatedLeadingSilence && (isStartOfFileInflation || isMidSentenceInflation)) {
        localStart = Math.max(previousLocalEnd, localEnd - estimatedDuration);
      }
    }

    localStart = Math.max(0, localStart ?? previousLocalEnd);
    localEnd = Math.max(localStart + MIN_CAPTION_DURATION_SECONDS, localEnd ?? (localStart + estimatedDuration));
    previousLocalEnd = localEnd;

    const absoluteStart = chunkStartSeconds + localStart;
    if (absoluteStart > chunkDurationSeconds + chunkStartSeconds + 0.25) return;

    words.push({
      id: `w${wordIdOffset + index + 1}`,
      text,
      start: absoluteStart,
      end: chunkStartSeconds + localEnd,
    });
  });

  return {
    text: result?.text || words.map((word) => word.text).join(" "),
    words: repairInflatedWordTimings(words),
  };
}

function applySpeechOnsetCorrection(transcript, speechOnsetSeconds) {
  const words = Array.isArray(transcript?.words) ? transcript.words.map((word) => ({ ...word })) : [];
  if (!words.length || !Number.isFinite(speechOnsetSeconds) || speechOnsetSeconds < 0.2) {
    return transcript;
  }

  const onset = Math.max(0, speechOnsetSeconds);
  const firstWord = words[0];
  if (!firstWord || firstWord.start >= onset - 0.12) {
    return transcript;
  }

  const earlyWordIndexes = [];
  for (let index = 0; index < Math.min(6, words.length); index += 1) {
    if (words[index].start < onset - 0.12) {
      earlyWordIndexes.push(index);
    } else {
      break;
    }
  }

  if (earlyWordIndexes.length >= 2) {
    const delta = onset - firstWord.start;
    words.forEach((word) => {
      word.start = Math.max(0, word.start + delta);
      word.end = Math.max(word.start + MIN_CAPTION_DURATION_SECONDS, word.end + delta);
    });
  } else {
    const nextWord = words[1] || null;
    const maxStart = nextWord ? Math.max(onset, nextWord.start - 0.12) : onset;
    const originalDuration = Math.max(MIN_CAPTION_DURATION_SECONDS, firstWord.end - firstWord.start);
    firstWord.start = maxStart;
    firstWord.end = Math.max(firstWord.start + MIN_CAPTION_DURATION_SECONDS, Math.min(firstWord.start + originalDuration, nextWord ? nextWord.start - 0.02 : Infinity));
  }

  return {
    ...transcript,
    text: transcript?.text || words.map((word) => word.text).join(" "),
    words,
  };
}

function repairInflatedWordTimings(words) {
  const repaired = words.map((word) => ({ ...word }));

  for (let index = 0; index < repaired.length; index += 1) {
    const previousWord = repaired[index - 1] || null;
    const word = repaired[index];
    const nextWord = repaired[index + 1] || null;
    if (!word) continue;

    const estimatedDuration = estimateCaptionWordDuration(word.text);
    const duration = word.end - word.start;
    const originalStart = word.start;
    const nextStartsAtEnd = nextWord ? Math.abs(nextWord.start - word.end) <= 0.08 : false;
    const hasInflatedLeadingSilence = duration >= Math.max(0.7, estimatedDuration * 3.5);
    const previousDuration = previousWord ? previousWord.end - previousWord.start : Infinity;
    const previousSharesOriginalStart = previousWord ? Math.abs(previousWord.end - originalStart) <= 0.08 : false;
    const previousIsBridgeWord = previousWord
      ? previousDuration <= 0.1 && estimateCaptionWordDuration(previousWord.text) <= 0.32
      : false;

    if (hasInflatedLeadingSilence && nextStartsAtEnd && previousIsBridgeWord && previousSharesOriginalStart) {
      const previousEstimatedDuration = estimateCaptionWordDuration(previousWord.text);
      const combinedStart = Math.max(
        repaired[index - 2]?.end ?? 0,
        word.end - (estimatedDuration + previousEstimatedDuration),
      );
      previousWord.start = combinedStart;
      previousWord.end = Math.max(previousWord.start + MIN_CAPTION_DURATION_SECONDS, word.end - estimatedDuration);
      word.start = Math.max(previousWord.end, word.end - estimatedDuration);
    } else if (hasInflatedLeadingSilence && nextStartsAtEnd) {
      word.start = Math.max(previousWord?.end ?? 0, word.end - estimatedDuration);
    }

    word.end = Math.max(word.start + MIN_CAPTION_DURATION_SECONDS, word.end);
  }

  return repaired;
}

function detectSpeechOnset(audio, sampleRate) {
  if (!(audio instanceof Float32Array) || !audio.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return 0;
  }

  const frameSize = Math.max(128, Math.round(sampleRate * 0.02));
  const hopSize = Math.max(64, Math.round(frameSize / 2));
  const baselineFrames = [];

  for (let start = 0; start + frameSize <= Math.min(audio.length, sampleRate); start += hopSize) {
    baselineFrames.push(computeFrameRms(audio, start, frameSize));
  }

  const sortedBaseline = [...baselineFrames].sort((a, b) => a - b);
  const baseline = sortedBaseline.length ? sortedBaseline[Math.floor(sortedBaseline.length * 0.5)] : 0;
  const threshold = Math.max(0.01, baseline * 4.5);
  let consecutive = 0;

  for (let start = 0; start + frameSize <= audio.length; start += hopSize) {
    const rms = computeFrameRms(audio, start, frameSize);
    if (rms >= threshold) {
      consecutive += 1;
      if (consecutive >= 3) {
        return Math.max(0, (start - hopSize * 2) / sampleRate);
      }
    } else {
      consecutive = 0;
    }
  }

  return 0;
}

function computeFrameRms(audio, start, frameSize) {
  let energy = 0;
  for (let index = start; index < start + frameSize; index += 1) {
    const sample = audio[index] || 0;
    energy += sample * sample;
  }
  return Math.sqrt(energy / frameSize);
}

function estimateCaptionWordDuration(text = "") {
  const normalizedLength = String(text).replace(/\s+/g, "").length;
  return Math.max(0.18, Math.min(0.52, 0.14 + normalizedLength * 0.03));
}

function stripNonDialogueText(text) {
  return String(text)
    .replace(/\[[^\]]*(?:music|applause|laughter|laughs|laughing|cheering|silence|inaudible|crosstalk)[^\]]*\]/gi, "")
    .replace(/\([^)]*(?:music|applause|laughter|laughs|laughing|cheering|silence|inaudible|crosstalk)[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function createCaptionRenderJob({ silent = false, token = state.captionAnalysisToken } = {}) {
  const video = state.captionVideo;
  if (!video) return null;
  if (!silent) setCaptionProgress(90, "Detecting cuts");
  if (!silent) setCaptionStatus("Detecting video cuts for caption timing...");
  const formData = new FormData();
  formData.append("video", video);
  formData.append("settings", JSON.stringify(getCaptionSettingsWithGeometry()));

  const response = await fetch("/api/captions/create-job", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Could not prepare render job with ${response.status}.`);
  }
  if (token !== state.captionAnalysisToken || video !== state.captionVideo) return null;
  state.captionCutPoints = state.captionCutPoints.length ? state.captionCutPoints : payload.cut_points || [];
  state.captionJobId = payload.job_id || state.captionJobId;
  state.captionVideoGeometry = mergeCaptionVideoMetadata(payload.metadata, state.captionVideoGeometry);
  return payload.job_id;
}

async function prepareCaptionCutPoints(options = {}) {
  if (!state.captionVideo || state.captionCutPoints.length) return;
  try {
    await createCaptionRenderJob(options);
  } catch (error) {
    state.captionCutPoints = [];
    console.warn("Caption cut detection failed.", error);
  }
}

async function getCaptionVideoMetadata() {
  if (state.captionVideoGeometry?.width && state.captionVideoGeometry?.height) {
    return state.captionVideoGeometry;
  }

  return await new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(state.captionVideo);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const metadata = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration || 0,
        fps: Number(state.captionVideoGeometry?.fps) || 0,
      };
      URL.revokeObjectURL(url);
      resolve(metadata);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video metadata."));
    };
    video.src = url;
  });
}

function waitForVideoMetadata(video) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("Could not load video for cut detection."));
  });
}

function waitForVideoData(video) {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const handleLoadedData = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Could not load the first video frame."));
    };
    const cleanup = () => {
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("canplay", handleLoadedData);
      video.removeEventListener("error", handleError);
    };
    video.addEventListener("loadeddata", handleLoadedData, { once: true });
    video.addEventListener("canplay", handleLoadedData, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.load();
  });
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const targetTime = Math.max(0, time);
    if (Math.abs(video.currentTime - targetTime) < 0.001 && video.readyState >= 2) {
      resolve();
      return;
    }
    const handleSeeked = () => {
      video.removeEventListener("seeked", handleSeeked);
      resolve();
    };
    video.addEventListener("seeked", handleSeeked, { once: true });
    video.onerror = () => reject(new Error("Could not seek video for cut detection."));
    video.currentTime = targetTime;
  });
}

async function renderCaptionedVideo() {
  if (!state.captionVideo || state.captions.length === 0) {
    setCaptionStatus("Transcribe a video before exporting.");
    return;
  }

  remapEditorToTimedCaptions();
  setCaptionBusy(true);
  setCaptionProgress(0, "Rendering captioned video");
  setCaptionStatus("");

  try {
    const blob = await renderCaptionedVideoWithCanvas();
    downloadBlob(blob, "video-wizard-captions.mp4");
    setCaptionProgress(100, "Captioned video exported");
    setCaptionStatus("Captioned video exported.");
  } catch (error) {
    setCaptionStatus(normalizeError(error));
  } finally {
    setCaptionBusy(false);
  }
}

async function renderCaptionedVideoWithCanvas() {
  const FRAME_PHASE_END = 82;
  const ENCODE_PHASE_END = 91;
  const MUX_PHASE_END = 97;
  const FINALIZE_PHASE_END = 99;
  const sourceVideo = document.createElement("video");
  sourceVideo.src = state.captionVideoUrl;
  sourceVideo.muted = true;
  sourceVideo.playsInline = true;
  sourceVideo.preload = "auto";
  await waitForVideoMetadata(sourceVideo);
  await ensureCaptionFontReady();

  const crop = getExportCaptionCrop(sourceVideo);
  const frameSize = getNormalizedCaptionFrameSize(crop);
  const width = makeEven(frameSize.width);
  const height = makeEven(frameSize.height);
  const duration = sourceVideo.duration || state.captionVideoGeometry?.duration || 0;
  const fps = Math.max(1, Number(state.captionVideoGeometry?.fps) || 24);
  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  await loadFFmpeg();
  await cleanWorkspace();
  const sourceName = `caption_source.${extensionFromName(state.captionVideo.name, "mp4")}`;
  const framePrefix = "caption_frame";
  const visualName = "caption_visual.mp4";
  const outputName = "caption_output.mp4";
  await ffmpeg.writeFile(sourceName, await fetchFile(state.captionVideo));

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    const time = Math.min(duration, frameIndex / fps);
    await seekVideo(sourceVideo, time);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(sourceVideo, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    drawCaptionOnCanvas(ctx, getCaptionAtTime(time), width, height);
    const frameName = `${framePrefix}_${String(frameIndex).padStart(6, "0")}.jpg`;
    const blob = await canvasToBlob(canvas, 0.92);
    await ffmpeg.writeFile(frameName, await fetchFile(blob));
    if (frameIndex % Math.max(1, Math.round(fps)) === 0) {
      els.progressBar.value = frameIndex / totalFrames;
      const framePercent = Math.round((frameIndex / totalFrames) * FRAME_PHASE_END);
      setCaptionProgress(
        framePercent,
        `Rendering frames ${frameIndex + 1} of ${totalFrames}`,
      );
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }

  setCaptionProgress(ENCODE_PHASE_END - 4, "Encoding caption video");
  await ffmpeg.exec([
    "-framerate",
    String(fps),
    "-start_number",
    "0",
    "-i",
    `${framePrefix}_%06d.jpg`,
    "-frames:v",
    String(totalFrames),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    visualName,
  ]);

  setCaptionProgress(MUX_PHASE_END - 2, "Adding original audio");
  await ffmpeg.exec([
    "-i",
    visualName,
    "-i",
    sourceName,
    "-map",
    "0:v",
    "-map",
    "1:a?",
    "-shortest",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    outputName,
  ]);

  setCaptionProgress(FINALIZE_PHASE_END, "Finalizing export file");
  const data = await ffmpeg.readFile(outputName);
  return new Blob([data], { type: "video/mp4" });
}

function drawCaptionOnCanvas(ctx, caption, width, height) {
  if (!caption?.text) return;
  const lines = caption.text.split("\n").filter(Boolean);
  if (!lines.length) return;
  const settings = getCaptionSettings();
  const positionGeometry = getCaptionPositionGeometry();
  const frameScale = getCaptionFrameScale(width, height);
  const fontSize = Math.max(1, Math.round(settings.fontSize * frameScale));
  const tracking = Number(settings.tracking || 0) * frameScale;
  const lineHeight = fontSize * 1.1 + getCaptionFontRelativeSpacing(settings.leading, fontSize);
  const centerX = width * (Number(settings.positionX ?? (positionGeometry.width / 2)) / positionGeometry.width);
  const centerY = height * (Number(settings.positionY ?? (positionGeometry.height * 0.85)) / positionGeometry.height);
  const yStart = centerY - (lineHeight * (lines.length - 1)) / 2;
  const paragraphAlign = settings.paragraphAlign || "center";

  ctx.save();
  ctx.font = getCaptionCanvasFont(fontSize, settings);
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const fontMetrics = measureCaptionFontMetrics(ctx, fontSize);
  const textMetrics = lines.map((line) => measureCaptionLine(ctx, line, tracking, fontSize));
  const textLayout = getCaptionTextLayout(lines, textMetrics, centerX, paragraphAlign);
  const lineYs = textLayout.map((_, index) => yStart + index * lineHeight);
  const textYs = getCaptionTextDrawYs(fontMetrics, lineYs, settings);
  drawCaptionTextBoxes(ctx, textLayout, textMetrics, fontMetrics, lineYs, textYs, yStart, lineHeight, fontSize, frameScale, settings);
  if (settings.dropShadow > 0) {
    const shadow = getDropShadowProfile(settings.dropShadow, frameScale);
    ctx.shadowColor = colorWithAlpha(settings.dropShadowColor || "#000000", shadow.alpha);
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }
  ctx.strokeStyle = settings.strokeColor || "#000";
  ctx.lineWidth = Math.max(0, Math.round(settings.strokeSize * frameScale));
  ctx.fillStyle = settings.color || "#fff";
  textLayout.forEach((layout, index) => drawTrackedText(ctx, layout, textYs[index], tracking));
  ctx.restore();
}

function measureTrackedText(ctx, text, tracking = 0) {
  const chars = Array.from(String(text));
  if (!chars.length) return 0;
  return chars.reduce((width, char) => width + ctx.measureText(char).width, 0) + tracking * Math.max(0, chars.length - 1);
}

function measureCaptionLine(ctx, text, tracking, fontSize) {
  const metrics = ctx.measureText(text);
  return {
    width: measureTrackedText(ctx, text, tracking),
    ascent: Math.max(1, metrics.actualBoundingBoxAscent || fontSize * 0.58),
    descent: Math.max(1, metrics.actualBoundingBoxDescent || fontSize * 0.42),
  };
}

function measureCaptionFontMetrics(ctx, fontSize) {
  const metrics = ctx.measureText("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789gjpqy");
  const ascent = Math.max(1, metrics.actualBoundingBoxAscent || metrics.fontBoundingBoxAscent || fontSize * 0.72);
  const descent = Math.max(1, metrics.actualBoundingBoxDescent || metrics.fontBoundingBoxDescent || fontSize * 0.28);
  return {
    ascent,
    descent,
    height: ascent + descent,
  };
}

function getCaptionFontConfig(fontFamily) {
  const family = normalizeCaptionFontFamily(fontFamily);
  return CAPTION_FONT_LIBRARY[family] || CAPTION_FONT_LIBRARY[DEFAULT_CAPTION_FONT];
}

function getCaptionFontWeightOptions(fontFamily) {
  return getCaptionFontConfig(fontFamily).weights;
}

function normalizeCaptionFontWeight(fontFamily, fontWeight) {
  const weights = getCaptionFontWeightOptions(fontFamily);
  const value = String(fontWeight || "").trim();
  return weights.some((option) => option.value === value) ? value : getCaptionFontConfig(fontFamily).defaultWeight;
}

function getCaptionFontOption(fontFamily, fontWeight) {
  const family = normalizeCaptionFontFamily(fontFamily);
  const weight = normalizeCaptionFontWeight(family, fontWeight);
  return {
    family,
    ...getCaptionFontWeightOptions(family).find((option) => option.value === weight),
  };
}

function getCaptionFontCacheKey(fontFamily, fontWeight) {
  const option = getCaptionFontOption(fontFamily, fontWeight);
  return `${option.family}::${option.value}`;
}

function getCaptionCanvasFont(fontSize, settings = getCaptionSettings()) {
  const option = getCaptionFontOption(settings.font, settings.fontWeight);
  return `${option.value} ${fontSize}px ${quoteFontFamily(option.family)}, sans-serif`;
}

function quoteFontFamily(fontFamily) {
  return `"${String(fontFamily || DEFAULT_CAPTION_FONT).replace(/"/g, '\\"')}"`;
}

function drawTrackedText(ctx, layout, y, tracking = 0) {
  const chars = Array.from(String(layout.text));
  if (!chars.length) return;
  let x = layout.x;
  ctx.save();
  ctx.textAlign = "left";
  chars.forEach((char) => {
    if (ctx.lineWidth > 0) ctx.strokeText(char, x, y);
    ctx.fillText(char, x, y);
    x += ctx.measureText(char).width + tracking;
  });
  ctx.restore();
}

function getCaptionFrameScale(width, height) {
  return Math.min(width / 1080, height / 1920);
}

function getCaptionFontRelativeSpacing(value, fontSize) {
  return (Number(value) || 0) * (Math.max(1, fontSize) / CAPTION_SPACING_REFERENCE_FONT_SIZE);
}

function getCaptionSpacingControlValue(pixelValue, fontSize) {
  return (Number(pixelValue) || 0) * (CAPTION_SPACING_REFERENCE_FONT_SIZE / Math.max(1, fontSize));
}

function getDropShadowProfile(intensity, frameScale) {
  const level = Math.max(0, Math.min(10, Number(intensity) || 0));
  const progress = level / 10;
  const alpha = level <= 0 ? 0 : 0.2 + progress * 0.7;
  const blur = 1.5 + progress * 3.5;
  const offsetY = 0.8 + progress * 2.2;
  const offsetX = progress * 0.6;
  return {
    alpha,
    blur: blur * frameScale,
    offsetX: offsetX * frameScale,
    offsetY: offsetY * frameScale,
  };
}

function colorWithAlpha(color, alpha) {
  const hex = String(color || "#000000").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getCaptionTextDrawYs(fontMetrics, lineYs, settings) {
  if (settings.textBox !== "line") return lineYs;
  const fontCenterOffset = (fontMetrics.ascent - fontMetrics.descent) / 2;
  return lineYs.map((y) => y + fontCenterOffset);
}

function drawCaptionTextBoxes(ctx, textLayout, textMetrics, fontMetrics, lineYs, textYs, yStart, lineHeight, fontSize, frameScale, settings) {
  if (settings.textBox === "none") return;
  const boxPadding = Math.max(0, getCaptionFontRelativeSpacing(settings.textBoxPadding ?? 30, fontSize));
  const paddingX = boxPadding;
  const paddingY = boxPadding;
  const radius = getCaptionBoxRadius(fontSize, settings);
  ctx.save();
  const boxOpacity = clampNumber(Number(settings.textBoxOpacity ?? 100) / 100, 0, 1);
  ctx.fillStyle = colorWithAlpha(settings.textBoxColor || "#000000", boxOpacity);

  if (settings.textBox === "whole") {
    const minX = Math.min(...textLayout.map((layout) => layout.x));
    const maxX = Math.max(...textLayout.map((layout) => layout.x + layout.width));
    const lineBounds = textMetrics.map((metric, index) => {
      const y = yStart + index * lineHeight;
      return {
        top: y - metric.ascent,
        bottom: y + metric.descent,
      };
    });
    const minY = Math.min(...lineBounds.map((bound) => bound.top));
    const maxY = Math.max(...lineBounds.map((bound) => bound.bottom));
    const boxWidth = maxX - minX + paddingX * 2;
    const boxHeight = maxY - minY + paddingY * 2;
    drawRoundedRect(ctx, minX - paddingX, minY - paddingY, boxWidth, boxHeight, radius);
    ctx.fill();
    ctx.restore();
    return;
  }

  const lineBoxHeight = fontMetrics.height + paddingY * 2;
  const rects = textLayout.map((layout, index) => {
    const y = lineYs[index];
    return {
      x: layout.x - paddingX,
      y: y - lineBoxHeight / 2,
      width: layout.width + paddingX * 2,
      height: lineBoxHeight,
    };
  });
  drawConnectedLineBoxes(ctx, sliceLineRectsAtTransitions(rects), radius);
  ctx.fill();
  ctx.restore();
}

function sliceLineRectsAtTransitions(rects) {
  const sliced = rects.map((rect) => ({
    ...rect,
    bottom: rect.y + rect.height,
  }));
  for (let index = 0; index < sliced.length - 1; index += 1) {
    const current = sliced[index];
    const next = sliced[index + 1];
    if (current.bottom <= next.y) continue;
    const boundary = (current.bottom + next.y) / 2;
    current.bottom = boundary;
    current.height = Math.max(1, current.bottom - current.y);
    next.y = boundary;
    next.height = Math.max(1, next.bottom - next.y);
  }
  return sliced;
}

function drawConnectedLineBoxes(ctx, rects, radius) {
  if (!rects.length) return;
  ctx.beginPath();
  groupOverlappingLineRects(rects).forEach((group) => {
    const contour = getLineBoxUnionContour(group);
    if (contour.length >= 3) {
      appendRoundedOrthogonalPath(ctx, contour, radius);
    }
  });
}

function groupOverlappingLineRects(rects) {
  const groups = [];
  rects
    .map((rect) => ({
      ...rect,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
    }))
    .forEach((rect) => {
      const group = groups.at(-1);
      const previous = group?.at(-1);
      if (!previous || rect.y > previous.bottom) {
        groups.push([rect]);
      } else {
        group.push(rect);
      }
    });
  return groups;
}

function getLineBoxUnionContour(rects) {
  if (rects.length === 1) {
    const rect = rects[0];
    return [
      { x: rect.x, y: rect.y },
      { x: rect.right, y: rect.y },
      { x: rect.right, y: rect.bottom },
      { x: rect.x, y: rect.bottom },
    ];
  }

  const yStops = Array.from(
    new Set(rects.flatMap((rect) => [rect.y, rect.bottom]).map((value) => value.toFixed(3))),
    Number,
  ).sort((a, b) => a - b);

  const bands = [];
  for (let index = 0; index < yStops.length - 1; index += 1) {
    const top = yStops[index];
    const bottom = yStops[index + 1];
    const covering = rects.filter((rect) => rect.y < bottom && rect.bottom > top);
    if (!covering.length) continue;
    bands.push({
      top,
      bottom,
      left: Math.min(...covering.map((rect) => rect.x)),
      right: Math.max(...covering.map((rect) => rect.right)),
    });
  }

  const mergedBands = mergeMatchingBands(bands);
  if (!mergedBands.length) return [];

  const rightSide = [];
  for (let index = 0; index < mergedBands.length; index += 1) {
    const band = mergedBands[index];
    rightSide.push({ x: band.right, y: band.bottom });
    const next = mergedBands[index + 1];
    if (next) rightSide.push({ x: next.right, y: band.bottom });
  }

  const leftSide = [];
  for (let index = mergedBands.length - 1; index >= 0; index -= 1) {
    const band = mergedBands[index];
    leftSide.push({ x: band.left, y: band.top });
    const previous = mergedBands[index - 1];
    if (previous) leftSide.push({ x: previous.left, y: band.top });
  }

  return cleanContourPoints([
    { x: mergedBands[0].left, y: mergedBands[0].top },
    { x: mergedBands[0].right, y: mergedBands[0].top },
    ...rightSide,
    { x: mergedBands.at(-1).left, y: mergedBands.at(-1).bottom },
    ...leftSide,
  ]);
}

function mergeMatchingBands(bands) {
  return bands.reduce((merged, band) => {
    const previous = merged.at(-1);
    if (previous && Math.abs(previous.left - band.left) < 0.01 && Math.abs(previous.right - band.right) < 0.01) {
      previous.bottom = band.bottom;
    } else {
      merged.push({ ...band });
    }
    return merged;
  }, []);
}

function cleanContourPoints(points) {
  const deduped = points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || Math.abs(point.x - previous.x) > 0.01 || Math.abs(point.y - previous.y) > 0.01;
  });
  const first = deduped[0];
  const last = deduped.at(-1);
  if (first && last && Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) {
    deduped.pop();
  }
  return deduped.filter((point, index) => {
    const previous = deduped[(index - 1 + deduped.length) % deduped.length];
    const next = deduped[(index + 1) % deduped.length];
    return !(
      (Math.abs(previous.x - point.x) < 0.01 && Math.abs(point.x - next.x) < 0.01) ||
      (Math.abs(previous.y - point.y) < 0.01 && Math.abs(point.y - next.y) < 0.01)
    );
  });
}

function appendRoundedOrthogonalPath(ctx, points, radius) {
  if (points.length < 3) return;
  points.forEach((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const previousDistance = Math.hypot(point.x - previous.x, point.y - previous.y);
    const nextDistance = Math.hypot(point.x - next.x, point.y - next.y);
    if (!previousDistance || !nextDistance) return;

    const safeRadius = Math.min(radius, previousDistance / 2, nextDistance / 2);
    const start = pointToward(point, previous, safeRadius);
    const end = pointToward(point, next, safeRadius);
    if (index === 0) {
      ctx.moveTo(start.x, start.y);
    } else {
      ctx.lineTo(start.x, start.y);
    }
    ctx.quadraticCurveTo(point.x, point.y, end.x, end.y);
  });
  ctx.closePath();
}

function pointToward(from, to, distance) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (!length) return { ...from };
  const amount = distance / length;
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

function getCaptionBoxRadius(fontSize, settings) {
  const roundness = clampNumber(Number(settings.textBoxRoundness ?? 15), 0, 100);
  const referenceFontScale = fontSize / Math.max(1, Number(settings.fontSize) || 50);
  return roundness * referenceFontScale;
}

function getCaptionTextLayout(lines, metrics, centerX, paragraphAlign) {
  const maxWidth = Math.max(...metrics.map((metric) => metric.width), 0);
  return lines.map((line, index) => {
    const width = metrics[index].width;
    if (paragraphAlign === "left") {
      return { text: line, width, x: centerX - maxWidth / 2 };
    }
    if (paragraphAlign === "right") {
      return { text: line, width, x: centerX + maxWidth / 2 - width };
    }
    return { text: line, width, x: centerX - width / 2 };
  });
}

function appendRoundedRectPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  appendRoundedRectPath(ctx, x, y, width, height, radius);
}

function makeEven(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function handleCaptionSettingsChange() {
  updateCaptionSettingsLabels();
  if (!state.captionTranscript?.words?.length) return;
  remapEditorToTimedCaptions();
  updateCaptionOverlay();
}

function handleCaptionLayoutChange() {
  updateCaptionSettingsLabels();
  if (!state.captionTranscript?.words?.length) return;
  regenerateCaptionLayoutFromEditor();
  updateCaptionOverlay();
}

function handleCaptionStyleChange() {
  updateCaptionSettingsLabels();
  ensureCaptionFontReady(els.captionFont.value, els.captionFontWeight.value);
  updateCaptionOverlay();
}

function handleCaptionFontFamilyChange() {
  syncCaptionFontWeightOptions(els.captionFontWeight.value);
}

function getCaptionSettingsSnapshot() {
  return {
    captionFont: els.captionFont.value,
    captionFontWeight: els.captionFontWeight.value,
    captionFontSize: els.captionFontSize.value,
    captionParagraphAlign: els.captionParagraphAlign.value,
    captionColor: els.captionColor.value,
    captionStrokeEnabled: els.captionStrokeEnabled.checked,
    captionStroke: els.captionStroke.value,
    captionStrokeColor: els.captionStrokeColor.value,
    captionDropShadowEnabled: els.captionDropShadowEnabled.checked,
    captionDropShadow: els.captionDropShadow.value,
    captionDropShadowColor: els.captionDropShadowColor.value,
    captionTracking: els.captionTracking.value,
    captionLeading: els.captionLeading.value,
    captionPositionX: els.captionPositionX.value,
    captionPositionY: els.captionPositionY.value,
    captionTextBox: els.captionTextBox.value,
    captionTextBoxColor: els.captionTextBoxColor.value,
    captionTextBoxOpacity: els.captionTextBoxOpacity.value,
    captionTextBoxRoundness: els.captionTextBoxRoundness.value,
    captionTextBoxPadding: els.captionTextBoxPadding.value,
    captionLength: els.captionLength.value,
    captionLines: els.captionLines.value,
  };
}

function getCaptionTimelineSnapshot() {
  return {
    captions: state.captions.map((caption) => ({
      ...caption,
      wordIds: Array.isArray(caption.wordIds) ? [...caption.wordIds] : [],
      wordMappings: Array.isArray(caption.wordMappings)
        ? caption.wordMappings.map((mapping) => ({ ...mapping }))
        : [],
    })),
    captionSelectedId: state.captionSelectedId,
    currentTime: Number.isFinite(els.captionPreviewVideo.currentTime) ? els.captionPreviewVideo.currentTime : 0,
    previewWindow: state.captionPreviewWindow ? { ...state.captionPreviewWindow } : null,
    previewZoomSeconds: state.captionPreviewZoomSeconds,
  };
}

function pushCaptionUndoEntry(entry) {
  if (!entry) return;
  state.captionUndoHistory.push(entry);
  if (state.captionUndoHistory.length > 220) state.captionUndoHistory.shift();
}

function applyCaptionSettingsSnapshot(snapshot) {
  if (!snapshot) return;
  const previousSnapshot = getCaptionSettingsSnapshot();
  state.isRestoringCaptionSettings = true;
  Object.entries(snapshot).forEach(([key, value]) => {
    const input = els[key];
    if (!input) return;
    if (input.type === "checkbox") {
      input.checked = Boolean(value);
    } else {
      input.value = value;
    }
  });
  syncCaptionFontWeightOptions(snapshot.captionFontWeight);
  setCaptionTextBoxMode(els.captionTextBox.value);
  setCaptionParagraphAlign(els.captionParagraphAlign.value || "center");
  updateCaptionSettingsLabels();
  if (state.captionTranscript?.words?.length) {
    if (snapshotChangesCaptionLayout(previousSnapshot, snapshot)) {
      regenerateCaptionLayoutFromEditor();
    } else {
      remapEditorToTimedCaptions();
    }
  }
  updateCaptionOverlay();
  state.isRestoringCaptionSettings = false;
}

function captureCaptionSettingsSnapshot() {
  if (state.isRestoringCaptionSettings || state.captionPendingSettingsSnapshot) return;
  state.captionPendingSettingsSnapshot = getCaptionSettingsSnapshot();
}

function commitCaptionSettingsSnapshot() {
  if (state.isRestoringCaptionSettings || !state.captionPendingSettingsSnapshot) return;
  const before = state.captionPendingSettingsSnapshot;
  state.captionPendingSettingsSnapshot = null;
  const after = getCaptionSettingsSnapshot();
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  pushCaptionUndoEntry({ kind: "settings", snapshot: before });
}

function applyCaptionTimelineSnapshot(snapshot) {
  if (!snapshot) return;
  state.captions = snapshot.captions.map((caption) => ({
    ...caption,
    wordIds: Array.isArray(caption.wordIds) ? [...caption.wordIds] : [],
    wordMappings: Array.isArray(caption.wordMappings)
      ? caption.wordMappings.map((mapping) => ({ ...mapping }))
      : [],
  }));
  state.captionSelectedId = snapshot.captionSelectedId || null;
  state.captionPreviewZoomSeconds = Number(snapshot.previewZoomSeconds) || state.captionPreviewZoomSeconds;
  state.captionPreviewWindow = snapshot.previewWindow ? { ...snapshot.previewWindow } : null;
  updateCaptionEditorFromCaptions();
  updateCaptionActionAvailability();
  renderCaptionPreviewTimeline();
  els.captionPreviewVideo.pause();
  seekCaptionPreviewToTime(snapshot.currentTime);
  showCaptionPreviewTimecode();
  updateCaptionOverlay();
}

function undoCaptionChange() {
  const entry = state.captionUndoHistory.pop();
  if (!entry) return;
  state.captionPendingSettingsSnapshot = null;
  if (entry.kind === "timeline") {
    applyCaptionTimelineSnapshot(entry.snapshot);
    return;
  }
  applyCaptionSettingsSnapshot(entry.snapshot);
}

function shouldHandleCaptionUndo(target) {
  if (target === els.captionEditor) return false;
  return Boolean(target?.closest?.(".caption-settings")) || document.activeElement !== els.captionEditor;
}

function unlockInlineValueInput(input) {
  if (input.readOnly) {
    input.readOnly = false;
    input.style.userSelect = "text";
  }
  selectInlineValueInput(input);
}

function selectInlineValueInput(input) {
  window.requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function handleInlineValueKeydown(event, input, slider) {
  if (event.key === "Enter") {
    event.preventDefault();
    commitInlineValueInput(input, slider);
    input.blur();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    input.value = formatInlineValueLabel(slider);
    input.readOnly = true;
    input.style.userSelect = "";
    input.blur();
  }
}

function commitInlineValueInput(input, slider) {
  const min = Number(slider.min);
  const step = Number(slider.step) || 1;
  const parsedValue = parseInlineValueInput(input, slider);
  expandControlRangeForValue(slider, parsedValue);
  const value = clampToStep(parsedValue, min, Number(slider.max), step);
  slider.value = String(value);
  input.value = formatInlineValueLabel(slider);
  input.readOnly = true;
  input.style.userSelect = "";
  handleCaptionControlCommit(slider);
  commitCaptionSettingsSnapshot();
}

function beginInlineValueDrag(event, input, slider) {
  if (!input.readOnly) return;
  event.preventDefault();
  input.setPointerCapture?.(event.pointerId);
  state.activeInlineDrag = {
    pointerId: event.pointerId,
    input,
    slider,
    startX: event.clientX,
    startValue: Number(slider.value),
    dragging: false,
  };
}

function handleInlineValueDragMove(event) {
  const drag = state.activeInlineDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const deltaX = event.clientX - drag.startX;
  if (!drag.dragging && Math.abs(deltaX) < 2) return;
  drag.dragging = true;
  const step = Number(drag.slider.step) || 1;
  const isPositionValue = drag.slider === els.captionPositionX || drag.slider === els.captionPositionY;
  const dragSpeed = isPositionValue
    ? (event.shiftKey ? 24 : 6)
    : (event.shiftKey ? 8 : 2);
  const nextValue = clampToStep(
    drag.startValue + Math.round((deltaX * dragSpeed) / 8) * step,
    Number(drag.slider.min),
    Number(drag.slider.max),
    step,
  );
  expandControlRangeForValue(drag.slider, nextValue);
  drag.slider.value = String(nextValue);
  drag.input.value = formatInlineValueLabel(drag.slider);
  handleCaptionControlCommit(drag.slider);
}

function endInlineValueDrag(event) {
  const drag = state.activeInlineDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (drag.dragging) {
    drag.input.dataset.dragged = "true";
    commitCaptionSettingsSnapshot();
  }
  drag.input.releasePointerCapture?.(event.pointerId);
  state.activeInlineDrag = null;
}

function handleInlineValueClick(event, input) {
  if (input.dataset.dragged === "true") {
    delete input.dataset.dragged;
    event.preventDefault();
    return;
  }
  unlockInlineValueInput(input);
}

function clampToStep(value, min, max, step) {
  const fallback = Number.isFinite(min) ? min : 0;
  const bounded = Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
  return Math.round(bounded / step) * step;
}

function expandControlRangeForValue(control, value) {
  if (![els.captionLeading, els.captionTextBoxPadding].includes(control)) return;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return;
  const max = Number(control.max);
  if (Number.isFinite(max) && numericValue >= max) {
    control.max = String(Math.ceil(numericValue + 1000));
  }
  const linkedValueInput = control === els.captionLeading ? els.captionLeadingValue : els.captionTextBoxPaddingValue;
  if (linkedValueInput) linkedValueInput.max = control.max;
}

function parseInlineValueInput(input, slider) {
  if (slider === els.captionLength && /^one\b/i.test(String(input.value).trim())) {
    return Number(slider.min);
  }
  const numericValue = Number(input.value);
  return Number.isFinite(numericValue) ? numericValue : Number(slider.value);
}

function formatInlineValueLabel(slider) {
  if (slider === els.captionLength && isOneWordCaptionLength(slider.value)) {
    return "1 word";
  }
  return String(slider.value);
}

function handleCaptionControlCommit(control) {
  if ([els.captionLength, els.captionLines].includes(control)) {
    handleCaptionLayoutChange();
    return;
  }
  handleCaptionStyleChange();
}

function handleCaptionEditorInput() {
  window.clearTimeout(state.captionEditDebounce);
  state.captionEditDebounce = window.setTimeout(() => {
    const changedIndex = remapEditorToTimedCaptions();
    seekPreviewToCaption(getCaptionIndexAtEditorCursor(changedIndex));
    updateCaptionOverlay();
  }, 180);
}

function handleCaptionCursorActivity() {
  if (state.suppressCaptionEditorCursorActivity) {
    updateCaptionEditorSelectionHighlight();
    return;
  }
  state.captionEditorHighlightedBlockIndex = getCaptionIndexAtEditorCursor(state.captionEditorHighlightedBlockIndex ?? -1);
  seekPreviewToCaption(getCaptionIndexAtEditorCursor());
  updateCaptionOverlay();
}

function updateCaptionOverlay() {
  drawCaptionPreviewFrame();
  updateCaptionPreviewControls();
  if (!els.captionPreviewVideo.paused) {
    window.cancelAnimationFrame(state.captionPreviewAnimation);
    state.captionPreviewAnimation = window.requestAnimationFrame(updateCaptionOverlay);
  }
}

function populateCaptionFontFamilyOptions() {
  els.captionFont.innerHTML = Object.keys(CAPTION_FONT_LIBRARY)
    .map((family) => `<option value="${family}">${family}</option>`)
    .join("");
  els.captionFont.value = normalizeCaptionFontFamily(els.captionFont.value);
}

function syncCaptionFontWeightOptions(preferredWeight = els.captionFontWeight?.value) {
  const family = normalizeCaptionFontFamily(els.captionFont.value);
  const weights = getCaptionFontWeightOptions(family);
  els.captionFont.value = family;
  els.captionFontWeight.innerHTML = weights
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  els.captionFontWeight.value = normalizeCaptionFontWeight(family, preferredWeight);
}

function ensureCaptionFontReady(fontFamily = els.captionFont?.value, fontWeight = els.captionFontWeight?.value) {
  const option = getCaptionFontOption(fontFamily, fontWeight);
  const key = getCaptionFontCacheKey(option.family, option.value);
  if (!document.fonts?.load) return Promise.resolve();
  if (state.captionLoadedFonts.has(key)) return Promise.resolve();
  if (!state.captionFontReadyPromises.has(key)) {
    const promise = loadCaptionFont(option.family, option.value)
      .then((didLoad) => {
        if (didLoad) state.captionLoadedFonts.add(key);
        if (!didLoad) state.captionFontReadyPromises.delete(key);
        state.captionFontReady = state.captionLoadedFonts.size > 0;
        updateCaptionOverlay();
      })
      .catch((error) => {
        state.captionFontReadyPromises.delete(key);
        console.warn(`Caption font "${option.family}" (${option.label}) failed to load.`, error);
      });
    state.captionFontReadyPromises.set(key, promise);
    if (!state.captionFontReadyPromise) state.captionFontReadyPromise = promise;
  }
  return state.captionFontReadyPromises.get(key);
}

async function loadCaptionFont(fontFamily = DEFAULT_CAPTION_FONT, fontWeight = DEFAULT_CAPTION_FONT_WEIGHT) {
  if (!document.fonts?.load) return;
  const option = getCaptionFontOption(fontFamily, fontWeight);
  const fontSpec = `${option.value} 72px ${quoteFontFamily(option.family)}`;
  try {
    const fontFace = new FontFace(option.family, `url("${option.file}")`, {
      weight: option.value,
      style: "normal",
    });
    const loadedFontFace = await fontFace.load();
    document.fonts.add(loadedFontFace);
    await document.fonts.load(fontSpec);
    await document.fonts.ready;
    if (!document.fonts.check(fontSpec)) {
      throw new Error(`${option.family} ${option.label} did not pass the browser font check.`);
    }
    return true;
  } catch (error) {
    console.warn(`Caption font "${option.family}" (${option.label}) could not be loaded before preview draw.`, error);
    return false;
  }
}

function normalizeCaptionFontFamily(fontFamily) {
  const family = String(fontFamily || DEFAULT_CAPTION_FONT).trim();
  if (family === "TikTok Sans Semibold") return DEFAULT_CAPTION_FONT;
  return CAPTION_FONT_FAMILIES.has(family) ? family : DEFAULT_CAPTION_FONT;
}

function isCaptionFontLoaded(fontFamily = els.captionFont?.value, fontWeight = els.captionFontWeight?.value) {
  return !document.fonts?.load || state.captionLoadedFonts.has(getCaptionFontCacheKey(fontFamily, fontWeight));
}

function toggleCaptionPreviewPlayback() {
  const video = els.captionPreviewVideo;
  if (!state.captionVideoUrl || !Number.isFinite(video.duration)) return;
  if (video.paused) {
    hideCaptionPreviewTimecode(true);
    video.play().catch(() => undefined);
  } else {
    video.pause();
    showCaptionPreviewTimecode();
  }
  updateCaptionPreviewControls();
}

function showCaptionPreviewTimecode() {
  if (!state.captionVideoUrl) return;
  window.clearTimeout(state.captionPreviewHudTimer);
  els.captionPreviewFrame.classList.add("is-timecode-visible");
  state.captionPreviewHudTimer = window.setTimeout(() => {
    if (state.activeTimelineScrub) return;
    hideCaptionPreviewTimecode();
  }, 2000);
}

function hideCaptionPreviewTimecode(immediate = false) {
  window.clearTimeout(state.captionPreviewHudTimer);
  state.captionPreviewHudTimer = null;
  if (immediate) {
    els.captionPreviewFrame.classList.remove("is-timecode-visible");
    return;
  }
  window.requestAnimationFrame(() => {
    els.captionPreviewFrame.classList.remove("is-timecode-visible");
  });
}

function handleCaptionPreviewClick(event) {
  event?.stopPropagation();
  els.captionPreviewFrame.focus();
  if (event?.detail > 1) return;
  toggleCaptionPreviewPlayback();
}

function handleCaptionPreviewDoubleClick(event) {
  event?.stopPropagation();
  const index = syncCaptionSelection();
  if (index < 0) return;
  setSelectedCaptionByIndex(index, { seek: false, refresh: false, syncEditor: true, focusEditor: false });
  window.requestAnimationFrame(() => {
    els.captionPreviewFrame.focus({ preventScroll: true });
  });
}

function handleCaptionTimelineClick(event) {
  const segment = event.target.closest(".caption-preview-segment");
  if (!segment) return;
  if (getCaptionTimelineBoundaryInteraction(event)) return;
  const index = Number(segment.dataset.captionIndex);
  if (!Number.isFinite(index)) return;
  if (event.detail >= 2) {
    event.preventDefault();
    setSelectedTimelineBoundary(null);
    setSelectedCaptionByIndex(index, { seek: true, edge: "start", syncEditor: true, focusEditor: false });
    window.requestAnimationFrame(() => {
      els.captionPreviewTimeline.focus({ preventScroll: true });
    });
    updateCaptionOverlay();
    return;
  }
  focusCaptionEditorBlock(index, { focusEditor: false });
}

function isTimelineBoundaryNudgeLeftKey(event) {
  return event.shiftKey && (event.key === "<" || event.code === "Comma");
}

function isTimelineBoundaryNudgeRightKey(event) {
  return event.shiftKey && (event.key === ">" || event.code === "Period");
}

function handleCaptionEditorKeydown(event) {
  if (!event.shiftKey || event.code !== "Space" || event.isComposing) return;
  event.preventDefault();
  toggleCaptionPreviewPlayback();
}

function handleCaptionPreviewKeydown(event) {
  if (event.code === "Space") {
    event.preventDefault();
    toggleCaptionPreviewPlayback();
    return;
  }
  if (event.shiftKey && event.key === "ArrowUp") {
    event.preventDefault();
    jumpToAdjacentCutPoint(-1);
    return;
  }
  if (event.shiftKey && event.key === "ArrowDown") {
    event.preventDefault();
    jumpToAdjacentCutPoint(1);
    return;
  }
  if (isTimelineBoundaryNudgeLeftKey(event)) {
    event.preventDefault();
    nudgeSelectedTimelineBoundary(-1);
    return;
  }
  if (isTimelineBoundaryNudgeRightKey(event)) {
    event.preventDefault();
    nudgeSelectedTimelineBoundary(1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    jumpToAdjacentCaption(-1);
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    jumpToAdjacentCaption(1);
    return;
  }
  if (isCaptionTimelineZoomInKey(event)) {
    event.preventDefault();
    adjustCaptionPreviewZoom(-1);
    return;
  }
  if (isCaptionTimelineZoomOutKey(event)) {
    event.preventDefault();
    adjustCaptionPreviewZoom(1);
    return;
  }
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  stepCaptionPreviewFrame(event.key === "ArrowRight" ? 1 : -1);
}

function handleCaptionTimelineKeydown(event) {
  if (event.code === "Space") {
    event.preventDefault();
    toggleCaptionPreviewPlayback();
    return;
  }
  if (event.shiftKey && event.key === "ArrowUp") {
    event.preventDefault();
    jumpToAdjacentCutPoint(-1);
    return;
  }
  if (event.shiftKey && event.key === "ArrowDown") {
    event.preventDefault();
    jumpToAdjacentCutPoint(1);
    return;
  }
  if (isTimelineBoundaryNudgeLeftKey(event)) {
    event.preventDefault();
    nudgeSelectedTimelineBoundary(-1);
    return;
  }
  if (isTimelineBoundaryNudgeRightKey(event)) {
    event.preventDefault();
    nudgeSelectedTimelineBoundary(1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    jumpToAdjacentCaption(-1);
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    jumpToAdjacentCaption(1);
    return;
  }
  if (isCaptionTimelineZoomInKey(event)) {
    event.preventDefault();
    adjustCaptionPreviewZoom(-1);
    return;
  }
  if (isCaptionTimelineZoomOutKey(event)) {
    event.preventDefault();
    adjustCaptionPreviewZoom(1);
    return;
  }
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  stepCaptionPreviewFrame(event.key === "ArrowRight" ? 1 : -1);
}

function isCaptionTimelineZoomInKey(event) {
  return event.key === "+" || (event.key === "=" && event.shiftKey);
}

function isCaptionTimelineZoomOutKey(event) {
  return event.key === "_";
}

function stepCaptionPreviewFrame(direction) {
  const video = els.captionPreviewVideo;
  if (!state.captionVideoUrl || !Number.isFinite(video.duration)) return;
  state.captionSelectionNeedsStartAnchor = false;
  video.pause();
  const nextFrameIndex = getCaptionPreviewDisplayFrameIndex(video.currentTime) + direction;
  seekCaptionPreviewToFrameIndex(nextFrameIndex);
  showCaptionPreviewTimecode();
  updateCaptionOverlay();
}

function getCaptionPreviewFps() {
  return Math.max(1, Number(state.captionVideoGeometry?.fps) || 30);
}

function getCaptionPreviewFrameDuration() {
  return 1 / getCaptionPreviewFps();
}

function getCaptionPreviewDisplayFrameIndex(time = els.captionPreviewVideo.currentTime) {
  const fps = getCaptionPreviewFps();
  return Math.max(0, Math.floor((Number(time) || 0) * fps + 1e-6));
}

function getCaptionPreviewSeekFrameIndex(time) {
  const fps = getCaptionPreviewFps();
  return Math.max(0, Math.round((Number(time) || 0) * fps));
}

function getCaptionPreviewFrameStartTime(frameIndex) {
  return Math.max(0, frameIndex) / getCaptionPreviewFps();
}

function getCaptionPreviewFrameCenterTime(frameIndex) {
  return getCaptionPreviewFrameStartTime(frameIndex) + getCaptionPreviewFrameDuration() / 2;
}

function getCanonicalCaptionPreviewSeekTime(time) {
  return clampPreviewTime(getCaptionPreviewFrameCenterTime(getCaptionPreviewSeekFrameIndex(time)));
}

function getCaptionPreviewDisplayTime(time = els.captionPreviewVideo.currentTime) {
  return clampPreviewTime(getCaptionPreviewFrameStartTime(getCaptionPreviewDisplayFrameIndex(time)));
}

function seekCaptionPreviewToFrameIndex(frameIndex) {
  els.captionPreviewVideo.currentTime = clampPreviewTime(getCaptionPreviewFrameCenterTime(Math.max(0, frameIndex)));
}

function seekCaptionPreviewToTime(time) {
  els.captionPreviewVideo.currentTime = getCanonicalCaptionPreviewSeekTime(time);
}

function clampPreviewTime(time) {
  const video = els.captionPreviewVideo;
  const duration = Number.isFinite(video.duration) ? video.duration : Number(state.captionVideoGeometry?.duration) || 0;
  return Math.max(0, Math.min(duration, Number(time) || 0));
}

function getCaptionIndexAtTime(time) {
  return state.captions.findIndex((caption) => time >= caption.start && time < caption.end);
}

function getSelectedCaptionIndex() {
  return state.captions.findIndex((caption) => caption.id === state.captionSelectedId);
}

function syncCaptionSelection({ time = els.captionPreviewVideo.currentTime } = {}) {
  const activeIndex = getCaptionIndexAtTime(Number(time) || 0);
  if (activeIndex >= 0) {
    state.captionSelectedId = state.captions[activeIndex].id;
    return activeIndex;
  }
  const selectedIndex = getSelectedCaptionIndex();
  if (selectedIndex >= 0) return selectedIndex;
  if (state.captions[0]) {
    state.captionSelectedId = state.captions[0].id;
    return 0;
  }
  state.captionSelectedId = null;
  return -1;
}

function setSelectedCaptionByIndex(index, { seek = true, edge = "start", refresh = true, syncEditor = true, focusEditor = false } = {}) {
  const hadSelectedBoundary = Boolean(state.captionSelectedBoundary);
  if (index < 0 || !state.captions[index]) {
    state.captionSelectedId = null;
    state.captionSelectedBoundary = null;
    state.captionEditorHighlightedBlockIndex = null;
    state.captionSelectionNeedsStartAnchor = false;
    if (refresh || hadSelectedBoundary) {
      renderCaptionPreviewTimeline();
    } else {
      updateCaptionPreviewControls();
    }
    return;
  }
  const caption = state.captions[index];
  state.captionSelectedId = caption.id;
  state.captionSelectedBoundary = null;
  state.captionEditorHighlightedBlockIndex = index;
  state.captionSelectionNeedsStartAnchor = !seek;
  if (seek) {
    const targetTime = edge === "end"
      ? Math.max(0, caption.end)
      : Math.max(0, caption.start);
    els.captionPreviewVideo.pause();
    seekCaptionPreviewToTime(targetTime);
    showCaptionPreviewTimecode();
  }
  if (refresh || hadSelectedBoundary) {
    renderCaptionPreviewTimeline();
  } else {
    updateCaptionPreviewControls();
  }
  if (syncEditor) focusCaptionEditorBlock(index, { focusEditor });
}

function jumpToAdjacentCaption(direction) {
  if (!state.captions.length) return;
  if (state.captionSelectionNeedsStartAnchor) {
    const selectedIndex = getSelectedCaptionIndex();
    if (selectedIndex >= 0) {
      state.captionSelectionNeedsStartAnchor = false;
      seekCaptionNavigationPoint({
        time: state.captions[selectedIndex].start,
        startCaptionIndex: selectedIndex,
        endCaptionIndex: null,
      });
      return;
    }
    state.captionSelectionNeedsStartAnchor = false;
  }
  const points = getCaptionNavigationPoints();
  if (!points.length) return;
  const currentTime = getCaptionPreviewDisplayTime();
  const tolerance = getCaptionPreviewFrameDuration() * 0.5;
  const nextPoint = direction > 0
    ? points.find((point) => point.time > currentTime + tolerance)
    : [...points].reverse().find((point) => point.time < currentTime - tolerance);
  if (nextPoint) seekCaptionNavigationPoint(nextPoint);
}

function getCaptionNavigationPoints() {
  const frameTolerance = getCaptionPreviewFrameDuration() * 1.5;
  const points = [];
  state.captions.forEach((caption, index) => {
    points.push({
      time: caption.start,
      startCaptionIndex: index,
      endCaptionIndex: null,
      startCaptionId: caption.id,
      endCaptionId: null,
    });
    points.push({
      time: caption.end,
      startCaptionIndex: null,
      endCaptionIndex: index,
      startCaptionId: null,
      endCaptionId: caption.id,
    });
  });
  return points
    .sort((a, b) => a.time - b.time)
    .reduce((merged, point) => {
      const previous = merged[merged.length - 1];
      if (previous && Math.abs(previous.time - point.time) <= frameTolerance) {
        previous.time = Math.min(previous.time, point.time);
        previous.startCaptionIndex = previous.startCaptionIndex ?? point.startCaptionIndex;
        previous.endCaptionIndex = previous.endCaptionIndex ?? point.endCaptionIndex;
        previous.startCaptionId = previous.startCaptionId ?? point.startCaptionId;
        previous.endCaptionId = previous.endCaptionId ?? point.endCaptionId;
        return merged;
      }
      merged.push({ ...point });
      return merged;
    }, []);
}

function getTimelineBoundarySelectionForNavigationPoint(point) {
  if (!point) return null;
  if (point.endCaptionId && point.startCaptionId) {
    return {
      mode: "roll",
      boundary: null,
      captionId: point.startCaptionId,
      leftCaptionId: point.endCaptionId,
      rightCaptionId: point.startCaptionId,
      singleCaptionId: null,
      singleBoundary: null,
      segmentIndex: Number.isFinite(point.startCaptionIndex) ? point.startCaptionIndex : point.endCaptionIndex,
    };
  }
  if (point.startCaptionId) {
    return {
      mode: "resize",
      boundary: "start",
      captionId: point.startCaptionId,
      leftCaptionId: null,
      rightCaptionId: null,
      singleCaptionId: point.startCaptionId,
      singleBoundary: "start",
      segmentIndex: point.startCaptionIndex,
    };
  }
  if (point.endCaptionId) {
    return {
      mode: "resize",
      boundary: "end",
      captionId: point.endCaptionId,
      leftCaptionId: null,
      rightCaptionId: null,
      singleCaptionId: point.endCaptionId,
      singleBoundary: "end",
      segmentIndex: point.endCaptionIndex,
    };
  }
  return null;
}

function seekCaptionNavigationPoint(point) {
  const captionIndex = Number.isFinite(point.startCaptionIndex)
    ? point.startCaptionIndex
    : point.endCaptionIndex;
  if (!Number.isFinite(captionIndex) || !state.captions[captionIndex]) return;
  state.captionSelectedId = state.captions[captionIndex].id;
  setSelectedTimelineBoundary(getTimelineBoundarySelectionForNavigationPoint(point));
  state.captionEditorHighlightedBlockIndex = captionIndex;
  state.captionSelectionNeedsStartAnchor = false;
  els.captionPreviewVideo.pause();
  seekCaptionPreviewToTime(point.time);
  showCaptionPreviewTimecode();
  focusCaptionEditorBlock(captionIndex, { focusEditor: false });
  renderCaptionPreviewTimeline();
  updateCaptionOverlay();
}

function jumpToAdjacentCutPoint(direction) {
  if (!state.captionCutPoints.length) return;
  state.captionSelectionNeedsStartAnchor = false;
  const currentTime = getCaptionPreviewDisplayTime();
  const frameDuration = getCaptionPreviewFrameDuration();
  const targetCutPoint = direction > 0
    ? state.captionCutPoints.find((cutPoint) => cutPoint > currentTime + frameDuration * 0.5)
    : [...state.captionCutPoints].reverse().find((cutPoint) => cutPoint < currentTime - frameDuration * 0.5);
  if (!Number.isFinite(targetCutPoint)) return;
  els.captionPreviewVideo.pause();
  seekCaptionPreviewToTime(targetCutPoint);
  showCaptionPreviewTimecode();
  const selectedIndex = syncCaptionSelection({ time: targetCutPoint });
  if (selectedIndex >= 0) {
    focusCaptionEditorBlock(selectedIndex, { focusEditor: false });
  }
  renderCaptionPreviewTimeline();
  updateCaptionOverlay();
}

function setSelectedTimelineBoundary(interaction) {
  if (!interaction) {
    state.captionSelectedBoundary = null;
    return;
  }
  state.captionSelectedBoundary = {
    mode: interaction.mode,
    boundary: interaction.boundary || null,
    captionId: interaction.captionId || null,
    leftCaptionId: interaction.leftCaptionId || null,
    rightCaptionId: interaction.rightCaptionId || null,
    singleCaptionId: interaction.singleCaptionId || null,
    singleBoundary: interaction.singleBoundary || null,
    segmentIndex: Number.isFinite(interaction.segmentIndex) ? interaction.segmentIndex : null,
  };
}

function getSelectedTimelineBoundaryTime(selection = state.captionSelectedBoundary) {
  if (!selection) return null;
  if (selection.mode === "roll" && selection.leftCaptionId && selection.rightCaptionId) {
    const leftCaption = state.captions.find((caption) => caption.id === selection.leftCaptionId);
    const rightCaption = state.captions.find((caption) => caption.id === selection.rightCaptionId);
    if (!leftCaption || !rightCaption) return null;
    return snapSecondsToFrame((leftCaption.end + rightCaption.start) / 2);
  }
  const targetCaptionId = selection.singleCaptionId || selection.captionId;
  const targetBoundary = selection.singleBoundary || selection.boundary;
  const caption = state.captions.find((entry) => entry.id === targetCaptionId);
  if (!caption || !targetBoundary) return null;
  return targetBoundary === "start" ? caption.start : caption.end;
}

function nudgeSelectedTimelineBoundary(direction) {
  const selection = state.captionSelectedBoundary;
  if (!selection) return;
  state.captionSelectionNeedsStartAnchor = false;
  const boundaryTime = getSelectedTimelineBoundaryTime(selection);
  if (!Number.isFinite(boundaryTime)) return;
  const frameDuration = getCaptionPreviewFrameDuration();
  const nextTime = clampPreviewTime(boundaryTime + direction * frameDuration);
  const snapshot = getCaptionTimelineSnapshot();
  if (selection.mode === "roll" && selection.leftCaptionId && selection.rightCaptionId) {
    rollCaptionBoundary(selection.leftCaptionId, selection.rightCaptionId, nextTime);
  } else if (selection.singleCaptionId && selection.singleBoundary) {
    updateCaptionBoundaryFromTime(selection.singleCaptionId, selection.singleBoundary, nextTime);
  } else if (selection.captionId && selection.boundary) {
    updateCaptionBoundaryFromTime(selection.captionId, selection.boundary, nextTime);
  } else {
    return;
  }
  if (JSON.stringify(snapshot.captions) !== JSON.stringify(getCaptionTimelineSnapshot().captions)) {
    pushCaptionUndoEntry({ kind: "timeline", snapshot });
  }
  const updatedBoundaryTime = getSelectedTimelineBoundaryTime(selection);
  if (Number.isFinite(updatedBoundaryTime)) {
    els.captionPreviewVideo.pause();
    seekCaptionPreviewToTime(updatedBoundaryTime);
  }
  if (Number.isFinite(selection.segmentIndex)) {
    focusCaptionEditorBlock(selection.segmentIndex, { focusEditor: false });
  }
  showCaptionPreviewTimecode();
  renderCaptionPreviewTimeline();
  updateCaptionOverlay();
}

function getCaptionPreviewDefaultZoom() {
  return 8;
}

function adjustCaptionPreviewZoom(direction) {
  const video = els.captionPreviewVideo;
  const duration = Number.isFinite(video.duration) ? video.duration : Number(state.captionVideoGeometry?.duration) || 0;
  if (!duration) return;
  const currentTime = getCaptionPreviewDisplayTime(video.currentTime);
  const previousDuration = Number(state.captionPreviewZoomSeconds) || state.captionPreviewWindow?.duration || getCaptionPreviewDefaultZoom();
  const nextDuration = clampNumber(
    direction < 0 ? previousDuration * 0.8 : previousDuration * 1.25,
    Math.max(getCaptionPreviewFrameDuration() * 12, 1.5),
    Math.max(3, duration),
  );
  state.captionPreviewZoomSeconds = nextDuration;
  const centeredStart = clampNumber(currentTime - nextDuration / 2, 0, Math.max(0, duration - nextDuration));
  state.captionPreviewWindow = {
    ...(state.captionPreviewWindow || {}),
    start: centeredStart,
    end: Math.min(duration, centeredStart + nextDuration),
    duration: nextDuration,
  };
  renderCaptionPreviewTimeline();
}

function snapSecondsToFrame(time, fps = getCaptionPreviewFps()) {
  return Math.round(Math.max(0, Number(time) || 0) * fps) / fps;
}

function getTimelinePointerTime(event) {
  const rect = els.captionPreviewCaptionLane.getBoundingClientRect();
  const windowRange = state.captionPreviewWindow;
  if (!windowRange || rect.width <= 0) return 0;
  const progress = clampNumber((event.clientX - rect.left) / rect.width, 0, 1);
  return windowRange.start + progress * windowRange.duration;
}

function getNearestCaptionCutPoint(time) {
  if (!state.captionCutPoints.length) return Number(time) || 0;
  return state.captionCutPoints.reduce((closest, cutPoint) => (
    Math.abs(cutPoint - time) < Math.abs(closest - time) ? cutPoint : closest
  ), state.captionCutPoints[0]);
}

function maybeSnapTimelineEditTime(time, event) {
  if (!event?.shiftKey) return time;
  return getNearestCaptionCutPoint(time);
}

function getCaptionPreviewWindow() {
  const video = els.captionPreviewVideo;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (!duration) return null;

  const currentTime = getCaptionPreviewDisplayTime(video.currentTime);
  const selectedIndex = syncCaptionSelection({ time: currentTime });
  const selectedCaption = selectedIndex >= 0 ? state.captions[selectedIndex] : null;
  const defaultDuration = Math.min(duration, getCaptionPreviewDefaultZoom());
  const zoomDuration = clampNumber(
    Number(state.captionPreviewZoomSeconds) || Number(state.captionPreviewWindow?.duration) || defaultDuration,
    Math.max(getCaptionPreviewFrameDuration() * 12, 1.5),
    Math.max(defaultDuration, duration),
  );
  state.captionPreviewZoomSeconds = zoomDuration;
  let start = Number(state.captionPreviewWindow?.start);
  if (!Number.isFinite(start)) {
    const initialAnchor = selectedCaption
      ? clampNumber(selectedCaption.start - zoomDuration * 0.22, 0, Math.max(0, duration - zoomDuration))
      : clampNumber(currentTime - zoomDuration / 2, 0, Math.max(0, duration - zoomDuration));
    start = initialAnchor;
  }
  let end = Math.min(duration, start + zoomDuration);
  if (currentTime < start) {
    start = clampNumber(currentTime - zoomDuration / 2, 0, Math.max(0, duration - zoomDuration));
    end = Math.min(duration, start + zoomDuration);
  } else if (currentTime > end) {
    start = clampNumber(currentTime - zoomDuration / 2, 0, Math.max(0, duration - zoomDuration));
    end = Math.min(duration, start + zoomDuration);
  }
  return {
    start,
    end,
    duration: Math.max(getCaptionPreviewFrameDuration(), end - start),
    captionId: selectedCaption?.id || null,
  };
}

function updateCaptionBoundaryFromTime(captionId, boundary, nextTime) {
  const index = state.captions.findIndex((caption) => caption.id === captionId);
  if (index < 0) return;
  const caption = state.captions[index];
  const previousCaption = state.captions[index - 1] || null;
  const nextCaption = state.captions[index + 1] || null;
  if (!caption) return;

  const frameDuration = getCaptionPreviewFrameDuration();
  const snappedTime = snapSecondsToFrame(nextTime);
  if (boundary === "start") {
    const touchingPrevious = Boolean(previousCaption && Math.abs(previousCaption.end - caption.start) <= frameDuration * 1.5);
    const min = touchingPrevious
      ? previousCaption.start + MIN_CAPTION_DURATION_SECONDS
      : (previousCaption ? previousCaption.end : 0);
    const max = touchingPrevious
      ? caption.end - MIN_CAPTION_DURATION_SECONDS
      : caption.end - MIN_CAPTION_DURATION_SECONDS;
    const boundaryTime = clampNumber(snappedTime, min, max);
    caption.start = boundaryTime;
    if (touchingPrevious) previousCaption.end = boundaryTime;
  } else {
    const touchingNext = Boolean(nextCaption && Math.abs(nextCaption.start - caption.end) <= frameDuration * 1.5);
    const min = caption.start + MIN_CAPTION_DURATION_SECONDS;
    const max = touchingNext
      ? nextCaption.end - MIN_CAPTION_DURATION_SECONDS
      : (nextCaption
        ? nextCaption.start
        : Math.max(min, Number(els.captionPreviewVideo.duration) || Number(state.captionVideoGeometry?.duration) || snappedTime));
    const boundaryTime = clampNumber(snappedTime, min, max);
    caption.end = boundaryTime;
    if (touchingNext) nextCaption.start = boundaryTime;
  }

  caption.nudged = true;
  if (previousCaption) previousCaption.nudged = true;
  if (nextCaption) nextCaption.nudged = true;
  state.captionSelectedId = caption.id;
}

function rollCaptionBoundary(leftCaptionId, rightCaptionId, nextTime) {
  const leftIndex = state.captions.findIndex((caption) => caption.id === leftCaptionId);
  const rightIndex = state.captions.findIndex((caption) => caption.id === rightCaptionId);
  if (leftIndex < 0 || rightIndex < 0) return;
  const leftCaption = state.captions[leftIndex];
  const rightCaption = state.captions[rightIndex];
  if (!leftCaption || !rightCaption) return;
  const snappedTime = snapSecondsToFrame(nextTime);
  const min = leftCaption.start + MIN_CAPTION_DURATION_SECONDS;
  const max = rightCaption.end - MIN_CAPTION_DURATION_SECONDS;
  const boundaryTime = clampNumber(snappedTime, min, max);
  leftCaption.end = boundaryTime;
  rightCaption.start = boundaryTime;
  leftCaption.nudged = true;
  rightCaption.nudged = true;
  state.captionSelectedId = rightCaption.id;
}

function getCaptionTimelineBoundaryInteraction(event) {
  const rect = els.captionPreviewCaptionLane.getBoundingClientRect();
  const windowRange = state.captionPreviewWindow || getCaptionPreviewWindow();
  if (!windowRange || rect.width <= 0) return null;
  const thresholdPx = 14;
  const frameTolerance = getCaptionPreviewFrameDuration() * 1.5;
  let nearestInteraction = null;

  const considerBoundary = (interaction) => {
    if (!interaction || interaction.distance > thresholdPx) return;
    if (!nearestInteraction || interaction.distance < nearestInteraction.distance) {
      nearestInteraction = interaction;
    }
  };

  state.captions.forEach((caption, index) => {
    const previousCaption = state.captions[index - 1] || null;
    const nextCaption = state.captions[index + 1] || null;
    const boundaries = [
      {
        time: caption.start,
        mode: previousCaption && Math.abs(previousCaption.end - caption.start) <= frameTolerance ? "roll" : "resize",
        boundary: "start",
        captionId: caption.id,
        leftCaptionId: previousCaption?.id || null,
        rightCaptionId: previousCaption && Math.abs(previousCaption.end - caption.start) <= frameTolerance ? caption.id : null,
        segmentIndex: index,
      },
      {
        time: caption.end,
        mode: nextCaption && Math.abs(nextCaption.start - caption.end) <= frameTolerance ? "roll" : "resize",
        boundary: "end",
        captionId: caption.id,
        leftCaptionId: nextCaption && Math.abs(nextCaption.start - caption.end) <= frameTolerance ? caption.id : null,
        rightCaptionId: nextCaption?.id || null,
        segmentIndex: index,
      },
    ];

    boundaries.forEach((boundary) => {
      if (boundary.time < windowRange.start || boundary.time > windowRange.end) return;
      const boundaryLeft = rect.left + ((boundary.time - windowRange.start) / windowRange.duration) * rect.width;
      considerBoundary({
        ...boundary,
        singleCaptionId: boundary.mode === "resize" ? caption.id : null,
        singleBoundary: boundary.mode === "resize" ? boundary.boundary : null,
        startBoundaryTime: boundary.time,
        distance: Math.abs(event.clientX - boundaryLeft),
      });
    });
  });

  return nearestInteraction;
}

function updateCaptionTimelineHoverState(event) {
  const interaction = getCaptionTimelineBoundaryInteraction(event);
  els.captionPreviewTimeline.classList.toggle("is-edit-hover", Boolean(interaction));
}

function clearCaptionTimelineHoverState() {
  els.captionPreviewTimeline.classList.remove("is-edit-hover");
}

function createCaptionBoundaryHandleMarkup({
  leftCaption = null,
  rightCaption = null,
  singleCaption = null,
  singleBoundary = null,
  boundaryTime,
  leftPercent,
  label,
}) {
  const leftCaptionId = leftCaption?.id || "";
  const rightCaptionId = rightCaption?.id || "";
  const singleCaptionId = singleCaption?.id || "";
  const boundaryAttr = singleBoundary ? ` data-single-boundary="${singleBoundary}"` : "";
  const leftAttr = leftCaptionId ? ` data-left-caption-id="${leftCaptionId}"` : "";
  const rightAttr = rightCaptionId ? ` data-right-caption-id="${rightCaptionId}"` : "";
  const singleAttr = singleCaptionId ? ` data-single-caption-id="${singleCaptionId}"` : "";
  return `<button class="caption-preview-roll-handle" type="button" tabindex="-1" aria-label="${label}"${leftAttr}${rightAttr}${singleAttr}${boundaryAttr} data-boundary-time="${boundaryTime}" style="left:${leftPercent}%"></button>`;
}

function handleCaptionTimelinePointerDown(event) {
  if (!state.captionVideoUrl || !Number.isFinite(els.captionPreviewVideo.duration)) return;
  event.preventDefault();
  els.captionPreviewTimeline.focus({ preventScroll: true });
  if (document.activeElement && document.activeElement !== els.captionPreviewTimeline) {
    document.activeElement.blur?.();
  }
  els.captionVideoInput.blur();
  els.captionPreviewVideo.pause();
  const boundaryInteraction = getCaptionTimelineBoundaryInteraction(event);
  const segment = event.target.closest(".caption-preview-segment");
  const segmentIndex = Number.isFinite(boundaryInteraction?.segmentIndex)
    ? boundaryInteraction.segmentIndex
    : Number(segment?.dataset.captionIndex);
  const pointerTime = clampPreviewTime(getTimelinePointerTime(event));
  const editPointerTime = clampPreviewTime(maybeSnapTimelineEditTime(pointerTime, event));
  const interactionTime = boundaryInteraction ? editPointerTime : pointerTime;
  const clickedCaptionId = segment?.dataset.captionId || null;
  const clickNow = performance.now();
  const isCaptionDoubleClick = Boolean(
    !boundaryInteraction
    && clickedCaptionId
    && Number.isFinite(segmentIndex)
    && (
      event.detail >= 2
      || (
        state.captionTimelineLastClick
        && state.captionTimelineLastClick.captionId === clickedCaptionId
        && clickNow - state.captionTimelineLastClick.time <= 260
      )
    ),
  );
  if (isCaptionDoubleClick) {
    state.captionTimelineLastClick = null;
    setSelectedTimelineBoundary(null);
    setSelectedCaptionByIndex(segmentIndex, { seek: true, edge: "start", syncEditor: true, focusEditor: false });
    window.requestAnimationFrame(() => {
      els.captionPreviewTimeline.focus({ preventScroll: true });
    });
    updateCaptionOverlay();
    return;
  }
  state.captionTimelineLastClick = !boundaryInteraction && clickedCaptionId
    ? { captionId: clickedCaptionId, time: clickNow }
    : null;
  setSelectedTimelineBoundary(boundaryInteraction);
  state.activeTimelineScrub = {
    pointerId: event.pointerId,
    mode: boundaryInteraction?.mode || "scrub",
    boundary: boundaryInteraction?.boundary || null,
    captionId: boundaryInteraction?.captionId || segment?.dataset.captionId || null,
    leftCaptionId: boundaryInteraction?.leftCaptionId || null,
    rightCaptionId: boundaryInteraction?.rightCaptionId || null,
    singleCaptionId: boundaryInteraction?.singleCaptionId || null,
    singleBoundary: boundaryInteraction?.singleBoundary || null,
    startX: event.clientX,
    startTime: interactionTime,
    startBoundaryTime: boundaryInteraction?.startBoundaryTime ?? null,
    undoSnapshot: null,
  };
  if (state.activeTimelineScrub.mode === "resize" || state.activeTimelineScrub.mode === "roll") {
    state.activeTimelineScrub.undoSnapshot = getCaptionTimelineSnapshot();
  }
  els.captionPreviewTimeline.setPointerCapture?.(event.pointerId);
  if (segment && Number.isFinite(segmentIndex)) {
    if (boundaryInteraction) {
      state.captionSelectedId = state.captions[segmentIndex]?.id || state.captionSelectedId;
      updateCaptionPreviewControls();
      focusCaptionEditorBlock(segmentIndex, { focusEditor: false });
    } else {
      setSelectedCaptionByIndex(segmentIndex, { seek: false, refresh: false, syncEditor: true });
    }
  } else if (!boundaryInteraction) {
    state.captionSelectedBoundary = null;
  }
  window.requestAnimationFrame(() => {
    els.captionPreviewTimeline.focus({ preventScroll: true });
  });
  showCaptionPreviewTimecode();
  if (state.activeTimelineScrub.mode === "resize" || state.activeTimelineScrub.mode === "roll") {
    seekCaptionPreviewToTime(interactionTime);
    renderCaptionPreviewTimeline();
  } else {
    seekCaptionPreviewToTime(pointerTime);
    if (segment && Number.isFinite(segmentIndex)) {
      state.captionSelectedId = state.captions[segmentIndex]?.id || state.captionSelectedId;
      updateCaptionPreviewControls();
    }
  }
  updateCaptionOverlay();
}

function handleCaptionTimelinePointerMove(event) {
  if (!state.activeTimelineScrub) {
    updateCaptionTimelineHoverState(event);
    return;
  }
  if (state.activeTimelineScrub.pointerId !== event.pointerId) return;
  const frameDuration = getCaptionPreviewFrameDuration();
  const frameDelta = Math.round((event.clientX - state.activeTimelineScrub.startX) / 2.5);
  const pointerTime = clampPreviewTime(
    (state.activeTimelineScrub.mode === "resize" || state.activeTimelineScrub.mode === "roll") && Number.isFinite(state.activeTimelineScrub.startBoundaryTime)
      ? state.activeTimelineScrub.startBoundaryTime + frameDelta * frameDuration
      : state.activeTimelineScrub.startTime + frameDelta * frameDuration,
  );
  const editPointerTime = clampPreviewTime(maybeSnapTimelineEditTime(pointerTime, event));
  if (state.activeTimelineScrub.mode === "resize" && state.activeTimelineScrub.captionId && state.activeTimelineScrub.boundary) {
    updateCaptionBoundaryFromTime(state.activeTimelineScrub.captionId, state.activeTimelineScrub.boundary, editPointerTime);
    seekCaptionPreviewToTime(
      state.activeTimelineScrub.boundary === "start"
        ? editPointerTime
        : Math.max(0, editPointerTime - getCaptionPreviewFrameDuration()),
    );
    renderCaptionPreviewTimeline();
  } else if (state.activeTimelineScrub.mode === "roll") {
    if (state.activeTimelineScrub.leftCaptionId && state.activeTimelineScrub.rightCaptionId) {
      rollCaptionBoundary(state.activeTimelineScrub.leftCaptionId, state.activeTimelineScrub.rightCaptionId, editPointerTime);
    } else if (state.activeTimelineScrub.singleCaptionId && state.activeTimelineScrub.singleBoundary) {
      updateCaptionBoundaryFromTime(state.activeTimelineScrub.singleCaptionId, state.activeTimelineScrub.singleBoundary, editPointerTime);
    }
    seekCaptionPreviewToTime(editPointerTime);
    renderCaptionPreviewTimeline();
  } else {
    seekCaptionPreviewToTime(pointerTime);
  }
  updateCaptionOverlay();
}

function endCaptionTimelineScrub(event) {
  if (!state.activeTimelineScrub || state.activeTimelineScrub.pointerId !== event.pointerId) return;
  const scrubState = state.activeTimelineScrub;
  els.captionPreviewTimeline.releasePointerCapture?.(event.pointerId);
  state.activeTimelineScrub = null;
  if (
    (scrubState.mode === "resize" || scrubState.mode === "roll")
    && scrubState.undoSnapshot
    && JSON.stringify(scrubState.undoSnapshot.captions) !== JSON.stringify(getCaptionTimelineSnapshot().captions)
  ) {
    pushCaptionUndoEntry({ kind: "timeline", snapshot: scrubState.undoSnapshot });
  }
  showCaptionPreviewTimecode();
}

function formatCaptionPreviewRulerLabel(time, majorStep) {
  if (majorStep < 1) {
    return Number(time).toFixed(1);
  }
  return String(Math.round(time));
}

function renderCaptionPreviewTimeline() {
  const video = els.captionPreviewVideo;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (!duration || !state.captionVideoUrl) {
    state.captionPreviewWindow = null;
    els.captionPreviewRuler.innerHTML = "";
    els.captionPreviewCaptionLane.innerHTML = '<div class="caption-preview-playhead" aria-hidden="true"></div>';
    updateCaptionPreviewControls();
    return;
  }

  const windowRange = getCaptionPreviewWindow();
  if (!windowRange) return;
  state.captionPreviewWindow = windowRange;
  const windowDuration = windowRange.duration;
  const majorStep = windowDuration <= 2.5
    ? 0.25
    : windowDuration <= 5
      ? 1
      : windowDuration <= 10
        ? 1
        : windowDuration <= 20
          ? 2
          : 5;
  const firstTick = Math.ceil(windowRange.start / majorStep) * majorStep;
  const rulerTimes = [windowRange.start];
  for (let time = firstTick; time < windowRange.end; time += majorStep) {
    if (time > windowRange.start + 0.001 && time < windowRange.end - 0.001) rulerTimes.push(time);
  }
  rulerTimes.push(windowRange.end);
  const minimumLabelGapPercent = 10;
  const rulerTicks = rulerTimes.map((time, index) => {
    const left = ((time - windowRange.start) / windowDuration) * 100;
    const previousLeft = index > 0
      ? ((rulerTimes[index - 1] - windowRange.start) / windowDuration) * 100
      : null;
    const nextLeft = index < rulerTimes.length - 1
      ? ((rulerTimes[index + 1] - windowRange.start) / windowDuration) * 100
      : null;
    const isTooCloseToPrevious = previousLeft != null && Math.abs(left - previousLeft) < minimumLabelGapPercent;
    const isTooCloseToNext = nextLeft != null && Math.abs(nextLeft - left) < minimumLabelGapPercent;
    const shouldShowLabel = index === 0
      ? !isTooCloseToNext
      : index === rulerTimes.length - 1
        ? !isTooCloseToPrevious
        : !isTooCloseToPrevious && !isTooCloseToNext;
    const label = shouldShowLabel ? formatCaptionPreviewRulerLabel(time, majorStep) : "";
    const alignClass = index === rulerTimes.length - 1
      ? "is-right"
      : index === 0
        ? "is-left"
        : "is-center";
    return `<div class="caption-preview-ruler-tick ${alignClass}" style="left:${left}%"><span>${label}</span></div>`;
  }).join("");
  const rollHandles = state.captions
    .map((caption, index) => ({ caption, index }))
    .flatMap(({ caption, index }) => {
      const previousCaption = state.captions[index - 1] || null;
      const nextCaption = state.captions[index + 1] || null;
      const frameTolerance = getCaptionPreviewFrameDuration() * 1.5;
      const handles = [];
      const touchingPrevious = Boolean(previousCaption && Math.abs(previousCaption.end - caption.start) <= frameTolerance);
      const touchingNext = Boolean(nextCaption && Math.abs(nextCaption.start - caption.end) <= frameTolerance);

      if (caption.start >= windowRange.start && caption.start <= windowRange.end) {
        const left = ((caption.start - windowRange.start) / windowDuration) * 100;
        if (touchingPrevious) {
          handles.push(createCaptionBoundaryHandleMarkup({
            leftCaption: previousCaption,
            rightCaption: caption,
            boundaryTime: caption.start,
            leftPercent: left,
            label: `Roll captions ${index} and ${index + 1}`,
          }));
        } else {
          handles.push(createCaptionBoundaryHandleMarkup({
            singleCaption: caption,
            singleBoundary: "start",
            boundaryTime: caption.start,
            leftPercent: left,
            label: `Adjust caption ${index + 1} in point`,
          }));
        }
      }

      if (!touchingNext && caption.end >= windowRange.start && caption.end <= windowRange.end) {
        const left = ((caption.end - windowRange.start) / windowDuration) * 100;
        handles.push(createCaptionBoundaryHandleMarkup({
          singleCaption: caption,
          singleBoundary: "end",
          boundaryTime: caption.end,
          leftPercent: left,
          label: `Adjust caption ${index + 1} out point`,
        }));
      }

      return handles;
    })
    .join("");
  const captionSegments = state.captions
    .map((caption, index) => ({ caption, index }))
    .filter(({ caption }) => caption.end > windowRange.start && caption.start < windowRange.end)
    .map(({ caption, index }) => {
      const previousCaption = state.captions[index - 1] || null;
      const nextCaption = state.captions[index + 1] || null;
      const frameTolerance = getCaptionPreviewFrameDuration() * 1.5;
      const touchingPrevious = previousCaption && Math.abs(previousCaption.end - caption.start) <= frameTolerance;
      const touchingNext = nextCaption && Math.abs(nextCaption.start - caption.end) <= frameTolerance;
      const clippedStart = Math.max(caption.start, windowRange.start);
      const clippedEnd = Math.min(caption.end, windowRange.end);
      const left = ((clippedStart - windowRange.start) / windowDuration) * 100;
      const width = Math.max(1.2, ((clippedEnd - clippedStart) / windowDuration) * 100);
      const touchingClasses = [
        touchingPrevious ? "is-touching-prev" : "",
        touchingNext ? "is-touching-next" : "",
      ].filter(Boolean).join(" ");
      return `
        <button class="caption-preview-segment ${touchingClasses}" type="button" tabindex="-1" aria-label="Caption ${index + 1}" data-caption-id="${caption.id}" data-caption-index="${index}" style="left:${left}%;width:${width}%">
          <span class="caption-preview-segment-handle" data-boundary="start" aria-hidden="true"></span>
          <span class="caption-preview-segment-handle" data-boundary="end" aria-hidden="true"></span>
        </button>
      `;
  }).join("");
  const cutMarkers = state.captionCutPoints
    .filter((cutPoint) => cutPoint >= windowRange.start && cutPoint <= windowRange.end)
    .map((cutPoint) => {
      const left = ((Math.max(windowRange.start, Math.min(windowRange.end, Number(cutPoint) || 0)) - windowRange.start) / windowDuration) * 100;
      return `<span class="caption-preview-cut-marker" aria-hidden="true" style="left:${left}%"></span>`;
    })
    .join("");
  const selectedBoundaryTime = getSelectedTimelineBoundaryTime();
  const selectedBoundaryMarker = Number.isFinite(selectedBoundaryTime)
    && selectedBoundaryTime >= windowRange.start
    && selectedBoundaryTime <= windowRange.end
    ? `<div class="caption-preview-selected-boundary" aria-hidden="true" style="left:${((selectedBoundaryTime - windowRange.start) / windowDuration) * 100}%"></div>`
    : "";

  els.captionPreviewRuler.innerHTML = rulerTicks;
  els.captionPreviewCaptionLane.innerHTML = `<div class="caption-preview-playhead" aria-hidden="true"></div>${cutMarkers}${captionSegments}${selectedBoundaryMarker}${rollHandles}`;
  updateCaptionPreviewControls();
}

function updateCaptionPreviewControls() {
  const video = els.captionPreviewVideo;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const rawCurrentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const currentTime = getCaptionPreviewDisplayTime(rawCurrentTime);
  const hasVideo = Boolean(state.captionVideoUrl && duration > 0);
  if (!hasVideo) hideCaptionPreviewTimecode(true);
  const fps = getCaptionPreviewFps();
  const selectedIndex = hasVideo ? syncCaptionSelection({ time: currentTime }) : -1;
  const selectedCaption = selectedIndex >= 0 ? state.captions[selectedIndex] : null;
  if (
    hasVideo &&
    state.captionPreviewWindow &&
    (currentTime < state.captionPreviewWindow.start || currentTime > state.captionPreviewWindow.end)
  ) {
    renderCaptionPreviewTimeline();
    return;
  }
  els.captionPreviewTime.textContent = secondsToTimecode(currentTime, fps);

  const windowRange = hasVideo ? (state.captionPreviewWindow || getCaptionPreviewWindow()) : null;
  const playheadPercent = hasVideo && windowRange
    ? clampNumber(((currentTime - windowRange.start) / windowRange.duration) * 100, 0, 100)
    : 0;
  const playhead = els.captionPreviewCaptionLane.querySelector(".caption-preview-playhead");
  if (playhead) playhead.style.left = `${playheadPercent}%`;
  els.captionPreviewCaptionLane.querySelectorAll(".caption-preview-segment").forEach((segment) => {
    const captionId = segment.dataset.captionId;
    segment.classList.toggle("is-selected", Boolean(selectedCaption && captionId === selectedCaption.id));
    segment.classList.toggle("is-active", Boolean(captionId === state.captions[getCaptionIndexAtTime(currentTime)]?.id));
  });
}

function getCaptionAtTime(time) {
  return state.captions.find((caption) => time >= caption.start && time < caption.end);
}

function commitCaptionEditorChanges() {
  remapEditorToTimedCaptions();
}

function remapEditorToTimedCaptions() {
  if (!state.captionSourceWords.length) return -1;
  const previous = state.captions.map((caption) => caption.text).join("\n\n");
  const editorBlocks = parseCaptionEditorBlocks(els.captionEditor.value);
  const editedWords = createEditedTimedWords(
    editorBlocks.map((block) => block.text).join(" "),
    state.captionSourceWords,
  );
  state.captionTranscript = {
    text: editedWords.map((word) => word.text).join(" "),
    words: editedWords,
  };
  state.captions = buildCaptionsFromEditorBlocks(editorBlocks, editedWords, state.captionCutPoints, getCaptionSettingsWithGeometry());
  syncCaptionSelection();
  renderCaptionPreviewTimeline();
  updateCaptionActionAvailability();
  return findChangedCaptionIndex(previous, state.captions.map((caption) => caption.text).join("\n\n"));
}

function regenerateCaptionLayoutFromEditor() {
  if (!state.captionSourceWords.length) return -1;
  const previous = state.captions.map((caption) => caption.text).join("\n\n");
  const editorBlocks = parseCaptionEditorBlocks(els.captionEditor.value);
  const editedWords = createEditedTimedWords(
    editorBlocks.map((block) => block.text).join(" "),
    state.captionSourceWords,
  );
  state.captionTranscript = {
    text: editedWords.map((word) => word.text).join(" "),
    words: editedWords,
  };
  state.captions = buildCaptionsFromWords(editedWords, state.captionCutPoints, getCaptionSettingsWithGeometry());
  syncCaptionSelection();
  renderCaptionPreviewTimeline();
  updateCaptionEditorFromCaptions();
  updateCaptionActionAvailability();
  return findChangedCaptionIndex(previous, state.captions.map((caption) => caption.text).join("\n\n"));
}

function snapshotChangesCaptionLayout(before, after) {
  return before?.captionLength !== after?.captionLength || before?.captionLines !== after?.captionLines;
}

function parseCaptionEditorBlocks(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((text) => ({
      text,
      wordCount: tokenizeCaptionText(text).length,
    }))
    .filter((block) => block.wordCount > 0);
}

function buildCaptionsFromEditorBlocks(blocks, editedWords, cutPoints, settings) {
  const captions = [];
  let wordIndex = 0;
  blocks.forEach((block) => {
    const blockWords = editedWords.slice(wordIndex, wordIndex + block.wordCount);
    wordIndex += block.wordCount;
    if (!blockWords.length) return;
    const originalStart = blockWords[0].start;
    const originalEnd = blockWords.at(-1).end;
    captions.push({
      id: crypto.randomUUID(),
      start: Math.max(0, originalStart),
      end: Math.max(originalStart + MIN_CAPTION_DURATION_SECONDS, originalEnd),
      originalStart,
      originalEnd,
      nudged: false,
      text: block.text,
      originalText: block.text,
      wordIds: blockWords.map((word) => word.id),
      wordMappings: blockWords.map((word) => ({ wordId: word.id, text: word.text })),
    });
  });
  return applyCaptionTimingRules(captions, cutPoints, settings);
}

function findChangedCaptionIndex(previousText, nextText) {
  const previousBlocks = previousText.split(/\n{2,}/);
  const nextBlocks = nextText.split(/\n{2,}/);
  const count = Math.max(previousBlocks.length, nextBlocks.length);
  for (let index = 0; index < count; index += 1) {
    if ((previousBlocks[index] || "") !== (nextBlocks[index] || "")) return index;
  }
  return -1;
}

function getCaptionEditorBlockRanges() {
  const value = els.captionEditor.value;
  const blocks = value.split(/\n{2,}/);
  const ranges = [];
  let cursor = 0;
  blocks.forEach((block, index) => {
    const start = cursor;
    const end = start + block.length;
    ranges.push({ start, end });
    cursor = end;
    if (index < blocks.length - 1) {
      const separatorMatch = value.slice(cursor).match(/^\n{2,}/);
      cursor += separatorMatch ? separatorMatch[0].length : 2;
    }
  });
  return ranges;
}

function focusCaptionEditorBlock(index, { focusEditor = false } = {}) {
  const range = getCaptionEditorBlockRanges()[index];
  state.captionEditorHighlightedBlockIndex = Number.isFinite(index) ? index : null;
  if (!range) {
    els.captionEditorContainer?.classList.remove("has-selection");
    els.captionEditorSelection.style.height = "0px";
    return;
  }
  const lineHeight = parseFloat(getComputedStyle(els.captionEditor).lineHeight || "24") || 24;
  const linesBefore = els.captionEditor.value.slice(0, range.start).split("\n").length - 1;
  const targetTop = Math.max(0, linesBefore * lineHeight - lineHeight * 2);
  state.suppressCaptionEditorCursorActivity = true;
  els.captionEditor.scrollTop = targetTop;
  if (typeof els.captionEditor.setSelectionRange === "function") {
    els.captionEditor.setSelectionRange(range.start, range.end);
  }
  updateCaptionEditorSelectionHighlight();
  window.requestAnimationFrame(() => {
    updateCaptionEditorSelectionHighlight();
    state.suppressCaptionEditorCursorActivity = false;
  });
  if (focusEditor) {
    els.captionEditor.focus({ preventScroll: true });
  }
}

function updateCaptionEditorSelectionHighlight() {
  const lineHeight = parseFloat(getComputedStyle(els.captionEditor).lineHeight || "24") || 24;
  const paddingTop = parseFloat(getComputedStyle(els.captionEditor).paddingTop || "12") || 12;
  const highlightPaddingY = 7;
  const highlightedIndex = Number.isFinite(state.captionEditorHighlightedBlockIndex)
    ? state.captionEditorHighlightedBlockIndex
    : null;
  if (highlightedIndex != null) {
    const range = getCaptionEditorBlockRanges()[highlightedIndex];
    if (!range) {
      els.captionEditorContainer?.classList.remove("has-selection");
      els.captionEditorSelection.style.height = "0px";
      return;
    }
    const valueBefore = els.captionEditor.value.slice(0, range.start);
    const selectedValue = els.captionEditor.value.slice(range.start, range.end);
    const linesBefore = valueBefore.split("\n").length - 1;
    const lineCount = Math.max(1, selectedValue.split("\n").length);
    const top = paddingTop + linesBefore * lineHeight - els.captionEditor.scrollTop - highlightPaddingY;
    const height = lineCount * lineHeight + highlightPaddingY * 2;
    els.captionEditorSelection.style.top = `${Math.max(paddingTop - highlightPaddingY, top)}px`;
    els.captionEditorSelection.style.height = `${Math.max(lineHeight + highlightPaddingY * 2, height)}px`;
    els.captionEditorContainer?.classList.add("has-selection");
    return;
  }
  const start = els.captionEditor.selectionStart;
  const end = els.captionEditor.selectionEnd;
  if (start == null || end == null || end <= start) {
    els.captionEditorContainer?.classList.remove("has-selection");
    els.captionEditorSelection.style.height = "0px";
    return;
  }
  const valueBefore = els.captionEditor.value.slice(0, start);
  const selectedValue = els.captionEditor.value.slice(start, end);
  const linesBefore = valueBefore.split("\n").length - 1;
  const lineCount = Math.max(1, selectedValue.split("\n").length);
  const top = paddingTop + linesBefore * lineHeight - els.captionEditor.scrollTop - highlightPaddingY;
  const height = lineCount * lineHeight + highlightPaddingY * 2;
  els.captionEditorSelection.style.top = `${Math.max(paddingTop - highlightPaddingY, top)}px`;
  els.captionEditorSelection.style.height = `${Math.max(lineHeight + highlightPaddingY * 2, height)}px`;
  els.captionEditorContainer?.classList.add("has-selection");
}

function seekPreviewToCaption(index) {
  if (index < 0 || !state.captions[index]) return;
  setSelectedCaptionByIndex(index, { seek: false, refresh: false, syncEditor: false });
  const targetTime = Math.max(0, state.captions[index].start + 0.02);
  if (Math.abs(els.captionPreviewVideo.currentTime - targetTime) > 0.15) {
    seekCaptionPreviewToTime(targetTime);
  }
  renderCaptionPreviewTimeline();
}

function getCaptionIndexAtEditorCursor(fallbackIndex = -1) {
  const cursor = els.captionEditor.selectionStart;
  if (!Number.isFinite(cursor)) return fallbackIndex;
  const beforeCursor = els.captionEditor.value.slice(0, cursor);
  const blockIndex = beforeCursor.split(/\n{2,}/).length - 1;
  if (state.captions[blockIndex]) return blockIndex;
  return fallbackIndex;
}

function drawCaptionPreviewFrame() {
  const video = els.captionPreviewVideo;
  const canvas = els.captionPreviewCanvas;
  const crop = getCaptionPreviewCrop();
  if (!crop) {
    clearCaptionPreviewCanvas();
    return;
  }
  if (video.readyState < 2) {
    return;
  }
  const frameSize = getNormalizedCaptionFrameSize(crop);
  const width = frameSize.width;
  const height = frameSize.height;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  const selectedFont = els.captionFont.value;
  const selectedWeight = els.captionFontWeight.value;
  if (isCaptionFontLoaded(selectedFont, selectedWeight)) {
    drawCaptionOnCanvas(ctx, getCaptionAtTime(video.currentTime), width, height);
  } else {
    ensureCaptionFontReady(selectedFont, selectedWeight);
  }
  els.captionPreview.classList.add("has-canvas");
}

function clearCaptionPreviewCanvas() {
  const canvas = els.captionPreviewCanvas;
  const ctx = canvas.getContext("2d");
  ctx?.clearRect(0, 0, canvas.width || 1, canvas.height || 1);
  els.captionPreview.classList.remove("has-canvas");
}

function getCaptionPreviewCrop() {
  const video = els.captionPreviewVideo;
  const width = video.videoWidth || state.captionVideoGeometry?.width || 0;
  const height = video.videoHeight || state.captionVideoGeometry?.height || 0;
  if (!width || !height) return null;
  const crop = state.captionVisibleCrop;
  if (!crop) return { x: 0, y: 0, width, height };
  return {
    x: Math.max(0, Math.min(width - 2, Math.round(crop.x))),
    y: Math.max(0, Math.min(height - 2, Math.round(crop.y))),
    width: Math.max(2, Math.min(width, Math.round(crop.width))),
    height: Math.max(2, Math.min(height, Math.round(crop.height))),
  };
}

function getExportCaptionCrop(video) {
  const width = video.videoWidth || state.captionVideoGeometry?.width || 0;
  const height = video.videoHeight || state.captionVideoGeometry?.height || 0;
  const crop = state.captionVisibleCrop;
  if (!crop || !width || !height) return { x: 0, y: 0, width, height };
  return {
    x: Math.max(0, Math.min(width - 2, Math.round(crop.x))),
    y: Math.max(0, Math.min(height - 2, Math.round(crop.y))),
    width: Math.max(2, Math.min(width, Math.round(crop.width))),
    height: Math.max(2, Math.min(height, Math.round(crop.height))),
  };
}

function getNormalizedCaptionFrameSize(crop) {
  const width = Math.max(2, Number(crop?.width) || 0);
  const height = Math.max(2, Number(crop?.height) || 0);
  const aspect = width / height;
  if (Math.abs(aspect - 9 / 16) < 0.04) return { width: 1080, height: 1920 };
  if (Math.abs(aspect - 16 / 9) < 0.04) return { width: 1920, height: 1080 };
  if (Math.abs(aspect - 1) < 0.04) return { width: 1080, height: 1080 };
  return { width: makeEven(width), height: makeEven(height) };
}

function createEditedTimedWords(text, sourceWords) {
  const tokens = tokenizeCaptionText(text);
  if (!tokens.length) return [];
  const timingSourceWords = sourceWords
    .map((word) => ({ ...word, text: stripNonDialogueText(word.text) }))
    .filter((word) => word.text);
  if (timingSourceWords.length === 0) {
    return tokens.map((token, index) => ({
      id: `e${index + 1}`,
      text: token,
      start: index * 0.25,
      end: index * 0.25 + 0.2,
    }));
  }

  if (tokens.length === 1) {
    return [{
      id: "e1",
      text: tokens[0],
      start: timingSourceWords[0].start,
      end: timingSourceWords.at(-1).end,
    }];
  }

  const sourceIndexes = mapEditedTokensToSourceIndexes(tokens, timingSourceWords);
  return tokens.map((token, index) => {
    const sourceIndex = sourceIndexes[index];
    const sourceWord = timingSourceWords[sourceIndex] || timingSourceWords.at(-1);
    const nextSourceIndex = sourceIndexes[index + 1];
    const nextStart = Number.isFinite(nextSourceIndex)
      ? timingSourceWords[nextSourceIndex]?.start
      : sourceWord.end;
    const start = sourceWord.start;
    const sourceDuration = Math.max(0.05, sourceWord.end - sourceWord.start);
    return {
      id: `e${index + 1}`,
      text: token,
      start,
      end: Math.max(start + 0.05, Math.min(nextStart || sourceWord.end, start + sourceDuration)),
      sourceWordId: sourceWord.id,
    };
  });
}

function mapEditedTokensToSourceIndexes(tokens, sourceWords) {
  const sourceTokens = sourceWords.map((word) => normalizeTokenForAlignment(word.text));
  const editedTokens = tokens.map(normalizeTokenForAlignment);
  if (tokens.length === sourceWords.length) {
    return tokens.map((_, index) => index);
  }

  const anchors = findTokenAlignmentAnchors(editedTokens, sourceTokens);
  const indexes = new Array(tokens.length).fill(null);
  anchors.forEach(({ editedIndex, sourceIndex }) => {
    indexes[editedIndex] = sourceIndex;
  });

  const boundaries = [
    { editedIndex: -1, sourceIndex: -1 },
    ...anchors,
    { editedIndex: tokens.length, sourceIndex: sourceWords.length },
  ];

  for (let boundaryIndex = 0; boundaryIndex < boundaries.length - 1; boundaryIndex += 1) {
    const left = boundaries[boundaryIndex];
    const right = boundaries[boundaryIndex + 1];
    const editedSpan = right.editedIndex - left.editedIndex;
    const sourceSpan = right.sourceIndex - left.sourceIndex;
    for (let editedIndex = left.editedIndex + 1; editedIndex < right.editedIndex; editedIndex += 1) {
      const amount = editedSpan > 0 ? (editedIndex - left.editedIndex) / editedSpan : 0;
      const sourceIndex = Math.round(left.sourceIndex + amount * sourceSpan);
      indexes[editedIndex] = Math.max(0, Math.min(sourceWords.length - 1, sourceIndex));
    }
  }

  return indexes.map((sourceIndex, index) => {
    if (Number.isFinite(sourceIndex)) return sourceIndex;
    return Math.max(0, Math.min(sourceWords.length - 1, index));
  });
}

function findTokenAlignmentAnchors(editedTokens, sourceTokens) {
  const rows = editedTokens.length + 1;
  const columns = sourceTokens.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(columns).fill(0));
  for (let row = editedTokens.length - 1; row >= 0; row -= 1) {
    for (let column = sourceTokens.length - 1; column >= 0; column -= 1) {
      dp[row][column] = editedTokens[row] && editedTokens[row] === sourceTokens[column]
        ? dp[row + 1][column + 1] + 1
        : Math.max(dp[row + 1][column], dp[row][column + 1]);
    }
  }

  const anchors = [];
  let row = 0;
  let column = 0;
  while (row < editedTokens.length && column < sourceTokens.length) {
    if (editedTokens[row] && editedTokens[row] === sourceTokens[column]) {
      anchors.push({ editedIndex: row, sourceIndex: column });
      row += 1;
      column += 1;
    } else if (dp[row + 1][column] >= dp[row][column + 1]) {
      row += 1;
    } else {
      column += 1;
    }
  }
  return anchors;
}

function normalizeTokenForAlignment(token) {
  return String(token || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']/gu, "");
}

function tokenizeCaptionText(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function mapEditedCaptionToWords(text, wordIds) {
  const tokens = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return wordIds.map((wordId) => ({ wordId, text: "" }));
  }
  return wordIds.map((wordId, index) => ({
    wordId,
    text: tokens[Math.min(index, tokens.length - 1)],
  }));
}

function updateCaptionEditorFromCaptions() {
  els.captionEditor.value = state.captions.map((caption) => caption.text).join("\n\n");
  els.captionEditor.scrollTop = 0;
}

function buildCaptionsFromWords(words, cutPoints, settings) {
  const cleanedWords = words
    .map((word) => ({ ...word, text: stripNonDialogueText(word.text) }))
    .filter((word) => word.text);
  if (isOneWordCaptionMode(settings)) {
    const captions = cleanedWords.map((word) => createCaptionFromWords([word], cutPoints, settings));
    return applyCaptionTimingRules(captions, cutPoints, settings);
  }

  const groups = [];
  let current = [];

  cleanedWords.forEach((word, index) => {
    const previous = current.at(-1);
    if (previous && shouldBreakOnPause(current, previous, word, settings)) {
      groups.push(current);
      current = [word];
      return;
    }

    const candidate = [...current, word];
    if (current.length > 0 && shouldStartNewCaption(candidate, current, settings)) {
      groups.push(current);
      current = [word];
      return;
    }
    current = candidate;

    const nextWord = cleanedWords[index + 1];
    if (nextWord && shouldBreakOnPunctuation(current, nextWord, settings)) {
      groups.push(current);
      current = [];
    }
  });

  if (current.length > 0) {
    groups.push(current);
  }
  const captions = mergeShortCaptionGroups(groups, settings)
    .map((group) => createCaptionFromWords(group, cutPoints, settings));
  return applyCaptionTimingRules(captions, cutPoints, settings);
}

function mergeShortCaptionGroups(groups, settings) {
  if (isOneWordCaptionMode(settings)) return groups;

  const pending = groups.map((group) => [...group]);
  const merged = [];

  for (let index = 0; index < pending.length; index += 1) {
    const group = pending[index];
    if (!group.length) continue;
    if (isShortCaptionGroup(group, settings)) {
      const nextGroup = pending[index + 1];
      if (nextGroup?.length && canMergeCaptionGroups(group, nextGroup, settings)) {
        pending[index + 1] = [...group, ...nextGroup];
        continue;
      }
      const previousGroup = merged.at(-1);
      if (previousGroup?.length && canMergeCaptionGroups(previousGroup, group, settings)) {
        merged[merged.length - 1] = [...previousGroup, ...group];
        continue;
      }
    }
    merged.push(group);
  }

  return merged;
}

function isShortCaptionGroup(group, settings) {
  if (group.length <= 1) return true;
  const text = group.map((word) => word.text).join(" ");
  return text.length < Math.max(12, settings.captionLength * 0.45);
}

function canMergeCaptionGroups(leftGroup, rightGroup, settings) {
  if (!leftGroup?.length || !rightGroup?.length) return false;
  if (hasTerminalPunctuation(leftGroup.at(-1)?.text)) return false;
  return captionCanFit([...leftGroup, ...rightGroup], settings);
}

function shouldStartNewCaption(candidateWords, currentWords, settings) {
  if (!captionCanFit(candidateWords, settings)) return true;

  const currentText = currentWords.map((word) => word.text).join(" ");
  const candidateText = candidateWords.map((word) => word.text).join(" ");
  if (hasBreakPunctuation(currentWords.at(-1)?.text) && candidateText.length > settings.captionLength * 0.8) {
    return true;
  }

  return currentText.length >= settings.captionLength * settings.captionLines;
}

function shouldBreakOnPause(currentWords, previousWord, word, settings) {
  const pause = Number(word.start) - Number(previousWord.end);
  if (pause < 0.45) return false;

  const currentText = currentWords.map((currentWord) => currentWord.text).join(" ");
  const minMeaningfulLength = Math.max(12, settings.captionLength * 0.45);
  if (currentWords.length < 3 && currentText.length < minMeaningfulLength) return false;

  return true;
}

function shouldBreakOnPunctuation(currentWords, nextWord, settings) {
  const lastWord = currentWords.at(-1);
  if (!lastWord || !hasBreakPunctuation(lastWord.text)) return false;

  const currentText = currentWords.map((word) => word.text).join(" ");
  if (!captionCanFit([...currentWords, nextWord], settings)) return true;
  if (hasTerminalPunctuation(lastWord.text)) return currentText.length >= 8 || currentWords.length >= 2;
  return currentText.length >= settings.captionLength * 0.55;
}

function hasBreakPunctuation(text = "") {
  return /[.!?;:,\u2026]["')\]]?$/.test(text.trim());
}

function hasTerminalPunctuation(text = "") {
  return /[.!?\u2026]["')\]]?$/.test(text.trim());
}

function createCaptionFromWords(words, cutPoints, settings) {
  const text = wrapCaptionText(words.map((word) => word.text).join(" "), settings.captionLength, settings.captionLines)
    .lines.join("\n");
  const originalStart = words[0].start;
  const originalEnd = words.at(-1).end;
  return {
    id: crypto.randomUUID(),
    start: Math.max(0, originalStart),
    end: Math.max(originalStart + MIN_CAPTION_DURATION_SECONDS, originalEnd),
    originalStart,
    originalEnd,
    nudged: false,
    text,
    originalText: text,
    wordIds: words.map((word) => word.id),
    wordMappings: words.map((word) => ({ wordId: word.id, text: word.text })),
  };
}

function applyCaptionTimingRules(captions, cutPoints = [], settings = {}) {
  const fps = Number(settings.fps) || 30;
  const snapToleranceSeconds = CAPTION_SNAP_TOLERANCE_FRAMES / fps;
  const sortedCuts = [...(cutPoints || [])]
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const timedCaptions = [];
  captions.forEach((caption) => {
    const dialogueStart = Number(caption.originalStart ?? caption.start) || 0;
    const dialogueEnd = Number(caption.originalEnd ?? caption.end) || dialogueStart;
    const previousCaption = timedCaptions.at(-1);
    const previousEnd = Number(previousCaption?.end);
    const previousDialogueEnd = Number(previousCaption?.originalEnd ?? previousEnd);
    let start = Math.max(0, dialogueStart);
    let end = Math.max(start + MIN_CAPTION_DURATION_SECONDS, dialogueEnd + CAPTION_HOLD_SECONDS);
    let nudged = false;

    const snappedStart = findNearestCut(start, sortedCuts, snapToleranceSeconds, {
      min: dialogueStart,
      max: start + snapToleranceSeconds,
    });
    if (snappedStart !== null) {
      start = snappedStart;
      nudged = true;
    }

    const pinnedEndCut = findFirstCutInRange(
      dialogueEnd,
      dialogueEnd + CAPTION_HOLD_SECONDS + CAPTION_CUTPOINT_PIN_SECONDS,
      sortedCuts,
    );
    if (pinnedEndCut !== null) {
      end = Math.max(start + MIN_CAPTION_DURATION_SECONDS, pinnedEndCut);
      nudged = true;
    }

    if (previousCaption && Number.isFinite(previousEnd)) {
      const overlapOrTouching = previousEnd >= start;
      const renderedGap = start - previousEnd;
      const dialogueGap = dialogueStart - previousDialogueEnd;
      if (overlapOrTouching || renderedGap <= CAPTION_JOIN_GAP_SECONDS || dialogueGap <= CAPTION_JOIN_GAP_SECONDS) {
        previousCaption.end = Math.max(previousCaption.start + MIN_CAPTION_DURATION_SECONDS, start);
        previousCaption.nudged = true;
      }
    }

    start = Math.max(dialogueStart, start);
    end = Math.max(start + MIN_CAPTION_DURATION_SECONDS, end);

    timedCaptions.push({
      ...caption,
      start,
      end,
      nudged: Boolean(caption.nudged || nudged),
    });
  });
  return timedCaptions;
}

function findNearestCut(time, cutPoints, tolerance, bounds = {}) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const cutPoint of cutPoints) {
    if (Number.isFinite(bounds.min) && cutPoint < bounds.min) continue;
    if (Number.isFinite(bounds.max) && cutPoint > bounds.max) continue;
    const distance = Math.abs(cutPoint - time);
    if (distance <= tolerance && distance < nearestDistance) {
      nearest = cutPoint;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function findFirstCutInRange(minTime, maxTime, cutPoints) {
  for (const cutPoint of cutPoints) {
    if (cutPoint < minTime) continue;
    if (cutPoint > maxTime) break;
    return cutPoint;
  }
  return null;
}

function captionCanFit(words, settings) {
  if (isOneWordCaptionMode(settings)) return words.length <= 1;
  const text = words.map((word) => word.text).join(" ");
  const wrapped = wrapCaptionText(text, settings.captionLength, settings.captionLines);
  return !wrapped.overflow;
}

function wrapCaptionText(text, maxChars, maxLines) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [], overflow: false };
  if (isOneWordCaptionLength(maxChars)) {
    return { lines: [words[0]], overflow: words.length > 1 };
  }
  if (words.some((word) => word.length > maxChars)) {
    return { lines: greedyWrapCaptionWords(words, maxChars).slice(0, maxLines), overflow: true };
  }

  const balanced = findBalancedCaptionLines(words, maxChars, maxLines);
  if (balanced) return { lines: balanced, overflow: false };

  return { lines: greedyWrapCaptionWords(words, maxChars).slice(0, maxLines), overflow: true };
}

function findBalancedCaptionLines(words, maxChars, maxLines) {
  let best = null;

  function visit(startIndex, remainingLines, lines) {
    if (startIndex >= words.length) {
      const score = scoreCaptionLines(lines, maxChars, maxLines);
      if (!best || score < best.score) best = { lines: [...lines], score };
      return;
    }
    if (remainingLines === 0) return;

    for (let endIndex = startIndex + 1; endIndex <= words.length; endIndex += 1) {
      const line = words.slice(startIndex, endIndex).join(" ");
      if (line.length > maxChars) break;
      const wordsLeft = words.length - endIndex;
      if (wordsLeft > 0 && remainingLines === 1) continue;
      visit(endIndex, remainingLines - 1, [...lines, line]);
    }
  }

  visit(0, maxLines, []);
  return best?.lines || null;
}

function scoreCaptionLines(lines, maxChars, maxLines) {
  const lengths = lines.map((line) => line.length);
  const maxLength = Math.max(...lengths);
  const minLength = Math.min(...lengths);
  const balancePenalty = (maxLength - minLength) * 8;
  const target = Math.min(maxChars, Math.ceil(lengths.reduce((sum, length) => sum + length, 0) / maxLines));
  const targetPenalty = lengths.reduce((sum, length) => sum + Math.abs(target - length), 0);
  return balancePenalty + targetPenalty;
}

function greedyWrapCaptionWords(words, maxChars) {
  const lines = [];
  let currentLine = "";
  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxChars) {
      currentLine = candidate;
      return;
    }
    if (currentLine) lines.push(currentLine);
    currentLine = word;
  });
  if (currentLine) lines.push(currentLine);
  return lines;
}

function getCaptionSettings() {
  return {
    whisperModel: CAPTION_WHISPER_MODEL,
    font: els.captionFont.value,
    fontWeight: els.captionFontWeight.value,
    fontSize: Number(els.captionFontSize.value),
    paragraphAlign: els.captionParagraphAlign.value,
    color: els.captionColor.value,
    strokeColor: els.captionStrokeColor.value,
    strokeSize: els.captionStrokeEnabled.checked ? Number(els.captionStroke.value) : 0,
    dropShadow: els.captionDropShadowEnabled.checked ? Number(els.captionDropShadow.value) : 0,
    dropShadowColor: els.captionDropShadowColor.value,
    tracking: Number(els.captionTracking.value),
    leading: Number(els.captionLeading.value),
    positionX: Number(els.captionPositionX.value),
    positionY: Number(els.captionPositionY.value),
    textBox: els.captionTextBox.value,
    textBoxColor: els.captionTextBoxColor.value,
    textBoxOpacity: Number(els.captionTextBoxOpacity.value),
    textBoxRoundness: Number(els.captionTextBoxRoundness.value),
    textBoxPadding: Number(els.captionTextBoxPadding.value),
    captionLength: Number(els.captionLength.value),
    captionLines: Number(els.captionLines.value),
  };
}

function getCaptionPositionGeometry() {
  const display = getCaptionDisplayGeometry(state.captionVideoGeometry);
  const width = Math.max(1, Math.round(Number(display?.width) || Number(state.captionVideoGeometry?.width) || 1080));
  const height = Math.max(1, Math.round(Number(display?.height) || Number(state.captionVideoGeometry?.height) || 1920));
  return { width, height };
}

function getCaptionWhisperModelLabel() {
  return CAPTION_WHISPER_MODEL_LABEL;
}

function mergeCaptionVideoMetadata(primary = {}, fallback = {}) {
  const primaryFps = Number(primary?.fps);
  const fallbackFps = Number(fallback?.fps);
  return {
    ...fallback,
    ...primary,
    width: Number(primary?.width) || Number(fallback?.width) || 0,
    height: Number(primary?.height) || Number(fallback?.height) || 0,
    duration: Number(primary?.duration) || Number(fallback?.duration) || 0,
    fps: primaryFps > 0 ? primaryFps : (fallbackFps > 0 ? fallbackFps : 30),
  };
}

function getCaptionSettingsWithGeometry() {
  return {
    ...getCaptionSettings(),
    fps: Number(state.captionVideoGeometry?.fps) || 30,
  };
}

function isOneWordCaptionMode(settings) {
  return isOneWordCaptionLength(settings?.captionLength);
}

function isOneWordCaptionLength(value) {
  return Number(value) < ONE_WORD_CAPTION_LENGTH_THRESHOLD;
}

function updateCaptionSettingsLabels() {
  syncCaptionPositionControls();
  els.captionFontSizeValue.value = els.captionFontSize.value;
  els.captionStrokeValue.value = els.captionStroke.value;
  els.captionDropShadowValue.value = els.captionDropShadow.value;
  els.captionTrackingValue.value = els.captionTracking.value;
  els.captionLeadingValue.value = els.captionLeading.value;
  els.captionPositionXValue.value = els.captionPositionX.value;
  els.captionPositionYValue.value = els.captionPositionY.value;
  els.captionTextBoxOpacityValue.value = els.captionTextBoxOpacity.value;
  els.captionTextBoxRoundnessValue.value = els.captionTextBoxRoundness.value;
  els.captionTextBoxPaddingValue.value = els.captionTextBoxPadding.value;
  els.captionLengthValue.value = formatInlineValueLabel(els.captionLength);
  els.captionLinesValue.value = `${Number(els.captionLines.value)}`;
}

function createCaptionMeasureContext() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = getCaptionCanvasFont(Math.max(1, Number(els.captionFontSize.value) || 50));
  ctx.textBaseline = "middle";
  return ctx;
}

function flashCaptionPaddingControl() {
  if (!els.captionPaddingControl) return;
  els.captionPaddingControl.classList.remove("is-flashing");
  void els.captionPaddingControl.offsetWidth;
  els.captionPaddingControl.classList.add("is-flashing");
}

function syncCaptionPositionControls() {
  const geometry = getCaptionPositionGeometry();
  els.captionPositionX.min = "0";
  els.captionPositionX.max = String(geometry.width);
  els.captionPositionY.min = "0";
  els.captionPositionY.max = String(geometry.height);
  els.captionPositionXValue.min = "0";
  els.captionPositionXValue.max = String(geometry.width);
  els.captionPositionYValue.min = "0";
  els.captionPositionYValue.max = String(geometry.height);

  if (!state.captionPositionInitialized) {
    els.captionPositionX.value = String(Math.round(geometry.width / 2));
    els.captionPositionY.value = String(Math.round(geometry.height * (geometry.height > geometry.width ? 0.83 : 0.87)));
    state.captionPositionInitialized = true;
  }

  els.captionPositionXValue.value = String(Math.round(Number(els.captionPositionX.value)));
  els.captionPositionYValue.value = String(Math.round(Number(els.captionPositionY.value)));
}

function setCaptionBusy(isBusy) {
  updateCaptionActionAvailability(isBusy);
}

function setCaptionStatus(message) {
  els.captionStatus.textContent = message;
}

function setCaptionProgress(percent, label, { visible = true } = {}) {
  const safePercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  if (state.captionProgressSmooth) {
    state.captionProgressSmooth.targetPercent = Math.max(state.captionProgressSmooth.targetPercent, safePercent);
    state.captionProgressSmooth.label = label || state.captionProgressSmooth.label || "Working";
    els.captionProgressGroup.hidden = !visible;
    return;
  }
  if (safePercent >= 100) {
    stopCaptionProgressSmoothing();
  }
  els.captionProgressGroup.hidden = !visible;
  els.captionProgressBar.value = safePercent;
  els.captionProgressPercent.textContent = `${safePercent}%`;
  els.captionProgressLabel.textContent = label || "Working";
}

function resetCaptionProgress() {
  stopCaptionProgressSmoothing();
  els.captionProgressGroup.hidden = true;
  els.captionProgressBar.value = 0;
  els.captionProgressPercent.textContent = "0%";
  els.captionProgressLabel.textContent = "Waiting for video";
}

function startCaptionProgressSmoothing(estimatedMs, label = "Working") {
  stopCaptionProgressSmoothing();
  const currentPercent = Number(els.captionProgressBar.value) || 0;
  state.captionProgressSmooth = {
    startedAt: performance.now(),
    estimatedMs: Math.max(12000, Number(estimatedMs) || 30000),
    displayedPercent: Math.max(0, Math.min(100, Math.round(currentPercent))),
    targetPercent: Math.max(0, Math.min(100, Math.round(currentPercent))),
    label,
  };
  els.captionProgressGroup.hidden = false;
  tickCaptionProgressSmoothing();
  state.captionProgressSmoothTimer = window.setInterval(tickCaptionProgressSmoothing, 90);
}

function stopCaptionProgressSmoothing() {
  if (state.captionProgressSmoothTimer) {
    window.clearInterval(state.captionProgressSmoothTimer);
    state.captionProgressSmoothTimer = null;
  }
  state.captionProgressSmooth = null;
}

function tickCaptionProgressSmoothing() {
  const smooth = state.captionProgressSmooth;
  if (!smooth) return;
  const elapsed = performance.now() - smooth.startedAt;
  const timePercent = Math.min(95, (elapsed / smooth.estimatedMs) * 95);
  const leadLimit = smooth.targetPercent < 35 ? 10 : 35;
  const desiredPercent = Math.max(smooth.targetPercent, Math.min(95, Math.floor(timePercent), smooth.targetPercent + leadLimit));
  if (desiredPercent > smooth.displayedPercent) {
    smooth.displayedPercent += 1;
  }
  const visiblePercent = Math.max(0, Math.min(100, Math.round(smooth.displayedPercent)));
  els.captionProgressGroup.hidden = false;
  els.captionProgressBar.value = visiblePercent;
  els.captionProgressPercent.textContent = `${visiblePercent}%`;
  els.captionProgressLabel.textContent = smooth.label || "Working";
  if (visiblePercent >= 100 && smooth.targetPercent >= 100) {
    stopCaptionProgressSmoothing();
  }
}

function estimateCaptionAnalysisDuration(metadata) {
  const durationSeconds = Math.max(1, Number(metadata?.duration) || Number(els.captionPreviewVideo.duration) || 30);
  const modelIsReady = Boolean(state.captionTranscriber && state.captionTranscriberModel === CAPTION_WHISPER_MODEL);
  const estimatedModelLoadMs = modelIsReady ? 1200 : 35000;
  const estimatedAudioPrepMs = Math.min(16000, Math.max(3000, durationSeconds * 140));
  const deviceMultiplier = navigator.gpu ? 0.65 : 1.45;
  const estimatedTranscribeMs = Math.max(8000, durationSeconds * 1000 * deviceMultiplier);
  const estimatedFinishMs = 3500;
  return estimatedModelLoadMs + estimatedAudioPrepMs + estimatedTranscribeMs + estimatedFinishMs;
}

function updateCaptionActionAvailability(isBusy = false) {
  els.renderCaptionsButton.disabled = isBusy || state.captions.length === 0;
  els.exportSrtButton.disabled = isBusy || state.captions.length === 0;
  els.exportEdlPngButton.disabled = isBusy || state.captions.length === 0;
}

function setCaptionDiagnostics(message) {
  els.captionDiagnostics.textContent = message;
}

function setCaptionTextBoxMode(value) {
  els.captionTextBox.value = value;
  els.captionTextBoxButtons.forEach((button) => {
    const isActive = button.dataset.captionBoxValue === value;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  const isDisabled = value === "none";
  if (els.captionTextBoxDetailRow) {
    els.captionTextBoxDetailRow.hidden = isDisabled;
  }
  els.captionTextBoxDetailRow?.classList.toggle("is-disabled", isDisabled);
  [els.captionTextBoxColor, els.captionTextBoxOpacity, els.captionTextBoxOpacityValue, els.captionTextBoxRoundness, els.captionTextBoxRoundnessValue, els.captionTextBoxPadding, els.captionTextBoxPaddingValue].forEach((input) => {
    if (!input) return;
    input.disabled = isDisabled;
  });
}

function setCaptionParagraphAlign(value) {
  els.captionParagraphAlign.value = value;
  els.captionParagraphButtons.forEach((button) => {
    const isActive = button.dataset.captionAlignValue === value;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function exportCaptionSrt() {
  if (!state.captions.length) {
    setCaptionStatus("Transcribe a video before exporting SRT.");
    return;
  }

  const srt = state.captions
    .map((caption, index) => {
      const text = String(caption.text || "")
        .split("\n")
        .map((line) => line.trim())
        .join("\n");
      return [
        String(index + 1),
        `${formatSrtTimestamp(caption.start)} --> ${formatSrtTimestamp(caption.end)}`,
        text,
      ].join("\n");
    })
    .join("\n\n");

  downloadBlob(new Blob([`${srt}\n`], { type: "application/x-subrip" }), "video-wizard-captions.srt");
  setCaptionStatus("SRT exported.");
}

async function exportCaptionEdlPng() {
  if (!state.captions.length) {
    setCaptionStatus("Transcribe a video before exporting EDL + PNG.");
    return;
  }
  const width = Math.max(1, Math.round(Number(state.captionVideoGeometry?.width) || 1920));
  const height = Math.max(1, Math.round(Number(state.captionVideoGeometry?.height) || 1080));
  const fps = Math.max(1, Number(state.captionVideoGeometry?.fps) || 30);
  const baseName = sanitizeFileStem(state.captionVideo?.name || "video-wizard");
  const edlLines = [
    `TITLE: ${baseName.toUpperCase()}_CAPTIONS`,
    "FCM: NON-DROP FRAME",
    "",
  ];
  const zipFiles = [];

  setCaptionStatus("Preparing EDL + PNG exports...");
  for (let index = 0; index < state.captions.length; index += 1) {
    const caption = state.captions[index];
    const eventId = String(index + 1).padStart(3, "0");
    const pngName = `${baseName}-caption-${String(index + 1).padStart(3, "0")}.png`;
    const sourceOut = secondsToTimecode(Math.max(MIN_CAPTION_DURATION_SECONDS, caption.end - caption.start), fps);
    const recordIn = secondsToTimecode(caption.start, fps);
    const recordOut = secondsToTimecode(caption.end, fps);
    edlLines.push(
      `${eventId}  C${eventId}     V     C        00:00:00:00 ${sourceOut} ${recordIn} ${recordOut}`,
      `* FROM CLIP NAME: ${pngName}`,
      `* COMMENT: ${String(caption.text || "").replace(/\n/g, " / ")}`,
      "",
    );
    const pngBlob = await renderCaptionPng(caption, width, height);
    zipFiles.push({ name: pngName, blob: pngBlob });
  }

  zipFiles.push({
    name: `${baseName}-captions.edl`,
    blob: new Blob([`${edlLines.join("\n")}\n`], { type: "text/plain" }),
  });
  const zipBlob = await buildZipBlob(zipFiles);
  downloadBlob(zipBlob, `${baseName}-captions-package.zip`);
  setCaptionStatus("EDL + PNG ZIP exported.");
}

function createTranscriptDiagnostic(transcript, durationSeconds = null) {
  const words = transcript?.words || [];
  if (!words.length) return "Transcript diagnostics: 0 words captured.";
  const first = words[0];
  const last = words.at(-1);
  const durationLabel = durationSeconds ? ` of ${formatSeconds(durationSeconds)}` : "";
  return `Transcript diagnostics: ${words.length} words, ${formatSeconds(first.start)}-${formatSeconds(last.end)}${durationLabel}; first "${first.text}", last "${last.text}".`;
}

async function handleCaptionPreviewMetadata() {
  updateCaptionPreviewGeometry();
  updateCaptionPreviewControls();
  const videoUrl = state.captionVideoUrl;
  try {
    await waitForVideoData(els.captionPreviewVideo);
    if (videoUrl !== state.captionVideoUrl) return;
    updateCaptionOverlay();
    const crop = await detectVisibleVideoCrop(videoUrl, state.captionVideoGeometry);
    if (videoUrl !== state.captionVideoUrl) return;
    state.captionVisibleCrop = crop;
    applyCaptionPreviewGeometry(state.captionVideoGeometry);
    updateCaptionOverlay();
  } catch (error) {
    if (videoUrl !== state.captionVideoUrl) return;
    state.captionVisibleCrop = null;
    applyCaptionPreviewGeometry(state.captionVideoGeometry);
    updateCaptionOverlay();
  }
}

function updateCaptionPreviewGeometry() {
  const width = els.captionPreviewVideo.videoWidth;
  const height = els.captionPreviewVideo.videoHeight;
  if (!width || !height) return;
  state.captionVideoGeometry = mergeCaptionVideoMetadata({ width, height }, state.captionVideoGeometry);
  applyCaptionPreviewGeometry(state.captionVideoGeometry);
}

function applyCaptionPreviewGeometry(geometry) {
  const width = Number(geometry?.width);
  const height = Number(geometry?.height);
  if (!width || !height) {
    resetCaptionPreviewGeometry();
    return;
  }
  const display = getCaptionDisplayGeometry({ width, height });
  els.captionPreviewFrame.style.aspectRatio = `${display.width} / ${display.height}`;
  els.captionPreview.classList.toggle("is-vertical", display.height > display.width);
  fitCaptionPreviewToAvailableSpace(display.width, display.height);
  syncCaptionPositionControls();
}

function resetCaptionPreviewGeometry() {
  state.captionVisibleCrop = null;
  state.captionPositionInitialized = false;
  els.captionPreviewFrame.style.aspectRatio = "";
  els.captionPreview.style.removeProperty("--caption-preview-width");
  els.captionPreview.classList.remove("is-vertical");
}

function getCaptionDisplayGeometry(geometry = state.captionVideoGeometry) {
  const width = Number(geometry?.width) || 0;
  const height = Number(geometry?.height) || 0;
  if (!width || !height) return { width: 16, height: 9 };
  const crop = state.captionVisibleCrop;
  if (!crop) return { width, height };
  return {
    width: Math.max(2, Math.round(crop.width)),
    height: Math.max(2, Math.round(crop.height)),
  };
}

function fitCaptionPreviewToAvailableSpace(width, height) {
  const panel = els.captionPreview.closest(".render-panel");
  if (!panel) return;
  const panelRect = panel.getBoundingClientRect();
  const heading = panel.querySelector("h2");
  const headingHeight = heading?.getBoundingClientRect().height || 0;
  const styles = getComputedStyle(panel);
  const rowGap = parseFloat(styles.rowGap || styles.gap || "0") || 0;
  const paddingTop = parseFloat(styles.paddingTop || "0") || 0;
  const paddingBottom = parseFloat(styles.paddingBottom || "0") || 0;
  const availableHeight = Math.max(160, window.innerHeight - panelRect.top - paddingTop - paddingBottom - headingHeight - rowGap - 24);
  const availableWidth = Math.max(160, panel.clientWidth - 2 * 0);
  const aspect = width / height;
  const widthScale = aspect >= 1.7 ? 1 : aspect >= 1.3 ? 0.88 : aspect >= 1 ? 0.78 : 0.64;
  const fittedWidth = Math.min(availableWidth * widthScale, availableHeight * aspect);
  els.captionPreview.style.setProperty("--caption-preview-width", `${Math.max(160, Math.floor(fittedWidth))}px`);
}

async function detectVisibleVideoCrop(videoUrl, geometry) {
  if (!videoUrl || !geometry?.width || !geometry?.height) return null;
  const video = document.createElement("video");
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  await waitForVideoMetadata(video);

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const sampleTimes = [0.08, 0.4, 1.0, 2.0]
    .map((time) => Math.min(Math.max(0, duration - 0.05), time))
    .filter((time, index, list) => duration > 0 && list.indexOf(time) === index);
  if (!sampleTimes.length) return null;

  const sampleWidth = 180;
  const sampleHeight = Math.max(2, Math.round(sampleWidth * geometry.height / geometry.width));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let mergedBounds = null;

  for (const time of sampleTimes) {
    await seekVideo(video, time);
    ctx.drawImage(video, 0, 0, sampleWidth, sampleHeight);
    const bounds = findVisiblePixelBounds(ctx.getImageData(0, 0, sampleWidth, sampleHeight), sampleWidth, sampleHeight);
    if (!bounds) continue;
    mergedBounds = mergedBounds
      ? {
          left: Math.min(mergedBounds.left, bounds.left),
          top: Math.min(mergedBounds.top, bounds.top),
          right: Math.max(mergedBounds.right, bounds.right),
          bottom: Math.max(mergedBounds.bottom, bounds.bottom),
        }
      : bounds;
  }

  if (!mergedBounds) return null;
  const margin = 2;
  const left = Math.max(0, mergedBounds.left - margin);
  const top = Math.max(0, mergedBounds.top - margin);
  const right = Math.min(sampleWidth - 1, mergedBounds.right + margin);
  const bottom = Math.min(sampleHeight - 1, mergedBounds.bottom + margin);
  const scaleX = geometry.width / sampleWidth;
  const scaleY = geometry.height / sampleHeight;
  const crop = {
    x: Math.floor(left * scaleX),
    y: Math.floor(top * scaleY),
    width: Math.ceil((right - left + 1) * scaleX),
    height: Math.ceil((bottom - top + 1) * scaleY),
  };

  const horizontalCrop = crop.x > geometry.width * 0.03 || crop.x + crop.width < geometry.width * 0.97;
  const verticalCrop = crop.y > geometry.height * 0.03 || crop.y + crop.height < geometry.height * 0.97;
  if (!horizontalCrop && !verticalCrop) return null;
  if (crop.width < geometry.width * 0.35 || crop.height < geometry.height * 0.35) return null;
  return crop;
}

function findVisiblePixelBounds(imageData, width, height) {
  const data = imageData.data;
  const columnHits = new Array(width).fill(0);
  const rowHits = new Array(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const brightness = (r + g + b) / 3;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (brightness > 18 || chroma > 18) {
        columnHits[x] += 1;
        rowHits[y] += 1;
      }
    }
  }

  const columnThreshold = Math.max(2, height * 0.035);
  const rowThreshold = Math.max(2, width * 0.035);
  const left = columnHits.findIndex((hits) => hits >= columnThreshold);
  const right = findLastIndex(columnHits, (hits) => hits >= columnThreshold);
  const top = rowHits.findIndex((hits) => hits >= rowThreshold);
  const bottom = findLastIndex(rowHits, (hits) => hits >= rowThreshold);
  if (left < 0 || right < 0 || top < 0 || bottom < 0 || right <= left || bottom <= top) return null;
  return { left, right, top, bottom };
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index)) return index;
  }
  return -1;
}

function formatSeconds(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function formatMediaTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds - minutes * 60);
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}`;
}

function formatSrtTimestamp(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function secondsToTimecode(seconds, fps = 30) {
  const exactFps = Math.max(1, Number(fps) || 30);
  const displayFps = Math.max(1, Math.round(exactFps));
  const totalFrames = Math.max(0, Math.floor((Number(seconds) || 0) * exactFps + 1e-6));
  const frames = totalFrames % displayFps;
  const totalSeconds = Math.floor(totalFrames / displayFps);
  const secs = totalSeconds % 60;
  const mins = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function sanitizeFileStem(name) {
  const stem = String(name || "video-wizard").replace(/\.[^.]+$/, "");
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "video-wizard";
}

function downloadBlob(blob, outputName) {
  const url = URL.createObjectURL(blob);
  const download = document.createElement("a");
  download.href = url;
  download.download = outputName;
  download.style.display = "none";
  document.body.append(download);
  download.click();
  download.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function renderCaptionPng(caption, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not prepare caption PNG canvas.");
  }
  ctx.clearRect(0, 0, width, height);
  drawCaptionOnCanvas(ctx, caption, width, height);
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not prepare caption PNG."));
      }
    }, "image/png");
  });
}

async function buildZipBlob(files) {
  const preparedFiles = await Promise.all(files.map(async (file) => {
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    const nameBytes = new TextEncoder().encode(file.name);
    const crc32 = computeCrc32(bytes);
    return {
      name: file.name,
      nameBytes,
      bytes,
      crc32,
    };
  }));

  const zipParts = [];
  const centralDirectoryParts = [];
  let offset = 0;
  const timestamp = new Date();
  const dosTime = ((timestamp.getHours() & 0x1f) << 11)
    | ((timestamp.getMinutes() & 0x3f) << 5)
    | Math.floor((timestamp.getSeconds() & 0x3f) / 2);
  const dosDate = ((((timestamp.getFullYear() - 1980) & 0x7f) << 9)
    | (((timestamp.getMonth() + 1) & 0xf) << 5)
    | (timestamp.getDate() & 0x1f));

  preparedFiles.forEach((file) => {
    const localHeader = new Uint8Array(30 + file.nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, file.crc32 >>> 0, true);
    localView.setUint32(18, file.bytes.length, true);
    localView.setUint32(22, file.bytes.length, true);
    localView.setUint16(26, file.nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(file.nameBytes, 30);
    zipParts.push(localHeader, file.bytes);

    const centralHeader = new Uint8Array(46 + file.nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, file.crc32 >>> 0, true);
    centralView.setUint32(20, file.bytes.length, true);
    centralView.setUint32(24, file.bytes.length, true);
    centralView.setUint16(28, file.nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(file.nameBytes, 46);
    centralDirectoryParts.push(centralHeader);

    offset += localHeader.length + file.bytes.length;
  });

  const centralDirectorySize = centralDirectoryParts.reduce((total, part) => total + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, preparedFiles.length, true);
  endView.setUint16(10, preparedFiles.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...zipParts, ...centralDirectoryParts, endRecord], { type: "application/zip" });
}

function computeCrc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

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
