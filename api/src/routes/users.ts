import { Router } from "express";
import {
  createUserHandler,
  listUsersHandler,
  resetPasswordHandler,
  updateUserHandler,
} from "../controllers/users.controller.js";
import { authenticate } from "../middlewares/authenticate.js";
import { requireAdmin } from "../middlewares/require-admin.js";

export const usersRouter = Router();

usersRouter.use(authenticate, requireAdmin);

usersRouter.post("/", createUserHandler);
usersRouter.get("/", listUsersHandler);
usersRouter.patch("/:id", updateUserHandler);
usersRouter.post("/:id/reset-password", resetPasswordHandler);
