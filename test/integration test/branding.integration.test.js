import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { readFile } from "node:fs/promises";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
const [{ registerBrandingRoutes, detectBrandingImage, saveBrandingLogo, BRANDING_SIZES }, { setPrismaClient }, { signToken }] = await Promise.all([
  import("../../api/branding.js"), import("../../backend/db.js"), import("../../backend/utils/auth.js")
]);
const { createLogoPreview, revokeLogoPreview, validateLogoSelection } = await import("../../frontend/src/utils/logoPreview.js");
const brandingStore = await import("../../frontend/src/utils/brandingStore.js");

function png(size = 59) {
  const dataLength = size - 57;
  const b = Buffer.alloc(size); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  let offset = 8;
  const chunk = (type, payloadLength) => {
    b.writeUInt32BE(payloadLength, offset); b.write(type, offset + 4, "ascii");
    if (type === "IHDR") { b.writeUInt32BE(1, offset + 8); b.writeUInt32BE(1, offset + 12); }
    offset += payloadLength + 12;
  };
  chunk("IHDR", 13); chunk("IDAT", dataLength); chunk("IEND", 0);
  return b;
}

test("branding validates image formats, boundaries, malformed content, and SVG safety", () => {
  assert.deepEqual(BRANDING_SIZES, [24, 32, 48, 64]);
  assert.equal(detectBrandingImage(png()), "image/png");
  assert.equal(detectBrandingImage(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9])), "image/jpeg");
  const webp = Buffer.from("RIFF\x04\x00\x00\x00WEBP", "binary");
  assert.equal(detectBrandingImage(webp), "image/webp");
  assert.equal(detectBrandingImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')), "image/svg+xml");
  assert.throws(() => detectBrandingImage(Buffer.alloc(0)), /non-empty/);
  assert.throws(() => detectBrandingImage(Buffer.alloc(100_000)), /100,000/);
  assert.equal(detectBrandingImage(png(99_999)), "image/png");
  assert.throws(() => detectBrandingImage(Buffer.from("GIF89a")), /Unsupported or malformed/);
  assert.throws(() => detectBrandingImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), /Unsupported or malformed/);
  assert.throws(() => detectBrandingImage(Buffer.from("<svg><script>alert(1)</script></svg>")), /unsafe content/);
  assert.throws(() => detectBrandingImage(Buffer.from("<svg><image href=\"https://evil.test/a\"/></svg>")), /unsafe content/);
});

test("shared header uses the persisted logo, keeps the default icon, and contains the image in its padded square", async () => {
  const source = await readFile(new URL("../../frontend/src/main.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../../frontend/src/styles.css", import.meta.url), "utf8");
  const storeSource = await readFile(new URL("../../frontend/src/utils/brandingStore.js", import.meta.url), "utf8");
  assert.match(source, /branding\.hasLogo && branding\.imageUrl/);
  assert.match(source, /<Database size=\{22\} \/>/);
  assert.match(source, /publishBranding\(data\)/);
  assert.match(source, /subscribeToBranding/);
  assert.match(source, /if \(!selected\) return/);
  assert.match(source, /brandingImageSrc\(branding\.imageUrl, branding\.revision\)/);
  assert.match(source, /maxWidth: branding\.displaySize - 4, maxHeight: branding\.displaySize - 4/);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(storeSource, /displaySize: 48/);
  for (const size of BRANDING_SIZES) assert.match(source, new RegExp(`value="${size}"`));
});

