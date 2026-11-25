import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../env.js";
import { AppError } from "./errors.js";

const ACCESS_TOKEN_ALGORITHM = "HS256";
const ROLES: readonly Role[] = ["ADMIN", "VENDEDOR", "ESTOQUISTA"];

export const REFRESH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_REMEMBER_ME_MS = 30 * 24 * 60 * 60 * 1000;

export type AccessTokenPayload = {
  sub: string;
  companyId: string;
  role: Role;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: ACCESS_TOKEN_ALGORITHM,
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [ACCESS_TOKEN_ALGORITHM] });
  } catch {
    throw new AppError(401, "invalid_token", "Token de acesso inválido ou expirado.");
  }

  if (typeof decoded !== "object" || decoded === null) {
    throw new AppError(401, "invalid_token", "Token de acesso inválido ou expirado.");
  }

  const { sub, companyId, role } = decoded as Record<string, unknown>;

  if (
    typeof sub !== "string" ||
    typeof companyId !== "string" ||
    typeof role !== "string" ||
    !ROLES.includes(role as Role)
  ) {
    throw new AppError(401, "invalid_token", "Token de acesso inválido ou expirado.");
  }

  return { sub, companyId, role: role as Role };
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiry(rememberMe: boolean): Date {
  const ttl = rememberMe ? REFRESH_TOKEN_TTL_REMEMBER_ME_MS : REFRESH_TOKEN_TTL_MS;
  return new Date(Date.now() + ttl);
}

const TTL_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
};

export function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) {
    throw new Error(`TTL inválido: ${ttl}`);
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "s";

  return amount * (TTL_UNIT_SECONDS[unit] ?? 1);
}
