import QRCode from "qrcode";
import speakeasy from "speakeasy";
import { signToken } from "./auth.js";

export async function createTotpSetup(user) {
  const secret = speakeasy.generateSecret({
    name: `ARFF File Analyzer (${user.email})`,
    issuer: "ARFF File Analyzer",
    length: 20
  });
  const setupToken = signToken({ purpose: "setup_2fa", sub: user.id, secret: secret.base32 }, "10m");

  return {
    setupToken,
    qrCode: await QRCode.toDataURL(secret.otpauth_url),
    manualKey: secret.base32
  };
}

export function verifyTotp(secret, token) {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: String(token || "").trim(),
    window: 1
  });
}
