import type { Company, Role, User } from "@prisma/client";
import { prisma } from "../../src/db.js";
import { hashPassword } from "../../src/lib/password.js";
import { signAccessToken } from "../../src/lib/tokens.js";

export const DEFAULT_PASSWORD = "Senha123";

export async function createCompany(name = "Empresa Teste"): Promise<Company> {
  return prisma.company.create({ data: { name } });
}

type CreateUserInput = {
  companyId: string;
  email: string;
  name?: string;
  password?: string;
  role?: Role;
  active?: boolean;
  mustChangePassword?: boolean;
};

export async function createUser(input: CreateUserInput): Promise<User> {
  return prisma.user.create({
    data: {
      companyId: input.companyId,
      name: input.name ?? "Usuário Teste",
      email: input.email,
      passwordHash: await hashPassword(input.password ?? DEFAULT_PASSWORD),
      role: input.role ?? "VENDEDOR",
      active: input.active ?? true,
      mustChangePassword: input.mustChangePassword ?? false,
    },
  });
}

export function accessTokenFor(user: Pick<User, "id" | "companyId" | "role">): string {
  return signAccessToken({ sub: user.id, companyId: user.companyId, role: user.role });
}

export async function countActiveRefreshTokens(userId: string): Promise<number> {
  return prisma.refreshToken.count({ where: { userId, revokedAt: null } });
}
