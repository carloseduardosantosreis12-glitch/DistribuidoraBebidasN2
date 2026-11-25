import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.js";

const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  JWT_SECRET: "a".repeat(32),
  ACCESS_TOKEN_TTL: "15m",
  PORT: "3333",
  NODE_ENV: "test",
};

describe("loadEnv", () => {
  it("aceita env mínima sem SEED_ADMIN_PASSWORD", () => {
    const env = loadEnv(base);
    expect(env.SEED_ADMIN_PASSWORD).toBeUndefined();
    expect(env.PORT).toBe(3333);
  });

  it("trata SEED_ADMIN_PASSWORD vazio como ausente", () => {
    expect(loadEnv({ ...base, SEED_ADMIN_PASSWORD: "" }).SEED_ADMIN_PASSWORD).toBeUndefined();
  });

  it("rejeita segredo JWT curto", () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: "curto" })).toThrow(/JWT_SECRET/);
  });

  it("rejeita SEED_ADMIN_PASSWORD fraca", () => {
    expect(() => loadEnv({ ...base, SEED_ADMIN_PASSWORD: "12345678" })).toThrow(/SEED_ADMIN_PASSWORD/);
  });

  it("rejeita TTL fora do formato", () => {
    expect(() => loadEnv({ ...base, ACCESS_TOKEN_TTL: "quinze" })).toThrow(/ACCESS_TOKEN_TTL/);
  });

  it("não inclui o valor do segredo na mensagem de erro", () => {
    const secret = "segredo-muito-curto";
    try {
      loadEnv({ ...base, JWT_SECRET: secret });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
