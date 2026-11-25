import { Prisma } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { MASTER_ADMIN_EMAIL } from "../lib/master-admin.js";
import { generateTemporaryPassword, hashPassword } from "../lib/password.js";
import { toAdminUser, toPublicUser } from "../lib/serializers.js";
import type { UpdateUserData } from "../repositories/users.repository.js";
import * as usersRepo from "../repositories/users.repository.js";

export async function createUser(
  companyId: string,
  name: string,
  email: string,
  role: "ADMIN" | "VENDEDOR" | "ESTOQUISTA",
) {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  try {
    const user = await usersRepo.create({ companyId, name, email, passwordHash, role });
    return { user: toPublicUser(user), temporaryPassword };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "email_already_in_use", "Já existe um usuário com esse e-mail.");
    }
    throw error;
  }
}

export async function listUsers(companyId: string) {
  const users = await usersRepo.findAllByCompany(companyId);
  return users.map(toAdminUser);
}

export async function updateUser(
  auth: { userId: string; companyId: string },
  targetId: string,
  data: UpdateUserData,
) {
  const target = await usersRepo.findById(targetId, auth.companyId);
  if (!target) throw new AppError(404, "user_not_found", "Usuário não encontrado.");

  if (target.email === MASTER_ADMIN_EMAIL) {
    if (data.active === false) {
      throw new AppError(409, "master_protected", "O administrador master não pode ser desativado.");
    }
    if (data.role !== undefined && data.role !== "ADMIN") {
      throw new AppError(409, "master_protected", "O perfil do administrador master não pode ser alterado.");
    }
  }

  if (target.id === auth.userId) {
    if (data.active === false) {
      throw new AppError(409, "self_protected", "Você não pode desativar a própria conta.");
    }
    if (data.role !== undefined && data.role !== target.role) {
      throw new AppError(409, "self_protected", "Você não pode alterar o próprio perfil.");
    }
  }

  const updated = await usersRepo.update(target.id, data, data.active === false);
  return toAdminUser(updated);
}

export async function resetUserPassword(
  companyId: string,
  requesterId: string,
  targetId: string,
) {
  const target = await usersRepo.findById(targetId, companyId);
  if (!target) throw new AppError(404, "user_not_found", "Usuário não encontrado.");

  if (target.id === requesterId) {
    throw new AppError(409, "self_protected", "Use a troca de senha para redefinir a sua própria senha.");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await usersRepo.resetPassword(target.id, passwordHash);

  return { temporaryPassword };
}
