import { createApp } from "./app.js";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { ensureMasterAdmin } from "./lib/master-admin.js";

const app = createApp();

async function main(): Promise<void> {
  await prisma.$connect();
  await ensureMasterAdmin();

  const server = app.listen(env.PORT, () => {
    console.log(`BebMais auth API ouvindo em http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string): void => {
    console.log(`Recebido ${signal}, encerrando...`);
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Falha ao iniciar o servidor: ${message}`);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
