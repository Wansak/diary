const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const TOKEN_STORAGE_PREFIX = "pinkPromiseDriveToken:";
const AUTH_STORAGE_PREFIX = "pinkPromiseDriveAuthorized:";
const LAST_ACCOUNT_STORAGE_KEY = "pinkPromiseDriveLastAccount";

function detectContentType(file) {
  if (file?.type) return file.type;
  const extension = String(file?.name || "").split(".").pop().toLowerCase();
  const types = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/x-m4v", ogg: "video/ogg"
  };
  return types[extension] || "application/octet-stream";
}

let config = null;
let tokenClient = null;
let tokenRequest = null;
let folderCache = new Map();
let folderPromiseCache = new Map();
let objectUrlCache = new Map();
let mediaObserver = null;
let hydrationQueue = [];
let activeHydrations = 0;
const MAX_ACTIVE_HYDRATIONS = 4;
const MAX_OBJECT_URLS = 48;
let accessToken = "";
let tokenExpiresAt = 0;
let accountKey = "";
let tokenRefreshTimer = null;

export class GoogleDriveError extends Error {
  constructor(message, code = "DRIVE_ERROR", details = null) {
    super(message);
    this.name = "GoogleDriveError";
    this.code = code;
    this.details = details;
  }
}

function emitStatus() {
  window.dispatchEvent(new CustomEvent("pinkpromise-drive-status", {
    detail: getGoogleDriveStatus()
  }));
}

function configuredClientId() {
  const value = String(config?.clientId || "").trim();
  return value && !value.includes("YOUR_GOOGLE_") && value.endsWith(".apps.googleusercontent.com");
}

export function isGoogleDriveConfigured() {
  return Boolean(configuredClientId());
}

function normalizedAccountKey(value = "") {
  return String(value || "").trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

function tokenStorageKey() {
  return `${TOKEN_STORAGE_PREFIX}${accountKey || "guest"}`;
}

function authorizationStorageKey() {
  return `${AUTH_STORAGE_PREFIX}${accountKey || "guest"}`;
}

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage may be unavailable */ }
}

function removeStorage(key) {
  try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ }
}

function clearTokenRefreshTimer() {
  clearTimeout(tokenRefreshTimer);
  tokenRefreshTimer = null;
}

function scheduleSilentTokenRefresh() {
  clearTokenRefreshTimer();
  if (!accountKey || !accessToken || tokenExpiresAt <= Date.now()) return;
  const delay = Math.max(1000, tokenExpiresAt - Date.now() + 250);
  tokenRefreshTimer = setTimeout(async () => {
    tokenRefreshTimer = null;
    if (!accountKey || tokenExpiresAt > Date.now()) {
      scheduleSilentTokenRefresh();
      return;
    }
    accessToken = "";
    tokenExpiresAt = 0;
    removeStorage(tokenStorageKey());
    emitStatus();
    if (readStorage(authorizationStorageKey()) !== "1" || document.visibilityState === "hidden") return;
    try {
      await connectGoogleDrive({ prompt: "none" });
    } catch {
      // The authorization remains remembered. The app retries silently when it
      // becomes visible or online, and only asks the user if Google requires it.
      emitStatus();
    }
  }, delay);
}

function saveToken(tokenResponse) {
  accessToken = tokenResponse.access_token || "";
  const expiresIn = Math.max(60, Number(tokenResponse.expires_in || 3600));
  tokenExpiresAt = Date.now() + (expiresIn - 45) * 1000;
  writeStorage(tokenStorageKey(), JSON.stringify({ accessToken, tokenExpiresAt }));
  writeStorage(authorizationStorageKey(), "1");
  if (accountKey) writeStorage(LAST_ACCOUNT_STORAGE_KEY, accountKey);
  scheduleSilentTokenRefresh();
  emitStatus();
}