test("local selection validates files, creates and revokes object URLs, and publishes saved branding to shared subscribers", async () => {
  const file = { name: "mark.png", size: 512 };
  assert.equal(validateLogoSelection(file), "");
  assert.match(validateLogoSelection({ name: "mark.gif", size: 20 }), /JPEG, PNG, SVG, or WEBP/);
  assert.match(validateLogoSelection({ name: "mark.png", size: 0 }), /non-empty/);
  assert.match(validateLogoSelection({ name: "mark.png", size: 100_000 }), /100,000/);
  const events = [];
  const urlApi = { createObjectURL(value) { events.push(["create", value]); return "blob:test-image"; }, revokeObjectURL(value) { events.push(["revoke", value]); } };
  const previewUrl = createLogoPreview(file, urlApi);
  revokeLogoPreview(previewUrl, urlApi);
  assert.deepEqual(events, [["create", file], ["revoke", "blob:test-image"]]);

  const before = brandingStore.getBrandingSnapshot();
  let notified = 0;
  const unsubscribe = brandingStore.subscribeToBranding(() => { notified += 1; });
  const restoreFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "/api/branding");
    assert.equal(options.cache, "no-store");
    return new Response(JSON.stringify({ hasLogo: true, contentType: "image/png", displaySize: 32, imageUrl: "/api/branding/image?v=1" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const loaded = await brandingStore.loadBranding({ force: true });
    assert.equal(loaded.hasLogo, true);
    assert.equal(loaded.displaySize, 32);
    assert.equal(brandingStore.getBrandingSnapshot().imageUrl, "/api/branding/image?v=1");
    assert.match(brandingStore.brandingImageSrc(loaded.imageUrl, loaded.revision), /\/api\/branding\/image\?v=1&r=/);
    const loadedRevision = loaded.revision;
    brandingStore.publishBranding({ hasLogo: false, imageUrl: null, displaySize: 48 });
    assert.equal(brandingStore.getBrandingSnapshot().hasLogo, false);
    assert.ok(brandingStore.getBrandingSnapshot().revision > loadedRevision);
    assert.ok(notified >= 2, "subscribers receive retrieval and removal updates");
  } finally {
    globalThis.fetch = restoreFetch;
    unsubscribe();
    brandingStore.publishBranding(before);
  }
});

test("public saved-logo retrieval returns binary image bytes with its stored content type", async () => {
  let routes = {};
  const app = {
    get(path, ...handlers) { routes[path] = handlers; },
    put(path, ...handlers) { routes[path] = handlers; },
    patch(path, ...handlers) { routes[path] = handlers; },
    delete(path, ...handlers) { routes[path] = handlers; }
  };
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  registerBrandingRoutes(app, { prismaClient: { websiteBranding: { async findUnique() { return { image: bytes, contentType: "image/png", displaySize: 32, updatedAt: new Date(1) }; }, async upsert() {} } } });
  const response = { headers: {}, set(values) { Object.assign(this.headers, values); return this; }, type(value) { this.headers["Content-Type"] = value; return this; }, send(value) { this.body = value; return this; }, status(code) { this.statusCode = code; return this; }, sendStatus(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await routes["/api/branding/image"][0]({}, response);
  assert.equal(response.statusCode, undefined);
  assert.equal(response.headers["Content-Type"], "image/png");
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(Buffer.isBuffer(response.body), true);
  assert.deepEqual([...response.body], [1, 2, 3, 4]);
});

test("upload persistence stores bytes and size, replaces atomically, and leaves a previous logo intact on invalid input", async () => {
  let row = null;
  const prismaClient = { websiteBranding: { async upsert({ create, update }) { row = { ...(row || create), ...update, ...(row ? {} : create), updatedAt: new Date() }; return row; } } };
  const original = png();
  const saved = await saveBrandingLogo({ buffer: original, displaySize: "24", prismaClient });
  assert.equal(saved.contentType, "image/png");
  assert.equal(saved.displaySize, 24);
  assert.deepEqual(Buffer.from(saved.image), original);
  const replacement = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>');
  const updated = await saveBrandingLogo({ buffer: replacement, displaySize: "64", prismaClient });
  assert.equal(updated.contentType, "image/svg+xml");
  assert.equal(updated.displaySize, 64);
  const previouslySaved = Buffer.from(row.image);
  await assert.rejects(saveBrandingLogo({ buffer: Buffer.from("not an image"), displaySize: "32", prismaClient }), /Unsupported or malformed/);
  assert.deepEqual(Buffer.from(row.image), previouslySaved);
  await assert.rejects(saveBrandingLogo({ buffer: png(), displaySize: "20", prismaClient }), /24, 32, 48, or 64/);
  assert.deepEqual(Buffer.from(row.image), previouslySaved);
});

test("branding API protects writes and persists replacement, size, image retrieval, and removal", async (context) => {
  let stored = null;
  const users = [{ id: "admin", role: "ADMIN", sessionVersion: 0 }, { id: "user", role: "USER", sessionVersion: 0 }];
  const fake = {
    user: { async findUnique({ where }) { return users.find((u) => u.id === where.id) || null; } },
    websiteBranding: {
      async findUnique() { return stored; },
      async upsert({ create, update }) { stored = { ...(stored || create), ...update, updatedAt: new Date() }; return stored; }
    }
  };
  setPrismaClient(fake);
  const app = express(); app.use(express.json()); registerBrandingRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  context.after(() => { server.close(); setPrismaClient(null); });
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = signToken({ sub: "admin", mfa: true, sv: 0 });
  const user = signToken({ sub: "user", mfa: true, sv: 0 });

  assert.deepEqual(await (await fetch(`${base}/api/branding`)).json(), { hasLogo: false, contentType: null, displaySize: 48, updatedAt: null, imageUrl: null });
  const denied = await fetch(`${base}/api/admin/branding/logo`, { method: "DELETE", headers: { authorization: `Bearer ${user}` } });
  assert.equal(denied.status, 403);
  const unauthorized = await fetch(`${base}/api/admin/branding/size`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displaySize: 32 }) });
  assert.equal(unauthorized.status, 401);

  async function postLogo(bytes, name = "logo.png", displaySize = 48) {
    const form = new FormData(); form.append("logo", new Blob([bytes], { type: "application/octet-stream" }), name); form.append("displaySize", String(displaySize));
    return fetch(`${base}/api/admin/branding/logo`, { method: "PUT", headers: { authorization: `Bearer ${admin}` }, body: form });
  }
  const first = await postLogo(png(), "logo.png", 24);
  assert.equal(first.status, 200); assert.equal((await first.json()).displaySize, 24);
  const bad = await postLogo(Buffer.from("nope"), "bad.png");
  assert.equal(bad.status, 400); assert.equal(stored.image.toString("hex"), png().toString("hex"), "failed upload retains saved image");
  const oversized = await postLogo(Buffer.alloc(100_000), "large.png"); assert.equal(oversized.status, 413);
  const resized = await fetch(`${base}/api/admin/branding/size`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${admin}` }, body: JSON.stringify({ displaySize: 64 }) });
  assert.equal((await resized.json()).displaySize, 64);
  const metadata = await (await fetch(`${base}/api/branding`)).json(); assert.equal(metadata.displaySize, 64); assert.equal(metadata.hasLogo, true);
  const imageResponse = await fetch(`${base}/api/branding/image`); assert.equal(imageResponse.status, 200); assert.equal(imageResponse.headers.get("content-type"), "image/png");
  const removed = await fetch(`${base}/api/admin/branding/logo`, { method: "DELETE", headers: { authorization: `Bearer ${admin}` } }); assert.equal(removed.status, 200); assert.equal((await removed.json()).hasLogo, false);
});
