import { registerAccountRoutes } from "./account.js";
import { registerAdminRoutes } from "./admin.js";
import { registerActivityLogRoutes } from "./activityLogs.js";
import { registerAuthRoutes } from "./auth.js";
import { registerHealthRoutes } from "./health.js";
import { registerUploadRoutes } from "./uploads.js";
import { registerDatasetRoutes } from "./datasets.js";
import { registerQualityRoutes } from "./quality.js";
import { registerBrandingRoutes } from "./branding.js";

export function registerApiRoutes(app) {
  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerAccountRoutes(app);
  registerAdminRoutes(app);
  registerBrandingRoutes(app);
  registerUploadRoutes(app);
  registerQualityRoutes(app);
  registerDatasetRoutes(app);
  registerActivityLogRoutes(app);
}
