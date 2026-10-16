const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "svg", "webp"]);

export function validateLogoSelection(file) {
  if (!file) return "Choose a logo file.";
  if (!file.size) return "Choose a non-empty image file.";
  if (file.size >= 100_000) return "Logo must be smaller than 100,000 bytes.";
  const extension = String(file.name || "").split(".").pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) return "Choose a JPEG, PNG, SVG, or WEBP image.";
  return "";
}

export function createLogoPreview(file, urlApi = URL) {
  return urlApi.createObjectURL(file);
}

export function revokeLogoPreview(url, urlApi = URL) {
  if (url) urlApi.revokeObjectURL(url);
}
