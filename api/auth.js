import bcrypt from "bcryptjs";
import { prisma } from "../backend/db.js";
import { requireAuth, signToken, verifyToken } from "../backend/utils/auth.js";
import { logActivity } from "../backend/utils/activity.js";
import { isStrongPassword, PASSWORD_REQUIREMENTS } from "../backend/utils/password.js";
import { rateLimit } from "../backend/utils/rateLimit.js";
import { createTotpSetup, verifyTotp } from "../backend/utils/totp.js";

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
  return signToken({ sub: user.id, email: user.email, role: user.role, mfa: true, sv: user.sessionVersion ?? 0 });
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
  const totpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: "Too many authenticator attempts. Please try again later." });
  const passwordResetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: "Too many password-reset attempts. Please try again later." });

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
      const setup = await createTotpSetup(user);
      return res.status(201).json({
        setupRequired: true,
        message: "Set up an authenticator app and verify a code to finish creating your account.",
        ...setup
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
    const { email, password } = req.body || {};

    try {
      const user = await prisma.user.findUnique({ where: { email: String(email || "").trim().toLowerCase() } });
      const passwordValid = user ? await bcrypt.compare(String(password || ""), user.passwordHash) : false;

      if (!user || !passwordValid) {
        await logActivity(req, "LOGIN", "FAILURE", { email });
        return res.status(401).json({ error: "Invalid email or password." });
      }

      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        const setup = await createTotpSetup(user);
        await logActivity(req, `${user.role}_2FA_SETUP_STARTED`, "SUCCESS", {}, user.id);
        return res.json({
          setupRequired: true,
          message: "Two-step authentication is mandatory. Set up your authenticator app to continue.",
          ...setup
        });
      }

      return res.json({
        requiresTwoFactor: true,
        challengeToken: signToken({ purpose: "login_2fa", sub: user.id, sv: user.sessionVersion ?? 0 }, "10m"),
        message: "Enter the 6-digit code from your authenticator app."
      });
    } catch (error) {
      console.error(error);
      return res.status(503).json({ error: "Login service is unavailable. Check the database connection." });
    }
  });

  app.post("/api/auth/password-reset/verify-totp", passwordResetLimiter, async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.token || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "Enter a valid email and 6-digit authenticator code." });
    }

    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.twoFactorEnabled || !user.twoFactorSecret || !verifyTotp(user.twoFactorSecret, code)) {
        if (user) await logActivity(req, "PASSWORD_RESET", "FAILURE", { reason: "Invalid authenticator code" }, user.id);
        return res.status(401).json({ error: "The email or authenticator code is incorrect." });
      }

      const resetToken = signToken({
        purpose: "password_reset",
        sub: user.id,
        sv: user.sessionVersion ?? 0
      }, "10m");
      return res.json({ resetToken, message: "Code verified. Choose a new password." });
    } catch (error) {
      console.error(error);
      return res.status(503).json({ error: "Password reset is temporarily unavailable." });
    }
  });

  app.post("/api/auth/password-reset/complete", passwordResetLimiter, async (req, res) => {
    const { resetToken, newPassword, confirmPassword } = req.body || {};
    if (!isStrongPassword(newPassword)) return res.status(400).json({ error: PASSWORD_REQUIREMENTS });
    if (String(newPassword) !== String(confirmPassword || "")) {
      return res.status(400).json({ error: "Password and confirm password must match." });
    }

    try {
      const payload = verifyToken(resetToken);
      if (payload.purpose !== "password_reset" || !payload.sub || !Number.isInteger(payload.sv)) {
        return res.status(400).json({ error: "Password reset session is invalid or expired. Start again." });
      }
      const existing = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!existing || existing.sessionVersion !== payload.sv) {
        return res.status(400).json({ error: "Password reset session is invalid or expired. Start again." });
      }

      const updated = await prisma.user.updateMany({
        where: { id: existing.id, sessionVersion: payload.sv },
        data: { passwordHash: await bcrypt.hash(String(newPassword), 12), sessionVersion: { increment: 1 } }
      });
      if (updated.count !== 1) {
        return res.status(400).json({ error: "Password reset session is invalid or expired. Start again." });
      }

      const user = await prisma.user.findUnique({ where: { id: existing.id } });
      await logActivity(req, "PASSWORD_RESET", "SUCCESS", { twoFactor: "totp" }, user.id);
      await logActivity(req, user.role === "ADMIN" ? "ADMIN_LOGIN" : "USER_LOGIN", "SUCCESS", { twoFactor: "totp", passwordReset: true }, user.id);
      return res.json({ token: createAuthToken(user), user: publicUser(user), message: "Password reset successfully. You are now signed in." });
    } catch (error) {
      if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
        return res.status(400).json({ error: "Password reset session is invalid or expired. Start again." });
      }
      console.error(error);
      return res.status(503).json({ error: "Password reset is temporarily unavailable." });
    }
  });

  app.post("/api/auth/2fa/verify-login", totpLimiter, async (req, res) => {
    try {
      const payload = verifyToken(req.body?.challengeToken);
      if (payload.purpose !== "login_2fa" || !payload.sub || !Number.isInteger(payload.sv)) throw new Error("Authenticator login session expired. Sign in again.");
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.sessionVersion !== payload.sv || !user.twoFactorEnabled || !user.twoFactorSecret) throw new Error("Authenticator login session expired. Sign in again.");
      if (!verifyTotp(user.twoFactorSecret, req.body?.token)) {
        await logActivity(req, "TOTP_LOGIN", "FAILURE", {}, user.id);
        return res.status(401).json({ error: "Invalid authenticator code." });
      }
      await logActivity(req, user.role === "ADMIN" ? "ADMIN_LOGIN" : "USER_LOGIN", "SUCCESS", { twoFactor: "totp" }, user.id);
      return res.json({ token: createAuthToken(user), user: publicUser(user) });
    } catch (error) {
      return res.status(401).json({ error: error.message || "Unable to verify authenticator code." });
    }
  });

  app.post("/api/auth/2fa/enable", totpLimiter, async (req, res) => {
    const { setupToken, token } = req.body || {};

    try {
      const payload = verifyToken(setupToken);
      if (payload.purpose !== "setup_2fa" || !payload.sub || !payload.secret || !Number.isInteger(payload.sv)) {
        return res.status(400).json({ error: "Invalid two-step setup session." });
      }

      if (!verifyTotp(payload.secret, token)) {
        return res.status(401).json({ error: "Invalid two-step authentication code." });
      }

      const existing = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!existing) return res.status(404).json({ error: "User not found." });
      if (existing.sessionVersion !== payload.sv) return res.status(401).json({ error: "Two-step setup expired. Sign in again." });
      if (existing.twoFactorEnabled && existing.twoFactorSecret) {
        return res.status(409).json({ error: "Two-step authentication is already configured. Sign in again." });
      }

      const user = await prisma.user.update({
        where: { id: payload.sub },
        data: {
          twoFactorSecret: payload.secret,
          twoFactorEnabled: true
        }
      });

      await logActivity(req, user.role === "ADMIN" ? "ADMIN_2FA_ENABLED" : "USER_2FA_ENABLED", "SUCCESS", { method: "authenticator_app" }, user.id);
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
      const lastLogin = await prisma.activityLog.findFirst({
        where: {
          userId: user.id,
          action: user.role === "ADMIN" ? "ADMIN_LOGIN" : "USER_LOGIN",
          status: "SUCCESS"
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true }
      });
      return res.json({ user: { ...publicUser(user), lastLoginAt: lastLogin?.createdAt || null } });
    } catch {
      return res.status(503).json({ error: "Profile service is unavailable." });
    }
  });
}
