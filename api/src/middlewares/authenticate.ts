import type { Role } from "@prisma/client";
import type { Request, RequestHandler } from "express";
import { prisma } from "../db.js";
import { AppError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";

export type AuthContext = {
  userId: string;
  companyId: string;
  role: Role;
};

const BEARER_PREFIX = "Bearer ";

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    throw new AppError(401, "unauthorized", "Autenticação necessária.");
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    throw new AppError(401, "unauthorized", "Autenticação necessária.");
  }

  const payload = verifyAccessToken(token);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, companyId: true, role: true, active: true },
  });

  if (!user || !user.active || user.companyId !== payload.companyId) {
    throw new AppError(401, "unauthorized", "Sessão inválida. Faça login novamente.");
  }

  req.auth = { userId: user.id, companyId: user.companyId, role: user.role };

  next();
};

export function getAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw new AppError(401, "unauthorized", "Autenticação necessária.");
  }
  return req.auth;
}
