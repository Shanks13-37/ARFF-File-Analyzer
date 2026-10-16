import multer from "multer";
import { prisma } from "../backend/db.js";
import { requireAdmin } from "../backend/utils/auth.js";

export const BRANDING_SIZES = [24, 32, 48, 64];
const MAX_BYTES = 99_999;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 1 } });

function isStructuredPng(buffer) {
  if (buffer.length < 57 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return false;
  let offset = 8;
  let sawHeader = false;
  let sawData = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    if (length > buffer.length - offset - 12) return false;
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13 || buffer.readUInt32BE(offset + 8) === 0 || buffer.readUInt32BE(offset + 12) === 0) return false;
      sawHeader = true;
    }
    if (type === "IDAT") sawData = true;
    offset += length + 12;
    if (type === "IEND") return length === 0 && sawData && offset === buffer.length;
  }
  return false;
}

export function detectBrandingImage(buffer) {
  if (!buffer?.length) throw new Error("Choose a non-empty image file.");
  if (buffer.length >= 100_000) throw new Error("Logo must be smaller than 100,000 bytes.");
  if (isStructuredPng(buffer)) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  const text = buffer.toString("utf8").trim();
  if (/^(?:<\?xml[^>]*>\s*)?<svg\b/i.test(text) && /<\/svg>\s*$/i.test(text)) {
    if (/<(?:script|style|foreignObject|iframe|object|embed|animate|set|animateMotion|animateTransform)\b|\bon\w+\s*=|\burl\s*\(|@import|xml-stylesheet|(?:href|xlink:href)\s*=\s*["'](?!\s*#)[^"']*["']|<!ENTITY|<!DOCTYPE/i.test(text)) {
      throw new Error("SVG contains unsafe content. Remove scripts, event handlers, and external resources.");
    }
    return "image/svg+xml";
  }
  throw new Error("Unsupported or malformed image. Use JPEG, PNG, SVG, or WEBP.");
}

function sendError(res, error) {
  const status = error instanceof multer.MulterError ? (error.code === "LIMIT_FILE_SIZE" ? 413 : 400) : (error.status || 503);
  return res.status(status).json({ error: error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? "Logo must be smaller than 100,000 bytes." : error.message || "Logo upload failed." });
}

export async function saveBrandingLogo({ buffer, displaySize = 48, prismaClient = prisma }) {
  let contentType;
  try { contentType = detectBrandingImage(buffer); }
  catch (error) { error.status = 400; throw error; }
  const size = Number(displaySize);
  if (!BRANDING_SIZES.includes(size)) {
    const error = new Error("Choose 24, 32, 48, or 64 pixels.");
    error.status = 400;
    throw error;
  }
  return prismaClient.websiteBranding.upsert({
    where: { id: "site" },
    create: { id: "site", image: buffer, contentType, displaySize: size },
    update: { image: buffer, contentType, displaySize: size, updatedAt: new Date() }
  });
}

export function registerBrandingRoutes(app, { prismaClient = prisma } = {}) {
  app.get("/api/branding", async (_req, res) => {
    try {
      const record = await prismaClient.websiteBranding.findUnique({ where: { id: "site" }, select: { contentType: true, displaySize: true, updatedAt: true } });
      res.json({ hasLogo: Boolean(record?.contentType), contentType: record?.contentType || null, displaySize: record?.displaySize || 48, updatedAt: record?.updatedAt || null, imageUrl: record?.contentType ? `/api/branding/image?v=${record.updatedAt?.getTime?.() || 0}` : null });
    } catch (error) { console.error(error); res.status(503).json({ error: "Branding is unavailable." }); }
  });
  app.get("/api/branding/image", async (_req, res) => {
    try {
      const record = await prismaClient.websiteBranding.findUnique({ where: { id: "site" }, select: { image: true, contentType: true, updatedAt: true } });
      if (!record?.image || !record.contentType) return res.sendStatus(404);
      res.set({ "Content-Type": record.contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
      // Prisma Bytes is a Uint8Array; Express 4 only treats Buffer as binary.
      return res.type(record.contentType).send(Buffer.from(record.image));
    } catch (error) { console.error(error); return res.status(503).json({ error: "Branding is unavailable." }); }
  });
  app.put("/api/admin/branding/logo", requireAdmin, (req, res) => upload.single("logo")(req, res, async (uploadError) => {
    if (uploadError) return sendError(res, uploadError);
    try {
      if (!req.file) return res.status(400).json({ error: "Choose a logo file." });
      const record = await saveBrandingLogo({ buffer: req.file.buffer, displaySize: req.body?.displaySize ?? 48, prismaClient });
      return res.json({ hasLogo: true, contentType: record.contentType, displaySize: record.displaySize, updatedAt: record.updatedAt, imageUrl: `/api/branding/image?v=${record.updatedAt?.getTime?.() || Date.now()}` });
    } catch (error) { return sendError(res, error); }
  }));
  app.patch("/api/admin/branding/size", requireAdmin, async (req, res) => {
    const displaySize = Number(req.body?.displaySize);
    if (!BRANDING_SIZES.includes(displaySize)) return res.status(400).json({ error: "Choose 24, 32, 48, or 64 pixels." });
    try {
      const record = await prismaClient.websiteBranding.upsert({ where: { id: "site" }, create: { id: "site", displaySize }, update: { displaySize, updatedAt: new Date() } });
      res.json({ hasLogo: Boolean(record.contentType), contentType: record.contentType, displaySize: record.displaySize, updatedAt: record.updatedAt, imageUrl: record.contentType ? `/api/branding/image?v=${record.updatedAt?.getTime?.() || 0}` : null });
    } catch (error) { console.error(error); res.status(503).json({ error: "Branding could not be updated." }); }
  });
  app.delete("/api/admin/branding/logo", requireAdmin, async (_req, res) => {
    try {
      const record = await prismaClient.websiteBranding.upsert({ where: { id: "site" }, create: { id: "site", image: null, contentType: null, displaySize: 48 }, update: { image: null, contentType: null, updatedAt: new Date() } });
      res.json({ hasLogo: false, contentType: null, displaySize: record.displaySize, updatedAt: record.updatedAt, imageUrl: null });
    } catch (error) { console.error(error); res.status(503).json({ error: "Branding could not be removed." }); }
  });
}
