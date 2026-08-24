import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { isStrongPassword, PASSWORD_REQUIREMENTS } from "../backend/utils/password.js";

const prisma = new PrismaClient();

const email = (process.env.ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
const defaultAdminPassword = password === "ChangeMe123!";

async function main() {
  if (process.env.NODE_ENV === "production" && defaultAdminPassword) {
    throw new Error("Set ADMIN_PASSWORD before seeding production.");
  }
  if (!isStrongPassword(password)) {
    throw new Error(PASSWORD_REQUIREMENTS);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      name: "Admin",
      email,
      passwordHash,
      role: "ADMIN"
    }
  });

  console.log(`Seeded admin user: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
