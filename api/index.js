import { registerAccountRoutes } from "./account.js";
import { registerAdminRoutes } from "./admin.js";
import { registerActivityLogRoutes } from "./activityLogs.js";
import { registerAuthRoutes } from "./auth.js";
import { registerHealthRoutes } from "./health.js";
import { registerUploadRoutes } from "./uploads.js";

export function registerApiRoutes(app) {
  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerAccountRoutes(app);
  registerAdminRoutes(app);
  registerUploadRoutes(app);
  registerActivityLogRoutes(app);
}
