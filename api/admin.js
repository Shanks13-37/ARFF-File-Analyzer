import bcrypt from "bcryptjs";
import { prisma } from "../backend/db.js";
import { requireAdmin } from "../backend/utils/auth.js";
import { logActivity } from "../backend/utils/activity.js";
import { isStrongPassword, PASSWORD_REQUIREMENTS } from "../backend/utils/password.js";
import { createTotpSetup } from "../backend/utils/totp.js";

export function registerAdminRoutes(app) {
  app.patch("/api/admin/login-details", requireAdmin, async (req, res) => {
    const { email, currentPassword, newPassword, confirmPassword, resetTwoFactor } = req.body || {};

    try {
      const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
      if (!user) return res.status(404).json({ error: "Admin user not found." });

      const passwordValid = await bcrypt.compare(String(currentPassword || ""), user.passwordHash);
      if (!passwordValid) {
        await logActivity(req, "ADMIN_LOGIN_DETAILS_UPDATE", "FAILURE", { reason: "Bad password" }, user.id);
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
      if (resetTwoFactor) {
        data.twoFactorSecret = null;
        data.twoFactorEnabled = false;
        data.sessionVersion = { increment: 1 };
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data
      });

      await logActivity(req, "ADMIN_LOGIN_DETAILS_UPDATE", "SUCCESS", {
        emailChanged: Boolean(email && email !== user.email),
        passwordChanged: Boolean(newPassword),
        twoFactorReset: Boolean(resetTwoFactor)
      }, user.id);

      const response = {
        message: "Login details updated.",
        user: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          organization: updated.organization,
          role: updated.role,
          twoFactorEnabled: updated.twoFactorEnabled
        }
      };

      if (resetTwoFactor) {
        response.setupRequired = true;
        Object.assign(response, await createTotpSetup(updated));
      }

      return res.json(response);
    } catch (error) {
      if (error.code === "P2002") {
        return res.status(409).json({ error: "That email address is already in use." });
      }
      console.error(error);
      return res.status(503).json({ error: "Settings service is unavailable." });
    }
  });
}
