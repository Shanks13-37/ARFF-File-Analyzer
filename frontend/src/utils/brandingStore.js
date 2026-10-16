const API_URL = import.meta.env?.VITE_API_URL ?? "";

let branding = { hasLogo: false, contentType: null, displaySize: 48, imageUrl: null, loading: true, revision: 0 };
let pendingLoad;
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

export function getBrandingSnapshot() {
  return branding;
}

export function subscribeToBranding(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishBranding(next) {
  branding = { ...branding, ...next, loading: false, revision: branding.revision + 1 };
  notify();
  return branding;
}

export function brandingImageSrc(imageUrl, revision = 0) {
  if (!imageUrl) return "";
  const separator = imageUrl.includes("?") ? "&" : "?";
  return `${API_URL}${imageUrl}${separator}r=${revision}`;
}

export function loadBranding({ force = false } = {}) {
  if (pendingLoad && !force) return pendingLoad;
  pendingLoad = fetch(`${API_URL}/api/branding`, { cache: "no-store" })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Branding is unavailable.");
      publishBranding(data);
      return branding;
    })
    .catch((error) => {
      branding = { ...branding, loading: false, loadError: error.message };
      notify();
      throw error;
    })
    .finally(() => { pendingLoad = undefined; });
  return pendingLoad;
}