function restoreToken() {
  accessToken = "";
  tokenExpiresAt = 0;
  if (!accountKey) return;
  try {
    const stored = JSON.parse(readStorage(tokenStorageKey()) || "null");
    if (stored?.accessToken && Number(stored.tokenExpiresAt) > Date.now()) {
      accessToken = stored.accessToken;
      tokenExpiresAt = Number(stored.tokenExpiresAt);
      scheduleSilentTokenRefresh();
    } else {
      removeStorage(tokenStorageKey());
    }
  } catch {
    removeStorage(tokenStorageKey());
  }
}

function clearToken({ revoke = false, forget = false, keepStoredToken = false } = {}) {
  clearTokenRefreshTimer();
  const token = accessToken;
  accessToken = "";
  tokenExpiresAt = 0;
  if (!keepStoredToken) removeStorage(tokenStorageKey());
  if (forget) removeStorage(authorizationStorageKey());
  if (revoke && token && window.google?.accounts?.oauth2?.revoke) {
    try { window.google.accounts.oauth2.revoke(token, () => {}); } catch { /* best effort */ }
  }
  emitStatus();
}

function waitForGoogleIdentity(timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - started >= timeoutMs) {
        return reject(new GoogleDriveError("Google authorization could not load. Check your connection and reload the page.", "DRIVE_LIBRARY_UNAVAILABLE"));
      }
      setTimeout(check, 80);
    };
    check();
  });
}

export function setGoogleDriveAccount(value = "") {
  const nextKey = normalizedAccountKey(value);
  if (nextKey === accountKey) {
    restoreToken();
    emitStatus();
    return getGoogleDriveStatus();
  }
  clearTokenRefreshTimer();
  accessToken = "";
  tokenExpiresAt = 0;
  folderCache.clear();
  folderPromiseCache.clear();
  clearDriveObjectUrlCache();
  accountKey = nextKey;
  restoreToken();
  emitStatus();
  return getGoogleDriveStatus();
}

export function suspendGoogleDrive() {
  clearTokenRefreshTimer();
  accessToken = "";
  tokenExpiresAt = 0;
  folderCache.clear();
  folderPromiseCache.clear();
  clearDriveObjectUrlCache();
  emitStatus();
}

export async function resumeGoogleDriveConnection({ prompt = "none" } = {}) {
  if (!accountKey || !isGoogleDriveConfigured()) return false;
  restoreToken();
  if (accessToken && tokenExpiresAt > Date.now()) {
    emitStatus();
    return true;
  }
  if (readStorage(authorizationStorageKey()) !== "1") {
    emitStatus();
    return false;
  }
  try {
    await connectGoogleDrive({ prompt });
    return true;
  } catch (error) {
    // Keep the remembered authorization marker. A user gesture may be needed
    // after browser privacy cleanup, password changes, or a revoked consent.
    emitStatus();
    return false;
  }
}

export async function initializeGoogleDrive(userConfig) {
  config = {
    rootFolderName: "Pink Promise Media",
    scope: "https://www.googleapis.com/auth/drive.file",
    ...userConfig
  };
  restoreToken();
  if (!isGoogleDriveConfigured()) {
    emitStatus();
    return false;
  }
  await waitForGoogleIdentity();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: config.clientId,
    scope: config.scope,
    callback: (response) => {
      const pending = tokenRequest;
      tokenRequest = null;
      if (response?.error) {
        clearToken();
        pending?.reject(new GoogleDriveError(response.error_description || response.error, "DRIVE_AUTH_FAILED", response));
        return;
      }
      saveToken(response);
      pending?.resolve(response);
    },
    error_callback: (error) => {
      const pending = tokenRequest;
      tokenRequest = null;
      pending?.reject(new GoogleDriveError(error?.message || "Google Drive authorization was canceled.", "DRIVE_AUTH_CANCELED", error));
    }
  });
  emitStatus();
  return true;
}

