import jwt from "jsonwebtoken";
import { prisma } from "../db.js";

const JWT_SECRET = process.env.JWT_SECRET || "development-secret-change-me";
const INSECURE_SECRETS = new Set(["development-secret-change-me", "replace-with-a-long-random-secret"]);

if (process.env.NODE_ENV === "production" && INSECURE_SECRETS.has(JWT_SECRET)) {
  throw new Error("Set a strong JWT_SECRET before running in production.");
}

export function signToken(payload, expiresIn = "8h") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing authorization token." });
  }

  try {
    const payload = verifyToken(token);
    if (payload.mfa !== true || !Number.isInteger(payload.sv)) {
      return res.status(401).json({ error: "Authenticator verification is required. Sign in again." });
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { role: true, sessionVersion: true } });
    if (!user || user.sessionVersion !== payload.sv) {
      return res.status(401).json({ error: "Your session has expired. Sign in again." });
    }
    req.user = { ...payload, role: user.role };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired authorization token." });
  }
}

export function requireRole(role) {
  return async (req, res, next) => {
    await requireAuth(req, res, () => {
      if (req.user?.role !== role) {
        return res.status(403).json({ error: "You are not authorized to access this resource." });
      }
      return next();
    });
  };
}

export const requireAdmin = requireRole("ADMIN");
