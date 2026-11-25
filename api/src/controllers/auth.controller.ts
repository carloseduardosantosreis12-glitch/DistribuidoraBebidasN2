import type { Request, Response } from "express";
import { z } from "zod";
import { passwordSchema } from "../lib/password.js";
import { getAuth } from "../middlewares/authenticate.js";
import * as authService from "../services/auth.service.js";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido.")),
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

export async function loginHandler(req: Request, res: Response) {
  const { email, password, rememberMe } = loginSchema.parse(req.body);
  const result = await authService.login(email, password, rememberMe);
  res.json(result);
}

export async function refreshHandler(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);
  const result = await authService.refresh(refreshToken);
  res.json(result);
}

export async function logoutHandler(req: Request, res: Response) {
  const parsed = refreshSchema.safeParse(req.body);
  await authService.logout(parsed.success ? parsed.data.refreshToken : undefined);
  res.status(204).end();
}

export async function changePasswordHandler(req: Request, res: Response) {
  const { userId, companyId } = getAuth(req);
  const { currentPassword, newPassword, refreshToken } = changePasswordSchema.parse(req.body);
  await authService.changePassword(userId, companyId, currentPassword, newPassword, refreshToken);
  res.status(204).end();
}

export async function getMeHandler(req: Request, res: Response) {
  const { userId } = getAuth(req);
  const result = await authService.getMe(userId);
  res.json(result);
}
