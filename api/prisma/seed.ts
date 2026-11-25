import { prisma } from "../src/db.js";
import { ensureMasterAdmin } from "../src/lib/master-admin.js";

async function main(): Promise<void> {
  await ensureMasterAdmin();
  console.log("Seed concluído.");
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Seed falhou: ${message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
