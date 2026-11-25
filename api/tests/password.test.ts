import { describe, expect, it } from "vitest";
import {
  DUMMY_PASSWORD_HASH,
  TEMPORARY_PASSWORD_LENGTH,
  generateTemporaryPassword,
  hashPassword,
  passwordSchema,
  verifyPassword,
} from "../src/lib/password.js";

describe("password", () => {
  it("gera hash argon2id verificável", async () => {
    const hash = await hashPassword("Senha123");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword(hash, "Senha123")).resolves.toBe(true);
    await expect(verifyPassword(hash, "Senha124")).resolves.toBe(false);
  });

  it("usa salt diferente a cada hash", async () => {
    const a = await hashPassword("Senha123");
    const b = await hashPassword("Senha123");
    expect(a).not.toBe(b);
  });

  it("rejeita hash malformado sem lançar", async () => {
    await expect(verifyPassword("nao-e-um-hash", "Senha123")).resolves.toBe(false);
  });

  it("o hash falso de tempo constante é válido e não corresponde a senhas comuns", async () => {
    await expect(verifyPassword(DUMMY_PASSWORD_HASH, "Senha123")).resolves.toBe(false);
  });

  it("gera senha temporária com 12 caracteres e dentro das regras", () => {
    for (let i = 0; i < 100; i += 1) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
      expect(passwordSchema.safeParse(password).success).toBe(true);
    }
  });

  it("senha temporária não se repete sempre", () => {
    const generated = new Set(Array.from({ length: 20 }, () => generateTemporaryPassword()));
    expect(generated.size).toBeGreaterThan(1);
  });

  it("passwordSchema valida as regras", () => {
    expect(passwordSchema.safeParse("Senha123").success).toBe(true);
    expect(passwordSchema.safeParse("senha123").success).toBe(false);
    expect(passwordSchema.safeParse("Senha").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
  });
});
