import { prisma } from "../backend/db.js";
import { requireAuth } from "../backend/utils/auth.js";

export function registerDatasetRoutes(app) {
  app.get("/api/datasets", requireAuth, async (req, res) => {
    const isAdmin = req.user.role === "ADMIN";

    try {
      const datasets = await prisma.dataset.findMany({
        where: isAdmin ? undefined : { userId: req.user.sub },
        include: isAdmin
          ? { user: { select: { id: true, name: true, email: true } } }
          : undefined,
        orderBy: { createdAt: "desc" },
        take: 50
      });
      return res.json({ datasets });
    } catch (error) {
      console.error(error);
      return res.status(503).json({ error: "Dataset history is unavailable. Check the database connection.", datasets: [] });
    }
  });
}
