import { sign } from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  ttlToSeconds,
  verifyAccessToken,
} from "../src/lib/tokens.js";

const payload = { sub: "user-id", companyId: "company-id", role: "ADMIN" as const };

describe("access token", () => {
  it("assina e verifica o payload", () => {
    const token = signAccessToken(payload);
    expect(verifyAccessToken(token)).toMatchObject(payload);
  });

  it("rejeita token adulterado", () => {
    const token = signAccessToken(payload);
    expect(() => verifyAccessToken(`${token}x`)).toThrow(AppError);
  });

  it("rejeita token assinado com outro segredo", () => {
    const forged = sign(payload, "outro-segredo-com-32-caracteres-aqui!!", {
      algorithm: "HS256",
      expiresIn: "15m",
    });
    expect(() => verifyAccessToken(forged)).toThrow(AppError);
  });

  it("rejeita payload sem os campos esperados", () => {
    const forged = sign({ sub: "x" }, process.env.JWT_SECRET ?? "", {
      algorithm: "HS256",
      expiresIn: "15m",
    });
    expect(() => verifyAccessToken(forged)).toThrow(AppError);
  });
});

describe("refresh token", () => {
  it("gera valor opaco e hash SHA-256 estável", () => {
    const token = generateRefreshToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(hashRefreshToken(generateRefreshToken()));
  });

  it("calcula validade de 1 dia ou 30 dias", () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    expect(refreshTokenExpiry(false).getTime() - now).toBeCloseTo(day, -3);
    expect(refreshTokenExpiry(true).getTime() - now).toBeCloseTo(30 * day, -3);
  });
});

describe("ttlToSeconds", () => {
  it("converte os formatos suportados", () => {
    expect(ttlToSeconds("15m")).toBe(900);
    expect(ttlToSeconds("1h")).toBe(3600);
    expect(ttlToSeconds("2d")).toBe(172800);
    expect(ttlToSeconds("30s")).toBe(30);
  });

  it("rejeita formato inválido", () => {
    expect(() => ttlToSeconds("quinze")).toThrow();
  });
});
