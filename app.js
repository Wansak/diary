import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  remove,
  push,
  onValue,
  onDisconnect,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { STARTER_GALLERY } from "./starter-gallery.js";
import { googleDriveConfig } from "./google-drive-config.js";
import {
  initializeGoogleDrive,
  getGoogleDriveStatus,
  connectGoogleDrive,
  disconnectGoogleDrive,
  setGoogleDriveAccount,
  resumeGoogleDriveConnection,
  suspendGoogleDrive,
  uploadGoogleDriveFile,
  deleteGoogleDriveFile,
  hydrateGoogleDriveMedia
} from "./google-drive.js";

const $ = (id) => document.getElementById(id);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const MOODS = {
  loved: { emoji: "🥰", label: "Loved" },
  happy: { emoji: "😊", label: "Happy" },
  calm: { emoji: "😌", label: "Calm" },
  tired: { emoji: "😴", label: "Tired" },
  sad: { emoji: "🥺", label: "Tender" }
};

const CATEGORIES = {
  memory: "Memory",
  gratitude: "Gratitude",
  date: "Date",
  dream: "Dream",
  letter: "Love letter"
};



const PHOTO_ALBUMS = {
  "with-friends": "With friends",
  psalm: "Psalm",
  juan: "Juan",
  pets: "Pets",
  foods: "Foods",
  "us-together": "Us Together"
};

const VIDEO_ALBUMS = {
  vlogs: "Vlogs",
  "normal-videos": "Normal Videos"
};

const GALLERY_MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" }
];

const PHOTO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "ogg"]);

const ENTERTAINMENT = [
  { emoji: "🎲", title: "This or That", text: "Choose together: sunrise date or midnight snack run?" },
  { emoji: "🍿", title: "Mini Movie Night", text: "Pick a 30-minute episode, prepare one snack, and keep phones away." },
  { emoji: "📸", title: "Photo Challenge", text: "Take one photo each that describes your day without using words." },
  { emoji: "🎧", title: "Song Swap", text: "Send one song that matches your mood and explain one favorite line." },
  { emoji: "☕", title: "Tiny Date Idea", text: "Make drinks at home and rate them like serious café reviewers." },
  { emoji: "🧩", title: "Memory Guess", text: "Describe a shared memory using three clues. Let your partner guess it." },
  { emoji: "💌", title: "Sweet Challenge", text: "Send a three-word compliment that you have never used before." },
  { emoji: "🌙", title: "Tonight's Pick", text: "Choose: short walk, comfort food, video call, or quiet cuddle time." },
  { emoji: "✏️", title: "Doodle Together", text: "Draw each other in 60 seconds, then reveal at the same time." },
  { emoji: "🗺️", title: "Future Trip", text: "Pick a place and plan one perfect low-budget day there." },
  { emoji: "😂", title: "Make Me Laugh", text: "Send your funniest recent screenshot or tell a deliberately bad joke." },
  { emoji: "🏆", title: "Couple Quiz", text: "Ask one question about yourself that your partner should know." }
];

const state = {
  user: null,
  profile: null,
  coupleId: null,
  couple: null,
  authMode: "login",
  currentView: "home",
  listeners: [],
  profileUnsubscribe: null,
  calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: null,
  promptOffset: 0,
  typingTimer: null,
  activeConfirmResolve: null,
  connectionUnsubscribe: null,
  galleryTab: "photos",
  galleryAlbum: "with-friends",
  galleryPeriod: "",
  galleryPage: 1,
  galleryPageSize: 20,
  galleryViewerId: null,
  gallerySelectedFiles: [],
  videoMigrationFiles: [],
  videoMigrationRunning: false,
  entrySelectedFiles: [],
  entryExistingPhotos: [],
  entryRemovedPhotos: [],
  chatReplyId: null,
  chatEditingId: null,
  chatAttachmentFile: null,
  chatExistingAttachment: null,
  chatRemoveExistingAttachment: false,
  chatRenderedCount: 0,
  chatForceScroll: true,
  chatTypingTimer: null,
  chatTypingActive: false,
  chatTypingLastWrite: 0,
  entertainmentOffset: 0,
  theme: "light",
  authBusy: false,
  signOutInProgress: false,
  navigationReady: false,
  navigationUserId: "",
  backExitArmedUntil: 0,
  driveRestoring: false,
  chatMessageSignatures: new Map(),
  smartRepliesTimer: null,
  smartRepliesDismissedFor: "",
  lastSmartReplyMessageId: "",
  loaderHideTimer: null
};

let app;
let auth;
let db;

const isConfigured = () => {
  const required = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];
  return required.every((key) => {
    const value = firebaseConfig[key];
    return typeof value === "string" && value.trim() && !value.includes("YOUR_");
  });
};

function showOnly(screenId) {
  ["setupScreen", "authScreen", "onboardingScreen", "appShell"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    const active = id === screenId;
    el.classList.toggle("hidden", !active);
    if (["setupScreen", "authScreen", "onboardingScreen"].includes(id)) {
      el.classList.toggle("flex", active);
    }
  });
  $("mobileNav")?.classList.toggle("hidden", screenId !== "appShell");
  $("mobileNav")?.classList.toggle("grid", screenId === "appShell");
}

function showAppLoader(title = "Opening Pink Promise", message = "Preparing your shared space…") {
  const loader = $("appLoadingScreen");
  if (!loader) return;
  clearTimeout(state.loaderHideTimer);
  state.loaderHideTimer = null;
  $("appLoadingTitle").textContent = title;
  $("appLoadingMessage").textContent = message;
  loader.classList.remove("hidden", "loader-leaving");
  loader.classList.add("flex");
  loader.setAttribute("aria-hidden", "false");
}

function hideAppLoader() {
  const loader = $("appLoadingScreen");
  if (!loader) return;
  clearTimeout(state.loaderHideTimer);
  loader.classList.add("loader-leaving");
  state.loaderHideTimer = window.setTimeout(() => {
    loader.classList.add("hidden");
    loader.classList.remove("flex", "loader-leaving");
    loader.setAttribute("aria-hidden", "true");
    state.loaderHideTimer = null;
  }, 180);
}

function validAppView(view) {
  return ["home", "timeline", "gallery", "messages", "calendar", "insights", "settings"].includes(view);
}

function initializeAppNavigation(userId) {
  if (!userId || (state.navigationReady && state.navigationUserId === userId)) return;
  state.navigationReady = true;
  state.navigationUserId = userId;
  state.currentView = "home";
  state.backExitArmedUntil = 0;
  const url = `${location.pathname}${location.search}#home`;
  history.replaceState({ pinkPromise: true, screen: "app", view: "home", root: true }, "", url);
  history.pushState({ pinkPromise: true, screen: "app", view: "home", guard: true }, "", url);
}

function initializeLoginNavigation() {
  state.navigationReady = false;
  state.navigationUserId = "";
  state.backExitArmedUntil = 0;
  const url = `${location.pathname}${location.search}#login`;
  history.replaceState({ pinkPromise: true, screen: "login" }, "", url);
}

function updateNavigationState(view, mode = "push", previousView = state.currentView) {
  if (!state.user || !validAppView(view) || mode === "none") return;
  const url = `${location.pathname}${location.search}#${view}`;
  const payload = { pinkPromise: true, screen: "app", view };
  state.backExitArmedUntil = 0;
  if (mode === "replace") {
    history.replaceState(payload, "", url);
    return;
  }
  if (history.state?.view === view) return;

  // Keep one lightweight screen entry above the Home guard. Switching between
  // app tabs replaces that entry, so Back consistently returns to Home instead
  // of walking through every tab used during the session.
  if (view === "home" && previousView !== "home") {
    history.back();
  } else if (previousView === "home") {
    history.pushState(payload, "", url);
  } else {
    history.replaceState(payload, "", url);
  }
}

function closeTopModal() {
  const modal = visibleModals().pop();
  if (!modal) return false;
  if (modal.id === "confirmModal") resolveConfirmation(false);
  else closeModal(modal.id);
  return true;
}

function handleAppBackNavigation(event) {
  // A modal behaves like the top layer of the app. Close it first and restore
  // the current screen in history so one Back press never closes a modal and
  // navigates away at the same time.
  if (closeTopModal()) {
    const modalView = validAppView(state.currentView) ? state.currentView : "home";
    const url = `${location.pathname}${location.search}#${modalView}`;
    history.pushState({ pinkPromise: true, screen: "app", view: modalView, modalGuard: true }, "", url);
    return;
  }
  if (!state.user) {
    showOnly("authScreen");
    setAuthMode("login");
    initializeLoginNavigation();
    return;
  }

  const view = event.state?.view;
  if (validAppView(view) && view !== "home") {
    setView(view, { historyMode: "none", scrollTop: false });
    return;
  }

  // Returning from Chat (or any other tab) lands on the Home guard. From Home,
  // the first Back press asks for confirmation and restores the guard; the
  // second press within the short window lets the installed PWA close.
  setView("home", { historyMode: "none", scrollTop: false });
  if (event.state?.root) {
    const now = Date.now();
    if (state.backExitArmedUntil > now) {
      state.backExitArmedUntil = 0;
      history.back();
      return;
    }
    state.backExitArmedUntil = now + 1900;
    const url = `${location.pathname}${location.search}#home`;
    history.pushState({ pinkPromise: true, screen: "app", view: "home", guard: true }, "", url);
    toast("Press Back again to exit Pink Promise.", "info");
    window.setTimeout(() => {
      if (state.backExitArmedUntil <= Date.now()) state.backExitArmedUntil = 0;
    }, 2000);
  }
}

function syncViewportLayout() {
  const visualViewport = window.visualViewport;
  const viewportHeight = Math.max(240, Math.round(visualViewport?.height || window.innerHeight || 0));
  const visibleBottom = Math.round((visualViewport?.offsetTop || 0) + viewportHeight);
  document.documentElement.style.setProperty("--visual-viewport-height", `${viewportHeight}px`);
  const chatView = $("view-messages");
  if (!chatView?.classList.contains("active")) return;
  const top = Math.max(0, chatView.getBoundingClientRect().top);
  let bottomGap = 10;
  const mobileNav = $("mobileNav");
  if (window.innerWidth < 768 && mobileNav && !document.body.classList.contains("chat-mode") && getComputedStyle(mobileNav).display !== "none") {
    const navTop = mobileNav.getBoundingClientRect().top;
    if (Number.isFinite(navTop)) bottomGap = Math.max(10, visibleBottom - navTop + 8);
  }
  chatView.style.height = `${Math.max(180, Math.floor(visibleBottom - top - bottomGap))}px`;
  const chatPanel = chatView.querySelector(".chat-panel");
  const composerHeight = chatView.querySelector(".chat-composer")?.getBoundingClientRect().height || 72;
  const typingHeight = $("chatTypingIndicator")?.classList.contains("hidden") ? 0 : ($("chatTypingIndicator")?.getBoundingClientRect().height || 0);
  chatPanel?.style.setProperty("--chat-footer-height", `${Math.ceil(composerHeight + typingHeight)}px`);
}

function scheduleViewportLayout() {
  requestAnimationFrame(() => requestAnimationFrame(syncViewportLayout));
}

function isHandheldApp() {
  return window.matchMedia?.("(pointer: coarse) and (max-width: 1024px)").matches;
}

async function requestPortraitLock() {
  document.documentElement.classList.toggle("portrait-lock-fallback", Boolean(isHandheldApp()));
  if (!isHandheldApp() || !screen.orientation?.lock) return false;
  try {
    await screen.orientation.lock("portrait-primary");
    return true;
  } catch {
    // iOS and some browsers do not expose the lock API. The CSS orientation
    // guard keeps the installed app portrait-only in those environments.
    return false;
  }
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeImageUrl(value = "") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}


function randomId(prefix = "file") {
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

function safeFileName(name = "file") {
  const cleaned = String(name).normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return (cleaned || "file").slice(-120);
}

function fileExtension(name = "") {
  return String(name).includes(".") ? String(name).split(".").pop().toLowerCase() : "";
}

function inferredContentType(file) {
  if (file?.type) return file.type;
  const map = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/x-m4v", ogg: "video/ogg"
  };
  return map[fileExtension(file?.name)] || "application/octet-stream";
}

function validateUploadFile(file, kind = "image") {
  if (!file) return "Choose a file from your device.";
  const extension = fileExtension(file.name);
  const image = file.type.startsWith("image/") || PHOTO_EXTENSIONS.has(extension);
  const video = file.type.startsWith("video/") || VIDEO_EXTENSIONS.has(extension);
  if (kind === "image" && !image) return "Please choose an image file.";
  if (kind === "video" && !video) return "Please choose a video file.";
  if (kind === "media" && !image && !video) return "Please choose a photo or video.";
  const max = video ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
  if (file.size > max) return video ? "Videos must be 100 MB or smaller for reliable private playback." : "Photos must be 20 MB or smaller.";
  return "";
}

