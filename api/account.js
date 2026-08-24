import bcrypt from "bcryptjs";
import { prisma } from "../backend/db.js";
import { requireAuth } from "../backend/utils/auth.js";
import { logActivity } from "../backend/utils/activity.js";
import { isStrongPassword, PASSWORD_REQUIREMENTS } from "../backend/utils/password.js";

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

export function registerAccountRoutes(app) {
  app.patch("/api/account/login-details", requireAuth, async (req, res) => {
    const { email, currentPassword, newPassword, confirmPassword } = req.body || {};

    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
      if (!user) return res.status(404).json({ error: "User not found." });

      const passwordValid = await bcrypt.compare(String(currentPassword || ""), user.passwordHash);
      if (!passwordValid) {
        await logActivity(req, "ACCOUNT_LOGIN_DETAILS_UPDATE", "FAILURE", { reason: "Bad password" }, user.id);
        return res.status(401).json({ error: "Current password is incorrect." });
      }

      const data = {};
      if (email) data.email = String(email).trim().toLowerCase();
      if (newPassword) {
        if (!isStrongPassword(newPassword)) {
          return res.status(400).json({ error: PASSWORD_REQUIREMENTS });
        }
        if (String(newPassword) !== String(confirmPassword || "")) {
          return res.status(400).json({ error: "New password and confirm password must match." });
        }
        data.passwordHash = await bcrypt.hash(String(newPassword), 12);
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data
      });

      await logActivity(req, "ACCOUNT_LOGIN_DETAILS_UPDATE", "SUCCESS", {
        emailChanged: Boolean(email && email !== user.email),
        passwordChanged: Boolean(newPassword)
      }, user.id);

      return res.json({
        message: "Login details updated.",
        user: publicUser(updated)
      });
    } catch (error) {
      if (error.code === "P2002") {
        return res.status(409).json({ error: "That email address is already in use." });
      }
      console.error(error);
      return res.status(503).json({ error: "Account settings are unavailable." });
    }
  });
}
