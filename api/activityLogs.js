import { prisma } from "../backend/db.js";
import { requireAuth } from "../backend/utils/auth.js";

export function registerActivityLogRoutes(app) {
  app.get("/api/activity-logs", requireAuth, async (req, res) => {
    try {
      const isAdmin = req.user.role === "ADMIN";
      const logs = await prisma.activityLog.findMany({
        where: isAdmin ? undefined : { userId: req.user.sub },
        orderBy: { createdAt: "desc" },
        take: 25
      });
      res.json({ logs });
    } catch {
      res.status(503).json({
        error: "Activity logs are unavailable. Check the database connection.",
        logs: []
      });
    }
  });
}
