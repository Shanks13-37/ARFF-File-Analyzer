import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL || "";
const placeholderValues = new Set(["user", "password", "host", "real_user", "real_password", "real_host"]);

function hasPlaceholderDatabaseUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return [parsedUrl.username, parsedUrl.password, parsedUrl.hostname].some((part) =>
      placeholderValues.has(part.toLowerCase())
    );
  } catch {
    return true;
  }
}

if (!databaseUrl || hasPlaceholderDatabaseUrl(databaseUrl)) {
  throw new Error("DATABASE_URL is missing or still contains placeholder values. Set it to a real PostgreSQL connection string.");
}

export const prisma = new PrismaClient();
