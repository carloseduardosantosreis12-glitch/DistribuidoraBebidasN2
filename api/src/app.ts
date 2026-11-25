import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./lib/errors.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";

export type RateLimitConfig = {
  windowMs: number;
  limit: number;
};

export const DEFAULT_AUTH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  limit: 10,
};

export type AppOptions = {
  authRateLimit?: RateLimitConfig;
};

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  const authRateLimitConfig = options.authRateLimit ?? DEFAULT_AUTH_RATE_LIMIT;

  const authLimiter = rateLimit({
    windowMs: authRateLimitConfig.windowMs,
    limit: authRateLimitConfig.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "too_many_requests",
        message: "Muitas tentativas. Tente novamente em instantes.",
      },
    },
  });

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth/login", authLimiter);
  app.use("/auth/refresh", authLimiter);
  app.use("/auth", authRouter);
  app.use("/users", usersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
