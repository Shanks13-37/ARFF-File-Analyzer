import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import speakeasy from "speakeasy";
import { prisma } from "../backend/db.js";
import { requireAuth, signToken, verifyToken } from "../backend/utils/auth.js";
import { logActivity } from "../backend/utils/activity.js";
import { isStrongPassword, PASSWORD_REQUIREMENTS } from "../backend/utils/password.js";
import { rateLimit } from "../backend/utils/rateLimit.js";

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    organization: user.organization,
    role: user.role,
    twoFactorEnabled: user.twoFactorEnabled
  };
}

function createAuthToken(user) {
  return signToken({ sub: user.id, email: user.email, role: user.role });
}

async function createTwoFactorSetup(user) {
  const secret = speakeasy.generateSecret({
    name: `ARFF File Analyzer (${user.email})`,
    issuer: "ARFF File Analyzer",
    length: 20
  });
  const setupToken = signToken(
    {
      purpose: "setup_2fa",
      sub: user.id,
      secret: secret.base32
    },
    "10m"
  );
  const qrCode = await QRCode.toDataURL(secret.otpauth_url);

  return {
    setupToken,
    qrCode,
    manualKey: secret.base32
  };
}

function verifyTotp(secret, token) {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: String(token || "").trim(),
    window: 1
  });
}

export function registerAuthRoutes(app) {
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: "Too many registration attempts. Please try again later."
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many login attempts. Please try again later."
  });

  app.post("/api/auth/register", registerLimiter, async (req, res) => {
    const { name, email, organization, password, confirmPassword } = req.body || {};
    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanOrganization = String(organization || "").trim();

    if (cleanName.length < 2) {
      return res.status(400).json({ error: "Enter your full name." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: PASSWORD_REQUIREMENTS });
    }
    if (String(password || "") !== String(confirmPassword || "")) {
      return res.status(400).json({ error: "Password and confirm password must match." });
    }

    try {
      const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (existingUser) {
        await logActivity(req, "USER_REGISTER", "FAILURE", { email: cleanEmail, reason: "Duplicate email" });
        return res.status(409).json({ error: "An account with this email already exists. Please log in instead." });
      }

      const user = await prisma.user.create({
        data: {
          name: cleanName,
          email: cleanEmail,
          organization: cleanOrganization || null,
          passwordHash: await bcrypt.hash(String(password), 12),
          role: "USER"
        }
      });

      await logActivity(req, "USER_REGISTER", "SUCCESS", { email: cleanEmail }, user.id);
      return res.status(201).json({
        token: createAuthToken(user),
        user: publicUser(user)
      });
    } catch (error) {
      if (error.code === "P2002") {
        await logActivity(req, "USER_REGISTER", "FAILURE", { email: cleanEmail, reason: "Duplicate email" });
        return res.status(409).json({ error: "An account with this email already exists." });
      }
      console.error(error);
      return res.status(503).json({ error: "Registration service is unavailable. Check the database connection." });
    }
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    const { email, password, token } = req.body || {};

    try {
      const user = await prisma.user.findUnique({ where: { email: String(email || "").trim().toLowerCase() } });
      const passwordValid = user ? await bcrypt.compare(String(password || ""), user.passwordHash) : false;

      if (!user || !passwordValid) {
        await logActivity(req, "LOGIN", "FAILURE", { email });
        return res.status(401).json({ error: "Invalid email or password." });
      }

      if (user.role === "ADMIN" && (!user.twoFactorEnabled || !user.twoFactorSecret)) {
        const setup = await createTwoFactorSetup(user);
        await logActivity(req, "ADMIN_2FA_SETUP_STARTED", "SUCCESS", {}, user.id);
        return res.json({
          setupRequired: true,
          message: "Two-step authentication setup is required.",
          ...setup
        });
      }

      if (user.role === "ADMIN" && !token) {
        return res.json({
          requiresTwoFactor: true,
          message: "Enter the 6-digit code from your authenticator app."
        });
      }

      if (user.role === "ADMIN" && !verifyTotp(user.twoFactorSecret, token)) {
        await logActivity(req, "ADMIN_LOGIN_2FA", "FAILURE", {}, user.id);
        return res.status(401).json({ error: "Invalid two-step authentication code." });
      }

      await logActivity(req, user.role === "ADMIN" ? "ADMIN_LOGIN" : "USER_LOGIN", "SUCCESS", {}, user.id);
      return res.json({
        token: createAuthToken(user),
        user: publicUser(user)
      });
    } catch (error) {
      console.error(error);
      return res.status(503).json({ error: "Login service is unavailable. Check the database connection." });
    }
  });

  app.post("/api/auth/2fa/enable", async (req, res) => {
    const { setupToken, token } = req.body || {};

    try {
      const payload = verifyToken(setupToken);
      if (payload.purpose !== "setup_2fa" || !payload.sub || !payload.secret) {
        return res.status(400).json({ error: "Invalid two-step setup session." });
      }

      if (!verifyTotp(payload.secret, token)) {
        return res.status(401).json({ error: "Invalid two-step authentication code." });
      }

      const user = await prisma.user.update({
        where: { id: payload.sub },
        data: {
          twoFactorSecret: payload.secret,
          twoFactorEnabled: true
        }
      });

      await logActivity(req, "ADMIN_2FA_ENABLED", "SUCCESS", {}, user.id);
      return res.json({
        token: createAuthToken(user),
        user: publicUser(user)
      });
    } catch {
      return res.status(401).json({ error: "Two-step setup expired. Sign in again." });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
      if (!user) return res.status(404).json({ error: "User not found." });
      return res.json({ user: publicUser(user) });
    } catch {
      return res.status(503).json({ error: "Profile service is unavailable." });
    }
  });
}
