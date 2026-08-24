import { prisma } from "../db.js";

export function requestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || null;
}

export async function logActivity(req, action, status = "SUCCESS", metadata = {}, userId = null) {
  try {
    await prisma.activityLog.create({
      data: {
        userId,
        action,
        status,
        ipAddress: requestIp(req),
        userAgent: req.headers["user-agent"] || null,
        metadata
      }
    });
  } catch (error) {
    console.error("Activity log failed:", error.message);
  }
}