async function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function optimizeImageForUpload(file, purpose = "gallery") {
  const extension = fileExtension(file?.name);
  const isImage = file?.type?.startsWith("image/") || PHOTO_EXTENSIONS.has(extension);
  if (!isImage || extension === "gif" || file.size < 420 * 1024) return file;

  const limits = {
    chat: { max: 1280, quality: 0.8 },
    diary: { max: 1600, quality: 0.82 },
    gallery: { max: 1920, quality: 0.84 }
  };
  const settings = limits[purpose] || limits.gallery;
  let bitmap = null;
  let objectUrl = "";
  try {
    if ("createImageBitmap" in window) bitmap = await createImageBitmap(file);
    else {
      objectUrl = URL.createObjectURL(file);
      bitmap = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = objectUrl;
      });
    }
    const width = Number(bitmap.width || bitmap.naturalWidth || 0);
    const height = Number(bitmap.height || bitmap.naturalHeight || 0);
    if (!width || !height) return file;
    const scale = Math.min(1, settings.max / Math.max(width, height));
    if (scale === 1 && file.size < 1.2 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, "image/webp", settings.quality);
    if (!blob || blob.size >= file.size * 0.96) return file;
    const base = String(file.name || "photo").replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.webp`, { type: "image/webp", lastModified: file.lastModified || Date.now() });
  } catch (error) {
    console.warn("Image optimization skipped", error);
    return file;
  } finally {
    if (bitmap?.close) bitmap.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function replacePathFilename(path, oldName, newName) {
  if (!newName || newName === oldName) return path;
  const encodedOld = safeFileName(oldName);
  const encodedNew = safeFileName(newName);
  return path.endsWith(encodedOld) ? `${path.slice(0, -encodedOld.length)}${encodedNew}` : path;
}

async function uploadFileToDrive(file, path, onProgress = () => {}, purpose = "gallery") {
  onProgress(1);
  const preparedFile = await optimizeImageForUpload(file, purpose);
  const optimizedPath = replacePathFilename(path, file.name, preparedFile.name);
  return uploadGoogleDriveFile({
    file: preparedFile,
    logicalPath: optimizedPath,
    coupleId: state.coupleId || "",
    uploadedBy: state.user?.uid || "",
    onProgress
  });
}

function clearGalleryFileSelection() {
  for (const selected of state.gallerySelectedFiles || []) {
    if (selected.previewUrl) URL.revokeObjectURL(selected.previewUrl);
  }
  state.gallerySelectedFiles = [];
  const input = $("galleryFileInput");
  if (input) input.value = "";
  const preview = $("galleryUploadPreview");
  if (preview) {
    preview.classList.add("hidden");
    preview.innerHTML = "";
  }
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  let firstError = null;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length && !firstError) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        firstError ||= error;
      }
    }
  });
  await Promise.all(runners);
  if (firstError) throw firstError;
  return results;
}


function formatFileSize(bytes = 0) {
  const value = Math.max(0, Number(bytes || 0));
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index];
  }
  return `${amount >= 10 ? amount.toFixed(1) : amount.toFixed(2)} ${unit}`;
}

function migrationVideoKey(album, filename) {
  return `starter-video:${String(album || "").toLowerCase()}:${String(filename || "").trim().toLowerCase()}`;
}

function effectiveStarterVideoItems() {
  const overrides = state.couple?.galleryStarterOverrides || {};
  return STARTER_GALLERY
    .filter((item) => item?.type === "video")
    .map((item) => ({ ...item, ...(overrides?.[item.id] || {}), id: item.id, isStarter: true }));
}

function migratedVideoRecords() {
  return Object.entries(state.couple?.gallery || {}).map(([id, item]) => ({ id, ...item })).filter((item) => item.type === "video" && item.driveFileId);
}

function renderVideoMigrationSettingsStatus() {
  const badge = $("videoMigrationSettingsStatus");
  const text = $("videoMigrationSettingsText");
  const button = $("openVideoMigrationBtn");
  if (!badge || !text || !button) return;

  const starterItems = effectiveStarterVideoItems();
  const hidden = state.couple?.galleryStarterHidden || {};
  const migrated = migratedVideoRecords();
  const migratedStarterIds = new Set(migrated.map((item) => item.sourceStarterId).filter(Boolean));
  const completed = starterItems.filter((item) => hidden[item.id] || migratedStarterIds.has(item.id)).length;

  if (!starterItems.length) {
    badge.textContent = migrated.length ? `${migrated.length} in Drive` : "Drive only";
    badge.className = "shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700";
    text.textContent = migrated.length
      ? `${migrated.length} video${migrated.length === 1 ? " is" : "s are"} stored in Google Drive. The starter manifest no longer contains GitHub videos.`
      : "No starter videos are listed in the current manifest. You can still scan a local videos folder to add unlisted videos to Drive.";
    button.textContent = "Scan local videos folder";
    return;
  }

  if (completed >= starterItems.length) {
    badge.textContent = "Migrated";
    badge.className = "shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700";
    text.textContent = `All ${starterItems.length} starter video${starterItems.length === 1 ? "" : "s"} have Drive replacements. Run the included final cleanup script before pushing to GitHub.`;
    button.textContent = "Review video migration";
  } else {
    badge.textContent = `${completed}/${starterItems.length}`;
    badge.className = "shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700";
    text.textContent = `${starterItems.length - completed} of ${starterItems.length} starter video${starterItems.length === 1 ? " still needs" : "s still need"} to be moved from GitHub assets to Google Drive.`;
    button.textContent = "Move local videos to Google Drive";
  }
}

function inferMigrationAlbum(file, starterByFilename) {
  const relative = String(file?.webkitRelativePath || file?.name || "").replaceAll("\\", "/").toLowerCase();
  const segments = relative.split("/").filter(Boolean);
  if (segments.includes("normal-videos")) return "normal-videos";
  if (segments.includes("vlogs")) return "vlogs";
  const matches = starterByFilename.get(String(file?.name || "").toLowerCase()) || [];
  return matches.length === 1 ? matches[0].album : "";
}

function migrationFileDate(file, starterItem) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(starterItem?.date || ""))) return starterItem.date;
  const modified = Number(file?.lastModified || 0);
  return localDateKey(modified > 0 ? new Date(modified) : new Date());
}

function migrationTitle(file, starterItem) {
  const fallback = String(file?.name || "Video").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Video";
  return String(starterItem?.title || fallback).trim().slice(0, 80) || "Video";
}

function videoMigrationExistingKeys() {
  const keys = new Set();
  const starterIds = new Set();
  for (const item of migratedVideoRecords()) {
    if (item.migrationKey) keys.add(item.migrationKey);
    else keys.add(migrationVideoKey(item.album, item.filename));
    if (item.sourceStarterId) starterIds.add(item.sourceStarterId);
  }
  return { keys, starterIds };
}

function renderVideoMigrationSelection() {
  const root = $("videoMigrationSelection");
  const startButton = $("startVideoMigrationBtn");
  if (!root || !startButton) return;
  const files = state.videoMigrationFiles || [];
  const ready = files.filter((item) => !item.error && !item.alreadyMigrated);
  const skipped = files.filter((item) => item.alreadyMigrated);
  const invalid = files.filter((item) => item.error);
  startButton.disabled = state.videoMigrationRunning || !ready.length;

  if (!files.length) {
    root.innerHTML = "No folder selected yet.";
    return;
  }

  const byAlbum = {
    vlogs: ready.filter((item) => item.album === "vlogs").length,
    "normal-videos": ready.filter((item) => item.album === "normal-videos").length
  };
  const totalSize = ready.reduce((sum, item) => sum + Number(item.file?.size || 0), 0);
  const preview = files.slice(0, 12).map((item) => {
    const status = item.error ? item.error : item.alreadyMigrated ? "Already in Drive — skipped" : `${VIDEO_ALBUMS[item.album]} · ${formatFileSize(item.file.size)}`;
    const tone = item.error ? "text-red-600" : item.alreadyMigrated ? "text-amber-600" : "text-slate-500";
    return `<div class="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0"><span class="min-w-0 truncate font-semibold text-slate-700">${escapeHTML(item.file.name)}</span><span class="shrink-0 text-[10px] ${tone}">${escapeHTML(status)}</span></div>`;
  }).join("");

  root.innerHTML = `<div class="grid grid-cols-2 gap-2 sm:grid-cols-4"><div class="rounded-xl bg-white p-2 ring-1 ring-slate-100"><strong class="block text-lg text-rosewood-900">${ready.length}</strong><span class="text-[10px] text-slate-500">Ready</span></div><div class="rounded-xl bg-white p-2 ring-1 ring-slate-100"><strong class="block text-lg text-rosewood-900">${byAlbum.vlogs}</strong><span class="text-[10px] text-slate-500">Vlogs</span></div><div class="rounded-xl bg-white p-2 ring-1 ring-slate-100"><strong class="block text-lg text-rosewood-900">${byAlbum["normal-videos"]}</strong><span class="text-[10px] text-slate-500">Normal videos</span></div><div class="rounded-xl bg-white p-2 ring-1 ring-slate-100"><strong class="block text-lg text-rosewood-900">${escapeHTML(formatFileSize(totalSize))}</strong><span class="text-[10px] text-slate-500">Upload size</span></div></div><div class="mt-3 max-h-52 overflow-y-auto rounded-xl bg-white px-3 ring-1 ring-slate-100">${preview}${files.length > 12 ? `<p class="py-2 text-center text-[10px] text-slate-400">+ ${files.length - 12} more files</p>` : ""}</div>${skipped.length || invalid.length ? `<p class="mt-2 text-[10px] leading-4 text-slate-500">Skipped: ${skipped.length} already migrated · ${invalid.length} invalid/unrecognized.</p>` : ""}`;
}

function openVideoMigrationModal() {
  if (!state.user || !state.coupleId) return toast("Open your shared diary first.", "error");
  state.videoMigrationFiles = [];
  const input = $("videoMigrationFolderInput");
  if (input) input.value = "";
  $("videoMigrationProgress")?.classList.add("hidden");
  if ($("videoMigrationResult")) {
    $("videoMigrationResult").className = "mt-4 hidden rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800";
    $("videoMigrationResult").innerHTML = "";
  }
  renderVideoMigrationSelection();
  openModal("videoMigrationModal");
}

function handleVideoMigrationFolderSelection(event) {
  const files = [...(event.target.files || [])].filter((file) => {
    const extension = fileExtension(file.name);
    return file.type?.startsWith("video/") || VIDEO_EXTENSIONS.has(extension);
  });
  const starterItems = effectiveStarterVideoItems();
  const starterByAlbumAndName = new Map(starterItems.map((item) => [`${item.album}/${String(item.filename || "").toLowerCase()}`, item]));
  const starterByFilename = new Map();
  for (const item of starterItems) {
    const key = String(item.filename || "").toLowerCase();
    if (!starterByFilename.has(key)) starterByFilename.set(key, []);
    starterByFilename.get(key).push(item);
  }
  const existing = videoMigrationExistingKeys();

  state.videoMigrationFiles = files.map((file) => {
    const album = inferMigrationAlbum(file, starterByFilename);
    const starterItem = album ? starterByAlbumAndName.get(`${album}/${file.name.toLowerCase()}`) || null : null;
    const migrationKey = migrationVideoKey(album, file.name);
    let error = "";
    if (!album || !VIDEO_ALBUMS[album]) error = "Folder must be vlogs or normal-videos";
    else if (file.size > 250 * 1024 * 1024) error = "Larger than 250 MB — compress first";
    return {
      file,
      album,
      starterItem,
      starterId: starterItem?.id || "",
      migrationKey,
      error,
      alreadyMigrated: Boolean((starterItem?.id && existing.starterIds.has(starterItem.id)) || existing.keys.has(migrationKey))
    };
  }).sort((a, b) => a.album.localeCompare(b.album) || new Intl.Collator("en", { numeric: true }).compare(a.file.name, b.file.name));
  renderVideoMigrationSelection();
}

async function migrateSelectedVideosToDrive() {
  if (state.videoMigrationRunning) return;
  const ready = (state.videoMigrationFiles || []).filter((item) => !item.error && !item.alreadyMigrated);
  if (!ready.length) return toast("Choose a videos folder with files that still need migration.", "error");
  if (!getGoogleDriveStatus().connected) {
    try { await connectGoogleDrive({ prompt: "consent" }); }
    catch (error) { return toast(friendlyError(error), "error"); }
  }

  const totalBytes = ready.reduce((sum, item) => sum + Math.max(1, Number(item.file.size || 0)), 0);
  const confirmed = await confirmAction({
    title: `Move ${ready.length} video${ready.length === 1 ? "" : "s"} to Drive?`,
    message: `${formatFileSize(totalBytes)} will be uploaded to the connected Google Drive. Keep the app open. Starter video entries will be replaced only after every upload succeeds.`,
    confirmText: "Start migration",
    icon: "▶"
  });
  if (!confirmed) return;

  const button = $("startVideoMigrationBtn");
  const progressRoot = $("videoMigrationProgress");
  const resultRoot = $("videoMigrationResult");
  const progressByIndex = new Map();
  const uploadedFiles = [];
  state.videoMigrationRunning = true;
  renderVideoMigrationSelection();
  progressRoot?.classList.remove("hidden");
  resultRoot?.classList.add("hidden");
  setButtonLoading(button, true, "Uploading videos…");

  const updateMigrationProgress = (activeName = "") => {
    let completedBytes = 0;
    ready.forEach((item, index) => {
      completedBytes += Math.max(1, Number(item.file.size || 0)) * (Number(progressByIndex.get(index) || 0) / 100);
    });
    const percent = Math.max(0, Math.min(100, Math.round((completedBytes / totalBytes) * 100)));
    if ($("videoMigrationProgressBar")) $("videoMigrationProgressBar").style.width = `${percent}%`;
    if ($("videoMigrationProgressPercent")) $("videoMigrationProgressPercent").textContent = `${percent}%`;
    if ($("videoMigrationProgressLabel")) $("videoMigrationProgressLabel").textContent = activeName ? `Uploading ${activeName}` : "Uploading videos…";
    const finished = [...progressByIndex.values()].filter((value) => Number(value) >= 100).length;
    if ($("videoMigrationProgressDetail")) $("videoMigrationProgressDetail").textContent = `${finished} of ${ready.length} uploaded · ${formatFileSize(totalBytes)} total. Keep Pink Promise open.`;
  };

  try {
    const results = await runWithConcurrency(ready, 2, async (entry, index) => {
      const itemId = push(ref(db, `couples/${state.coupleId}/gallery`)).key;
      progressByIndex.set(index, 1);
      updateMigrationProgress(entry.file.name);
      const logicalPath = `couples/${state.coupleId}/gallery/videos/${entry.album}/${itemId}-${randomId("video")}-${safeFileName(entry.file.name)}`;
      const uploaded = await uploadFileToDrive(entry.file, logicalPath, (percent) => {
        progressByIndex.set(index, percent);
        updateMigrationProgress(entry.file.name);
      }, "gallery");
      uploadedFiles.push(uploaded);
      progressByIndex.set(index, 100);
      updateMigrationProgress(entry.file.name);
      return { entry, itemId, uploaded };
    });

    const updates = {};
    const authorName = state.profile?.displayName || currentMember()?.displayName || "My love";
    for (const { entry, itemId, uploaded } of results) {
      const source = entry.starterItem || {};
      const filename = String(entry.file.name || uploaded.name || "video.mp4").slice(-100);
      updates[`gallery/${itemId}`] = {
        type: "video",
        album: entry.album,
        filename,
        title: migrationTitle(entry.file, source),
        date: migrationFileDate(entry.file, source),
        description: String(source.description || "").slice(0, 500),
        driveFileId: uploaded.driveFileId,
        driveWebViewLink: uploaded.driveWebViewLink || "",
        storageUrl: "",
        storagePath: uploaded.path,
        fileSize: Number(uploaded.size || entry.file.size || 0),
        contentType: uploaded.type || inferredContentType(entry.file),
        migrationKey: entry.migrationKey,
        sourceStarterId: entry.starterId || "",
        authorId: state.user.uid,
        authorName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (entry.starterId) {
        updates[`galleryStarterHidden/${entry.starterId}`] = true;
        const favorites = state.couple?.galleryFavorites?.[entry.starterId] || {};
        for (const [uid, favorite] of Object.entries(favorites)) {
          if (favorite === true) updates[`galleryFavorites/${itemId}/${uid}`] = true;
        }
      }
    }
    await update(ref(db, `couples/${state.coupleId}`), updates);

    state.videoMigrationFiles = state.videoMigrationFiles.map((item) => ready.includes(item) ? { ...item, alreadyMigrated: true } : item);
    renderVideoMigrationSelection();
    renderVideoMigrationSettingsStatus();
    if (resultRoot) {
      resultRoot.className = "mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800";
      resultRoot.innerHTML = `<strong>Migration complete.</strong> ${results.length} video${results.length === 1 ? " was" : "s were"} uploaded to Google Drive and linked to the gallery. Next, close the app and run <code class="rounded bg-white/70 px-1 py-0.5">finalize-video-migration.bat</code> in the project folder, then commit and push.`;
    }
    toast(`${results.length} video${results.length === 1 ? "" : "s"} moved to Google Drive.`);
  } catch (error) {
    await Promise.allSettled(uploadedFiles.filter((item) => item?.driveFileId).map(deleteUploadedMedia));
    console.error("Starter video migration failed", error);
    if (resultRoot) {
      resultRoot.classList.remove("hidden");
      resultRoot.className = "mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700";
      resultRoot.textContent = `Migration stopped safely: ${friendlyError(error)} No starter entries were replaced. Retry after checking the connection.`;
    }
    toast(friendlyError(error), "error");
  } finally {
    state.videoMigrationRunning = false;
    setButtonLoading(button, false);
    renderVideoMigrationSelection();
  }
}

async function deleteUploadedMedia(media) {
  const driveFileId = typeof media === "string" ? media : media?.driveFileId;
  if (!driveFileId) return;
  await deleteGoogleDriveFile(driveFileId);
}

function legacyMediaUrl(media) {
  return safeImageUrl(media?.url || media?.storageUrl || "");
}

function mediaImageHTML(media, className, alt, extraAttributes = "") {
  const driveFileId = String(media?.driveFileId || "").trim();
  const url = legacyMediaUrl(media);
  const source = driveFileId
    ? `data-drive-file-id="${escapeHTML(driveFileId)}"`
    : `src="${escapeHTML(url)}"`;
  return `<img class="${className} ${driveFileId ? "drive-media-pending" : ""}" ${source} alt="${escapeHTML(alt)}" ${extraAttributes} />`;
}

function mediaVideoHTML(media, className, extraAttributes = "") {
  const driveFileId = String(media?.driveFileId || "").trim();
  const url = legacyMediaUrl(media);
  const source = driveFileId
    ? `data-drive-file-id="${escapeHTML(driveFileId)}"`
    : `src="${escapeHTML(url)}"`;
  return `<video class="${className} ${driveFileId ? "drive-media-pending" : ""}" ${source} ${extraAttributes}></video>`;
}

function hydrateMedia(root = document, interactive = false) {
  hydrateGoogleDriveMedia(root, { interactive }).catch((error) => {
    if (interactive) toast(friendlyError(error), "error");
  });
}

async function handleDriveConnect() {
  const buttons = [$("driveConnectBtn"), $("settingsDriveConnectBtn")].filter(Boolean);
  buttons.forEach((button) => setButtonLoading(button, true, "Connecting…"));
  try {
    await connectGoogleDrive({ prompt: "consent" });
    renderDriveStatus();
    await hydrateGoogleDriveMedia(document, { interactive: true });
    toast("Google Drive connected. Private media is ready.");
  } catch (error) {
    toast(friendlyError(error), "error");
  } finally {
    buttons.forEach((button) => setButtonLoading(button, false));
  }
}

async function handleDriveDisconnect() {
  const confirmed = await confirmAction({
    title: "Disconnect Google Drive?",
    message: "Private media will stop loading on this device until you connect again. Your Drive files will not be deleted.",
    confirmText: "Disconnect",
    icon: "☁"
  });
  if (!confirmed) return;
  disconnectGoogleDrive();
  renderDriveStatus();
  toast("Google Drive authorization removed from this Pink Promise account on this device.", "info");
}

async function restoreDriveForUser(user) {
  if (!user) return false;
  setGoogleDriveAccount(user.uid);
  state.driveRestoring = true;
  renderDriveStatus();
  const restored = await resumeGoogleDriveConnection({ prompt: "none" });
  state.driveRestoring = false;
  renderDriveStatus();
  if (restored) await hydrateGoogleDriveMedia(document, { interactive: false });
  return restored;
}

function renderDriveStatus() {
  const status = getGoogleDriveStatus();
  const configured = status.configured;
  const connected = status.connected;
  const remembered = status.remembered;
  const restoring = state.driveRestoring;
  const banner = $("driveConnectionBanner");
  const bannerText = $("driveConnectionText");
  const bannerButton = $("driveConnectBtn");
  const statusBadge = $("settingsDriveStatus");
  const settingsConnect = $("settingsDriveConnectBtn");
  const settingsDisconnect = $("settingsDriveDisconnectBtn");
  const headerIndicator = $("driveSyncIndicator");

  if (banner) {
    banner.classList.toggle("hidden", connected || restoring);
    banner.classList.toggle("flex", !connected && !restoring);
    if (bannerText) bannerText.textContent = configured
      ? remembered
        ? "Drive authorization is remembered, but Google needs a quick reconnect before private media can load."
        : "Connect the dedicated Google Drive account to upload and view private gallery, diary, and chat media."
      : "Google Drive is not configured yet. Add the OAuth Client ID in google-drive-config.js. Text features still work.";
    if (bannerButton) {
      bannerButton.disabled = !configured || restoring;
      bannerButton.textContent = restoring ? "Restoring…" : configured ? remembered ? "Reconnect Drive" : "Connect Drive" : "Configure Drive";
    }
  }
  if (headerIndicator) {
    headerIndicator.innerHTML = connected
      ? '<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Drive ✓'
      : restoring
        ? '<span class="drive-mini-spinner"></span> Drive…'
        : configured
          ? `<span class="h-1.5 w-1.5 rounded-full ${remembered ? "bg-rosewood-500" : "bg-amber-500"}"></span> ${remembered ? "Drive paused" : "Drive off"}`
          : '<span class="h-1.5 w-1.5 rounded-full bg-slate-400"></span> Drive setup';
    headerIndicator.className = `flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold ${connected ? "bg-emerald-50 text-emerald-700" : restoring || remembered ? "bg-rosewood-50 text-rosewood-700" : configured ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`;
  }
  if (statusBadge) {
    statusBadge.textContent = connected ? "Connected" : restoring ? "Restoring" : remembered ? "Remembered" : configured ? "Not connected" : "Not configured";
    statusBadge.className = `rounded-full px-2.5 py-1 text-[10px] font-bold ${connected ? "bg-emerald-100 text-emerald-700" : restoring || remembered ? "bg-rosewood-100 text-rosewood-700" : "bg-amber-100 text-amber-700"}`;
  }
  if (settingsConnect) {
    settingsConnect.disabled = !configured || connected || restoring;
    settingsConnect.textContent = connected ? "Drive connected" : restoring ? "Restoring Drive…" : remembered ? "Reconnect Google Drive" : "Connect Google Drive";
  }
  settingsDisconnect?.classList.toggle("hidden", !connected && !remembered);
  scheduleViewportLayout();
}

function applyTheme(theme, persist = true) {
  const resolved = theme === "dark" ? "dark" : "light";
  state.theme = resolved;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.classList.add("theme-transition");
  $("themeToggleBtn") && ($("themeToggleBtn").textContent = resolved === "dark" ? "☀" : "☾");
  $("settingsThemeToggle") && ($("settingsThemeToggle").textContent = resolved === "dark" ? "Use light mode" : "Use dark mode");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#21131a" : "#9f496e");
  if (persist) localStorage.setItem("pinkPromiseTheme", resolved);
}

function initializeTheme() {
  const stored = localStorage.getItem("pinkPromiseTheme");
  const preferred = stored || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(preferred, false);
}

function entryPhotosArray(entry) {
  let photos = [];
  if (Array.isArray(entry?.photos)) photos = entry.photos.filter(Boolean).map((photo, index) => ({ id: photo.id || `photo-${index}`, ...photo }));
  else if (entry?.photos) photos = Object.entries(entry.photos).map(([id, photo]) => ({ id, ...photo })).filter((photo) => photo.url || photo.driveFileId);
  const legacyUrl = safeImageUrl(entry?.imageUrl || "");
  if (!photos.length && legacyUrl) photos.push({ id: "legacy-photo", url: legacyUrl, path: "", name: "Legacy photo", type: "image/jpeg", size: 0 });
  return photos;
}

function photosObject(photos = []) {
  return Object.fromEntries(photos.filter((photo) => photo?.id && (photo?.url || photo?.driveFileId)).map((photo) => [photo.id, {
    url: photo.url || "",
    path: photo.path || "",
    driveFileId: photo.driveFileId || "",
    driveWebViewLink: photo.driveWebViewLink || "",
    name: photo.name || "photo",
    size: Number(photo.size || 0),
    type: photo.type || "image/jpeg"
  }]));
}

function clearEntryPhotoState() {
  state.entrySelectedFiles.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
  state.entrySelectedFiles = [];
  state.entryExistingPhotos = [];
  state.entryRemovedPhotos = [];
  if ($("entryPhotoInput")) $("entryPhotoInput").value = "";
  if ($("entryPhotoPreview")) $("entryPhotoPreview").innerHTML = "";
}

function renderEntryPhotoPreview() {
  const root = $("entryPhotoPreview");
  if (!root) return;
  const existing = state.entryExistingPhotos.map((photo) => ({ ...photo, existing: true }));
  const selected = state.entrySelectedFiles.map((item) => ({ ...item, existing: false }));
  const all = [...existing, ...selected];
  root.innerHTML = all.map((photo, index) => {
    const image = photo.existing
      ? mediaImageHTML(photo, "h-full w-full object-cover", "Memory photo preview", 'loading="lazy"')
      : `<img class="h-full w-full object-cover" src="${escapeHTML(photo.previewUrl)}" alt="Memory photo preview" />`;
    return `<div class="upload-preview-card relative aspect-square overflow-hidden rounded-xl border border-rosewood-100 bg-white">${image}<button class="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-lg bg-rosewood-950/75 text-xs font-bold text-white" data-remove-entry-photo="${escapeHTML(photo.existing ? `existing:${photo.id}` : `new:${photo.localId}`)}" type="button" aria-label="Remove photo">×</button><span class="absolute bottom-1 left-1 rounded bg-white/85 px-1.5 py-0.5 text-[8px] font-bold text-rosewood-800">${index + 1}</span></div>`;
  }).join("");
  root.classList.toggle("hidden", all.length === 0);
  hydrateMedia(root);
}

function addEntryPhotoFiles(fileList) {
  const files = [...fileList];
  const room = Math.max(0, 8 - state.entryExistingPhotos.length - state.entrySelectedFiles.length);
  if (!room) return toast("A diary memory can have up to 8 photos.", "info");
  for (const file of files.slice(0, room)) {
    const error = validateUploadFile(file, "image");
    if (error) { toast(error, "error"); continue; }
    state.entrySelectedFiles.push({ localId: randomId("local"), file, previewUrl: URL.createObjectURL(file) });
  }
  if (files.length > room) toast(`Only ${room} more photo${room === 1 ? "" : "s"} could be added.`, "info");
  renderEntryPhotoPreview();
}

function messagesArray() {
  return Object.entries(state.couple?.messages || {}).map(([id, message]) => ({ id, ...message })).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

function currentEntertainment() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const day = Math.floor((new Date() - start) / 86400000);
  return ENTERTAINMENT[(day + state.entertainmentOffset) % ENTERTAINMENT.length];
}

function renderEntertainment() {
  const item = currentEntertainment();
  if (!item || !$("entertainmentTitle")) return;
  $("entertainmentEmoji").textContent = item.emoji;
  $("entertainmentTitle").textContent = item.title;
  $("entertainmentText").textContent = item.text;
}

function defaultGalleryAlbum(tab, items = galleryItemsArray()) {
  const candidates = tab === "videos" ? Object.keys(VIDEO_ALBUMS) : tab === "photos" ? Object.keys(PHOTO_ALBUMS) : [...Object.keys(PHOTO_ALBUMS), ...Object.keys(VIDEO_ALBUMS)];
  return candidates.find((album) => items.some((item) => item.album === album && (tab !== "favorites" || item.favorite))) || candidates[0];
}

function truncate(value = "", max = 240) {
  const text = String(value);
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  return value ? new Date(`${value}T12:00:00`) : new Date();
}

function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", options).format(parseLocalDate(value));
}

function formatTimestamp(value) {
  if (!Number.isFinite(Number(value))) return "Just now";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(Number(value)));
}

function initials(name = "PP") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "PP";
}

function generateInviteCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return [...values].map((value) => alphabet[value % alphabet.length]).join("");
}


async function generateUniqueInviteCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateInviteCode();
    const snapshot = await get(ref(db, `inviteCodes/${code}`));
    if (!snapshot.exists()) return code;
  }
  throw new Error("Unable to create a unique invite code. Please try again.");
}

function setButtonLoading(button, loading, label = "Working…") {
  if (!button) return;
  if (loading) {
    if (button.dataset.loading !== "1") button.dataset.originalText = button.textContent;
    button.dataset.loading = "1";
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    delete button.dataset.loading;
    delete button.dataset.originalText;
  }
}

function toast(message, type = "success") {
  const styles = {
    success: "border-emerald-100 bg-white text-emerald-800",
    error: "border-red-100 bg-white text-red-700",
    info: "border-rosewood-100 bg-white text-rosewood-800"
  };
  const icons = { success: "✓", error: "!", info: "♥" };
  const item = document.createElement("div");
  item.className = `pointer-events-auto flex items-start gap-3 rounded-2xl border p-3 text-sm font-semibold shadow-xl transition ${styles[type] || styles.info}`;
  item.innerHTML = `<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-rosewood-50 text-xs">${icons[type] || icons.info}</span><span class="pt-1">${escapeHTML(message)}</span>`;
  $("toastContainer").appendChild(item);
  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(-8px)";
    setTimeout(() => item.remove(), 220);
  }, 3200);
}

