import { type Role } from "@prisma/client";
import { prisma } from "../db.js";

export interface CreateUserData {
  companyId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}

export interface UpdateUserData {
  name?: string;
  role?: Role;
  active?: boolean;
}

export async function findById(id: string, companyId: string) {
  return prisma.user.findFirst({ where: { id, companyId } });
}

export async function findAllByCompany(companyId: string) {
  return prisma.user.findMany({ where: { companyId }, orderBy: { name: "asc" } });
}

export async function create(data: CreateUserData) {
  return prisma.user.create({ data: { ...data, mustChangePassword: true } });
}

export async function update(id: string, data: UpdateUserData, revokeTokens = false) {
  if (revokeTokens) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return user;
    });
  }
  return prisma.user.update({ where: { id }, data });
}

export async function resetPassword(id: string, passwordHash: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
