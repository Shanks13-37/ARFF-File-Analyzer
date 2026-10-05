import assert from "node:assert/strict";
import test from "node:test";
import { requireAdmin, requireAuth, requireRole, signToken } from "../backend/utils/auth.js";
import { detectImage, isValidIp, contactSchema } from "../backend/utils/validators.js";
import { isStrongPassword, PASSWORD_REQUIREMENTS } from "../backend/utils/password.js";
import { rateLimit } from "../backend/utils/rateLimit.js";

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("password policy accepts strong passwords and rejects each missing requirement", () => {
  assert.equal(isStrongPassword("ValidPass1!"), true);
  for (const password of ["Sh1!rt", "lowercase1!", "UPPERCASE1!", "NoNumber!!", "NoSpecial1"]) {
    assert.equal(isStrongPassword(password), false, password);
  }
  assert.match(PASSWORD_REQUIREMENTS, /uppercase, lowercase, number, and special character/i);
});

test("contact schema trims valid fields and rejects invalid lengths and email", () => {
  const parsed = contactSchema.safeParse({ name: " Ada ", email: " ada@example.com ", message: " A sufficiently long message " });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data, { name: "Ada", email: "ada@example.com", message: "A sufficiently long message" });
  assert.equal(contactSchema.safeParse({ name: "A", email: "bad", message: "short" }).success, false);
});

test("validates IPv4 and supported IPv6 forms", () => {
  for (const ip of ["127.0.0.1", "255.255.255.255", "::1", "::", "2001:db8:0:0:0:0:0:1"]) assert.equal(isValidIp(ip), true, ip);
  for (const ip of ["256.0.0.1", "1.2.3", "not-an-ip", "", null]) assert.equal(isValidIp(ip), false, String(ip));
});

test("detects supported image signatures and rejects unknown or short buffers", () => {
  const signatures = [
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/jpeg", [0xff, 0xd8, 0xff]],
    ["image/gif", [...Buffer.from("GIF89a")]],
    ["image/webp", [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]]
  ];
  for (const [mime, signature] of signatures) {
    const buffer = Buffer.alloc(12);
    Buffer.from(signature).copy(buffer);
    assert.equal(detectImage(buffer), mime);
  }
  assert.equal(detectImage(Buffer.from("not an image")), null);
  assert.equal(detectImage(Buffer.alloc(11)), null);
  assert.equal(detectImage(null), null);
});

test("requires a bearer token with completed authenticator verification", () => {
  const noTokenResponse = response();
  requireAuth({ headers: {} }, noTokenResponse, () => assert.fail("must not continue"));
  assert.equal(noTokenResponse.statusCode, 401);

  const incompleteResponse = response();
  requireAuth({ headers: { authorization: `Bearer ${signToken({ sub: "u1", mfa: false })}` } }, incompleteResponse, () => assert.fail("must not continue"));
  assert.equal(incompleteResponse.statusCode, 401);
  assert.match(incompleteResponse.body.error, /authenticator verification/i);

  const successResponse = response();
  let continued = false;
  requireAuth({ headers: { authorization: `Bearer ${signToken({ sub: "u1", mfa: true, role: "USER" })}` } }, successResponse, () => { continued = true; });
  assert.equal(continued, true);
});

test("enforces roles after authentication", () => {
  const denied = response();
  requireAdmin({ headers: { authorization: `Bearer ${signToken({ sub: "u1", mfa: true, role: "USER" })}` } }, denied, () => assert.fail("must not continue"));
  assert.equal(denied.statusCode, 403);

  const allowed = response();
  let continued = false;
  requireRole("ADMIN")({ headers: { authorization: `Bearer ${signToken({ sub: "a1", mfa: true, role: "ADMIN" })}` } }, allowed, () => { continued = true; });
  assert.equal(continued, true);
});

test("rate limits by method, path, and client and sets retry-after", () => {
  const middleware = rateLimit({ windowMs: 60_000, max: 1, message: "Slow down." });
  const req = { method: "POST", path: "/unit-test-rate-limit", ip: "192.0.2.10", headers: {} };
  let calls = 0;
  middleware(req, response(), () => { calls += 1; });
  const blocked = response();
  middleware(req, blocked, () => { calls += 1; });
  assert.equal(calls, 1);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.error, "Slow down.");
  assert.ok(Number(blocked.headers["Retry-After"]) > 0);

  let otherClientContinued = false;
  middleware({ ...req, ip: "192.0.2.11" }, response(), () => { otherClientContinued = true; });
  assert.equal(otherClientContinued, true);
});
