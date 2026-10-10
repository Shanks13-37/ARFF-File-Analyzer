import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
const [{ registerApiRoutes }, { setPrismaClient }, { verifyToken }] = await Promise.all([
  import("../../api/index.js"),
  import("../../backend/db.js"),
  import("../../backend/utils/auth.js")
]);
const { createMemoryDatabase } = await import("../helpers/memoryPrisma.js");

test("HTTP API registration, 2FA enrollment, profile, and ARFF upload work together", async (context) => {
  const database = createMemoryDatabase();
  setPrismaClient(database);
  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
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

  const healthResponse = await fetch(`${base}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json()).ok, true);

  const registration = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Integration User",
      email: " Test.User@Example.com ",
      organization: "Test Org",
      password: "StrongPass1!",
      confirmPassword: "StrongPass1!"
    })
  });
  assert.equal(registration.status, 201);
  const setup = await registration.json();
  assert.equal(setup.setupRequired, true);
  const setupPayload = verifyToken(setup.setupToken);
  assert.equal(setupPayload.purpose, "setup_2fa");
  const user = database.users[0];
  assert.equal(user.email, "test.user@example.com");
  assert.equal(await bcrypt.compare("StrongPass1!", user.passwordHash), true);

  const enableResponse = await fetch(`${base}/api/auth/2fa/enable`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      setupToken: setup.setupToken,
      token: speakeasy.totp({ secret: setupPayload.secret, encoding: "base32" })
    })
  });
  assert.equal(enableResponse.status, 200);
  const enrolled = await enableResponse.json();
  assert.equal(enrolled.user.twoFactorEnabled, true);
  assert.equal(user.twoFactorEnabled, true);

  const profileResponse = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${enrolled.token}` } });
  assert.equal(profileResponse.status, 200);
  assert.equal((await profileResponse.json()).user.email, "test.user@example.com");

  const deniedUpload = await fetch(`${base}/api/uploads/arff`, { method: "POST" });
  assert.equal(deniedUpload.status, 401);

  const form = new FormData();
  form.append("file", new Blob(["@relation demo\n@attribute value numeric\n@data\n3"], { type: "text/plain" }), "demo.arff");
  const uploadResponse = await fetch(`${base}/api/uploads/arff`, {
    method: "POST",
    headers: { authorization: `Bearer ${enrolled.token}` },
    body: form
  });
  assert.equal(uploadResponse.status, 201);
  const upload = await uploadResponse.json();
  assert.equal(upload.valid, true);
  assert.equal(upload.summary.instanceCount, 1);
  assert.equal(database.datasets.length, 1);
  assert.equal(database.datasets[0].userId, user.id);
  assert.ok(database.activityLogs.some((log) => log.action === "USER_2FA_ENABLED"));

  const resetCode = speakeasy.totp({ secret: setupPayload.secret, encoding: "base32" });
  const resetVerificationResponse = await fetch(`${base}/api/auth/password-reset/verify-totp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: user.email, token: resetCode })
  });
  assert.equal(resetVerificationResponse.status, 200);
  const resetChallenge = await resetVerificationResponse.json();

  const resetResponse = await fetch(`${base}/api/auth/password-reset/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resetToken: resetChallenge.resetToken, newPassword: "NewStrongPass2!", confirmPassword: "NewStrongPass2!" })
  });
  assert.equal(resetResponse.status, 200);
  const resetResult = await resetResponse.json();
  assert.equal(resetResult.user.email, user.email);
  assert.equal(await bcrypt.compare("NewStrongPass2!", user.passwordHash), true);

  const resetProfileResponse = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${resetResult.token}` } });
  assert.equal(resetProfileResponse.status, 200);
  const oldSessionResponse = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${enrolled.token}` } });
  assert.equal(oldSessionResponse.status, 401);
});
