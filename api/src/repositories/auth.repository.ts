import { prisma } from "../db.js";
import {
  REFRESH_TOKEN_TTL_MS,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from "../lib/tokens.js";

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, include: { company: true } });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function findUserByIdWithCompany(id: string) {
  return prisma.user.findUnique({ where: { id }, include: { company: true } });
}

export async function findRefreshTokenWithUser(tokenHash: string) {
  return prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
}

export async function findRefreshToken(tokenHash: string) {
  return prisma.refreshToken.findUnique({ where: { tokenHash } });
}

export async function createRefreshToken(userId: string, rememberMe: boolean): Promise<string> {
  const token = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashRefreshToken(token), expiresAt: refreshTokenExpiry(rememberMe) },
  });
  return token;
}

export async function revokeRefreshTokenByHash(tokenHash: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function rotateRefreshToken(stored: {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  userId: string;
}): Promise<{ success: boolean; newToken: string }> {
  const rememberMe =
    stored.expiresAt.getTime() - stored.createdAt.getTime() > REFRESH_TOKEN_TTL_MS;
  const newToken = generateRefreshToken();

  const success = await prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) return false;
    await tx.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: hashRefreshToken(newToken),
        expiresAt: refreshTokenExpiry(rememberMe),
      },
    });
    return true;
  });

  return { success, newToken };
}

export async function updateUserPassword(
  userId: string,
  keepSessionId: string,
  passwordHash: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, id: { not: keepSessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
