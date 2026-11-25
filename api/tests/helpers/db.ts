import { prisma } from "../../src/db.js";
import { assertTestDatabase } from "./derive-url.js";

export { prisma };

export async function resetDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);

  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "RefreshToken", "User", "Company" RESTART IDENTITY CASCADE',
  );
}