export function getGoogleDriveStatus() {
  const connected = Boolean(accessToken && tokenExpiresAt > Date.now());
  return {
    configured: isGoogleDriveConfigured(),
    connected,
    remembered: Boolean(accountKey && readStorage(authorizationStorageKey()) === "1"),
    accountKey,
    expiresAt: connected ? tokenExpiresAt : 0,
    rootFolderName: config?.rootFolderName || "Pink Promise Media"
  };
}

export async function connectGoogleDrive({ prompt = "consent" } = {}) {
  if (!isGoogleDriveConfigured()) {
    throw new GoogleDriveError("Add your Google OAuth Client ID in google-drive-config.js first.", "DRIVE_NOT_CONFIGURED");
  }
  await waitForGoogleIdentity();
  if (!tokenClient) await initializeGoogleDrive(config);
  if (accessToken && tokenExpiresAt > Date.now()) return getGoogleDriveStatus();
  if (tokenRequest) return tokenRequest.promise;

  let resolveRequest;
  let rejectRequest;
  const promise = new Promise((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });
  tokenRequest = { promise, resolve: resolveRequest, reject: rejectRequest };
  try {
    tokenClient.requestAccessToken({ prompt });
  } catch (error) {
    const pending = tokenRequest;
    tokenRequest = null;
    pending?.reject(new GoogleDriveError(error?.message || "Google Drive authorization popup was blocked.", "DRIVE_AUTH_FAILED", error));
  }
  await promise;
  return getGoogleDriveStatus();
}

export function disconnectGoogleDrive() {
  clearToken({ revoke: true, forget: true });
  folderCache.clear();
  folderPromiseCache.clear();
  clearDriveObjectUrlCache();
}

async function ensureToken({ interactive = true } = {}) {
  if (accessToken && tokenExpiresAt > Date.now()) return accessToken;
  clearToken({ forget: false });
  if (!interactive) {
    throw new GoogleDriveError("Connect Google Drive to view or upload private media.", "DRIVE_NOT_CONNECTED");
  }
  await connectGoogleDrive({ prompt: "" });
  return accessToken;
}

async function driveFetch(url, options = {}, { interactive = true, retryAuth = true } = {}) {
  const token = await ensureToken({ interactive });
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 && retryAuth) {
    clearToken({ forget: false });
    if (!interactive) throw new GoogleDriveError("Your Google Drive session expired. Reconnect Drive.", "DRIVE_SESSION_EXPIRED");
    await connectGoogleDrive({ prompt: "" });
    return driveFetch(url, options, { interactive, retryAuth: false });
  }
  if (!response.ok) {
    let details = null;
    try { details = await response.json(); } catch { details = await response.text().catch(() => ""); }
    const apiMessage = details?.error?.message || details?.error_description || "";
    const code = response.status === 403 ? "DRIVE_PERMISSION_DENIED" : response.status === 404 ? "DRIVE_FILE_NOT_FOUND" : "DRIVE_REQUEST_FAILED";
    throw new GoogleDriveError(apiMessage || `Google Drive request failed (${response.status}).`, code, details);
  }
  return response;
}

