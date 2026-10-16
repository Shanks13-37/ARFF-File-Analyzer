import { spawn } from "node:child_process";
import { getPrismaClient } from "../backend/db.js";

const prisma = getPrismaClient();
try {
  const result = await prisma.$queryRaw`SELECT to_regclass('public."SiteBranding"') IS NOT NULL AS legacy_exists`;
  if (result[0]?.legacy_exists) {
    // Keep the abandoned table and every row untouched. db push treats an
    // unmapped table as a possible data-loss warning, so add only our table.
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "WebsiteBranding" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "image" BYTEA,
      "contentType" TEXT,
      "displaySize" INTEGER NOT NULL DEFAULT 48,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    console.log('Preserved legacy "SiteBranding" table; ensured "WebsiteBranding" exists.');
  } else {
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(command, ["prisma", "db", "push"], { stdio: "inherit", env: process.env });
    child.on("error", (error) => { console.error(error); process.exitCode = 1; });
    child.on("exit", (code) => { process.exitCode = code ?? 1; });
    await new Promise((resolve) => child.once("exit", resolve));
  }
} finally {
  await prisma.$disconnect();
}
