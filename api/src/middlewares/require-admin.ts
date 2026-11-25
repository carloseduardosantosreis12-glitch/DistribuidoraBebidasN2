import type { RequestHandler } from "express";
import { AppError } from "../lib/errors.js";
import { getAuth } from "./authenticate.js";

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const { role } = getAuth(req);

  if (role !== "ADMIN") {
    throw new AppError(403, "forbidden", "Acesso restrito a administradores.");
  }

  next();
};
