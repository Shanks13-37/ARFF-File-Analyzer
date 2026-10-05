import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import speakeasy from "speakeasy";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
const [{ registerApiRoutes }, { setPrismaClient }, { verifyToken }, { createMemoryDatabase }] = await Promise.all([
  import("../../api/index.js"),
  import("../../backend/db.js"),
  import("../../backend/utils/auth.js"),
  import("../helpers/memoryPrisma.js")
]);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const distPath = path.join(projectRoot, "dist");

test("built application serves UI and completes a user upload journey", async (context) => {
  const database = createMemoryDatabase();
  setPrismaClient(database);

  const app = express();
  app.use(express.json());
  app.use(express.static(distPath));
  registerApiRoutes(app);
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    return res.sendFile(path.join(distPath, "index.html"));
  });

  const server = app.listen(0, "127.0.0.1");
  context.after(() => {
    server.close();
    setPrismaClient(null);
  });
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const pageResponse = await fetch(base);
  assert.equal(pageResponse.status, 200);
  const html = await pageResponse.text();
  assert.match(html, /<div id="root"><\/div>/);
  const bundlePath = html.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(bundlePath, "built page should reference its JavaScript bundle");
  const bundleResponse = await fetch(new URL(bundlePath, base));
  assert.equal(bundleResponse.status, 200);
  assert.match(await bundleResponse.text(), /Upload ARFF File/);

  const registrationResponse = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "System Test User",
      email: "system.user@example.com",
      organization: "System Test",
      password: "SystemPass1!",
      confirmPassword: "SystemPass1!"
    })
  });
  assert.equal(registrationResponse.status, 201);
  const setup = await registrationResponse.json();
  const setupPayload = verifyToken(setup.setupToken);

  const enrollmentResponse = await fetch(`${base}/api/auth/2fa/enable`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      setupToken: setup.setupToken,
      token: speakeasy.totp({ secret: setupPayload.secret, encoding: "base32" })
    })
  });
  assert.equal(enrollmentResponse.status, 200);
  const { token, user } = await enrollmentResponse.json();

  const uploadForm = new FormData();
  uploadForm.append("file", new Blob(["@relation system\n@attribute score numeric\n@data\n7\n9"]), "system.arff");
  const uploadResponse = await fetch(`${base}/api/uploads/arff`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: uploadForm
  });
  assert.equal(uploadResponse.status, 201);
  const upload = await uploadResponse.json();
  assert.equal(upload.valid, true);
  assert.equal(upload.summary.instanceCount, 2);

  const historyResponse = await fetch(`${base}/api/datasets`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.equal(history.datasets.length, 1);
  assert.equal(history.datasets[0].originalName, "system.arff");
  assert.equal(history.datasets[0].userId, user.id);
});
