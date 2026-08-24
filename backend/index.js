import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import { logActivity } from "./utils/activity.js";
import { registerApiRoutes } from "../api/index.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, "../dist");

const PORT = process.env.PORT || 4000;
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const isProduction = process.env.NODE_ENV === "production";

["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"].forEach((origin) =>
  allowedOrigins.add(origin)
);

function isAllowedDevOrigin(origin) {
  if (isProduction) return false;
  try {
    const { hostname } = new URL(origin);
    const privateIpv4Pattern = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      privateIpv4Pattern.test(hostname)
    );
  } catch {
    return false;
  }
}

function createCorsError(origin) {
  const error = new Error(`Origin ${origin || "unknown"} is not allowed by CORS.`);
  error.code = "CORS_NOT_ALLOWED";
  return error;
}

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin) || isAllowedDevOrigin(origin)) return callback(null, true);
      return callback(createCorsError(origin));
    }
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(distPath));

registerApiRoutes(app);

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  return res.sendFile(path.join(distPath, "index.html"));
});

app.use((error, req, res, _next) => {
  if (error.code === "CORS_NOT_ALLOWED") {
    return res.status(403).json({
      valid: false,
      error: error.message
    });
  }

  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    logActivity(req, "ARFF_UPLOAD_VALIDATION", "FAILURE", {
      reason: "File exceeded 10 MB limit"
    });
    return res.status(413).json({
      valid: false,
      error: "File is too large. Maximum allowed size is 10 MB."
    });
  }

  console.error(error);
  return res.status(500).json({
    valid: false,
    error: "Unexpected server error."
  });
});

app.listen(PORT, () => {
  console.log(`Module 1 API running on http://localhost:${PORT}`);
});
