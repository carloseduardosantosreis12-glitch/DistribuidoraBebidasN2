import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { hashPassword, passwordSchema } from "./password.js";

export const MASTER_COMPANY_NAME = "BebMais";
export const MASTER_ADMIN_NAME = "Administrador";
export const MASTER_ADMIN_EMAIL = "admin@bebmais.com";

export type EnsureMasterAdminOptions = {
  seedPassword?: string | undefined;
};

export async function ensureMasterAdmin(options: EnsureMasterAdminOptions = {}): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: MASTER_ADMIN_EMAIL } });

  if (existing) {
    if (!existing.active || existing.role !== "ADMIN") {
      await prisma.user.update({
        where: { id: existing.id },
        data: { active: true, role: "ADMIN" },
      });
      console.warn(
        `[master-admin] Usuário ${MASTER_ADMIN_EMAIL} estava inativo ou sem perfil ADMIN; corrigido para ativo/ADMIN.`,
      );
    }
    return;
  }

  const seedPassword = options.seedPassword ?? env.SEED_ADMIN_PASSWORD;

  if (!seedPassword) {
    throw new Error(
      "O ADMIN master não existe e SEED_ADMIN_PASSWORD não está definida. Defina essa variável para criar o master.",
    );
  }

  const passwordCheck = passwordSchema.safeParse(seedPassword);
  if (!passwordCheck.success) {
    throw new Error(
      `O ADMIN master não existe e SEED_ADMIN_PASSWORD é fraca: ${passwordCheck.error.issues[0]?.message ?? "senha inválida"}`,
    );
  }

  const company = await prisma.company.upsert({
    where: { name: MASTER_COMPANY_NAME },
    update: {},
    create: { name: MASTER_COMPANY_NAME },
  });

  const passwordHash = await hashPassword(seedPassword);

  try {
    await prisma.user.create({
      data: {
        companyId: company.id,
        name: MASTER_ADMIN_NAME,
        email: MASTER_ADMIN_EMAIL,
        passwordHash,
        role: "ADMIN",
        active: true,
        mustChangePassword: true,
      },
    });
    console.log(`[master-admin] ADMIN master criado (${MASTER_ADMIN_EMAIL}).`);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }
}
