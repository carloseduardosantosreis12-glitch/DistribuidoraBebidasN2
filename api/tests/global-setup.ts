import { execSync } from "node:child_process";
import "dotenv/config";
import { assertTestDatabase, resolveTestDatabaseUrl } from "./helpers/derive-url.js";

export default function globalSetup(): void {
  const url = resolveTestDatabaseUrl();
  assertTestDatabase(url);

  process.env.DATABASE_URL = url;

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
