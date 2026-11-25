import { describe, expect, it } from "vitest";
import { ensureMasterAdmin, MASTER_ADMIN_EMAIL } from "../../src/lib/master-admin.js";
import { verifyPassword } from "../../src/lib/password.js";
import { prisma } from "../helpers/db.js";
import { createCompany, createUser } from "../helpers/fixtures.js";

const SEED = "SeedMaster123";

async function findMaster() {
  return prisma.user.findUniqueOrThrow({ where: { email: MASTER_ADMIN_EMAIL } });
}

describe("ensureMasterAdmin", () => {
  it("cria empresa e master quando o banco está vazio", async () => {
    await ensureMasterAdmin({ seedPassword: SEED });

    const master = await findMaster();
    const company = await prisma.company.findUniqueOrThrow({ where: { id: master.companyId } });

    expect(master.role).toBe("ADMIN");
    expect(master.active).toBe(true);
    expect(master.mustChangePassword).toBe(true);
    expect(company.name).toBe("BebMais");
    await expect(verifyPassword(master.passwordHash, SEED)).resolves.toBe(true);
  });

  it("não altera nem sobrescreve a senha de um master existente", async () => {
    const company = await createCompany("BebMais");
    const master = await createUser({
      companyId: company.id,
      email: MASTER_ADMIN_EMAIL,
      name: "Administrador",
      role: "ADMIN",
      password: "SenhaOriginal1",
    });

    await ensureMasterAdmin({ seedPassword: "OutraSenha123" });

    const after = await findMaster();
    expect(after.passwordHash).toBe(master.passwordHash);
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(master.updatedAt.getTime());
  });

  it("reativa e devolve o perfil ADMIN se o master estiver inativo ou rebaixado", async () => {
    const company = await createCompany("BebMais");
    const master = await createUser({
      companyId: company.id,
      email: MASTER_ADMIN_EMAIL,
      role: "ADMIN",
      password: "SenhaOriginal1",
    });

    await prisma.user.update({
      where: { id: master.id },
      data: { active: false, role: "VENDEDOR" },
    });

    await ensureMasterAdmin({ seedPassword: "OutraSenha123" });

    const after = await findMaster();
    expect(after.active).toBe(true);
    expect(after.role).toBe("ADMIN");
    expect(after.passwordHash).toBe(master.passwordHash);
  });

  it("é idempotente em execuções seguidas", async () => {
    await ensureMasterAdmin({ seedPassword: SEED });
    const first = await findMaster();

    await ensureMasterAdmin({ seedPassword: "OutraSenha123" });
    const second = await findMaster();

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.company.count()).toBe(1);
    expect(second.id).toBe(first.id);
    expect(second.passwordHash).toBe(first.passwordHash);
  });

  it("falha sem SEED_ADMIN_PASSWORD quando o master não existe", async () => {
    await expect(ensureMasterAdmin({ seedPassword: "" })).rejects.toThrow(/SEED_ADMIN_PASSWORD/);
    expect(await prisma.user.count()).toBe(0);
  });

  it("falha com SEED_ADMIN_PASSWORD fraca quando o master não existe", async () => {
    await expect(ensureMasterAdmin({ seedPassword: "12345678" })).rejects.toThrow(/fraca/);
    expect(await prisma.user.count()).toBe(0);
  });
});