function escapeDriveQuery(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function findFolder(name, parentId = "") {
  const clauses = [
    `name = '${escapeDriveQuery(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false"
  ];
  if (parentId) clauses.push(`'${escapeDriveQuery(parentId)}' in parents`);
  const params = new URLSearchParams({
    q: clauses.join(" and "),
    fields: "files(id,name,parents)",
    pageSize: "10",
    spaces: "drive"
  });
  const response = await driveFetch(`${DRIVE_API}/files?${params}`);
  const data = await response.json();
  return data.files?.[0] || null;
}

async function createFolder(name, parentId = "", appProperties = {}) {
  const body = {
    name,
    mimeType: FOLDER_MIME,
    appProperties
  };
  if (parentId) body.parents = [parentId];
  const response = await driveFetch(`${DRIVE_API}/files?fields=id,name,parents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}

async function getOrCreateFolder(name, parentId = "", cacheKey = "") {
  const key = cacheKey || `${parentId || "root"}/${name}`;
  if (folderCache.has(key)) return folderCache.get(key);
  if (folderPromiseCache.has(key)) return folderPromiseCache.get(key);
  const pending = (async () => {
    const existing = await findFolder(name, parentId);
    const folder = existing || await createFolder(name, parentId, { pinkPromiseFolder: "true" });
    folderCache.set(key, folder.id);
    return folder.id;
  })();
  folderPromiseCache.set(key, pending);
  try {
    return await pending;
  } finally {
    folderPromiseCache.delete(key);
  }
}

async function ensureFolderPath(pathSegments) {
  const rootName = String(config?.rootFolderName || "Pink Promise Media").trim() || "Pink Promise Media";
  let parentId = await getOrCreateFolder(rootName, "root", `root/${rootName}`);
  let logical = rootName;
  for (const rawSegment of pathSegments) {
    const segment = String(rawSegment || "").trim();
    if (!segment) continue;
    logical += `/${segment}`;
    parentId = await getOrCreateFolder(segment, parentId, logical);
  }
  return parentId;
}

function splitLogicalPath(logicalPath, fallbackName) {
  const pieces = String(logicalPath || "")
    .replaceAll("\\", "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");
  const filename = pieces.pop() || fallbackName || "media-file";
  return { folders: pieces, filename };
}


function driveUploadError(xhr, fallbackMessage = "Google Drive upload failed.") {
  let details = xhr?.responseText || "";
  let apiMessage = "";
  try {
    const parsed = JSON.parse(details || "null");
    apiMessage = parsed?.error?.message || parsed?.error_description || "";
    details = parsed;
  } catch {
    // Keep the raw response text for troubleshooting.
  }
  const status = Number(xhr?.status || 0);
  const message = apiMessage || (status ? `${fallbackMessage} Google returned HTTP ${status}.` : fallbackMessage);
  const code = status === 401
    ? "DRIVE_SESSION_EXPIRED"
    : status === 403
      ? "DRIVE_PERMISSION_DENIED"
      : "DRIVE_UPLOAD_FAILED";
  return new GoogleDriveError(message, code, details);
}

function uploadMultipart(metadata, file, onProgress) {
  return ensureToken({ interactive: true }).then((token) => new Promise((resolve, reject) => {
    const boundary = `pink_promise_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const contentType = detectContentType(file);
    const body = new Blob([
      `--${boundary}\r\n`,
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\n`,
      `Content-Type: ${contentType}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`
    ], { type: `multipart/related; boundary=${boundary}` });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", `multipart/related; boundary=${boundary}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.max(1, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new GoogleDriveError("Google Drive returned an invalid upload response.", "DRIVE_UPLOAD_RESPONSE_INVALID", xhr.responseText)); }
      } else {
        reject(driveUploadError(xhr));
      }
    };
    xhr.onerror = () => reject(new GoogleDriveError("The browser could not reach Google Drive. Check the exact authorized origin and your connection.", "DRIVE_NETWORK_ERROR"));
    xhr.onabort = () => reject(new GoogleDriveError("The upload was canceled.", "DRIVE_UPLOAD_CANCELED"));
    xhr.send(body);
  }));
}

function startResumableSession(metadata, file) {
  return ensureToken({ interactive: true }).then((token) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
    xhr.setRequestHeader("X-Upload-Content-Type", detectContentType(file));
    xhr.setRequestHeader("X-Upload-Content-Length", String(file.size));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const location = xhr.getResponseHeader("Location");
        if (location) resolve(location);
        else reject(new GoogleDriveError("Google Drive did not return an upload session URL.", "DRIVE_UPLOAD_SESSION_FAILED"));
      } else {
        reject(new GoogleDriveError(`Unable to start Google Drive upload (${xhr.status}).`, xhr.status === 401 ? "DRIVE_SESSION_EXPIRED" : "DRIVE_UPLOAD_SESSION_FAILED", xhr.responseText));
      }
    };
    xhr.onerror = () => reject(new GoogleDriveError("Unable to connect to Google Drive for upload.", "DRIVE_NETWORK_ERROR"));
    xhr.send(JSON.stringify(metadata));
  }));
}

