export function registerHealthRoutes(app) {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, module: "1.0 File Upload & Validation" });
  });
}
