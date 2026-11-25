import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { AppError } from "../lib/errors.js";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  passwordSchema,
  verifyPassword,
} from "../lib/password.js";
import { toPublicCompany, toPublicUser } from "../lib/serializers.js";
import {
  REFRESH_TOKEN_TTL_MS,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  ttlToSeconds,
} from "../lib/tokens.js";
import { authenticate, getAuth } from "../middlewares/authenticate.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Informe um e-mail válido.")),
  password: z.string().min(1, "Informe a senha."),
  rememberMe: z.boolean().default(false),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Informe o refresh token."),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual."),
  newPassword: passwordSchema,
  refreshToken: z.string().min(1, "Informe o refresh token da sessão atual."),
});

const INVALID_CREDENTIALS = new AppError(
  401,
  "invalid_credentials",
  "E-mail ou senha incorretos.",
);

const INVALID_REFRESH = new AppError(401, "invalid_refresh_token", "Sessão inválida ou expirada.");

async function createRefreshToken(userId: string, rememberMe: boolean): Promise<string> {
  const token = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(token),
      expiresAt: refreshTokenExpiry(rememberMe),
    },
  });

  return token;
}

async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

authRouter.post("/login", async (req, res) => {
  const { email, password, rememberMe } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { email },
    include: { company: true },
  });

  const passwordMatches = await verifyPassword(user?.passwordHash ?? DUMMY_PASSWORD_HASH, password);

  if (!user || !user.active || !passwordMatches) {
    throw INVALID_CREDENTIALS;
  }

  const refreshToken = await createRefreshToken(user.id, rememberMe);

  res.json({
    accessToken: signAccessToken({
      sub: user.id,
      companyId: user.companyId,
      role: user.role,
    }),
    refreshToken,
    expiresIn: ttlToSeconds(env.ACCESS_TOKEN_TTL),
    user: toPublicUser(user),
    company: toPublicCompany(user.company),
  });
});

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const tokenHash = hashRefreshToken(refreshToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) {
    throw INVALID_REFRESH;
  }

  if (stored.revokedAt) {
    await revokeAllRefreshTokens(stored.userId);
    throw INVALID_REFRESH;
  }

  if (stored.expiresAt.getTime() <= Date.now() || !stored.user.active) {
    await revokeAllRefreshTokens(stored.userId);
    throw INVALID_REFRESH;
  }

  const rememberMe =
    stored.expiresAt.getTime() - stored.createdAt.getTime() > REFRESH_TOKEN_TTL_MS;
  const rotatedToken = generateRefreshToken();

  const rotated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claimed.count === 0) {
      return false;
    }

    await tx.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: hashRefreshToken(rotatedToken),
        expiresAt: refreshTokenExpiry(rememberMe),
      },
    });

    return true;
  });

  if (!rotated) {
    await revokeAllRefreshTokens(stored.userId);
    throw INVALID_REFRESH;
  }

  res.json({
    accessToken: signAccessToken({
      sub: stored.user.id,
      companyId: stored.user.companyId,
      role: stored.user.role,
    }),
    refreshToken: rotatedToken,
    expiresIn: ttlToSeconds(env.ACCESS_TOKEN_TTL),
  });
});

authRouter.post("/logout", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);

  if (parsed.success) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(parsed.data.refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  res.status(204).end();
});

authRouter.post("/change-password", authenticate, async (req, res) => {
  const { userId, companyId } = getAuth(req);
  const { currentPassword, newPassword, refreshToken } = changePasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.active || user.companyId !== companyId) {
    throw new AppError(401, "unauthorized", "Sessão inválida. Faça login novamente.");
  }

  const currentMatches = await verifyPassword(user.passwordHash, currentPassword);
  if (!currentMatches) {
    throw new AppError(400, "invalid_current_password", "A senha atual está incorreta.");
  }

  const session = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
  });

  if (
    !session ||
    session.userId !== user.id ||
    session.revokedAt !== null ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    throw INVALID_REFRESH;
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, id: { not: session.id }, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  res.status(204).end();
});

authRouter.get("/me", authenticate, async (req, res) => {
  const { userId } = getAuth(req);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { company: true },
  });

  if (!user) {
    throw new AppError(401, "unauthorized", "Sessão inválida. Faça login novamente.");
  }

  res.json({
    user: toPublicUser(user),
    company: toPublicCompany(user.company),
  });
});
