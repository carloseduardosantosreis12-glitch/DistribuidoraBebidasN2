import "dotenv/config";
import { z } from "zod";
import { passwordSchema } from "./lib/password.js";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "obrigatória"),
  JWT_SECRET: z.string().min(32, "deve ter no mínimo 32 caracteres"),
  SEED_ADMIN_PASSWORD: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    passwordSchema.optional(),
  ),
  ACCESS_TOKEN_TTL: z
    .string()
    .regex(/^\d+[smhd]$/, "use um formato como 15m, 1h ou 7d")
    .default("15m"),
  PORT: z.coerce.number().int().positive().default(3333),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(env)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${details}`);
  }

  return parsed.data;
}

export const env = loadEnv();
