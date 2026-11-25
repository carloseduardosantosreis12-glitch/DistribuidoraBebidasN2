import { env } from "../env.js";
import { AppError } from "../lib/errors.js";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../lib/password.js";
import { toPublicCompany, toPublicUser } from "../lib/serializers.js";
import { hashRefreshToken, signAccessToken, ttlToSeconds } from "../lib/tokens.js";
import * as authRepo from "../repositories/auth.repository.js";

const INVALID_CREDENTIALS = new AppError(401, "invalid_credentials", "E-mail ou senha incorretos.");
const INVALID_REFRESH = new AppError(401, "invalid_refresh_token", "Sessão inválida ou expirada.");

export async function login(email: string, password: string, rememberMe: boolean) {
  const user = await authRepo.findUserByEmail(email);
  const passwordMatches = await verifyPassword(user?.passwordHash ?? DUMMY_PASSWORD_HASH, password);

  if (!user || !user.active || !passwordMatches) throw INVALID_CREDENTIALS;

  const refreshToken = await authRepo.createRefreshToken(user.id, rememberMe);

  return {
    accessToken: signAccessToken({ sub: user.id, companyId: user.companyId, role: user.role }),
    refreshToken,
    expiresIn: ttlToSeconds(env.ACCESS_TOKEN_TTL),
    user: toPublicUser(user),
    company: toPublicCompany(user.company),
  };
}

export async function refresh(refreshToken: string) {
  const stored = await authRepo.findRefreshTokenWithUser(hashRefreshToken(refreshToken));

  if (!stored) throw INVALID_REFRESH;

  if (stored.revokedAt) {
    await authRepo.revokeAllRefreshTokens(stored.userId);
    throw INVALID_REFRESH;
  }

  if (stored.expiresAt.getTime() <= Date.now() || !stored.user.active) {
    await authRepo.revokeAllRefreshTokens(stored.userId);
    throw INVALID_REFRESH;
  }

  const { success, newToken } = await authRepo.rotateRefreshToken(stored);

  if (!success) {
    await authRepo.revokeAllRefreshTokens(stored.userId);
    throw INVALID_REFRESH;
  }

  return {
    accessToken: signAccessToken({
      sub: stored.user.id,
      companyId: stored.user.companyId,
      role: stored.user.role,
    }),
    refreshToken: newToken,
    expiresIn: ttlToSeconds(env.ACCESS_TOKEN_TTL),
  };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await authRepo.revokeRefreshTokenByHash(hashRefreshToken(refreshToken));
}

export async function changePassword(
  userId: string,
  companyId: string,
  currentPassword: string,
  newPassword: string,
  refreshToken: string,
): Promise<void> {
  const user = await authRepo.findUserById(userId);

  if (!user || !user.active || user.companyId !== companyId) {
    throw new AppError(401, "unauthorized", "Sessão inválida. Faça login novamente.");
  }

  const currentMatches = await verifyPassword(user.passwordHash, currentPassword);
  if (!currentMatches) {
    throw new AppError(400, "invalid_current_password", "A senha atual está incorreta.");
  }

  const session = await authRepo.findRefreshToken(hashRefreshToken(refreshToken));

  if (
    !session ||
    session.userId !== user.id ||
    session.revokedAt !== null ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    throw INVALID_REFRESH;
  }

  const passwordHash = await hashPassword(newPassword);
  await authRepo.updateUserPassword(user.id, session.id, passwordHash);
}

export async function getMe(userId: string) {
  const user = await authRepo.findUserByIdWithCompany(userId);
  if (!user) throw new AppError(401, "unauthorized", "Sessão inválida. Faça login novamente.");
  return { user: toPublicUser(user), company: toPublicCompany(user.company) };
}
