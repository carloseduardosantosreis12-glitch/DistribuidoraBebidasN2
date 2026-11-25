import { Router } from "express";
import {
  changePasswordHandler,
  getMeHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middlewares/authenticate.js";

export const authRouter = Router();

authRouter.post("/login", loginHandler);
authRouter.post("/refresh", refreshHandler);
authRouter.post("/logout", logoutHandler);
authRouter.post("/change-password", authenticate, changePasswordHandler);
authRouter.get("/me", authenticate, getMeHandler);
