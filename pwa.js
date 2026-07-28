const elements = {
  installButton: document.getElementById("installAppBtn"),
  installHelpButton: document.getElementById("installHelpBtn"),
  authInstallButton: document.getElementById("authInstallAppBtn"),
  status: document.getElementById("pwaInstallStatus"),
  description: document.getElementById("pwaInstallDescription"),
  modal: document.getElementById("pwaInstallModal"),
  modalIntro: document.getElementById("pwaInstallModalIntro"),
  steps: document.getElementById("pwaInstallSteps"),
  closeModalButton: document.getElementById("closePwaInstallModalBtn"),
  closeModalFooterButton: document.getElementById("closePwaInstallModalFooterBtn")
};

let deferredInstallPrompt = null;

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  window.navigator.standalone === true;

async function lockPortraitWhenPossible() {
  if (!isStandalone() || !screen.orientation?.lock) return;
  try { await screen.orientation.lock("portrait-primary"); } catch { /* platform fallback is handled in app.css */ }
}

function setButtonVisibility(element, visible) {
  if (!element) return;
  element.classList.toggle("hidden", !visible);
  element.classList.toggle("flex", visible);
}

function updateInstallUI() {
  if (isStandalone()) {
    deferredInstallPrompt = null;
    if (elements.status) {
      elements.status.textContent = "Installed";
      elements.status.className = "rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700";
    }
    if (elements.description) {
      elements.description.textContent = "Pink Promise is installed and opens in its own app window.";
    }
    setButtonVisibility(elements.installButton, false);
    setButtonVisibility(elements.installHelpButton, false);
    setButtonVisibility(elements.authInstallButton, false);
    return;
  }

  if (deferredInstallPrompt) {
    if (elements.status) {
      elements.status.textContent = "Ready";
      elements.status.className = "rounded-full bg-rosewood-100 px-2.5 py-1 text-[10px] font-bold text-rosewood-700";
    }
    if (elements.description) {
      elements.description.textContent = "Install Pink Promise for a standalone app experience and quicker access.";
    }
    setButtonVisibility(elements.installButton, true);
    setButtonVisibility(elements.installHelpButton, false);
    setButtonVisibility(elements.authInstallButton, true);
    return;
  }

  if (elements.status) {
    elements.status.textContent = isIOS ? "Manual install" : "Browser menu";
    elements.status.className = "rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700";
  }
  if (elements.description) {
    elements.description.textContent = isIOS
      ? "Install from Safari using Add to Home Screen."
      : "Your browser may offer installation from its address-bar or menu.";
  }
  setButtonVisibility(elements.installButton, false);
  setButtonVisibility(elements.installHelpButton, true);
  setButtonVisibility(elements.authInstallButton, true);
}

function getInstallSteps() {
  if (isIOS) {
    return [
      ["1", "Open Pink Promise in Safari."],
      ["2", "Tap the Share button."],
      ["3", "Choose Add to Home Screen."],
      ["4", "Turn on Open as Web App when shown, then tap Add."]
    ];
  }

  if (/android/i.test(navigator.userAgent)) {
    return [
      ["1", "Open Pink Promise in Chrome or Edge."],
      ["2", "Open the browser menu (⋮)."],
      ["3", "Choose Install app or Add to Home screen."],
      ["4", "Confirm Install."]
    ];
  }

  return [
    ["1", "Open Pink Promise in Chrome or Edge."],
    ["2", "Look for the install icon in the address bar, or open the browser menu."],
    ["3", "Choose Install Pink Promise."],
    ["4", "Confirm Install to add it to your desktop or Start menu."]
  ];
}

function openInstallHelp() {
  if (!elements.modal || !elements.steps) return;
  const steps = getInstallSteps();
  elements.steps.innerHTML = steps
    .map(([number, text]) => `
      <li class="flex gap-3 rounded-2xl border border-rosewood-100 bg-white p-3">
        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-rosewood-100 text-xs font-bold text-rosewood-800">${number}</span>
        <span class="pt-1 leading-5">${text}</span>
      </li>`)
    .join("");

  if (elements.modalIntro) {
    elements.modalIntro.textContent = isIOS
      ? "iPhone and iPad install web apps through Safari’s Share menu."
      : "Use your browser’s install option to open Pink Promise like a regular app.";
  }

  elements.modal.classList.remove("hidden");
  elements.modal.classList.add("flex");
  document.body.style.overflow = "hidden";
  elements.closeModalButton?.focus();
}