function friendlyError(error) {
  const code = error?.code || "";
  const map = {
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/email-already-in-use": "An account already uses this email address.",
    "auth/weak-password": "Use a stronger password with at least 6 characters.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Please check your internet connection.",
    "auth/user-not-found": "No account was found for that email.",
    "DRIVE_NOT_CONFIGURED": "Add your Google OAuth Client ID in google-drive-config.js first.",
    "DRIVE_NOT_CONNECTED": "Connect Google Drive to upload or view private media.",
    "DRIVE_SESSION_EXPIRED": "Your Google Drive session expired. Connect Drive again.",
    "DRIVE_AUTH_CANCELED": "Google Drive connection was canceled.",
    "DRIVE_AUTH_FAILED": "Google Drive authorization failed. Check the OAuth setup.",
    "DRIVE_PERMISSION_DENIED": "Google Drive denied access. Use the dedicated Drive account and check the folder permissions.",
    "DRIVE_FILE_NOT_FOUND": "The media file was not found in Google Drive.",
    "DRIVE_UPLOAD_FAILED": "The Google Drive upload failed. Check your connection and try again.",
    "DRIVE_NETWORK_ERROR": "The Google Drive request was interrupted. Check your connection.",
    "PERMISSION_DENIED": "Firebase blocked this action. Check the included database rules."
  };
  return map[code] || map[error?.message] || error?.message || "Something went wrong. Please try again.";
}

function visibleModals() {
  return $$('[id$="Modal"]:not(.hidden)');
}

function focusableElements(root) {
  return $$('button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', root)
    .filter((element) => element.offsetParent !== null);
}

function lockPageScroll() {
  if (document.body.dataset.modalLocked === "true") return;
  const scrollY = window.scrollY;
  document.body.dataset.modalLocked = "true";
  document.body.dataset.modalScrollY = String(scrollY);
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.body.style.overflow = "hidden";
}

function unlockPageScroll() {
  if (document.body.dataset.modalLocked !== "true") return;
  const scrollY = Number(document.body.dataset.modalScrollY || 0);
  delete document.body.dataset.modalLocked;
  delete document.body.dataset.modalScrollY;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  document.body.style.overflow = "";
  window.scrollTo(0, scrollY);
}

function openModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal._returnFocus = document.activeElement;
  if (!visibleModals().length) lockPageScroll();
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  modal.scrollTop = 0;
  const card = modal.querySelector(".modal-card");
  if (card) card.scrollTop = 0;
  requestAnimationFrame(() => {
    const preferred = modal.querySelector('[autofocus]') || focusableElements(modal)[0];
    preferred?.focus({ preventScroll: true });
  });
}

function closeModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  if (!visibleModals().length) unlockPageScroll();
  if (id === "entryModal") {
    setTyping(false);
    clearEntryPhotoState();
  }
  if (id === "galleryItemModal") clearGalleryFileSelection();
  if (id === "galleryViewerModal") {
    state.galleryViewerId = null;
    if ($("galleryViewerMedia")) $("galleryViewerMedia").innerHTML = "";
  }
  const returnFocus = modal._returnFocus;
  modal._returnFocus = null;
  if (returnFocus?.isConnected) requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
}

function confirmAction({ title, message, confirmText = "Confirm", icon = "?" }) {
  $("confirmTitle").textContent = title;
  $("confirmMessage").textContent = message;
  $("confirmAcceptBtn").textContent = confirmText;
  $("confirmIcon").textContent = icon;
  openModal("confirmModal");
  return new Promise((resolve) => {
    state.activeConfirmResolve = resolve;
  });
}

function resolveConfirmation(value) {
  closeModal("confirmModal");
  if (state.activeConfirmResolve) state.activeConfirmResolve(value);
  state.activeConfirmResolve = null;
}

function clearRealtimeListeners() {
  state.listeners.forEach((unsubscribe) => {
    try { unsubscribe(); } catch { /* no-op */ }
  });
  state.listeners = [];
  if (state.connectionUnsubscribe) {
    try { state.connectionUnsubscribe(); } catch { /* no-op */ }
    state.connectionUnsubscribe = null;
  }
}

function resetSessionState() {
  clearRealtimeListeners();
  if (state.profileUnsubscribe) {
    try { state.profileUnsubscribe(); } catch { /* no-op */ }
    state.profileUnsubscribe = null;
  }
  state.profile = null;
  state.couple = null;
  state.coupleId = null;
  state.selectedDate = null;
  state.calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  state.galleryTab = "photos";
  state.galleryAlbum = "with-friends";
  state.galleryPeriod = "";
  state.galleryPage = 1;
  state.galleryViewerId = null;
  clearGalleryFileSelection();
  state.videoMigrationFiles = [];
  state.videoMigrationRunning = false;
  clearEntryPhotoState();
  state.chatReplyId = null;
  state.chatEditingId = null;
  state.chatAttachmentFile = null;
  state.chatExistingAttachment = null;
  state.chatRemoveExistingAttachment = false;
  state.chatRenderedCount = 0;
  state.chatForceScroll = true;
  clearTimeout(state.chatTypingTimer);
  state.chatTypingTimer = null;
  state.chatTypingActive = false;
  state.chatTypingLastWrite = 0;
  state.chatMessageSignatures = new Map();
  clearTimeout(state.smartRepliesTimer);
  state.smartRepliesTimer = null;
  state.smartRepliesDismissedFor = "";
  state.lastSmartReplyMessageId = "";
  document.body.classList.remove("chat-mode");
}

function entriesArray() {
  const entries = state.couple?.entries || {};
  return Object.entries(entries)
    .map(([id, entry]) => ({ id, ...entry }))
    .sort((a, b) => {
      const byDate = String(b.date || "").localeCompare(String(a.date || ""));
      return byDate || Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });
}



function galleryItemsArray() {
  const dynamicItems = state.couple?.gallery || {};
  const favorites = state.couple?.galleryFavorites || {};
  const starterOverrides = state.couple?.galleryStarterOverrides || {};
  const starterHidden = state.couple?.galleryStarterHidden || {};

  const starterItems = STARTER_GALLERY
    .filter((item) => !starterHidden?.[item.id])
    .map((item) => ({
      ...item,
      ...(starterOverrides?.[item.id] || {}),
      id: item.id,
      isStarter: true,
      favorite: Boolean(favorites?.[item.id]?.[state.user?.uid])
    }));

  const firebaseItems = Object.entries(dynamicItems).map(([id, item]) => ({
    id,
    ...item,
    isStarter: false,
    favorite: Boolean(favorites?.[id]?.[state.user?.uid])
  }));

  return [...starterItems, ...firebaseItems];
}

function galleryItemById(id) {
  return galleryItemsArray().find((item) => item.id === id) || null;
}

function canManageGalleryItem(item) {
  return Boolean(item && (item.isStarter || item.authorId === state.user?.uid));
}

function galleryAlbumsForType(type) {
  return type === "video" ? VIDEO_ALBUMS : PHOTO_ALBUMS;
}

function galleryAlbumLabel(type, album) {
  return galleryAlbumsForType(type)[album] || "Album";
}

function galleryMonthLabel(month) {
  return GALLERY_MONTHS.find((entry) => entry.value === String(month || "").padStart(2, "0"))?.label || "";
}

function isUsTogetherAlbum(type, album) {
  return type === "photo" && album === "us-together";
}

function usTogetherFolderName(month, year) {
  const label = galleryMonthLabel(month);
  const safeYear = Number(year);
  return label && Number.isInteger(safeYear) ? `${label} ${safeYear}` : "";
}

function galleryPeriodLabel(item) {
  if (!isUsTogetherAlbum(item?.type, item?.album)) return "";
  return usTogetherFolderName(item?.month, item?.year) || String(item?.folderPath || "").replaceAll("/", " · ");
}

function safeGalleryFolderSegments(folderPath = "") {
  return String(folderPath)
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .slice(0, 4);
}

