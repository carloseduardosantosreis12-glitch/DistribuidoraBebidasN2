import type { Request, Response } from "express";
import { z } from "zod";
import { getAuth } from "../middlewares/authenticate.js";
import * as usersService from "../services/users.service.js";

const ROLES = ["ADMIN", "VENDEDOR", "ESTOQUISTA"] as const;

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do usuário.").max(120, "Nome muito longo."),
  email: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido.")),
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

export async function createUserHandler(req: Request, res: Response) {
  const { companyId } = getAuth(req);
  const { name, email, role } = createUserSchema.parse(req.body);
  const result = await usersService.createUser(companyId, name, email, role);
  res.status(201).json(result);
}

export async function listUsersHandler(req: Request, res: Response) {
  const { companyId } = getAuth(req);
  const users = await usersService.listUsers(companyId);
  res.json({ users });
}

export async function updateUserHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const id = idSchema.parse(req.params.id);
  const data = updateUserSchema.parse(req.body);
  const user = await usersService.updateUser(auth, id, data);
  res.json({ user });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const { companyId, userId } = getAuth(req);
  const id = idSchema.parse(req.params.id);
  const result = await usersService.resetUserPassword(companyId, userId, id);
  res.json(result);
}