function closeInstallHelp() {
  if (!elements.modal) return;
  elements.modal.classList.add("hidden");
  elements.modal.classList.remove("flex");
  document.body.style.overflow = "";
}

async function requestInstall() {
  if (!deferredInstallPrompt) {
    openInstallHelp();
    return;
  }

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;

  if (choice.outcome === "accepted") {
    showPwaToast("Pink Promise is being installed.", "success");
  }

  updateInstallUI();
}

function showPwaToast(message, type = "info", action = null) {
  const host = document.getElementById("toastContainer") || document.body;
  const toast = document.createElement("div");
  const tones = {
    success: "border-emerald-200 bg-white text-emerald-800",
    warning: "border-amber-200 bg-white text-amber-800",
    info: "border-rosewood-100 bg-white text-rosewood-800"
  };
  toast.className = `pointer-events-auto rounded-2xl border p-3 text-xs font-semibold shadow-xl ${tones[type] || tones.info}`;
  toast.innerHTML = `<div class="flex items-center gap-3"><span class="min-w-0 flex-1 leading-5"></span></div>`;
  toast.querySelector("span").textContent = message;

  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mt-2 w-full rounded-xl bg-rosewood-700 px-3 py-2 text-xs font-bold text-white";
    button.textContent = action.label;
    button.addEventListener("click", action.onClick, { once: true });
    toast.appendChild(button);
  }

  host.appendChild(toast);
  if (!action) window.setTimeout(() => toast.remove(), 4200);
}

async function clearLocalDevelopmentPwaState() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(registrations.map((registration) => registration.unregister()));
  }

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.allSettled(
      keys.filter((key) => key.startsWith("pink-promise")).map((key) => caches.delete(key))
    );
  }
}

async function registerServiceWorker() {
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (localHosts.has(location.hostname)) {
    await clearLocalDevelopmentPwaState().catch((error) => {
      console.warn("Local Pink Promise cache cleanup failed:", error);
    });
    return;
  }

  if (!("serviceWorker" in navigator)) {
    if (elements.status) elements.status.textContent = "Not supported";
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });

    // Check quietly for a newer service worker. Updates are intentionally not
    // forced while the app is open because reloading during authentication or
    // data restoration can leave the installed PWA on its loading screen.
    // A waiting update activates naturally after every Pink Promise window and
    // browser tab is fully closed, then the next launch uses the new version.
    window.setTimeout(() => registration.update().catch(() => {}), 2500);
  } catch (error) {
    console.error("Pink Promise service worker registration failed:", error);
    showPwaToast("The app could not prepare offline support on this browser.", "warning");
  }
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallUI();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  updateInstallUI();
  showPwaToast("Pink Promise was installed successfully.", "success");
});

window.matchMedia("(display-mode: standalone)").addEventListener?.("change", updateInstallUI);
window.addEventListener("online", () => showPwaToast("You’re back online.", "success"));
window.addEventListener("offline", () => showPwaToast("You’re offline. Live sync and Drive media are temporarily unavailable.", "warning"));

elements.installButton?.addEventListener("click", requestInstall);
elements.authInstallButton?.addEventListener("click", requestInstall);
elements.installHelpButton?.addEventListener("click", openInstallHelp);
elements.closeModalButton?.addEventListener("click", closeInstallHelp);
elements.closeModalFooterButton?.addEventListener("click", closeInstallHelp);
elements.modal?.addEventListener("click", (event) => {
  if (event.target === elements.modal) closeInstallHelp();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.modal?.classList.contains("flex")) closeInstallHelp();
});

document.addEventListener("DOMContentLoaded", () => {
  updateInstallUI();
  lockPortraitWhenPossible();
  registerServiceWorker();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") lockPortraitWhenPossible();
});
