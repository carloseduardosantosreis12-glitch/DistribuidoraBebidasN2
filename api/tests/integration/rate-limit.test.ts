import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";

describe("rate limit", () => {
  it("responde 429 depois do limite no login", async () => {
    const app = createApp({ authRateLimit: { windowMs: 60_000, limit: 2 } });

    const first = await request(app)
      .post("/auth/login")
      .send({ email: "ninguem@test.com", password: "Senha123" });
    expect(first.status).toBe(401);

    const second = await request(app)
      .post("/auth/login")
      .send({ email: "ninguem@test.com", password: "Senha123" });
    expect(second.status).toBe(401);

    const third = await request(app)
      .post("/auth/login")
      .send({ email: "ninguem@test.com", password: "Senha123" });
    expect(third.status).toBe(429);
    expect(third.body).toEqual({
      error: {
        code: "too_many_requests",
        message: "Muitas tentativas. Tente novamente em instantes.",
      },
    });
  });

  it("também limita /auth/refresh", async () => {
    const app = createApp({ authRateLimit: { windowMs: 60_000, limit: 1 } });

    await request(app).post("/auth/refresh").send({ refreshToken: "x" });
    const blocked = await request(app).post("/auth/refresh").send({ refreshToken: "x" });
    expect(blocked.status).toBe(429);
  });
});