function galleryMediaPath(item) {
  if (!item) return "";
  if (item.driveFileId) return "";
  if (item.storageUrl && safeImageUrl(item.storageUrl)) return safeImageUrl(item.storageUrl);
  const collection = item.type === "video" ? "videos" : "photos";
  const segments = ["assets", "gallery", collection, item.album];
  if (isUsTogetherAlbum(item.type, item.album)) {
    const folderPath = item.folderPath || usTogetherFolderName(item.month, item.year);
    segments.push(...safeGalleryFolderSegments(folderPath));
  }
  segments.push(item.filename || "");
  return `./${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function galleryDisplayPath(type, album, filename, month = "", year = "", folderPath = "") {
  const collection = type === "video" ? "videos" : "photos";
  const segments = ["assets", "gallery", collection, album];
  if (isUsTogetherAlbum(type, album)) {
    segments.push(...safeGalleryFolderSegments(folderPath || usTogetherFolderName(month, year)));
  }
  segments.push(filename || "");
  return segments.join("/");
}

function validGalleryFilename(filename, type) {
  const value = String(filename || "").trim();
  if (!value || value.length > 100 || value.includes("/") || value.includes("\\") || value.startsWith(".")) return false;
  const extension = value.includes(".") ? value.split(".").pop().toLowerCase() : "";
  return type === "video" ? VIDEO_EXTENSIONS.has(extension) : PHOTO_EXTENSIONS.has(extension);
}

function membersArray() {
  return Object.entries(state.couple?.members || {}).map(([uid, member]) => ({ uid, ...member }));
}

function currentMember() {
  return state.couple?.members?.[state.user?.uid] || null;
}

function partnerMember() {
  return membersArray().find((member) => member.uid !== state.user?.uid) || null;
}

function partnerDisplayName() {
  const partner = partnerMember();
  const nickname = state.couple?.nicknames?.[state.user?.uid];
  return nickname?.trim() || partner?.displayName || "Your partner";
}

function isOwner() {
  return currentMember()?.role === "owner";
}

function currentPrompt() {
  return currentEntertainment()?.text || "A tiny moment for two.";
}

async function ensureUserProfile(user) {
  const userRef = ref(db, `users/${user.uid}`);
  const snapshot = await get(userRef);
  if (!snapshot.exists()) {
    await set(userRef, {
      displayName: user.displayName || user.email?.split("@")[0] || "My love",
      email: user.email || "",
      createdAt: serverTimestamp()
    });
  }
}

function watchUserProfile(user) {
  if (state.profileUnsubscribe) {
    try { state.profileUnsubscribe(); } catch { /* no-op */ }
  }
  state.profileUnsubscribe = onValue(ref(db, `users/${user.uid}`), async (snapshot) => {
    state.profile = snapshot.val() || {};
    const nextCoupleId = state.profile.coupleId || null;
    if (!nextCoupleId) {
      if (state.coupleId) clearRealtimeListeners();
      state.coupleId = null;
      state.couple = null;
      showOnly("onboardingScreen");
      initializeAppNavigation(user.uid);
      hideAppLoader();
      return;
    }
    if (state.coupleId !== nextCoupleId) {
      await startCoupleSession(nextCoupleId);
    } else {
      renderAll();
      hideAppLoader();
    }
  }, (error) => {
    hideAppLoader();
    toast(friendlyError(error), "error");
  });
}

function branchChanged(previous, next, key) {
  return JSON.stringify(previous?.[key] ?? null) !== JSON.stringify(next?.[key] ?? null);
}

function renderCoupleUpdate(previous, next, { initial = false } = {}) {
  state.couple = next;
  if (initial || !previous) {
    renderAll();
    return;
  }

  const knownKeys = new Set([
    "name", "anniversary", "inviteCode", "createdBy", "createdAt", "partner",
    "members", "nicknames", "entries", "moods", "presence", "typing",
    "gallery", "galleryFavorites", "galleryStarterOverrides", "galleryStarterHidden",
    "messages", "chatRead", "chatTyping"
  ]);
  const allKeys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
  const unknownChanged = [...allKeys].some((key) => !knownKeys.has(key) && branchChanged(previous, next, key));
  const coreChanged = ["name", "anniversary", "inviteCode", "createdBy", "createdAt", "partner", "members", "nicknames"]
    .some((key) => branchChanged(previous, next, key));

  if (unknownChanged || coreChanged) {
    renderAll();
    return;
  }

  if (branchChanged(previous, next, "entries")) {
    renderHome();
    renderTimeline();
    renderCalendar();
    renderInsights();
  }
  if (branchChanged(previous, next, "moods")) {
    renderHome();
    renderInsights();
  }
  if (branchChanged(previous, next, "presence")) {
    renderHome();
    renderChat();
  }
  if (branchChanged(previous, next, "typing")) renderTyping();

  if (["gallery", "galleryFavorites", "galleryStarterOverrides", "galleryStarterHidden"]
    .some((key) => branchChanged(previous, next, key))) {
    renderGallery();
  }

  if (branchChanged(previous, next, "messages")) {
    renderChat();
  } else {
    if (branchChanged(previous, next, "chatTyping")) {
      renderChatTyping();
      renderSmartReplies();
      scheduleViewportLayout();
    }
    if (branchChanged(previous, next, "chatRead")) {
      const messages = messagesArray();
      renderChatBadges();
      renderChatSeenState(messages);
    }
  }
}

async function startCoupleSession(coupleId) {
  clearRealtimeListeners();
  state.coupleId = coupleId;
  initializeAppNavigation(state.user?.uid || "");
  showOnly("appShell");
  setView("home", { historyMode: "none", scrollTop: false });

  let firstSnapshot = true;
  const coupleUnsubscribe = onValue(ref(db, `couples/${coupleId}`), (snapshot) => {
    if (!snapshot.exists()) {
      hideAppLoader();
      toast("This shared diary no longer exists.", "error");
      return;
    }
    const previousCouple = state.couple;
    const nextCouple = snapshot.val();
    renderCoupleUpdate(previousCouple, nextCouple, { initial: firstSnapshot });
    if (firstSnapshot) {
      firstSnapshot = false;
      hideAppLoader();
    }
  }, (error) => {
    hideAppLoader();
    toast(friendlyError(error), "error");
  });
  state.listeners.push(coupleUnsubscribe);

  const connectedRef = ref(db, ".info/connected");
  state.connectionUnsubscribe = onValue(connectedRef, async (snapshot) => {
    const online = snapshot.val() === true;
    renderSyncBadge(online);
    if (!online || !state.user) return;
    const statusRef = ref(db, `couples/${coupleId}/presence/${state.user.uid}`);
    try {
      await onDisconnect(statusRef).set({ online: false, lastSeen: serverTimestamp() });
      await set(statusRef, { online: true, lastSeen: serverTimestamp() });
    } catch (error) {
      console.warn("Presence update failed", error);
    }
  });
}

function renderSyncBadge(online) {
  const badge = $("syncBadge");
  if (!badge) return;
  badge.innerHTML = online
    ? '<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Synced'
    : '<span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Offline';
  badge.classList.toggle("bg-emerald-50", online);
  badge.classList.toggle("text-emerald-700", online);
  badge.classList.toggle("bg-amber-50", !online);
  badge.classList.toggle("text-amber-700", !online);
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isRegister = mode === "register";
  $("nameField").classList.toggle("hidden", !isRegister);
  $("displayName").required = isRegister;
  $("authHeading").textContent = isRegister ? "Create your private space" : "Sign in to your space";
  $("authSubheading").textContent = isRegister ? "Start your shared story in a few seconds." : "Your memories are waiting for you.";
  $("authSubmitBtn").textContent = isRegister ? "Create account" : "Sign in";
  $("forgotPasswordBtn").classList.toggle("hidden", isRegister);
  $("password").autocomplete = isRegister ? "new-password" : "current-password";
  $("loginTab").className = `auth-tab rounded-lg px-4 py-2.5 text-sm font-semibold ${!isRegister ? "bg-white text-rosewood-800 shadow-sm" : "text-slate-500"}`;
  $("registerTab").className = `auth-tab rounded-lg px-4 py-2.5 text-sm font-semibold ${isRegister ? "bg-white text-rosewood-800 shadow-sm" : "text-slate-500"}`;
  $("authMessage").classList.add("hidden");
}

function showAuthMessage(message, type = "error") {
  const el = $("authMessage");
  el.textContent = message;
  el.className = `mt-4 rounded-xl border px-3 py-2.5 text-sm ${type === "error" ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (state.authBusy || !auth) return;
  const email = $("email").value.trim().toLowerCase();
  const password = $("password").value;
  const displayName = $("displayName").value.trim();
  const button = $("authSubmitBtn");
  if (!email || !password || (state.authMode === "register" && !displayName)) return;

  state.authBusy = true;
  $("loginTab").disabled = true;
  $("registerTab").disabled = true;
  setButtonLoading(button, true, state.authMode === "register" ? "Creating account…" : "Signing in…");
  $("authMessage").classList.add("hidden");
  showAppLoader(state.authMode === "register" ? "Creating your space" : "Welcome back", state.authMode === "register" ? "Securing your new Pink Promise account…" : "Signing you in and syncing your shared memories…");

  try {
    if (state.authMode === "register") {
      const credentials = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credentials.user, { displayName });
      await set(ref(db, `users/${credentials.user.uid}`), {
        displayName,
        email,
        createdAt: serverTimestamp()
      });
      toast("Account created. Let’s make your shared space.");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    try { localStorage.setItem("pinkPromiseLastEmail", email); } catch { /* optional convenience */ }
    $("password").value = "";
  } catch (error) {
    hideAppLoader();
    showAuthMessage(friendlyError(error));
    $("password").select();
  } finally {
    state.authBusy = false;
    $("loginTab").disabled = false;
    $("registerTab").disabled = false;
    setButtonLoading(button, false);
  }
}
async function handleForgotPassword() {
  const email = $("email").value.trim();
  if (!email) {
    showAuthMessage("Enter your email address first.");
    $("email").focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showAuthMessage("Password reset email sent. Check your inbox.", "success");
  } catch (error) {
    showAuthMessage(friendlyError(error));
  }
}

async function handleSignOut() {
  if (!auth || state.signOutInProgress) return;
  const confirmed = await confirmAction({
    title: "Sign out of Pink Promise?",
    message: "Your shared memories stay safe. This device will remember the Drive authorization for this Pink Promise account.",
    confirmText: "Sign out",
    icon: "↪"
  });
  if (!confirmed) return;
  state.signOutInProgress = true;
  showAppLoader("Signing out safely", "Closing the live session and returning to login…");
  try {
    if (state.coupleId && state.user) {
      try { await setChatTyping(false, { force: true }); } catch { /* non-critical */ }
      try { await set(ref(db, `couples/${state.coupleId}/presence/${state.user.uid}`), { online: false, lastSeen: serverTimestamp() }); } catch { /* non-critical */ }
    }
    suspendGoogleDrive();
    await signOut(auth);
  } catch (error) {
    hideAppLoader();
    toast(friendlyError(error), "error");
  } finally {
    state.signOutInProgress = false;
  }
}

async function createSpace(event) {
  event.preventDefault();
  const button = $("createSpaceBtn");
  const name = $("coupleName").value.trim();
  const anniversary = $("anniversaryDate").value || "";
  if (!name) return;
  setButtonLoading(button, true, "Creating…");

  let coupleId = null;
  try {
    coupleId = push(ref(db, "couples")).key;
    const code = await generateUniqueInviteCode();
    const memberData = {
      displayName: state.profile?.displayName || state.user.displayName || "My love",
      role: "owner",
      joinCode: "OWNER",
      joinedAt: serverTimestamp()
    };

    await set(ref(db, `couples/${coupleId}/members/${state.user.uid}`), memberData);
    await update(ref(db), {
      [`couples/${coupleId}/name`]: name,
      [`couples/${coupleId}/anniversary`]: anniversary,
      [`couples/${coupleId}/inviteCode`]: code,
      [`couples/${coupleId}/createdBy`]: state.user.uid,
      [`couples/${coupleId}/createdAt`]: serverTimestamp(),
      [`inviteCodes/${code}`]: {
        coupleId,
        createdBy: state.user.uid,
        createdAt: serverTimestamp()
      },
      [`users/${state.user.uid}/coupleId`]: coupleId
    });
    toast("Your shared diary is ready.");
  } catch (error) {
    if (coupleId) {
      try { await remove(ref(db, `couples/${coupleId}/members/${state.user.uid}`)); } catch { /* cleanup only */ }
    }
    toast(friendlyError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function joinSpace(event) {
  event.preventDefault();
  const button = $("joinSpaceBtn");
  const code = $("inviteCodeInput").value.trim().toUpperCase();
  if (code.length !== 6) {
    toast("Enter the complete six-character invite code.", "error");
    return;
  }
  setButtonLoading(button, true, "Joining…");

  let joinedCoupleId = null;
  try {
    const inviteSnapshot = await get(ref(db, `inviteCodes/${code}`));
    if (!inviteSnapshot.exists()) throw new Error("That invite code is invalid or expired.");
    const { coupleId } = inviteSnapshot.val();
    joinedCoupleId = coupleId;

    // Claim the diary's single partner slot first. This prevents a third
    // account from joining even when several people submit the same code.
    await set(ref(db, `couples/${coupleId}/partner`), {
      uid: state.user.uid,
      joinCode: code,
      joinedAt: serverTimestamp()
    });

    await set(ref(db, `couples/${coupleId}/members/${state.user.uid}`), {
      displayName: state.profile?.displayName || state.user.displayName || "My love",
      role: "partner",
      joinCode: code,
      joinedAt: serverTimestamp()
    });
    await update(ref(db, `users/${state.user.uid}`), { coupleId });
    toast("You joined your partner’s diary.");
  } catch (error) {
    if (joinedCoupleId) {
      try { await remove(ref(db, `couples/${joinedCoupleId}/members/${state.user.uid}`)); } catch { /* cleanup only */ }
      try { await remove(ref(db, `couples/${joinedCoupleId}/partner`)); } catch { /* cleanup only */ }
    }
    toast(friendlyError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function setView(view, { historyMode = "push", scrollTop = true } = {}) {
  if (!validAppView(view)) view = "home";
  const previousView = state.currentView;
  state.currentView = view;
  updateNavigationState(view, historyMode, previousView);
  document.body.classList.toggle("chat-mode", view === "messages");
  const mobileNav = $("mobileNav");
  if (mobileNav) {
    const chatActive = view === "messages";
    mobileNav.setAttribute("aria-hidden", chatActive ? "true" : "false");
    if ("inert" in mobileNav) mobileNav.inert = chatActive;
  }
  $$(".view-section").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  const titles = { home: "Home", timeline: "Our diary", gallery: "Gallery", messages: "Messages", calendar: "Calendar", insights: "Insights", settings: "Settings" };
  $("pageTitle").textContent = titles[view] || "Pink Promise";
  const headerActionLabel = view === "gallery" ? "Add media" : "Add memory";
  if ($("headerNewEntryLabel")) $("headerNewEntryLabel").textContent = headerActionLabel;
  $("headerNewEntryBtn").setAttribute("aria-label", headerActionLabel);
  $("mobileMoreBtn")?.classList.toggle("active", ["calendar", "insights", "settings"].includes(view));
  closeModal("mobileMoreModal");
  if (previousView === "messages" && view !== "messages") setChatTyping(false, { force: true });
  if (view === "messages") window.scrollTo({ top: 0, behavior: "auto" });
  else if (scrollTop) window.scrollTo({ top: 0, behavior: previousView ? "smooth" : "auto" });
  if (view === "gallery") renderGallery();
  if (view === "messages") {
    state.chatForceScroll = previousView !== "messages";
    renderChat();
    markChatRead();
  }
  if (view === "calendar") renderCalendar();
  if (view === "settings") renderSettings();
  scheduleViewportLayout();
}
function renderAll() {
  if (!state.couple || !state.user) return;
  renderHeader();
  renderHome();
  renderTimeline();
  renderGallery();
  renderChat();
  renderCalendar();
  renderInsights();
  renderSettings();
  renderTyping();
  renderDriveStatus();
  hydrateMedia(document);
}

function renderHeader() {
  const myName = state.profile?.displayName || currentMember()?.displayName || state.user.displayName || "You";
  $("profileMenuBtn").textContent = initials(myName);
  $("profileModalContent").innerHTML = `
    <div class="flex items-center gap-3 rounded-2xl bg-rosewood-50 p-3">
      <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-bold text-rosewood-800 ring-1 ring-rosewood-100">${escapeHTML(initials(myName))}</div>
      <div class="min-w-0"><p class="truncate text-sm font-bold text-rosewood-950">${escapeHTML(myName)}</p><p class="truncate text-xs text-slate-500">${escapeHTML(state.user.email || "")}</p></div>
    </div>
    <div class="mt-3 flex items-center justify-between rounded-xl border border-rosewood-100 px-3 py-2 text-xs"><span class="text-slate-500">Diary role</span><strong class="capitalize text-rosewood-800">${escapeHTML(currentMember()?.role || "member")}</strong></div>`;
}

function calculateStats() {
  const entries = entriesArray();
  const today = localDateKey();
  const thisMonth = today.slice(0, 7);
  const monthEntries = entries.filter((entry) => String(entry.date || "").startsWith(thisMonth));
  const activeDays = [...new Set(entries.map((entry) => entry.date).filter(Boolean))];
  const monthActiveDays = [...new Set(monthEntries.map((entry) => entry.date).filter(Boolean))];
  const hearts = entries.reduce((sum, entry) => sum + Object.keys(entry.reactions || {}).length, 0);
  const monthHearts = monthEntries.reduce((sum, entry) => sum + Object.keys(entry.reactions || {}).length, 0);
  const streak = calculateStreak(activeDays);
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const rhythm = Math.min(100, Math.round((monthActiveDays.length / Math.max(1, Math.min(daysInMonth, new Date().getDate()))) * 100));
  return { entries, monthEntries, activeDays, monthActiveDays, hearts, monthHearts, streak, rhythm };
}

function calculateStreak(dateKeys) {
  const setOfDates = new Set(dateKeys);
  let cursor = new Date();
  let streak = 0;
  if (!setOfDates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (setOfDates.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function daysTogether() {
  const anniversary = state.couple?.anniversary;
  if (!anniversary) return null;
  const start = parseLocalDate(anniversary);
  const today = parseLocalDate(localDateKey());
  return Math.max(0, Math.floor((today - start) / 86400000) + 1);
}

function renderHome() {
  const stats = calculateStats();
  const myName = state.profile?.displayName || currentMember()?.displayName || "love";
  $("todayLabel").textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  $("welcomeTitle").textContent = `Hi, ${myName.split(" ")[0]} ♡`;
  const partner = partnerMember();
  $("welcomeSubtitle").textContent = partner
    ? `You and ${partnerDisplayName()} have ${stats.entries.length} shared ${stats.entries.length === 1 ? "memory" : "memories"}.`
    : "Share your invite code when you are ready to welcome your partner.";
  $("daysTogetherStat").textContent = daysTogether() ?? "—";
  $("streakStat").textContent = stats.streak;
  renderEntertainment();
  $("coupleNameDisplay").textContent = state.couple.name || "Our diary";
  $("inviteCodeDisplay").textContent = state.couple.inviteCode || "------";
  $("monthEntriesStat").textContent = stats.monthEntries.length;
  $("monthHeartsStat").textContent = stats.monthHearts;
  $("activeDaysStat").textContent = stats.monthActiveDays.length;
  $("rhythmScore").textContent = `${stats.rhythm}%`;
  $("rhythmBar").style.width = `${stats.rhythm}%`;

  renderMoodPicker();
  renderMemberList();
  renderRecentEntries(stats.entries.slice(0, 4));
  renderSidebarPartner();
}

function renderMoodPicker() {
  const currentMoodData = state.couple?.moods?.[state.user.uid];
  const currentMood = currentMoodData?.date === localDateKey() ? currentMoodData.mood : null;
  $("moodPicker").innerHTML = Object.entries(MOODS).map(([key, mood]) => `
    <button class="mood-btn ${currentMood === key ? "active" : ""} rounded-2xl border border-rosewood-100 bg-white px-1 py-2.5 text-center transition" data-mood="${key}" type="button" title="${mood.label}">
      <span class="block text-xl">${mood.emoji}</span><span class="mt-1 block text-[9px] font-bold text-slate-500">${mood.label}</span>
    </button>`).join("");
  $("clearMoodBtn")?.classList.toggle("hidden", !currentMood);

  const partner = partnerMember();
  const storedPartnerMood = partner ? state.couple?.moods?.[partner.uid] : null;
  const partnerMood = storedPartnerMood?.date === localDateKey() ? storedPartnerMood : null;
  const partnerMoodInfo = partnerMood ? MOODS[partnerMood.mood] : null;
  $("partnerMoodDisplay").innerHTML = partner
    ? partnerMoodInfo
      ? `<div class="flex items-center justify-between gap-3"><span><strong class="text-rosewood-900">${escapeHTML(partnerDisplayName())}</strong> feels ${escapeHTML(partnerMoodInfo.label.toLowerCase())} today.</span><span class="text-lg">${partnerMoodInfo.emoji}</span></div>`
      : `<span><strong class="text-rosewood-900">${escapeHTML(partnerDisplayName())}</strong> has not checked in today yet.</span>`
    : "Your partner’s mood will appear here after they join.";
}

async function saveMood(mood) {
  if (!MOODS[mood]) return;
  try {
    await set(ref(db, `couples/${state.coupleId}/moods/${state.user.uid}`), {
      mood,
      date: localDateKey(),
      updatedAt: serverTimestamp()
    });
    $("moodSavedBadge").classList.remove("hidden");
    setTimeout(() => $("moodSavedBadge").classList.add("hidden"), 1600);
  } catch (error) {
    toast(friendlyError(error), "error");
  }
}

async function clearMood() {
  const current = state.couple?.moods?.[state.user?.uid];
  if (!current) return;
  const confirmed = await confirmAction({ title: "Clear today’s mood?", message: "Your check-in will be removed. You can choose another mood anytime.", confirmText: "Clear mood", icon: "○" });
  if (!confirmed) return;
  try {
    await remove(ref(db, `couples/${state.coupleId}/moods/${state.user.uid}`));
    toast("Today’s mood was cleared.", "info");
  } catch (error) { toast(friendlyError(error), "error"); }
}

function renderMemberList() {
  const members = membersArray();
  $("memberList").innerHTML = members.map((member) => {
    const presence = state.couple?.presence?.[member.uid];
    const online = presence?.online === true;
    const isMe = member.uid === state.user.uid;
    return `<div class="flex items-center gap-3 rounded-2xl border border-rosewood-100 bg-white p-2.5">
      <div class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rosewood-50 text-xs font-bold text-rosewood-800">${escapeHTML(initials(member.displayName))}<span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${online ? "bg-emerald-500" : "bg-slate-300"}"></span></div>
      <div class="min-w-0 flex-1"><p class="truncate text-xs font-bold text-rosewood-950">${escapeHTML(isMe ? `${member.displayName} (you)` : partnerDisplayName())}</p><p class="text-[10px] text-slate-400">${online ? "Online now" : presence?.lastSeen ? `Last seen ${formatTimestamp(presence.lastSeen)}` : "Not online yet"}</p></div>
    </div>`;
  }).join("") + (members.length < 2 ? `<div class="rounded-2xl border border-dashed border-rosewood-200 p-3 text-center text-[11px] text-slate-500">Waiting for your partner to join.</div>` : "");
}

function renderSidebarPartner() {
  const partner = partnerMember();
  if (!partner) {
    $("sidebarPartnerCard").innerHTML = `<p class="text-[10px] font-bold uppercase tracking-wider text-rosewood-600">Invite your partner</p><p class="mt-1 text-xs leading-5 text-slate-500">Code: <strong class="tracking-widest text-rosewood-800">${escapeHTML(state.couple.inviteCode || "------")}</strong></p>`;
    return;
  }
  const online = state.couple?.presence?.[partner.uid]?.online === true;
  $("sidebarPartnerCard").innerHTML = `<div class="flex items-center gap-2.5"><div class="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-bold text-rosewood-800 ring-1 ring-rosewood-100">${escapeHTML(initials(partnerDisplayName()))}<span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${online ? "bg-emerald-500" : "bg-slate-300"}"></span></div><div class="min-w-0"><p class="truncate text-xs font-bold text-rosewood-950">${escapeHTML(partnerDisplayName())}</p><p class="text-[10px] text-slate-400">${online ? "Together online" : "Your diary partner"}</p></div></div>`;
}

function entryCard(entry, compact = false) {
  const mine = entry.authorId === state.user.uid;
  const liked = Boolean(entry.reactions?.[state.user.uid]);
  const heartCount = Object.keys(entry.reactions || {}).length;
  const photos = entryPhotosArray(entry);
  const cover = photos[0] || null;
  const mood = MOODS[entry.mood] || MOODS.loved;
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  const body = compact ? truncate(entry.body, 180) : truncate(entry.body, 520);
  return `<article class="entry-card overflow-hidden rounded-3xl border border-rosewood-100 bg-white shadow-sm" data-entry-id="${escapeHTML(entry.id)}">
    ${cover ? `<div class="relative">${mediaImageHTML(cover, "h-40 w-full object-cover", `Photo for ${entry.title}`, 'loading="lazy"')}${photos.length > 1 ? `<span class="absolute bottom-2 right-2 rounded-full bg-rosewood-950/75 px-2 py-1 text-[9px] font-bold text-white backdrop-blur">${photos.length} photos</span>` : ""}</div>` : ""}
    <div class="p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><span class="rounded-full bg-rosewood-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-rosewood-700">${escapeHTML(CATEGORIES[entry.category] || "Memory")}</span><span class="text-xs">${mood.emoji}</span></div><h3 class="mt-2 break-words font-display text-xl font-bold text-rosewood-950">${escapeHTML(entry.title || "Untitled memory")}</h3></div>
        <div class="flex shrink-0 items-center gap-1">${mine ? `<button class="rounded-lg px-2 py-1 text-xs font-bold text-slate-400 hover:bg-rosewood-50 hover:text-rosewood-700" data-entry-action="edit" data-entry-id="${escapeHTML(entry.id)}" type="button">Edit</button><button class="rounded-lg px-2 py-1 text-xs font-bold text-slate-400 hover:bg-red-50 hover:text-red-600" data-entry-action="delete" data-entry-id="${escapeHTML(entry.id)}" type="button">×</button>` : ""}</div>
      </div>
      <p class="mt-3 whitespace-pre-line break-words text-sm leading-6 text-slate-600">${escapeHTML(body)}</p>
      ${tags.length ? `<div class="mt-3 flex flex-wrap gap-1.5">${tags.slice(0, 6).map((tag) => `<span class="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">#${escapeHTML(tag)}</span>`).join("")}</div>` : ""}
      <div class="mt-4 flex items-center justify-between border-t border-rosewood-50 pt-3"><div class="min-w-0"><p class="truncate text-[11px] font-bold text-rosewood-800">${escapeHTML(mine ? "You" : partnerDisplayName())}</p><p class="text-[10px] text-slate-400">${escapeHTML(formatDate(entry.date))}</p></div><div class="flex items-center gap-1.5"><button class="rounded-xl bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-rosewood-50 hover:text-rosewood-700" data-entry-action="view" data-entry-id="${escapeHTML(entry.id)}" type="button">Read</button><button class="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${liked ? "bg-rosewood-100 text-rosewood-800" : "bg-slate-50 text-slate-500 hover:bg-rosewood-50 hover:text-rosewood-700"}" data-entry-action="heart" data-entry-id="${escapeHTML(entry.id)}" type="button"><span>${liked ? "♥" : "♡"}</span><span>${heartCount}</span></button></div></div>
    </div>
  </article>`;
}

function renderRecentEntries(entries) {
  $("recentEntries").innerHTML = entries.map((entry) => entryCard(entry, true)).join("");
  $("recentEmpty").classList.toggle("hidden", entries.length > 0);
}

function filteredEntries() {
  const search = $("searchEntries")?.value.trim().toLowerCase() || "";
  const category = $("categoryFilter")?.value || "all";
  const author = $("authorFilter")?.value || "all";
  const partner = partnerMember();
  return entriesArray().filter((entry) => {
    const haystack = `${entry.title || ""} ${entry.body || ""} ${(entry.tags || []).join(" ")}`.toLowerCase();
    const searchMatch = !search || haystack.includes(search);
    const categoryMatch = category === "all" || entry.category === category;
    const authorMatch = author === "all" || (author === "me" && entry.authorId === state.user.uid) || (author === "partner" && partner && entry.authorId === partner.uid);
    return searchMatch && categoryMatch && authorMatch;
  });
}

function renderTimeline() {
  if (!$("timelineEntries")) return;
  const entries = filteredEntries();
  $("timelineCount").textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
  $("timelineEntries").innerHTML = entries.map((entry) => entryCard(entry)).join("");
  $("timelineEmpty").classList.toggle("hidden", entries.length > 0);
  hydrateMedia($("timelineEntries"));
}


function renderGallery() {
  if (!state.couple || !state.user || !$("galleryGrid")) return;
  const allItems = galleryItemsArray();
  const photoItems = allItems.filter((item) => item.type === "photo");
  const videoItems = allItems.filter((item) => item.type === "video");
  const favoriteItems = allItems.filter((item) => item.favorite);

  $("galleryPhotoCount").textContent = photoItems.length;
  $("galleryVideoCount").textContent = videoItems.length;
  $("galleryFavoriteCount").textContent = favoriteItems.length;
  $$(".gallery-tab").forEach((button) => button.classList.toggle("active", button.dataset.galleryTab === state.galleryTab));

  const type = state.galleryTab === "videos" ? "video" : "photo";
  const albumSource = state.galleryTab === "favorites" ? { ...PHOTO_ALBUMS, ...VIDEO_ALBUMS } : galleryAlbumsForType(type);
  const albumEntries = Object.entries(albumSource);
  const validAlbums = new Set(albumEntries.map(([key]) => key));
  if (!validAlbums.has(state.galleryAlbum)) state.galleryAlbum = defaultGalleryAlbum(state.galleryTab, allItems);

  $("galleryAlbumFilters").innerHTML = albumEntries.map(([key, label]) => {
    const count = (state.galleryTab === "favorites" ? favoriteItems : state.galleryTab === "videos" ? videoItems : photoItems).filter((item) => item.album === key).length;
    return `<button class="gallery-chip ${state.galleryAlbum === key ? "active" : ""} shrink-0 rounded-xl border border-rosewood-100 bg-white px-3 py-2 text-[11px] font-bold text-slate-600" data-gallery-album="${escapeHTML(key)}" type="button">${escapeHTML(label)} <span class="ml-1 opacity-60">${count}</span></button>`;
  }).join("");

  let items = state.galleryTab === "photos" ? photoItems : state.galleryTab === "videos" ? videoItems : favoriteItems;
  items = items.filter((item) => item.album === state.galleryAlbum);

  const folderRoot = $("galleryPeriodFolders");
  if (state.galleryAlbum === "us-together") {
    const periodsMap = new Map();
    items.forEach((item) => {
      const month = String(item.month || "").padStart(2, "0");
      const year = Number(item.year || 0);
      if (!galleryMonthLabel(month) || !year) return;
      const key = `${year}-${month}`;
      const current = periodsMap.get(key) || { key, month, year, label: usTogetherFolderName(month, year), count: 0 };
      current.count += 1;
      periodsMap.set(key, current);
    });
    const periods = [...periodsMap.values()].sort((a, b) => b.key.localeCompare(a.key));
    if (!periods.some((period) => period.key === state.galleryPeriod)) state.galleryPeriod = periods[0]?.key || "";
    folderRoot.classList.toggle("hidden", periods.length === 0);
    folderRoot.classList.toggle("grid", periods.length > 0);
    folderRoot.innerHTML = periods.map((period) => `<button class="folder-card ${state.galleryPeriod === period.key ? "border-rosewood-400 bg-rosewood-50" : "border-rosewood-100 bg-white"} rounded-2xl border p-3 text-left" data-gallery-period="${period.key}" type="button"><span class="text-xl">🗂️</span><strong class="mt-2 block text-xs text-rosewood-950">${escapeHTML(period.label)}</strong><span class="mt-1 block text-[10px] text-slate-400">${period.count} ${period.count === 1 ? "photo" : "photos"}</span></button>`).join("");
    if (state.galleryPeriod) items = items.filter((item) => `${Number(item.year)}-${String(item.month).padStart(2, "0")}` === state.galleryPeriod);
  } else {
    state.galleryPeriod = "";
    folderRoot.classList.add("hidden");
    folderRoot.classList.remove("grid");
    folderRoot.innerHTML = "";
  }

  const query = $("gallerySearch").value.trim().toLowerCase();
  if (query) {
    items = items.filter((item) => [item.title, item.description, item.filename, galleryAlbumLabel(item.type, item.album), galleryPeriodLabel(item), item.authorName]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }

  const sort = $("gallerySort").value;
  items.sort((a, b) => {
    if (sort === "oldest") return String(a.date || "").localeCompare(String(b.date || "")) || Number(a.createdAt || 0) - Number(b.createdAt || 0);
    if (sort === "title") return String(a.title || "").localeCompare(String(b.title || ""), undefined, { numeric: true, sensitivity: "base" });
    return String(b.date || "").localeCompare(String(a.date || "")) || Number(b.createdAt || 0) - Number(a.createdAt || 0);
  });

  const totalPages = Math.max(1, Math.ceil(items.length / state.galleryPageSize));
  state.galleryPage = Math.min(Math.max(1, state.galleryPage), totalPages);
  const startIndex = (state.galleryPage - 1) * state.galleryPageSize;
  const pageItems = items.slice(startIndex, startIndex + state.galleryPageSize);
  $("galleryGrid").innerHTML = pageItems.map(galleryCard).join("");
  $("galleryEmpty").classList.toggle("hidden", items.length > 0);

  const pagination = $("galleryPagination");
  const showPagination = items.length > state.galleryPageSize;
  pagination.classList.toggle("hidden", !showPagination);
  pagination.classList.toggle("flex", showPagination);
  if (showPagination) {
    const first = startIndex + 1;
    const last = Math.min(startIndex + state.galleryPageSize, items.length);
    pagination.innerHTML = `<button class="pressable rounded-xl border border-rosewood-100 bg-white px-3 py-2 text-xs font-bold text-rosewood-800 disabled:opacity-40" data-gallery-page="${state.galleryPage - 1}" ${state.galleryPage === 1 ? "disabled" : ""} type="button">← Previous</button><span class="text-center text-[10px] font-semibold text-slate-500"><strong class="block text-xs text-rosewood-900">Page ${state.galleryPage} of ${totalPages}</strong>${first}–${last} of ${items.length}</span><button class="pressable rounded-xl border border-rosewood-100 bg-white px-3 py-2 text-xs font-bold text-rosewood-800 disabled:opacity-40" data-gallery-page="${state.galleryPage + 1}" ${state.galleryPage === totalPages ? "disabled" : ""} type="button">Next →</button>`;
  } else pagination.innerHTML = "";
  hydrateMedia($("galleryGrid"));
}

function galleryCard(item) {
  const path = galleryMediaPath(item);
  const album = galleryAlbumLabel(item.type, item.album);
  const period = galleryPeriodLabel(item);
  const isVideo = item.type === "video";
  const manageable = canManageGalleryItem(item);
  return `<article class="gallery-card group relative overflow-hidden rounded-2xl border border-rosewood-100 bg-white shadow-sm">
    <button class="block w-full text-left" data-gallery-action="view" data-gallery-id="${escapeHTML(item.id)}" type="button">
      <div class="gallery-media relative overflow-hidden">
        ${isVideo
          ? `<div class="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-rosewood-950 via-rosewood-800 to-rosewood-600 text-white"><span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-xl ring-1 ring-white/20">▶</span><span class="mt-2 max-w-[80%] truncate text-[10px] font-bold text-rosewood-100">${escapeHTML(item.filename)}</span></div><span class="absolute left-2 top-2 rounded-full bg-rosewood-950/75 px-2 py-1 text-[9px] font-bold text-white backdrop-blur">VIDEO</span>`
          : item.driveFileId
            ? `${mediaImageHTML(item, "h-full w-full object-cover", item.title || album, 'loading="lazy" decoding="async"')}<div class="media-fallback hidden h-full w-full items-center justify-center text-center text-2xl text-rosewood-700">♡</div>`
            : `<img class="h-full w-full object-cover" src="${escapeHTML(path)}" alt="${escapeHTML(item.title || album)}" loading="lazy" decoding="async" onerror="this.classList.add('hidden');this.nextElementSibling.classList.remove('hidden');this.nextElementSibling.classList.add('flex')" /><div class="media-fallback hidden h-full w-full items-center justify-center text-center text-2xl text-rosewood-700">♡</div>`}
        <span class="absolute bottom-2 left-2 max-w-[82%] truncate rounded-full bg-white/90 px-2 py-1 text-[9px] font-bold text-rosewood-800 backdrop-blur">${escapeHTML(period ? `${album} · ${period}` : album)}</span>
      </div>
    </button>
    <div class="p-3">
      <button class="block w-full text-left" data-gallery-action="view" data-gallery-id="${escapeHTML(item.id)}" type="button"><h3 class="truncate text-xs font-bold text-rosewood-950">${escapeHTML(item.title || item.filename)}</h3><p class="mt-1 truncate text-[10px] text-slate-400">${escapeHTML(formatDate(item.date))}${period ? ` · ${escapeHTML(period)}` : ""}</p></button>
      ${manageable ? `<div class="gallery-card-actions mt-2 flex justify-end gap-1 border-t border-rosewood-50 pt-2"><button class="rounded-lg px-2 py-1 text-[9px] font-bold text-rosewood-700 hover:bg-rosewood-50" data-gallery-action="edit" data-gallery-id="${escapeHTML(item.id)}" type="button">Edit</button><button class="rounded-lg px-2 py-1 text-[9px] font-bold text-red-600 hover:bg-red-50" data-gallery-action="delete" data-gallery-id="${escapeHTML(item.id)}" type="button">Delete</button></div>` : ""}
    </div>
    <button class="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl bg-white/90 text-sm font-bold ${item.favorite ? "text-rosewood-700" : "text-slate-400"} shadow-sm backdrop-blur" data-gallery-action="favorite" data-gallery-id="${escapeHTML(item.id)}" type="button" aria-label="${item.favorite ? "Remove from favorites" : "Add to favorites"}">${item.favorite ? "♥" : "♡"}</button>
  </article>`;
}

function updateGalleryAlbumOptions(preferredAlbum = '') {
  const type = $('galleryMediaType').value;
  const albums = galleryAlbumsForType(type);
  $('galleryAlbum').innerHTML = Object.entries(albums).map(([key, label]) => `<option value="${escapeHTML(key)}">${escapeHTML(label)}</option>`).join('');
  if (preferredAlbum && albums[preferredAlbum]) $('galleryAlbum').value = preferredAlbum;
  updateGalleryTogetherFields();
}

function updateGalleryTogetherFields(item = null) {
  const active = isUsTogetherAlbum($('galleryMediaType').value, $('galleryAlbum').value);
  const wrapper = $('galleryTogetherPeriodFields');
  wrapper.classList.toggle('hidden', !active);
  wrapper.classList.toggle('grid', active);
  $('galleryTogetherMonth').required = active;
  $('galleryTogetherYear').required = active;

  if (active) {
    const sourceDate = item?.date || $('galleryDate').value || localDateKey();
    const [dateYear, dateMonth] = String(sourceDate).split('-');
    if (!$('galleryTogetherMonth').value) $('galleryTogetherMonth').value = item?.month || dateMonth || String(new Date().getMonth() + 1).padStart(2, '0');
    if (!$('galleryTogetherYear').value) $('galleryTogetherYear').value = item?.year || dateYear || new Date().getFullYear();
    $('galleryTogetherHint').textContent = item?.folderPath
      ? `Current folder: ${item.folderPath}`
      : 'Folder format: Month Year, for example July 2026.';
  }
  updateGalleryPathPreview();
}

function updateGalleryPathPreview() {
  if (!$("galleryPathPreview")) return;
  const id = $("galleryItemId").value;
  const item = id ? galleryItemById(id) : null;
  const selected = state.gallerySelectedFiles || [];
  if (selected.length === 1) {
    $("galleryPathPreview").textContent = `Device file: ${selected[0].file.name}`;
  } else if (selected.length > 1) {
    $("galleryPathPreview").textContent = `${selected.length} files selected for bulk upload`;
  } else if (item?.driveFileId || item?.storagePath) {
    $("galleryPathPreview").textContent = item.driveFileId ? `Google Drive file: ${item.driveFileId}` : `Legacy media: ${item.storagePath}`;
  } else if (item?.isStarter) {
    $("galleryPathPreview").textContent = galleryDisplayPath(item.type, item.album, item.filename, item.month, item.year, item.folderPath);
  } else {
    $("galleryPathPreview").textContent = "Choose files from your device";
  }
}

function renderGalleryUploadPreview() {
  const root = $("galleryUploadPreview");
  if (!root) return;
  const selected = state.gallerySelectedFiles || [];
  if (!selected.length) {
    root.classList.add("hidden");
    root.innerHTML = "";
    return;
  }
  root.classList.remove("hidden");
  root.innerHTML = `<div class="mb-2 flex items-center justify-between gap-2"><p class="text-[10px] font-bold text-rosewood-700">${selected.length} file${selected.length === 1 ? "" : "s"} ready</p><button class="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-rosewood-700 ring-1 ring-rosewood-100" data-clear-gallery-selection type="button">Clear</button></div><div class="gallery-bulk-preview scrollbar-thin">${selected.map(({ file, previewUrl }) => {
    const video = inferredContentType(file).startsWith("video/");
    return `<div class="gallery-bulk-preview-item">${video ? `<div class="flex h-full w-full items-center justify-center bg-gradient-to-br from-rosewood-900 to-rosewood-600 text-2xl text-white">▶</div>` : `<img src="${escapeHTML(previewUrl)}" alt="${escapeHTML(file.name)}" loading="lazy" />`}<span>${escapeHTML(file.name)}</span></div>`;
  }).join("")}</div>`;
}

function openGalleryItemModal(item = null) {
  if (item && !canManageGalleryItem(item)) {
    toast("Only the person who added this item can edit it.", "info");
    return;
  }
  $("galleryItemForm").reset();
  clearGalleryFileSelection();
  $("galleryItemId").value = item?.id || "";
  const suggestedType = item?.type || (state.galleryTab === "videos" ? "video" : "photo");
  $("galleryMediaType").value = suggestedType;
  $("galleryTitle").value = item?.title || "";
  $("galleryDate").value = item?.date || localDateKey();
  $("galleryFilename").value = item?.filename || "";
  $("galleryDescription").value = item?.description || "";
  $("galleryTogetherMonth").value = item?.month || "";
  $("galleryTogetherYear").value = item?.year || "";
  updateGalleryAlbumOptions(item?.album || "");
  updateGalleryTogetherFields(item);
  const input = $("galleryFileInput");
  input.value = "";
  input.accept = suggestedType === "video" ? "video/*" : "image/*";
  input.multiple = !item;
  $("galleryFileHelp").textContent = item?.isStarter
    ? "This starter file stays in your GitHub assets. You can edit its details here."
    : item
      ? "Choose one replacement file only when you want to replace this upload."
      : suggestedType === "video"
        ? "Choose up to 10 videos. The date, album, and caption apply to the whole batch."
        : "Choose up to 30 photos. Images are optimized before upload for faster loading.";
  input.disabled = Boolean(item?.isStarter);
  $("galleryMediaType").disabled = Boolean(item?.isStarter);
  $("galleryAlbum").disabled = Boolean(item?.isStarter);
  $("galleryTogetherMonth").disabled = Boolean(item?.isStarter);
  $("galleryTogetherYear").disabled = Boolean(item?.isStarter);
  if (item) {
    $("galleryUploadPreview").classList.remove("hidden");
    $("galleryUploadPreview").innerHTML = `<div class="flex items-center gap-3 rounded-xl bg-white p-2 ring-1 ring-rosewood-100"><div class="flex h-10 w-10 items-center justify-center rounded-lg bg-rosewood-50 text-lg">${item.type === "video" ? "▶" : "▧"}</div><div class="min-w-0"><p class="truncate text-xs font-bold text-rosewood-950">${escapeHTML(item.filename)}</p><p class="truncate text-[10px] text-slate-400">${item.isStarter ? "Starter asset" : "Current uploaded file"}</p></div></div>`;
  }
  $("galleryItemModalTitle").textContent = item ? (item.isStarter ? "Edit starter media" : "Edit media") : "Add media";
  $("saveGalleryItemBtn").textContent = item ? "Save changes" : "Upload batch";
  $("deleteGalleryFromModalBtn")?.classList.toggle("hidden", !item);
  updateGalleryPathPreview();
  openModal("galleryItemModal");
  setTimeout(() => $(item ? "galleryTitle" : "galleryFileInput").focus(), 80);
}

function galleryBatchTitle(baseTitle, file, index, total) {
  const fileTitle = String(file.name || "Memory").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Memory";
  if (total === 1) return baseTitle || fileTitle;
  return baseTitle ? `${baseTitle} ${index + 1}` : fileTitle;
}

async function saveGalleryItem(event) {
  event.preventDefault();
  const button = $("saveGalleryItemBtn");
  const id = $("galleryItemId").value;
  const existing = id ? galleryItemById(id) : null;
  const type = $("galleryMediaType").value;
  const album = $("galleryAlbum").value;
  const selected = state.gallerySelectedFiles || [];
  const title = $("galleryTitle").value.trim();
  const date = $("galleryDate").value;
  const description = $("galleryDescription").value.trim();
  const usesTogetherPeriod = isUsTogetherAlbum(type, album);
  const month = usesTogetherPeriod ? $("galleryTogetherMonth").value : "";
  const year = usesTogetherPeriod ? Number($("galleryTogetherYear").value) : null;
  const maxFiles = type === "video" ? 10 : 30;

  if (!date || !galleryAlbumsForType(type)[album]) return toast("Complete the date and album.", "error");
  if (existing && !title) return toast("Add a title for this media item.", "error");
  if (!existing && !selected.length) return toast("Choose files from your device.", "error");
  if (selected.length > maxFiles) return toast(`Choose no more than ${maxFiles} ${type === "video" ? "videos" : "photos"} per batch.`, "error");
  if (existing && selected.length > 1) return toast("Choose only one replacement file while editing.", "error");
  if (existing && !existing.isStarter && !selected.length && type !== existing.type) return toast("Choose a replacement file when changing the media type.", "error");
  for (const { file } of selected) {
    const fileError = validateUploadFile(file, type === "video" ? "video" : "image");
    if (fileError) return toast(`${file.name}: ${fileError}`, "error");
  }
  if (usesTogetherPeriod && (!galleryMonthLabel(month) || !Number.isInteger(year) || year < 2000 || year > 2100)) return toast("Choose a valid month and year for Us Together.", "error");
  if (existing && !canManageGalleryItem(existing)) return toast("Only the person who added this item can edit it.", "error");

  const preservedStarterFolder = existing?.isStarter && existing.folderPath && String(existing.month || "") === String(month || "") && Number(existing.year) === year ? existing.folderPath : "";
  const periodData = usesTogetherPeriod ? { month, year, folderPath: preservedStarterFolder || usTogetherFolderName(month, year) } : {};
  const uploadedFiles = [];
  const progress = new Map();
  const updateProgress = () => {
    const total = selected.length || 1;
    const percent = Math.round([...progress.values()].reduce((sum, value) => sum + value, 0) / total);
    $("galleryUploadProgressBar").style.width = `${percent}%`;
    $("galleryUploadProgressText").textContent = selected.length > 1 ? `Uploading ${selected.length} files · ${percent}%` : `Uploading ${percent}%`;
  };
  $("galleryUploadProgress").classList.toggle("hidden", !selected.length);
  setButtonLoading(button, true, selected.length ? `Uploading 0/${selected.length}` : "Saving…");

  try {
    if (existing?.isStarter) {
      const filename = existing.filename || $("galleryFilename").value.trim();
      await set(ref(db, `couples/${state.coupleId}/galleryStarterOverrides/${id}`), {
        type, album, filename, title, date, description, ...periodData,
        updatedBy: state.user.uid,
        updatedByName: state.profile?.displayName || currentMember()?.displayName || "My love",
        updatedAt: serverTimestamp()
      });
    } else if (existing) {
      const file = selected[0]?.file || null;
      let uploaded = null;
      if (file) {
        const albumFolder = usesTogetherPeriod ? `${album}/${usTogetherFolderName(month, year)}` : album;
        const path = `couples/${state.coupleId}/gallery/${type === "video" ? "videos" : "photos"}/${albumFolder}/${id}-${randomId("media")}-${safeFileName(file.name)}`;
        uploaded = await uploadFileToDrive(file, path, (percent) => {
          progress.set(0, percent);
          updateProgress();
        }, "gallery");
        uploadedFiles.push(uploaded);
      }
      const filename = file?.name || existing.filename || $("galleryFilename").value.trim();
      const storageData = uploaded ? {
        driveFileId: uploaded.driveFileId,
        driveWebViewLink: uploaded.driveWebViewLink || "",
        storageUrl: "",
        storagePath: uploaded.path,
        fileSize: uploaded.size,
        contentType: uploaded.type
      } : {
        driveFileId: existing.driveFileId || "",
        driveWebViewLink: existing.driveWebViewLink || "",
        storageUrl: existing.storageUrl || "",
        storagePath: existing.storagePath || "",
        fileSize: Number(existing.fileSize || 0),
        contentType: existing.contentType || ""
      };
      await set(ref(db, `couples/${state.coupleId}/gallery/${id}`), {
        type, album, filename, title, date, description, ...periodData, ...storageData,
        authorId: existing.authorId || state.user.uid,
        authorName: existing.authorName || state.profile?.displayName || currentMember()?.displayName || "My love",
        createdAt: existing.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      if (uploaded && existing.driveFileId && existing.driveFileId !== uploaded.driveFileId) await deleteUploadedMedia(existing);
    } else {
      const albumFolder = usesTogetherPeriod ? `${album}/${usTogetherFolderName(month, year)}` : album;
      const uploadResults = await runWithConcurrency(selected, type === "video" ? 2 : 4, async ({ file }, index) => {
        const itemId = push(ref(db, `couples/${state.coupleId}/gallery`)).key;
        progress.set(index, 1);
        updateProgress();
        const path = `couples/${state.coupleId}/gallery/${type === "video" ? "videos" : "photos"}/${albumFolder}/${itemId}-${randomId("media")}-${safeFileName(file.name)}`;
        const uploaded = await uploadFileToDrive(file, path, (percent) => {
          progress.set(index, percent);
          updateProgress();
        }, "gallery");
        uploadedFiles.push(uploaded);
        setButtonLoading(button, true, `Uploading ${uploadedFiles.length}/${selected.length}`);
        return { itemId, file, uploaded, index };
      });

      const batchUpdates = {};
      for (const { itemId, file, uploaded, index } of uploadResults) {
        batchUpdates[itemId] = {
          type, album,
          filename: file.name,
          title: galleryBatchTitle(title, file, index, selected.length),
          date, description, ...periodData,
          driveFileId: uploaded.driveFileId,
          driveWebViewLink: uploaded.driveWebViewLink || "",
          storageUrl: "",
          storagePath: uploaded.path,
          fileSize: uploaded.size,
          contentType: uploaded.type,
          authorId: state.user.uid,
          authorName: state.profile?.displayName || currentMember()?.displayName || "My love",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
      }
      await update(ref(db, `couples/${state.coupleId}/gallery`), batchUpdates);
    }

    clearGalleryFileSelection();
    state.galleryPage = 1;
    closeModal("galleryItemModal");
    toast(existing?.isStarter ? "Starter media updated." : existing ? "Gallery item updated." : `${selected.length} media item${selected.length === 1 ? "" : "s"} added.`);
  } catch (error) {
    await Promise.allSettled(uploadedFiles.filter((file) => file?.driveFileId).map(deleteUploadedMedia));
    console.error("Gallery batch upload failed", error);
    toast(friendlyError(error), "error");
  } finally {
    $("galleryUploadProgress").classList.add("hidden");
    $("galleryUploadProgressBar").style.width = "0%";
    setButtonLoading(button, false);
  }
}

async function toggleGalleryFavorite(id) {
  const item = galleryItemById(id);
  if (!item) return;
  const favoriteRef = ref(db, `couples/${state.coupleId}/galleryFavorites/${id}/${state.user.uid}`);
  const isFavorite = Boolean(state.couple?.galleryFavorites?.[id]?.[state.user.uid]);
  try {
    if (isFavorite) await remove(favoriteRef);
    else await set(favoriteRef, true);
    if (state.galleryViewerId === id && $('galleryViewerFavoriteBtn')) {
      $('galleryViewerFavoriteBtn').textContent = isFavorite ? '♡ Add to favorites' : '♥ Remove from favorites';
    }
  } catch (error) {
    toast(friendlyError(error), 'error');
  }
}

function openGalleryViewer(id) {
  const item = galleryItemById(id);
  if (!item) return;
  state.galleryViewerId = id;
  const path = galleryMediaPath(item);
  const album = galleryAlbumLabel(item.type, item.album);
  const period = galleryPeriodLabel(item);
  $("galleryViewerTitle").textContent = item.title || item.filename;
  $("galleryViewerFavoriteBtn").classList.remove("hidden");
  $("galleryViewerDetails").classList.remove("hidden");
  $("galleryViewerMedia").innerHTML = item.type === "video"
    ? (item.driveFileId
      ? mediaVideoHTML(item, "max-h-[72vh] w-full rounded-xl object-contain", 'controls playsinline preload="metadata"')
      : `<video class="max-h-[72vh] w-full rounded-xl object-contain" src="${escapeHTML(path)}" controls playsinline preload="metadata">Your browser cannot play this video.</video>`)
    : (item.driveFileId
      ? mediaImageHTML(item, "max-h-[72vh] w-full rounded-xl object-contain", item.title || album)
      : `<img class="max-h-[72vh] w-full rounded-xl object-contain" src="${escapeHTML(path)}" alt="${escapeHTML(item.title || album)}" />`);
  $("galleryViewerDetails").innerHTML = `<div class="flex flex-wrap gap-2"><span class="rounded-full bg-rosewood-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rosewood-700">${escapeHTML(item.type)}</span><span class="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600">${escapeHTML(album)}</span>${period ? `<span class="rounded-full bg-rosewood-50 px-2.5 py-1 text-[10px] font-bold text-rosewood-700">${escapeHTML(period)}</span>` : ""}</div><p class="mt-4 text-sm leading-6 text-slate-600">${escapeHTML(item.description || "No caption added.")}</p><div class="mt-5 space-y-2 border-t border-rosewood-100 pt-4 text-xs"><div class="flex justify-between gap-3"><span class="text-slate-400">Date</span><strong class="text-right text-slate-700">${escapeHTML(formatDate(item.date, { month: "long", day: "numeric", year: "numeric" }))}</strong></div>${period ? `<div class="flex justify-between gap-3"><span class="text-slate-400">Us Together folder</span><strong class="text-right text-slate-700">${escapeHTML(period)}</strong></div>` : ""}<div class="flex justify-between gap-3"><span class="text-slate-400">File</span><strong class="break-all text-right text-slate-700">${escapeHTML(item.filename)}</strong></div><div class="flex justify-between gap-3"><span class="text-slate-400">Storage</span><strong class="text-right text-slate-700">${item.driveFileId ? "Private Google Drive" : item.isStarter ? "GitHub starter asset" : "Legacy upload"}</strong></div><div class="flex justify-between gap-3"><span class="text-slate-400">Added by</span><strong class="text-right text-slate-700">${escapeHTML(item.authorId === state.user.uid ? "You" : item.authorName || partnerDisplayName())}</strong></div></div>`;
  $("galleryViewerFavoriteBtn").textContent = item.favorite ? "♥ Remove from favorites" : "♡ Add to favorites";
  $("galleryViewerFavoriteBtn").dataset.galleryId = id;
  const mine = canManageGalleryItem(item);
  $("galleryOwnerActions").classList.toggle("hidden", !mine);
  $("galleryOwnerActions").classList.toggle("grid", mine);
  $("galleryViewerEditBtn").dataset.galleryId = id;
  $("galleryViewerDeleteBtn").dataset.galleryId = id;
  openModal("galleryViewerModal");
  hydrateMedia($("galleryViewerMedia"), Boolean(item.driveFileId));
}

async function deleteGalleryItem(id) {
  const item = galleryItemById(id);
  if (!item || !canManageGalleryItem(item)) return;
  const confirmed = await confirmAction({
    title: 'Remove this gallery item?',
    message: item.isStarter
      ? "It will disappear from both accounts. The physical starter file in GitHub will remain until you remove it from the repository."
      : "It will be removed from both accounts and permanently deleted from Google Drive.",
    confirmText: 'Remove item',
    icon: '×'
  });
  if (!confirmed) return;
  try {
    if (item.driveFileId && !getGoogleDriveStatus().connected) await connectGoogleDrive({ prompt: "consent" });
    if (item.isStarter) {
      await set(ref(db, `couples/${state.coupleId}/galleryStarterHidden/${id}`), true);
    } else {
      await update(ref(db), {
        [`couples/${state.coupleId}/gallery/${id}`]: null,
        [`couples/${state.coupleId}/galleryFavorites/${id}`]: null
      });
      if (item.driveFileId) await deleteUploadedMedia(item);
    }
    closeModal('galleryViewerModal');
    closeModal('galleryItemModal');
    toast(item.isStarter ? 'Starter media hidden from the gallery.' : 'Gallery item removed.', 'info');
  } catch (error) {
    toast(friendlyError(error), 'error');
  }
}


function chatReplySnapshot(message) {
  if (!message) return null;
  return { id: message.id, senderName: message.senderName || "Partner", text: truncate(message.text || (message.attachment ? "Photo" : "Message"), 90) };
}

function currentSmartReplyMessage() {
  return [...messagesArray()].reverse().find((message) => message.senderId !== state.user?.uid) || null;
}

function hideSmartReplies({ dismiss = false } = {}) {
  const panel = $("smartRepliesPanel");
  panel?.classList.add("hidden");
  clearTimeout(state.smartRepliesTimer);
  state.smartRepliesTimer = null;
  if (dismiss) state.smartRepliesDismissedFor = currentSmartReplyMessage()?.id || "";
}

function renderSmartReplies() {
  const panel = $("smartRepliesPanel");
  const root = $("smartReplies");
  if (!panel || !root || !state.user) return;
  const lastPartnerMessage = currentSmartReplyMessage();
  const messageId = lastPartnerMessage?.id || "";
  const inputHasText = Boolean($("chatInput")?.value.trim());
  const partner = partnerMember();
  const partnerTyping = partner ? state.couple?.chatTyping?.[partner.uid] : null;
  const partnerIsTyping = Boolean(partnerTyping?.active && Number(partnerTyping.updatedAt || 0) > Date.now() - 12000);
  if (!messageId || inputHasText || partnerIsTyping || state.chatEditingId || state.chatReplyId || state.smartRepliesDismissedFor === messageId) {
    panel.classList.add("hidden");
    return;
  }

  const text = String(lastPartnerMessage?.text || "").toLowerCase();
  let replies = ["I love you 💗", "Tell me more", "Miss you", "Okay, noted ✨"];
  if (text.includes("where") || text.includes("nasaan")) replies = ["On my way", "I’m here", "I’ll update you", "Give me a minute"];
  else if (text.includes("love") || text.includes("miss")) replies = ["I love you more 💗", "Miss you too", "See you soon", "Sending a hug"];
  else if (String(lastPartnerMessage?.text || "").includes("?")) replies = ["Yes 💗", "Tell me more", "Let me think", "Sounds good"];
  const replySignature = `${messageId}|${replies.join("|")}`;
  if (root.dataset.replySignature !== replySignature) {
    root.dataset.replySignature = replySignature;
    root.innerHTML = replies.map((reply) => `<button class="pressable shrink-0 rounded-full border border-rosewood-100 bg-white px-3 py-1.5 text-[10px] font-bold text-rosewood-700" data-smart-reply="${escapeHTML(reply)}" type="button">${escapeHTML(reply)}</button>`).join("");
  }
  panel.classList.remove("hidden");

  if (state.lastSmartReplyMessageId !== messageId) {
    state.lastSmartReplyMessageId = messageId;
    clearTimeout(state.smartRepliesTimer);
    state.smartRepliesTimer = setTimeout(() => hideSmartReplies({ dismiss: true }), 8000);
  }
}

function chatMessageSignature(message) {
  const value = JSON.stringify({
    text: message.text || "",
    senderId: message.senderId || "",
    senderName: message.senderName || "",
    replyTo: message.replyTo || null,
    attachment: message.attachment || null,
    reactions: message.reactions || null,
    createdAt: Number(message.createdAt || 0),
    updatedAt: Number(message.updatedAt || 0),
    editedAt: Number(message.editedAt || 0)
  });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function chatMessageHTML(message) {
  const mine = message.senderId === state.user.uid;
  const liked = Boolean(message.reactions?.[state.user.uid]);
  const hearts = Object.keys(message.reactions || {}).length;
  const signature = chatMessageSignature(message);
  const hasAttachment = Boolean(message.attachment?.url || message.attachment?.driveFileId);
  const attachment = hasAttachment ? `<button class="mt-2 block overflow-hidden rounded-xl" data-chat-image="${escapeHTML(message.attachment?.url || "")}" data-chat-drive-file-id="${escapeHTML(message.attachment?.driveFileId || "")}" type="button">${mediaImageHTML(message.attachment, "max-h-72 w-full object-cover", "Chat attachment", 'loading="lazy"')}</button>` : "";
  const reply = message.replyTo ? `<div class="mb-2 rounded-lg border-l-2 ${mine ? "border-white/45 bg-white/10" : "border-rosewood-300 bg-rosewood-50"} px-2 py-1.5 text-[10px]"><strong class="block">${escapeHTML(message.replyTo.senderName || "Message")}</strong><span class="block truncate opacity-75">${escapeHTML(message.replyTo.text || "")}</span></div>` : "";
  return `<div class="message-bubble flex ${mine ? "justify-end" : "justify-start"}" data-message-id="${escapeHTML(message.id)}" data-message-signature="${escapeHTML(signature)}"><div class="max-w-[86%] sm:max-w-[72%]"><div class="rounded-2xl px-3.5 py-2.5 ${mine ? "rounded-br-md bg-rosewood-700 text-white" : "rounded-bl-md border border-rosewood-100 bg-white text-slate-700"}">${reply}${message.text ? `<p class="whitespace-pre-wrap break-words text-sm leading-5">${escapeHTML(message.text)}</p>` : ""}${attachment}<div class="mt-1.5 flex items-center justify-between gap-3 text-[9px] ${mine ? "text-rosewood-100" : "text-slate-400"}"><span>${escapeHTML(formatTimestamp(message.updatedAt || message.createdAt))}${message.editedAt ? " · edited" : ""}</span>${hearts ? `<span>♥ ${hearts}</span>` : ""}</div></div><div class="mt-1 flex ${mine ? "justify-end" : "justify-start"} gap-1"><button class="rounded-lg px-2 py-1 text-[9px] font-bold text-slate-400 hover:bg-rosewood-50" data-chat-action="reply" data-message-id="${escapeHTML(message.id)}" type="button">Reply</button><button class="rounded-lg px-2 py-1 text-[9px] font-bold ${liked ? "text-rosewood-700" : "text-slate-400"} hover:bg-rosewood-50" data-chat-action="heart" data-message-id="${escapeHTML(message.id)}" type="button">${liked ? "♥" : "♡"}</button>${mine ? `<button class="rounded-lg px-2 py-1 text-[9px] font-bold text-slate-400 hover:bg-rosewood-50" data-chat-action="edit" data-message-id="${escapeHTML(message.id)}" type="button">Edit</button><button class="rounded-lg px-2 py-1 text-[9px] font-bold text-slate-400 hover:bg-red-50 hover:text-red-600" data-chat-action="delete" data-message-id="${escapeHTML(message.id)}" type="button">Delete</button>` : ""}</div></div></div>`;
}

function htmlToElement(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function patchChatMessages(root, messages) {
  const wantedIds = new Set(messages.map((message) => message.id));
  root.querySelectorAll("[data-message-id]").forEach((node) => {
    if (!wantedIds.has(node.dataset.messageId)) node.remove();
  });

  if (!messages.length) {
    if (!root.querySelector("[data-chat-empty]")) {
      root.innerHTML = `<div data-chat-empty class="flex h-full min-h-40 flex-col items-center justify-center text-center"><div class="text-4xl">💌</div><h3 class="mt-3 font-display text-xl font-bold text-rosewood-950">Start your private conversation</h3><p class="mt-1 max-w-sm text-sm leading-6 text-slate-500">Messages, photos, replies, reactions, and typing status sync instantly between both accounts.</p></div>`;
    }
    return;
  }
  root.querySelector("[data-chat-empty]")?.remove();

  messages.forEach((message, index) => {
    const signature = chatMessageSignature(message);
    let node = root.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
    if (!node) {
      node = htmlToElement(chatMessageHTML(message));
      const nextMessage = messages[index + 1];
      const nextNode = nextMessage ? root.querySelector(`[data-message-id="${CSS.escape(nextMessage.id)}"]`) : null;
      root.insertBefore(node, nextNode || null);
      return;
    }
    if (node.dataset.messageSignature !== signature) {
      const replacement = htmlToElement(chatMessageHTML(message));
      node.replaceWith(replacement);
    }
  });

  const currentOrder = [...root.querySelectorAll("[data-message-id]")].map((node) => node.dataset.messageId).join("|");
  const wantedOrder = messages.map((message) => message.id).join("|");
  if (currentOrder !== wantedOrder) {
    messages.forEach((message) => {
      const node = root.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
      if (node) root.appendChild(node);
    });
  }
}

function renderChatSeenState(messages) {
  const root = $("chatMessages");
  if (!root) return;
  const currentSeen = root.querySelector("[data-chat-seen]");
  const partner = partnerMember();
  const partnerReadAt = Number(partner ? state.couple?.chatRead?.[partner.uid] || 0 : 0);
  const latestOwn = partner
    ? [...messages].reverse().find((message) => message.senderId === state.user.uid && Number(message.createdAt || 0) > 0)
    : null;
  const shouldShow = Boolean(latestOwn && partnerReadAt >= Number(latestOwn.createdAt || 0));

  if (!shouldShow) {
    currentSeen?.remove();
    return;
  }
  const label = `Seen by ${partnerDisplayName()}`;
  if (currentSeen?.dataset.forMessage === latestOwn.id && currentSeen.textContent === label) return;
  currentSeen?.remove();
  const bubble = root.querySelector(`[data-message-id="${CSS.escape(latestOwn.id)}"] > div`);
  if (!bubble) return;
  const seen = document.createElement("div");
  seen.dataset.chatSeen = "true";
  seen.dataset.forMessage = latestOwn.id;
  seen.className = "mt-1 pr-1 text-right text-[9px] font-semibold text-rosewood-500";
  seen.textContent = label;
  bubble.appendChild(seen);
}

function updateChatScrollButton() {
  const root = $("chatMessages");
  const button = $("chatScrollBottomBtn");
  if (!root || !button) return;
  const awayFromBottom = root.scrollHeight - root.scrollTop - root.clientHeight > 180;
  button.classList.toggle("hidden", !awayFromBottom);
}

function renderChat() {
  if (!$("chatMessages") || !state.couple || !state.user) return;
  const messages = messagesArray();
  const root = $("chatMessages");
  const nearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 120;
  const newest = messages[messages.length - 1];
  const newOwnMessage = messages.length > state.chatRenderedCount && newest?.senderId === state.user.uid;
  const shouldScroll = state.chatForceScroll || state.chatRenderedCount === 0 || nearBottom || newOwnMessage;

  patchChatMessages(root, messages);
  const partner = partnerMember();
  const online = partner && state.couple?.presence?.[partner.uid]?.online === true;
  $("chatPartnerAvatar").textContent = partner ? initials(partnerDisplayName()) : "♡";
  $("chatStatusText").textContent = partner ? `${partnerDisplayName()} is ${online ? "online now" : "currently offline"}.` : "Your chat will be ready when your partner joins.";
  renderChatTyping();
  renderSmartReplies();
  renderChatBadges();
  renderChatSeenState(messages);
  if (shouldScroll) requestAnimationFrame(() => {
    root.scrollTop = root.scrollHeight;
    updateChatScrollButton();
  });
  else updateChatScrollButton();
  state.chatRenderedCount = messages.length;
  state.chatForceScroll = false;
  if (state.currentView === "messages") markChatRead();
  hydrateMedia(root);
}

function renderChatBadges() {
  const lastRead = Number(state.couple?.chatRead?.[state.user?.uid] || 0);
  const unread = messagesArray().filter((message) => message.senderId !== state.user?.uid && Number(message.createdAt || 0) > lastRead).length;
  [$("desktopChatBadge"), $("mobileChatBadge")].forEach((badge) => {
    if (!badge) return;
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.classList.toggle("hidden", unread === 0);
  });
}

async function markChatRead() {
  if (state.currentView !== "messages" || !state.coupleId || !state.user) return;
  const latest = [...messagesArray()].reverse().find((message) => message.senderId !== state.user.uid);
  const latestTime = Number(latest?.createdAt || 0);
  const current = Number(state.couple?.chatRead?.[state.user.uid] || 0);
  if (!latestTime || latestTime <= current) return;
  try { await set(ref(db, `couples/${state.coupleId}/chatRead/${state.user.uid}`), latestTime); } catch { /* non-critical */ }
}

function renderChatTyping() {
  const partner = partnerMember();
  const typing = partner ? state.couple?.chatTyping?.[partner.uid] : null;
  const recent = typing?.active && Number(typing.updatedAt || 0) > Date.now() - 12000;
  $("chatTypingIndicator")?.classList.toggle("hidden", !recent);
  if (recent) $("chatTypingIndicator").textContent = `${partnerDisplayName()} is typing…`;
}

async function setChatTyping(active, { force = false } = {}) {
  if (!state.coupleId || !state.user) return;
  clearTimeout(state.chatTypingTimer);
  state.chatTypingTimer = null;

  const now = Date.now();
  if (active) {
    // Do not write to Firebase on every keystroke. One initial write plus an
    // occasional heartbeat keeps the indicator live without repeatedly
    // re-rendering the conversation on both devices.
    const needsHeartbeat = !state.chatTypingActive || now - state.chatTypingLastWrite > 4500;
    state.chatTypingActive = true;
    state.chatTypingTimer = setTimeout(() => setChatTyping(false, { force: true }), 2200);
    if (!needsHeartbeat && !force) return;
  } else {
    if (!state.chatTypingActive && !force) return;
    state.chatTypingActive = false;
  }

  state.chatTypingLastWrite = now;
  try {
    await set(ref(db, `couples/${state.coupleId}/chatTyping/${state.user.uid}`), {
      active,
      updatedAt: serverTimestamp()
    });
  } catch {
    // Typing presence is helpful but non-critical; sending messages still works.
  }
}

function cancelChatMode(clearText = false) {
  state.chatReplyId = null;
  state.chatEditingId = null;
  state.chatExistingAttachment = null;
  state.chatRemoveExistingAttachment = false;
  state.chatAttachmentFile = null;
  if ($("chatAttachmentInput")) $("chatAttachmentInput").value = "";
  $("chatReplyBanner")?.classList.add("hidden");
  $("chatReplyBanner")?.classList.remove("flex");
  if (clearText) {
    $("chatInput").value = "";
    $("chatInput").style.height = "auto";
  }
  $("sendChatBtn").textContent = "Send";
  renderChatAttachmentPreview();
  if (!clearText) renderSmartReplies();
}

function setChatReply(message) {
  hideSmartReplies();
  state.chatReplyId = message?.id || null;
  state.chatEditingId = null;
  state.chatExistingAttachment = null;
  state.chatRemoveExistingAttachment = false;
  $("sendChatBtn").textContent = "Send";
  $("chatReplyText").textContent = `Replying to ${message?.senderId === state.user.uid ? "yourself" : message?.senderName || partnerDisplayName()}: ${truncate(message?.text || "Photo", 65)}`;
  $("chatReplyBanner").classList.remove("hidden");
  $("chatReplyBanner").classList.add("flex");
  $("chatInput").focus();
}

function editChatMessage(message) {
  if (!message || message.senderId !== state.user.uid) return;
  hideSmartReplies();
  state.chatAttachmentFile = null;
  $("chatAttachmentInput").value = "";
  state.chatExistingAttachment = message.attachment || null;
  state.chatRemoveExistingAttachment = false;
  state.chatEditingId = message.id;
  state.chatReplyId = null;
  $("chatInput").value = message.text || "";
  $("chatInput").style.height = "auto";
  $("chatInput").style.height = `${Math.min($("chatInput").scrollHeight, 112)}px`;
  $("sendChatBtn").textContent = "Save";
  $("chatReplyText").textContent = "Editing your message and attachment";
  $("chatReplyBanner").classList.remove("hidden");
  $("chatReplyBanner").classList.add("flex");
  renderChatAttachmentPreview();
  $("chatInput").focus();
}

function renderChatAttachmentPreview() {
  const root = $("chatAttachmentPreview");
  if (!root) return;
  const file = state.chatAttachmentFile;
  const existing = state.chatExistingAttachment;
  if (file) {
    root.classList.remove("hidden");
    root.innerHTML = `<div class="flex items-center justify-between gap-3"><div class="min-w-0"><p class="truncate text-xs font-bold text-rosewood-950">${escapeHTML(file.name)}</p><p class="text-[10px] text-slate-400">${state.chatEditingId ? "Replacement photo ready" : "Photo ready to upload"}</p></div><button class="rounded-lg bg-white px-2 py-1 text-xs font-bold text-rosewood-800" data-remove-chat-attachment type="button">×</button></div>`;
    return;
  }
  if (state.chatEditingId && existing && !state.chatRemoveExistingAttachment) {
    root.classList.remove("hidden");
    root.innerHTML = `<div class="flex items-center justify-between gap-3"><div class="min-w-0"><p class="truncate text-xs font-bold text-rosewood-950">${escapeHTML(existing.name || "Attached photo")}</p><p class="text-[10px] text-slate-400">Current attachment · choose another photo to replace it</p></div><button class="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600" data-remove-chat-existing-attachment type="button">Remove</button></div>`;
    return;
  }
  root.classList.add("hidden");
  root.innerHTML = "";
}

async function sendChatMessage(event) {
  event.preventDefault();
  const text = $("chatInput").value.trim();
  const file = state.chatAttachmentFile;
  const button = $("sendChatBtn");
  if (state.chatEditingId) {
    const messageId = state.chatEditingId;
    const message = state.couple?.messages?.[messageId];
    const existingAttachment = message?.attachment || null;
    if (!message || message.senderId !== state.user.uid) return;
    if (!text && !file && (!existingAttachment || state.chatRemoveExistingAttachment)) return toast("Keep some text or a photo, or delete the message instead.", "info");
    if (file) {
      const error = validateUploadFile(file, "image");
      if (error) return toast(error, "error");
    }
    let replacement = null;
    let success = false;
    setButtonLoading(button, true, file ? "Uploading…" : "Saving…");
    try {
      if (file) {
        const uploaded = await uploadFileToDrive(file, `couples/${state.coupleId}/chat/${state.user.uid}/${messageId}/${randomId("photo")}-${safeFileName(file.name)}`, () => {}, "chat");
        replacement = { url: "", path: uploaded.path, driveFileId: uploaded.driveFileId, driveWebViewLink: uploaded.driveWebViewLink || "", name: uploaded.name, size: uploaded.size, type: uploaded.type };
      }
      const attachment = replacement || (state.chatRemoveExistingAttachment ? null : existingAttachment);
      await update(ref(db, `couples/${state.coupleId}/messages/${messageId}`), { text, attachment, editedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      success = true;
      if ((replacement || state.chatRemoveExistingAttachment) && existingAttachment?.driveFileId && existingAttachment.driveFileId !== replacement?.driveFileId) {
        try {
          if (!getGoogleDriveStatus().connected) await connectGoogleDrive({ prompt: "consent" });
          await deleteUploadedMedia(existingAttachment);
        } catch (cleanupError) {
          console.warn("Old chat attachment cleanup failed", cleanupError);
          toast("Message updated, but the old Drive photo could not be cleaned up yet.", "info");
        }
      }
      toast("Message updated.");
    } catch (error) {
      if (!success && replacement?.driveFileId) {
        try { await deleteUploadedMedia(replacement); } catch { /* best-effort rollback */ }
      }
      toast(friendlyError(error), "error");
    } finally {
      setButtonLoading(button, false);
      if (success) cancelChatMode(true);
      else $("sendChatBtn").textContent = "Save";
    }
    return;
  }
  if (!text && !file) return;
  if (file) {
    const error = validateUploadFile(file, "image");
    if (error) return toast(error, "error");
  }
  const messageRef = push(ref(db, `couples/${state.coupleId}/messages`));
  let attachment = null;
  setButtonLoading(button, true, file ? "Uploading…" : "Sending…");
  try {
    if (file) {
      const uploaded = await uploadFileToDrive(file, `couples/${state.coupleId}/chat/${state.user.uid}/${messageRef.key}/${randomId("photo")}-${safeFileName(file.name)}`, () => {}, "chat");
      attachment = { url: "", path: uploaded.path, driveFileId: uploaded.driveFileId, driveWebViewLink: uploaded.driveWebViewLink || "", name: uploaded.name, size: uploaded.size, type: uploaded.type };
    }
    const replyMessage = state.chatReplyId ? { id: state.chatReplyId, ...state.couple?.messages?.[state.chatReplyId] } : null;
    await set(messageRef, {
      text,
      senderId: state.user.uid,
      senderName: state.profile?.displayName || currentMember()?.displayName || "My love",
      replyTo: chatReplySnapshot(replyMessage),
      attachment,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    state.chatAttachmentFile = null;
    $("chatAttachmentInput").value = "";
    state.smartRepliesDismissedFor = currentSmartReplyMessage()?.id || "";
    hideSmartReplies();
    renderChatAttachmentPreview();
    cancelChatMode(true);
    setChatTyping(false);
  } catch (error) {
    if (attachment?.driveFileId) await deleteUploadedMedia(attachment);
    toast(friendlyError(error), "error");
  } finally { setButtonLoading(button, false); }
}

async function toggleChatHeart(id) {
  const current = state.couple?.messages?.[id]?.reactions?.[state.user.uid];
  const heartRef = ref(db, `couples/${state.coupleId}/messages/${id}/reactions/${state.user.uid}`);
  try { current ? await remove(heartRef) : await set(heartRef, true); } catch (error) { toast(friendlyError(error), "error"); }
}

async function deleteChatMessage(id) {
  const message = state.couple?.messages?.[id];
  if (!message || message.senderId !== state.user.uid) return;
  const confirmed = await confirmAction({ title: "Delete this message?", message: "It will be removed from both accounts, including its attached photo.", confirmText: "Delete message", icon: "×" });
  if (!confirmed) return;
  try {
    if (message.attachment?.driveFileId && !getGoogleDriveStatus().connected) await connectGoogleDrive({ prompt: "consent" });
    await remove(ref(db, `couples/${state.coupleId}/messages/${id}`));
    if (message.attachment?.driveFileId) await deleteUploadedMedia(message.attachment);
    if (state.chatEditingId === id || state.chatReplyId === id) cancelChatMode(true);
  } catch (error) { toast(friendlyError(error), "error"); }
}

function renderCalendar() {
  if (!state.couple) return;
  const year = state.calendarCursor.getFullYear();
  const month = state.calendarCursor.getMonth();
  $("calendarMonthLabel").textContent = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(state.calendarCursor);
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const entries = entriesArray();
  const dateSet = new Set(entries.map((entry) => entry.date));
  const today = localDateKey();
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    const day = i - firstDay + 1;
    if (day < 1 || day > daysInMonth) {
      cells.push('<div class="calendar-day rounded-xl bg-slate-50/50"></div>');
      continue;
    }
    const dateKey = localDateKey(new Date(year, month, day));
    const selected = state.selectedDate === dateKey;
    const isToday = dateKey === today;
    cells.push(`<button class="calendar-day relative rounded-xl border p-2 text-left text-xs font-bold transition ${selected ? "border-rosewood-500 bg-rosewood-100 text-rosewood-900" : isToday ? "border-rosewood-200 bg-rosewood-50 text-rosewood-800" : "border-rosewood-50 bg-white text-slate-600 hover:border-rosewood-200 hover:bg-rosewood-50"} ${dateSet.has(dateKey) ? "has-entry" : ""}" data-calendar-date="${dateKey}" type="button"><span>${day}</span></button>`);
  }
  $("calendarGrid").innerHTML = cells.join("");
  renderSelectedDateEntries();
}

function renderSelectedDateEntries() {
  const dateKey = state.selectedDate;
  if (!dateKey) {
    $("selectedDateLabel").textContent = "Choose a date";
    $("selectedDateEntries").innerHTML = '<p class="rounded-2xl border border-dashed border-rosewood-200 p-5 text-center text-xs leading-5 text-slate-500">Select a day to see the memories written on it.</p>';
    $("addForSelectedDateBtn").classList.add("hidden");
    return;
  }
  const entries = entriesArray().filter((entry) => entry.date === dateKey);
  $("selectedDateLabel").textContent = formatDate(dateKey, { weekday: "long", month: "long", day: "numeric" });
  $("selectedDateEntries").innerHTML = entries.length
    ? entries.map((entry) => {
      const mine = entry.authorId === state.user.uid;
      return `<article class="rounded-2xl border border-rosewood-100 bg-white p-3"><button class="w-full text-left" data-entry-action="view" data-entry-id="${escapeHTML(entry.id)}" type="button"><div class="flex items-center justify-between gap-2"><strong class="truncate text-xs text-rosewood-950">${escapeHTML(entry.title)}</strong><span>${MOODS[entry.mood]?.emoji || "♡"}</span></div><p class="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">${escapeHTML(truncate(entry.body, 100))}</p></button>${mine ? `<div class="mt-2 flex justify-end gap-1 border-t border-rosewood-50 pt-2"><button class="rounded-lg px-2 py-1 text-[9px] font-bold text-rosewood-700 hover:bg-rosewood-50" data-entry-action="edit" data-entry-id="${escapeHTML(entry.id)}" type="button">Edit</button><button class="rounded-lg px-2 py-1 text-[9px] font-bold text-red-600 hover:bg-red-50" data-entry-action="delete" data-entry-id="${escapeHTML(entry.id)}" type="button">Delete</button></div>` : ""}</article>`;
    }).join("")
    : '<p class="rounded-2xl border border-dashed border-rosewood-200 p-5 text-center text-xs leading-5 text-slate-500">No entry for this day yet.</p>';
  $("addForSelectedDateBtn").classList.remove("hidden");
}

function renderInsights() {
  const stats = calculateStats();
  $("insightTotal").textContent = stats.entries.length;
  $("insightHearts").textContent = stats.hearts;
  $("insightActiveDays").textContent = stats.activeDays.length;
  $("insightStreak").textContent = stats.streak;

  const monthPrefix = localDateKey().slice(0, 7);
  const monthEntries = stats.entries.filter((entry) => String(entry.date || "").startsWith(monthPrefix));
  const moodCounts = Object.fromEntries(Object.keys(MOODS).map((key) => [key, 0]));
  monthEntries.forEach((entry) => { if (moodCounts[entry.mood] !== undefined) moodCounts[entry.mood] += 1; });
  const maxMood = Math.max(1, ...Object.values(moodCounts));
  $("moodInsight").innerHTML = Object.entries(MOODS).map(([key, mood]) => insightBar(`${mood.emoji} ${mood.label}`, moodCounts[key], maxMood)).join("");

  const categoryCounts = Object.fromEntries(Object.keys(CATEGORIES).map((key) => [key, 0]));
  stats.entries.forEach((entry) => { if (categoryCounts[entry.category] !== undefined) categoryCounts[entry.category] += 1; });
  const maxCategory = Math.max(1, ...Object.values(categoryCounts));
  $("categoryInsight").innerHTML = Object.entries(CATEGORIES).map(([key, label]) => insightBar(label, categoryCounts[key], maxCategory)).join("");
}

function insightBar(label, value, max) {
  const width = Math.round((value / max) * 100);
  return `<div><div class="mb-1.5 flex items-center justify-between text-xs"><span class="font-semibold text-slate-600">${escapeHTML(label)}</span><strong class="text-rosewood-800">${value}</strong></div><div class="h-2 overflow-hidden rounded-full bg-rosewood-50"><div class="h-full rounded-full bg-gradient-to-r from-rosewood-300 to-rosewood-600" style="width:${width}%"></div></div></div>`;
}

function renderSettings() {
  if (!state.couple || !state.profile) return;
  $("settingsDisplayName").value = state.profile.displayName || currentMember()?.displayName || "";
  $("settingsCoupleName").value = state.couple.name || "";
  $("settingsAnniversary").value = state.couple.anniversary || "";
  $("settingsNickname").value = state.couple?.nicknames?.[state.user.uid] || "";
  $("settingsInviteCode").textContent = state.couple.inviteCode || "------";
  $("regenerateCodeBtn").classList.toggle("hidden", !isOwner());
  if ($("settingsThemeToggle")) $("settingsThemeToggle").textContent = state.theme === "dark" ? "Use light mode" : "Use dark mode";
  renderVideoMigrationSettingsStatus();
}

function renderTyping() {
  const partner = partnerMember();
  const typingData = partner ? state.couple?.typing?.[partner.uid] : null;
  const isRecent = typingData?.active && Number(typingData.updatedAt || 0) > Date.now() - 12000;
  $("typingCard").classList.toggle("hidden", !isRecent);
  if (isRecent) $("typingText").textContent = `${partnerDisplayName()} is writing…`;
}

async function setTyping(active) {
  if (!state.coupleId || !state.user) return;
  clearTimeout(state.typingTimer);
  try {
    await set(ref(db, `couples/${state.coupleId}/typing/${state.user.uid}`), {
      active,
      updatedAt: serverTimestamp()
    });
  } catch {
    // Typing status is non-critical.
  }
  if (active) {
    state.typingTimer = setTimeout(() => setTyping(false), 1800);
  }
}

function openMemoryModal(entry) {
  if (!entry) return;
  const photos = entryPhotosArray(entry);
  const mood = MOODS[entry.mood] || MOODS.loved;
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  const mine = entry.authorId === state.user.uid;
  const deck = photos.length ? `<div class="mb-5"><button class="memory-photo-deck block w-full" data-memory-photo-deck type="button" aria-label="Spread memory photos">${photos.map((photo, index) => {
    const rotation = ((index % 5) - 2) * 3.5;
    const offset = ((index % 5) - 2) * 7;
    return `<span class="memory-photo-card" style="--deck-rotation:${rotation}deg;--deck-offset:${offset}px;z-index:${photos.length - index}">${mediaImageHTML(photo, "h-full w-full object-cover", `Memory photo ${index + 1}`, 'loading="lazy"')}</span>`;
  }).join("")}</button><p class="mt-2 text-center text-[10px] font-semibold text-slate-400">${photos.length > 1 ? `Tap the deck to spread ${photos.length} photos` : "Tap the photo to view it clearly"}</p></div>` : "";
  $("memoryModalTitle").textContent = entry.title || "Diary entry";
  $("memoryModalContent").innerHTML = `${deck}<div class="flex flex-wrap items-center gap-2"><span class="rounded-full bg-rosewood-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rosewood-700">${escapeHTML(CATEGORIES[entry.category] || "Memory")}</span><span class="text-sm">${mood.emoji} ${escapeHTML(mood.label)}</span></div><p class="mt-4 whitespace-pre-line break-words text-sm leading-7 text-slate-600">${escapeHTML(entry.body || "")}</p>${tags.length ? `<div class="mt-4 flex flex-wrap gap-1.5">${tags.map((tag) => `<span class="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">#${escapeHTML(tag)}</span>`).join("")}</div>` : ""}<div class="mt-5 flex items-center justify-between border-t border-rosewood-100 pt-4"><div><p class="text-xs font-bold text-rosewood-900">${escapeHTML(mine ? "Written by you" : `Written by ${partnerDisplayName()}`)}</p><p class="mt-0.5 text-[10px] text-slate-400">${escapeHTML(formatDate(entry.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" }))}</p></div>${mine ? `<div class="flex gap-2"><button class="rounded-xl border border-rosewood-100 bg-white px-3 py-2 text-xs font-bold text-rosewood-700" data-entry-action="edit" data-entry-id="${escapeHTML(entry.id)}" type="button">Edit</button><button class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-600" data-entry-action="delete" data-entry-id="${escapeHTML(entry.id)}" type="button">Delete</button></div>` : ""}</div>`;
  openModal("memoryModal");
  hydrateMedia($("memoryModalContent"), photos.some((photo) => photo.driveFileId));
}

function openEntryModal(entry = null, preset = {}) {
  const mine = !entry || entry.authorId === state.user.uid;
  if (entry && !mine) return toast("Only the writer can edit this entry.", "info");
  $("entryForm").reset();
  clearEntryPhotoState();
  state.entryExistingPhotos = entryPhotosArray(entry).filter((photo) => photo.id !== "legacy-photo" || photo.path);
  $("entryId").value = entry?.id || "";
  $("entryTitle").value = entry?.title || preset.title || "";
  $("entryDate").value = entry?.date || preset.date || localDateKey();
  $("entryBody").value = entry?.body || preset.body || "";
  $("entryCategory").value = entry?.category || preset.category || "memory";
  $("entryMood").value = entry?.mood || preset.mood || state.couple?.moods?.[state.user.uid]?.mood || "loved";
  $("entryTags").value = Array.isArray(entry?.tags) ? entry.tags.join(", ") : "";
  $("entryModalTitle").textContent = entry ? "Edit memory" : "New memory";
  $("saveEntryBtn").textContent = entry ? "Save changes" : "Save memory";
  $("deleteEntryFromModalBtn")?.classList.toggle("hidden", !entry);
  $("entryCharCount").textContent = `${$("entryBody").value.length} / 4000`;
  renderEntryPhotoPreview();
  openModal("entryModal");
  setTimeout(() => $(entry ? "entryBody" : "entryTitle").focus(), 80);
}

async function saveEntry(event) {
  event.preventDefault();
  const button = $("saveEntryBtn");
  const id = $("entryId").value;
  const entryId = id || push(ref(db, `couples/${state.coupleId}/entries`)).key;
  const existing = id ? state.couple?.entries?.[id] : null;
  const title = $("entryTitle").value.trim();
  const body = $("entryBody").value.trim();
  const date = $("entryDate").value;
  const category = $("entryCategory").value;
  const mood = $("entryMood").value;
  const tags = $("entryTags").value.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean).slice(0, 10);
  if (!title || !body || !date) return toast("Please complete the title, date, and entry text.", "error");
  if (existing && existing.authorId !== state.user.uid) return toast("Only the writer can edit this entry.", "error");

  const uploadedPhotos = [];
  const totalUploads = state.entrySelectedFiles.length;
  $("entryUploadProgress").classList.toggle("hidden", totalUploads === 0);
  setButtonLoading(button, true, totalUploads ? "Uploading…" : "Saving…");
  try {
    if (state.entryRemovedPhotos.some((photo) => photo.driveFileId) && !getGoogleDriveStatus().connected) await connectGoogleDrive({ prompt: "consent" });
    const entryProgress = new Map();
    const results = await runWithConcurrency(state.entrySelectedFiles, 3, async (selected, index) => {
      const path = `couples/${state.coupleId}/diary/${state.user.uid}/${entryId}/${randomId("photo")}-${safeFileName(selected.file.name)}`;
      const uploaded = await uploadFileToDrive(selected.file, path, (percent) => {
        entryProgress.set(index, percent);
        const overall = Math.round([...entryProgress.values()].reduce((sum, value) => sum + value, 0) / Math.max(1, totalUploads));
        $("entryUploadProgressBar").style.width = `${overall}%`;
        $("entryUploadProgressText").textContent = `Optimizing and uploading ${totalUploads} photo${totalUploads === 1 ? "" : "s"} · ${overall}%`;
      }, "diary");
      return { id: randomId("photo"), ...uploaded };
    });
    uploadedPhotos.push(...results);
    const finalPhotos = [...state.entryExistingPhotos, ...uploadedPhotos];
    const entryData = {
      title, body, date, category, mood, tags,
      photos: photosObject(finalPhotos),
      imageUrl: null,
      authorId: existing?.authorId || state.user.uid,
      authorName: existing?.authorName || state.profile?.displayName || currentMember()?.displayName || "My love",
      createdAt: existing?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await set(ref(db, `couples/${state.coupleId}/entries/${entryId}`), entryData);
    await Promise.all(state.entryRemovedPhotos.filter((photo) => photo.driveFileId).map(deleteUploadedMedia));
    toast(id ? "Memory updated." : "Memory saved to your shared diary.");
    closeModal("entryModal");
  } catch (error) {
    await Promise.all(uploadedPhotos.filter((photo) => photo.driveFileId).map(deleteUploadedMedia));
    toast(friendlyError(error), "error");
  } finally {
    $("entryUploadProgress").classList.add("hidden");
    $("entryUploadProgressBar").style.width = "0%";
    setButtonLoading(button, false);
    setTyping(false);
  }
}

async function deleteEntry(id) {
  const entry = state.couple?.entries?.[id];
  if (!entry || entry.authorId !== state.user.uid) return;
  const confirmed = await confirmAction({ title: "Delete this memory?", message: "The entry and its uploaded photos will be permanently removed from both devices.", confirmText: "Delete memory", icon: "×" });
  if (!confirmed) return;
  try {
    const uploadedPhotos = entryPhotosArray(entry).filter((photo) => photo.driveFileId);
    if (uploadedPhotos.length && !getGoogleDriveStatus().connected) await connectGoogleDrive({ prompt: "consent" });
    await remove(ref(db, `couples/${state.coupleId}/entries/${id}`));
    await Promise.all(uploadedPhotos.map(deleteUploadedMedia));
    closeModal("memoryModal");
    closeModal("entryModal");
    toast("Memory deleted.", "info");
  } catch (error) { toast(friendlyError(error), "error"); }
}

async function toggleHeart(id) {
  const current = state.couple?.entries?.[id]?.reactions?.[state.user.uid];
  try {
    const reactionRef = ref(db, `couples/${state.coupleId}/entries/${id}/reactions/${state.user.uid}`);
    if (current) await remove(reactionRef);
    else await set(reactionRef, true);
  } catch (error) {
    toast(friendlyError(error), "error");
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const button = $("saveSettingsBtn");
  const displayName = $("settingsDisplayName").value.trim();
  const coupleName = $("settingsCoupleName").value.trim();
  const anniversary = $("settingsAnniversary").value || "";
  const nickname = $("settingsNickname").value.trim();
  if (!displayName || !coupleName) return;
  setButtonLoading(button, true, "Saving…");

  try {
    await update(ref(db, `users/${state.user.uid}`), { displayName });
    await update(ref(db, `couples/${state.coupleId}`), { name: coupleName, anniversary });
    await update(ref(db, `couples/${state.coupleId}/members/${state.user.uid}`), { displayName });
    if (nickname) await set(ref(db, `couples/${state.coupleId}/nicknames/${state.user.uid}`), nickname);
    else await remove(ref(db, `couples/${state.coupleId}/nicknames/${state.user.uid}`));
    await updateProfile(state.user, { displayName });
    toast("Settings saved.");
  } catch (error) {
    toast(friendlyError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function regenerateCode() {
  if (!isOwner()) return;
  const confirmed = await confirmAction({
    title: "Generate a new invite code?",
    message: "The current code will stop working. Your existing partner will remain connected.",
    confirmText: "Generate code",
    icon: "⌁"
  });
  if (!confirmed) return;

  const oldCode = state.couple.inviteCode;
  try {
    const newCode = await generateUniqueInviteCode();
    const updates = {
      [`inviteCodes/${newCode}`]: {
        coupleId: state.coupleId,
        createdBy: state.user.uid,
        createdAt: serverTimestamp()
      },
      [`couples/${state.coupleId}/inviteCode`]: newCode
    };
    if (oldCode) updates[`inviteCodes/${oldCode}`] = null;
    await update(ref(db), updates);
    toast("A new invite code is ready.");
  } catch (error) {
    toast(friendlyError(error), "error");
  }
}

async function copyInviteCode() {
  const code = state.couple?.inviteCode;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    const input = document.createElement("input");
    input.value = code;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  toast("Invite code copied.");
}

function exportDiary() {
  const payload = {
    exportedAt: new Date().toISOString(),
    diary: {
      name: state.couple?.name || "Our diary",
      anniversary: state.couple?.anniversary || null,
      members: membersArray().map(({ uid, displayName, role, joinedAt }) => ({ uid, displayName, role, joinedAt })),
      entries: entriesArray().map(({ id, ...entry }) => ({ id, ...entry })),
      gallery: galleryItemsArray().map(({ favorite, ...item }) => ({ ...item, favoriteForCurrentUser: favorite }))
    }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pink-promise-${localDateKey()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  toast("Diary export downloaded.");
}

function handleDocumentClick(event) {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) { setView(viewButton.dataset.view); return; }
  const goView = event.target.closest("[data-go-view]");
  if (goView) { setView(goView.dataset.goView); return; }
  if (event.target.closest("[data-open-entry]")) { openEntryModal(); return; }
  if (event.target.closest("[data-open-gallery-item]")) { openGalleryItemModal(); return; }
  const mobileMoreView = event.target.closest("[data-mobile-more-view]");
  if (mobileMoreView) { setView(mobileMoreView.dataset.mobileMoreView); return; }

  const galleryTabButton = event.target.closest("[data-gallery-tab]");
  if (galleryTabButton) {
    state.galleryTab = galleryTabButton.dataset.galleryTab;
    state.galleryAlbum = defaultGalleryAlbum(state.galleryTab);
    state.galleryPeriod = "";
    state.galleryPage = 1;
    renderGallery();
    return;
  }
  const galleryAlbumButton = event.target.closest("[data-gallery-album]");
  if (galleryAlbumButton) {
    state.galleryAlbum = galleryAlbumButton.dataset.galleryAlbum;
    state.galleryPeriod = "";
    state.galleryPage = 1;
    renderGallery();
    return;
  }
  const galleryPeriodButton = event.target.closest("[data-gallery-period]");
  if (galleryPeriodButton) {
    state.galleryPeriod = galleryPeriodButton.dataset.galleryPeriod;
    state.galleryPage = 1;
    renderGallery();
    return;
  }
  const galleryPageButton = event.target.closest("[data-gallery-page]");
  if (galleryPageButton && !galleryPageButton.disabled) {
    state.galleryPage = Number(galleryPageButton.dataset.galleryPage) || 1;
    renderGallery();
    $("view-gallery")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const galleryActionButton = event.target.closest("[data-gallery-action]");
  if (galleryActionButton) {
    const id = galleryActionButton.dataset.galleryId;
    const action = galleryActionButton.dataset.galleryAction;
    const item = galleryItemById(id);
    if (action === "view") openGalleryViewer(id);
    if (action === "favorite") toggleGalleryFavorite(id);
    if (action === "edit" && item) { closeModal("galleryViewerModal"); openGalleryItemModal(item); }
    if (action === "delete") deleteGalleryItem(id);
    return;
  }

  const removeEntryPhoto = event.target.closest("[data-remove-entry-photo]");
  if (removeEntryPhoto) {
    const [kind, id] = removeEntryPhoto.dataset.removeEntryPhoto.split(":");
    if (kind === "existing") {
      const photo = state.entryExistingPhotos.find((item) => item.id === id);
      if (photo?.driveFileId) state.entryRemovedPhotos.push(photo);
      state.entryExistingPhotos = state.entryExistingPhotos.filter((item) => item.id !== id);
    } else {
      const photo = state.entrySelectedFiles.find((item) => item.localId === id);
      if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
      state.entrySelectedFiles = state.entrySelectedFiles.filter((item) => item.localId !== id);
    }
    renderEntryPhotoPreview();
    return;
  }
  const deck = event.target.closest("[data-memory-photo-deck]");
  if (deck) { deck.classList.toggle("spread"); return; }

  const chatAction = event.target.closest("[data-chat-action]");
  if (chatAction) {
    const id = chatAction.dataset.messageId;
    const message = state.couple?.messages?.[id] ? { id, ...state.couple.messages[id] } : null;
    if (chatAction.dataset.chatAction === "reply") setChatReply(message);
    if (chatAction.dataset.chatAction === "heart") toggleChatHeart(id);
    if (chatAction.dataset.chatAction === "edit") editChatMessage(message);
    if (chatAction.dataset.chatAction === "delete") deleteChatMessage(id);
    return;
  }
  const smartReply = event.target.closest("[data-smart-reply]");
  if (smartReply) {
    $("chatInput").value = smartReply.dataset.smartReply;
    $("chatInput").dispatchEvent(new Event("input", { bubbles: true }));
    hideSmartReplies({ dismiss: true });
    $("chatInput").focus();
    return;
  }
  if (event.target.closest("[data-dismiss-smart-replies]")) {
    hideSmartReplies({ dismiss: true });
    return;
  }
  if (event.target.closest("[data-remove-chat-attachment]")) {
    state.chatAttachmentFile = null;
    $("chatAttachmentInput").value = "";
    renderChatAttachmentPreview();
    return;
  }
  if (event.target.closest("[data-remove-chat-existing-attachment]")) {
    state.chatRemoveExistingAttachment = true;
    state.chatExistingAttachment = null;
    renderChatAttachmentPreview();
    return;
  }
  const chatImage = event.target.closest("[data-chat-image]");
  if (chatImage) {
    const driveFileId = chatImage.dataset.chatDriveFileId || "";
    $("galleryViewerTitle").textContent = "Chat photo";
    $("galleryViewerMedia").innerHTML = driveFileId
      ? mediaImageHTML({ driveFileId }, "max-h-[78vh] w-full rounded-xl object-contain", "Chat photo")
      : `<img class="max-h-[78vh] w-full rounded-xl object-contain" src="${escapeHTML(chatImage.dataset.chatImage)}" alt="Chat photo" />`;
    $("galleryViewerFavoriteBtn").classList.add("hidden");
    $("galleryViewerDetails").classList.add("hidden");
    $("galleryOwnerActions").classList.add("hidden");
    openModal("galleryViewerModal");
    hydrateMedia($("galleryViewerMedia"), Boolean(driveFileId));
    return;
  }

  const moodButton = event.target.closest("[data-mood]");
  if (moodButton) { saveMood(moodButton.dataset.mood); return; }
  const calendarButton = event.target.closest("[data-calendar-date]");
  if (calendarButton) { state.selectedDate = calendarButton.dataset.calendarDate; renderCalendar(); return; }
  const entryActionButton = event.target.closest("[data-entry-action]");
  if (entryActionButton) {
    const id = entryActionButton.dataset.entryId;
    const action = entryActionButton.dataset.entryAction;
    const entry = state.couple?.entries?.[id] ? { id, ...state.couple.entries[id] } : null;
    if (action === "view" && entry) openMemoryModal(entry);
    if (action === "edit" && entry) { closeModal("memoryModal"); openEntryModal(entry); }
    if (action === "delete") deleteEntry(id);
    if (action === "heart") toggleHeart(id);
    return;
  }
  const closeButton = event.target.closest("[data-close-modal]");
  if (closeButton) closeModal(closeButton.dataset.closeModal);
}

function bindEvents() {
  $("loginTab").addEventListener("click", () => setAuthMode("login"));
  $("registerTab").addEventListener("click", () => setAuthMode("register"));
  $("authForm").addEventListener("submit", handleAuthSubmit);
  $("forgotPasswordBtn").addEventListener("click", handleForgotPassword);
  $("togglePasswordBtn").addEventListener("click", () => { const input = $("password"); const show = input.type === "password"; input.type = show ? "text" : "password"; $("togglePasswordBtn").textContent = show ? "Hide" : "Show"; });
  $("createSpaceForm").addEventListener("submit", createSpace);
  $("joinSpaceForm").addEventListener("submit", joinSpace);
  $("inviteCodeInput").addEventListener("input", (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); });
  $("onboardingSignOutBtn").addEventListener("click", handleSignOut);
  $("signOutBtn").addEventListener("click", handleSignOut);
  $("sidebarNewEntryBtn").addEventListener("click", () => openEntryModal());
  $("headerNewEntryBtn").addEventListener("click", () => state.currentView === "gallery" ? openGalleryItemModal() : openEntryModal());
  $("newEntertainmentBtn").addEventListener("click", () => { state.entertainmentOffset += 1; renderEntertainment(); });
  $("clearMoodBtn")?.addEventListener("click", clearMood);
  $("mobileMoreBtn")?.addEventListener("click", () => openModal("mobileMoreModal"));
  $("sendEntertainmentBtn").addEventListener("click", () => { setView("messages"); $("chatInput").value = `Couple Spark: ${currentEntertainment().text}`; $("chatInput").focus(); });
  $("entryForm").addEventListener("submit", saveEntry);
  $("deleteEntryFromModalBtn")?.addEventListener("click", () => { const id = $("entryId").value; if (id) deleteEntry(id); });
  $("entryBody").addEventListener("input", (event) => { $("entryCharCount").textContent = `${event.target.value.length} / 4000`; setTyping(true); });
  $("entryPhotoInput").addEventListener("change", (event) => { addEntryPhotoFiles(event.target.files); event.target.value = ""; });

  $("addGalleryItemBtn").addEventListener("click", () => openGalleryItemModal());
  $("galleryItemForm").addEventListener("submit", saveGalleryItem);
  $("deleteGalleryFromModalBtn")?.addEventListener("click", () => { const id = $("galleryItemId").value; if (id) deleteGalleryItem(id); });
  $("galleryMediaType").addEventListener("change", () => {
    clearGalleryFileSelection();
    const type = $("galleryMediaType").value;
    $("galleryFileInput").accept = type === "video" ? "video/*" : "image/*";
    $("galleryFileHelp").textContent = type === "video"
      ? "Choose up to 10 videos. Uploads run two at a time for stability."
      : "Choose up to 30 photos. Images are optimized and uploaded in parallel.";
    updateGalleryAlbumOptions();
  });
  $("galleryAlbum").addEventListener("change", () => updateGalleryTogetherFields());
  $("galleryTogetherMonth").addEventListener("change", updateGalleryPathPreview);
  $("galleryTogetherYear").addEventListener("input", updateGalleryPathPreview);
  $("galleryFileInput").addEventListener("change", (event) => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    const expected = $("galleryMediaType").value;
    const editing = Boolean($("galleryItemId").value);
    const limit = editing ? 1 : expected === "video" ? 10 : 30;
    if (files.length > limit) {
      toast(`Choose no more than ${limit} ${expected === "video" ? "videos" : "photos"}${editing ? " while editing" : " per batch"}.`, "error");
      event.target.value = "";
      return;
    }
    for (const file of files) {
      const error = validateUploadFile(file, expected === "video" ? "video" : "image");
      if (error) {
        toast(`${file.name}: ${error}`, "error");
        event.target.value = "";
        return;
      }
    }
    clearGalleryFileSelection();
    state.gallerySelectedFiles = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    $("galleryFilename").value = files[0].name;
    if (!$("galleryTitle").value.trim() && files.length === 1) {
      $("galleryTitle").value = files[0].name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
    }
    renderGalleryUploadPreview();
    updateGalleryPathPreview();
  });
  $("galleryUploadPreview").addEventListener("click", (event) => {
    if (!event.target.closest("[data-clear-gallery-selection]")) return;
    clearGalleryFileSelection();
    updateGalleryPathPreview();
  });
  $("galleryDate").addEventListener("change", () => {
    if (!isUsTogetherAlbum($("galleryMediaType").value, $("galleryAlbum").value)) return;
    const [year, month] = $("galleryDate").value.split("-");
    if (year && month) { $("galleryTogetherYear").value = year; $("galleryTogetherMonth").value = month; updateGalleryPathPreview(); }
  });
  $("gallerySearch").addEventListener("input", () => { state.galleryPage = 1; renderGallery(); });
  $("gallerySort").addEventListener("change", () => { state.galleryPage = 1; renderGallery(); });
  $("galleryViewerFavoriteBtn").addEventListener("click", () => state.galleryViewerId && toggleGalleryFavorite(state.galleryViewerId));
  $("galleryViewerEditBtn").addEventListener("click", () => { const item = state.galleryViewerId ? galleryItemById(state.galleryViewerId) : null; if (item) { closeModal("galleryViewerModal"); openGalleryItemModal(item); } });
  $("galleryViewerDeleteBtn").addEventListener("click", () => state.galleryViewerId && deleteGalleryItem(state.galleryViewerId));

  $("chatBackBtn")?.addEventListener("click", () => setView("home"));
  $("chatForm").addEventListener("submit", sendChatMessage);
  $("chatMessages").addEventListener("scroll", () => {
    updateChatScrollButton();
    const root = $("chatMessages");
    if (root.scrollHeight - root.scrollTop - root.clientHeight < 80) markChatRead();
  }, { passive: true });
  $("chatScrollBottomBtn")?.addEventListener("click", () => {
    const root = $("chatMessages");
    root.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
    state.chatForceScroll = true;
    markChatRead();
  });
  $("chatInput").addEventListener("input", (event) => {
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 112)}px`;
    const hasText = Boolean(event.target.value.trim());
    setChatTyping(hasText);
    if (hasText) hideSmartReplies();
    else renderSmartReplies();
    scheduleViewportLayout();
  });
  $("chatInput").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("chatForm").requestSubmit(); } });
  $("chatAttachmentInput").addEventListener("change", (event) => { const file = event.target.files?.[0] || null; if (!file) return; const error = validateUploadFile(file, "image"); if (error) { toast(error, "error"); event.target.value = ""; return; } state.chatAttachmentFile = file; renderChatAttachmentPreview(); });
  $("cancelChatReplyBtn").addEventListener("click", () => cancelChatMode(false));

  $("searchEntries").addEventListener("input", renderTimeline);
  $("categoryFilter").addEventListener("change", renderTimeline);
  $("authorFilter").addEventListener("change", renderTimeline);
  $("prevMonthBtn").addEventListener("click", () => { state.calendarCursor.setMonth(state.calendarCursor.getMonth() - 1); state.selectedDate = null; renderCalendar(); });
  $("nextMonthBtn").addEventListener("click", () => { state.calendarCursor.setMonth(state.calendarCursor.getMonth() + 1); state.selectedDate = null; renderCalendar(); });
  $("addForSelectedDateBtn").addEventListener("click", () => openEntryModal(null, { date: state.selectedDate || localDateKey() }));
  $("settingsForm").addEventListener("submit", saveSettings);
  $("copyInviteBtn").addEventListener("click", copyInviteCode);
  $("settingsCopyCodeBtn").addEventListener("click", copyInviteCode);
  $("regenerateCodeBtn").addEventListener("click", regenerateCode);
  $("exportDataBtn").addEventListener("click", exportDiary);
  $("themeToggleBtn").addEventListener("click", () => applyTheme(state.theme === "dark" ? "light" : "dark"));
  $("settingsThemeToggle").addEventListener("click", () => applyTheme(state.theme === "dark" ? "light" : "dark"));
  $("driveConnectBtn")?.addEventListener("click", handleDriveConnect);
  $("settingsDriveConnectBtn")?.addEventListener("click", handleDriveConnect);
  $("settingsDriveDisconnectBtn")?.addEventListener("click", handleDriveDisconnect);
  $("openVideoMigrationBtn")?.addEventListener("click", openVideoMigrationModal);
  $("videoMigrationFolderInput")?.addEventListener("change", handleVideoMigrationFolderSelection);
  $("startVideoMigrationBtn")?.addEventListener("click", migrateSelectedVideosToDrive);
  $("profileMenuBtn").addEventListener("click", () => openModal("profileModal"));
  $("profileSettingsBtn").addEventListener("click", () => { closeModal("profileModal"); setView("settings"); });
  $("confirmCancelBtn").addEventListener("click", () => resolveConfirmation(false));
  $("confirmAcceptBtn").addEventListener("click", () => resolveConfirmation(true));
  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("popstate", handleAppBackNavigation);
  window.addEventListener("resize", scheduleViewportLayout, { passive: true });
  window.addEventListener("orientationchange", () => { requestPortraitLock(); scheduleViewportLayout(); }, { passive: true });
  window.addEventListener("online", () => {
    scheduleViewportLayout();
    if (state.user && !getGoogleDriveStatus().connected) restoreDriveForUser(state.user).catch(() => {});
  });
  window.visualViewport?.addEventListener("resize", scheduleViewportLayout, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleViewportLayout, { passive: true });
  requestPortraitLock();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      requestPortraitLock();
      scheduleViewportLayout();
      if (state.user && !getGoogleDriveStatus().connected) restoreDriveForUser(state.user).catch(() => {});
      if (state.currentView === "messages") markChatRead();
    } else if (state.currentView === "messages") {
      setChatTyping(false, { force: true });
    }
  });
  document.addEventListener("keydown", (event) => {
    const openModalElement = visibleModals().pop();
    if (!openModalElement) return;
    if (event.key === "Escape") {
      if (openModalElement.id === "confirmModal") resolveConfirmation(false);
      else closeModal(openModalElement.id);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = focusableElements(openModalElement);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  ["entryModal", "memoryModal", "galleryItemModal", "galleryViewerModal", "videoMigrationModal", "profileModal", "mobileMoreModal"].forEach((id) => $(id)?.addEventListener("click", (event) => { if (event.target.id === id) closeModal(id); }));
}

async function waitForActiveAuthSubmission(timeoutMs = 6000) {
  const started = Date.now();
  while (state.authBusy && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

async function initialize() {
  initializeTheme();
  bindEvents();
  syncViewportLayout();
  setAuthMode("login");
  try {
    const rememberedEmail = localStorage.getItem("pinkPromiseLastEmail") || "";
    if (rememberedEmail && $("email")) $("email").value = rememberedEmail;
  } catch { /* local storage is optional */ }
  showAppLoader("Pink Promise", "Checking your secure session…");

  if (!isConfigured()) {
    showOnly("setupScreen");
    hideAppLoader();
    return;
  }

  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
  } catch (error) {
    console.error(error);
    showOnly("setupScreen");
    hideAppLoader();
    return;
  }

  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.warn("Firebase local auth persistence is unavailable; this browser may require login again after closing.", error);
  }

  try {
    await initializeGoogleDrive(googleDriveConfig);
  } catch (error) {
    console.warn("Google Drive initialization:", error);
  }
  renderDriveStatus();
  window.addEventListener("pinkpromise-drive-status", () => {
    renderDriveStatus();
    if (getGoogleDriveStatus().connected) hydrateMedia(document);
  });

  onAuthStateChanged(auth, async (user) => {
    const previousUserId = state.user?.uid || "";
    if (!user || previousUserId !== user.uid) resetSessionState();
    state.user = user;

    if (!user) {
      suspendGoogleDrive();
      setGoogleDriveAccount("");
      renderDriveStatus();
      showOnly("authScreen");
      setAuthMode("login");
      initializeLoginNavigation();
      $("password").value = "";
      hideAppLoader();
      return;
    }

    await waitForActiveAuthSubmission();
    showAppLoader("Welcome back", "Syncing your diary, chat, and private media…");
    initializeAppNavigation(user.uid);
    setGoogleDriveAccount(user.uid);
    restoreDriveForUser(user).catch((error) => console.warn("Drive auto-restore:", error));

    try {
      await ensureUserProfile(user);
      watchUserProfile(user);
    } catch (error) {
      hideAppLoader();
      toast(friendlyError(error), "error");
      await signOut(auth).catch(() => {});
      showOnly("authScreen");
    }
  });
}

initialize();