function uploadToSession(sessionUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", sessionUrl);
    // The resumable session URI already authorizes this upload. Avoiding an
    // extra Authorization header also prevents an unnecessary CORS preflight.
    xhr.setRequestHeader("Content-Type", detectContentType(file));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.max(1, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new GoogleDriveError("Google Drive returned an invalid upload response.", "DRIVE_UPLOAD_RESPONSE_INVALID", xhr.responseText)); }
      } else {
        reject(driveUploadError(xhr));
      }
    };
    xhr.onerror = () => reject(new GoogleDriveError("The upload was interrupted. Check your connection and the authorized JavaScript origin.", "DRIVE_NETWORK_ERROR"));
    xhr.onabort = () => reject(new GoogleDriveError("The upload was canceled.", "DRIVE_UPLOAD_CANCELED"));
    xhr.send(file);
  });
}

export async function uploadGoogleDriveFile({ file, logicalPath, coupleId = "", uploadedBy = "", onProgress = () => {} }) {
  if (!(file instanceof File || file instanceof Blob)) {
    throw new GoogleDriveError("Choose a valid file from your device.", "DRIVE_INVALID_FILE");
  }
  await ensureToken({ interactive: true });
  const { folders, filename } = splitLogicalPath(logicalPath, file.name);
  const parentId = await ensureFolderPath(folders);
  // Keep upload metadata intentionally small. Google Drive limits each
  // appProperties key + value pair to 124 UTF-8 bytes. The full logical path,
  // couple ID, and uploader are already stored safely in Firebase, so they do
  // not need to be duplicated in Drive custom properties.
  const metadata = {
    name: filename,
    parents: [parentId],
    mimeType: detectContentType(file),
    appProperties: { pp: "1" }
  };
  onProgress(1);
  // Google recommends multipart uploads for files up to 5 MB. This is also
  // more reliable for browser-hosted static sites such as GitHub Pages.
  const result = file.size <= 5 * 1024 * 1024
    ? await uploadMultipart(metadata, file, onProgress)
    : await startResumableSession(metadata, file).then((sessionUrl) => uploadToSession(sessionUrl, file, onProgress));
  onProgress(100);
  return {
    driveFileId: result.id,
    driveWebViewLink: result.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(result.id)}/view`,
    driveThumbnailLink: result.thumbnailLink || "",
    path: logicalPath,
    name: result.name || filename,
    size: Number(result.size || file.size || 0),
    type: result.mimeType || detectContentType(file)
  };
}

export async function deleteGoogleDriveFile(fileId) {
  if (!fileId) return;
  try {
    await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
    releaseDriveObjectUrl(fileId);
  } catch (error) {
    if (error?.code !== "DRIVE_FILE_NOT_FOUND") throw error;
  }
}

function rememberObjectUrl(fileId, objectUrl) {
  if (objectUrlCache.has(fileId)) objectUrlCache.delete(fileId);
  objectUrlCache.set(fileId, objectUrl);
  while (objectUrlCache.size > MAX_OBJECT_URLS) {
    const [oldestId, oldestUrl] = objectUrlCache.entries().next().value || [];
    if (!oldestId) break;
    URL.revokeObjectURL(oldestUrl);
    objectUrlCache.delete(oldestId);
  }
}

export async function getGoogleDriveObjectUrl(fileId, { interactive = false } = {}) {
  if (!fileId) throw new GoogleDriveError("Missing Google Drive file ID.", "DRIVE_FILE_ID_MISSING");
  if (objectUrlCache.has(fileId)) {
    const cached = objectUrlCache.get(fileId);
    objectUrlCache.delete(fileId);
    objectUrlCache.set(fileId, cached);
    return cached;
  }
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {}, { interactive });
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  rememberObjectUrl(fileId, objectUrl);
  return objectUrl;
}

async function hydrateDriveNode(node, interactive) {
  const fileId = node?.dataset?.driveFileId;
  if (!fileId || node.dataset.driveState === "ready" || node.dataset.driveState === "loading") return;
  node.dataset.driveState = "loading";
  node.classList.add("drive-media-pending");
  try {
    const url = await getGoogleDriveObjectUrl(fileId, { interactive });
    if (!node.isConnected) return;
    node.src = url;
    if (node.tagName === "VIDEO") {
      node.preload = node.preload || "metadata";
      node.load();
    }
    node.dataset.driveState = "ready";
    node.classList.remove("drive-media-pending");
    node.dispatchEvent(new CustomEvent("drive-media-ready"));
  } catch (error) {
    node.dataset.driveState = error?.code === "DRIVE_NOT_CONNECTED" ? "needs-auth" : "error";
    node.classList.add("drive-media-pending");
  }
}

function pumpHydrationQueue() {
  while (activeHydrations < MAX_ACTIVE_HYDRATIONS && hydrationQueue.length) {
    const task = hydrationQueue.shift();
    if (!task?.node?.isConnected || task.node.dataset.driveState === "ready") {
      task?.resolve?.();
      continue;
    }
    activeHydrations += 1;
    hydrateDriveNode(task.node, task.interactive)
      .then(task.resolve, task.reject)
      .finally(() => {
        activeHydrations -= 1;
        pumpHydrationQueue();
      });
  }
}

function queueHydration(node, interactive = false) {
  if (!node || node.dataset.driveQueued === "1" || node.dataset.driveState === "ready") return Promise.resolve();
  node.dataset.driveQueued = "1";
  return new Promise((resolve, reject) => {
    hydrationQueue.push({
      node,
      interactive,
      resolve: () => { delete node.dataset.driveQueued; resolve(); },
      reject: (error) => { delete node.dataset.driveQueued; reject(error); }
    });
    pumpHydrationQueue();
  });
}

function getMediaObserver() {
  if (mediaObserver || !("IntersectionObserver" in window)) return mediaObserver;
  mediaObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      mediaObserver.unobserve(entry.target);
      queueHydration(entry.target, false).catch(() => {});
    }
  }, { rootMargin: "500px 0px", threshold: 0.01 });
  return mediaObserver;
}

export async function hydrateGoogleDriveMedia(root = document, { interactive = false, eager = null } = {}) {
  const nodes = [...root.querySelectorAll("[data-drive-file-id]")];
  if (!nodes.length) return;
  const status = getGoogleDriveStatus();
  if (!status.connected && !interactive) {
    nodes.forEach((node) => {
      node.dataset.driveState = "needs-auth";
      node.classList.add("drive-media-pending");
    });
    return;
  }
  const eagerLoad = eager == null ? Boolean(interactive && root !== document) : Boolean(eager);
  if (eagerLoad || !("IntersectionObserver" in window)) {
    await Promise.allSettled(nodes.map((node) => queueHydration(node, interactive)));
    return;
  }
  const observer = getMediaObserver();
  nodes.forEach((node) => {
    if (node.dataset.driveState === "needs-auth" || node.dataset.driveState === "error") node.dataset.driveState = "";
    node.classList.add("drive-media-pending");
    observer?.observe(node);
  });
}

export function releaseDriveObjectUrl(fileId) {
  const url = objectUrlCache.get(fileId);
  if (url) URL.revokeObjectURL(url);
  objectUrlCache.delete(fileId);
}

export function clearDriveObjectUrlCache() {
  for (const url of objectUrlCache.values()) URL.revokeObjectURL(url);
  objectUrlCache.clear();
  hydrationQueue = [];
  mediaObserver?.disconnect();
  mediaObserver = null;
}
