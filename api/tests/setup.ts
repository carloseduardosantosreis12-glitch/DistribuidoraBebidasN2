import "dotenv/config";
import { afterAll, beforeEach } from "vitest";
import { resolveTestDatabaseUrl } from "./helpers/derive-url.js";

process.env.DATABASE_URL = resolveTestDatabaseUrl();

const { prisma } = await import("../src/db.js");
const { resetDatabase } = await import("./helpers/db.js");

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
