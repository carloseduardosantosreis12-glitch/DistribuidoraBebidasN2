import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { AppError } from "../lib/errors.js";
import { MASTER_ADMIN_EMAIL } from "../lib/master-admin.js";
import { generateTemporaryPassword, hashPassword } from "../lib/password.js";
import { toAdminUser, toPublicUser } from "../lib/serializers.js";
import { authenticate, getAuth } from "../middlewares/authenticate.js";
import { requireAdmin } from "../middlewares/require-admin.js";

export const usersRouter = Router();

usersRouter.use(authenticate, requireAdmin);

const ROLES = ["ADMIN", "VENDEDOR", "ESTOQUISTA"] as const;

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do usuário.").max(120, "Nome muito longo."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Informe um e-mail válido.")),
  role: z.enum(ROLES),
});

const updateUserSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome do usuário.").max(120, "Nome muito longo.").optional(),
    role: z.enum(ROLES).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar.");

const idSchema = z.uuid("Identificador inválido.");

async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

usersRouter.post("/", async (req, res) => {
  const { companyId } = getAuth(req);
  const { name, email, role } = createUserSchema.parse(req.body);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  try {
    const user = await prisma.user.create({
      data: {
        companyId,
        name,
        email,
        passwordHash,
        role,
        mustChangePassword: true,
      },
    });

    res.status(201).json({ user: toPublicUser(user), temporaryPassword });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "email_already_in_use", "Já existe um usuário com esse e-mail.");
    }
    throw error;
  }
});

usersRouter.get("/", async (req, res) => {
  const { companyId } = getAuth(req);

  const users = await prisma.user.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
  });

  res.json({ users: users.map(toAdminUser) });
});

usersRouter.patch("/:id", async (req, res) => {
  const auth = getAuth(req);
  const id = idSchema.parse(req.params.id);
  const data = updateUserSchema.parse(req.body);

  const target = await prisma.user.findFirst({
    where: { id, companyId: auth.companyId },
  });

  if (!target) {
    throw new AppError(404, "user_not_found", "Usuário não encontrado.");
  }

  const isMaster = target.email === MASTER_ADMIN_EMAIL;

  if (isMaster) {
    if (data.active === false) {
      throw new AppError(
        409,
        "master_protected",
        "O administrador master não pode ser desativado.",
      );
    }
    if (data.role !== undefined && data.role !== "ADMIN") {
      throw new AppError(
        409,
        "master_protected",
        "O perfil do administrador master não pode ser alterado.",
      );
    }
  }

  const isSelf = target.id === auth.userId;

  if (isSelf) {
    if (data.active === false) {
      throw new AppError(409, "self_protected", "Você não pode desativar a própria conta.");
    }
    if (data.role !== undefined && data.role !== target.role) {
      throw new AppError(409, "self_protected", "Você não pode alterar o próprio perfil.");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: target.id }, data });

    if (data.active === false) {
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return user;
  });

  res.json({ user: toAdminUser(updated) });
});

usersRouter.post("/:id/reset-password", async (req, res) => {
  const { companyId, userId } = getAuth(req);
  const id = idSchema.parse(req.params.id);

  const target = await prisma.user.findFirst({
    where: { id, companyId },
    select: { id: true },
  });

  if (!target) {
    throw new AppError(404, "user_not_found", "Usuário não encontrado.");
  }

  if (target.id === userId) {
    throw new AppError(
      409,
      "self_protected",
      "Use a troca de senha para redefinir a sua própria senha.",
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { passwordHash, mustChangePassword: true },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  res.json({ temporaryPassword });
});
