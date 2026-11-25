import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createCompany, createUser, DEFAULT_PASSWORD } from "../helpers/fixtures.js";
import { prisma } from "../helpers/db.js";

const app = createApp({ authRateLimit: { windowMs: 60_000, limit: 10_000 } });

async function seedUser(
  overrides: { email?: string; password?: string; role?: "ADMIN" | "VENDEDOR" | "ESTOQUISTA"; active?: boolean } = {},
) {
  const company = await createCompany("Empresa Auth");
  const user = await createUser({
    companyId: company.id,
    email: overrides.email ?? "admin@auth.test",
    password: overrides.password ?? DEFAULT_PASSWORD,
    role: overrides.role ?? "ADMIN",
    active: overrides.active ?? true,
  });
  return { company, user };
}

function login(email: string, password: string, rememberMe?: boolean) {
  return request(app).post("/auth/login").send({ email, password, rememberMe });
}

describe("POST /auth/login", () => {
  it("faz login e devolve tokens, usuário e empresa sem hash", async () => {
    const { company, user } = await seedUser();

    const response = await login("  Admin@Auth.Test  ", DEFAULT_PASSWORD, true);

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    expect(response.body.expiresIn).toBe(900);
    expect(response.body.company).toEqual({ id: company.id, name: company.name });
    expect(response.body.user).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      role: "ADMIN",
      mustChangePassword: false,
    });
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");

    const stored = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).not.toBe(response.body.refreshToken);
  });

  it("validade do refresh: 1 dia por padrão e 30 dias com rememberMe", async () => {
    const { user } = await seedUser();

    await login(user.email, DEFAULT_PASSWORD, false);
    await login(user.email, DEFAULT_PASSWORD, true);

    const tokens = await prisma.refreshToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    const day = 24 * 60 * 60 * 1000;
    const first = tokens[0];
    const second = tokens[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    const firstTtl = (first?.expiresAt.getTime() ?? 0) - Date.now();
    const secondTtl = (second?.expiresAt.getTime() ?? 0) - Date.now();
    expect(firstTtl).toBeLessThan(day + 60_000);
    expect(firstTtl).toBeGreaterThan(day - 60_000);
    expect(secondTtl).toBeGreaterThan(29 * day);
  });

  it("responde igual para senha errada, e-mail inexistente e usuário inativo", async () => {
    const { user } = await seedUser({ email: "inativo@auth.test", active: false });

    const responses = await Promise.all([
      login(user.email, "SenhaErrada1"),
      login("naoexiste@auth.test", DEFAULT_PASSWORD),
      login(user.email, DEFAULT_PASSWORD),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: { code: "invalid_credentials", message: "E-mail ou senha incorretos." },
      });
    }
  });

  it("faz login mesmo com mustChangePassword true", async () => {
    const company = await createCompany("Empresa Troca");
    await createUser({
      companyId: company.id,
      email: "novo@auth.test",
      password: "Temporaria1",
      mustChangePassword: true,
    });

    const response = await login("novo@auth.test", "Temporaria1");
    expect(response.status).toBe(200);
    expect(response.body.user.mustChangePassword).toBe(true);
  });
});

describe("POST /auth/refresh", () => {
  it("rotaciona o token e invalida o anterior", async () => {
    const { user } = await seedUser();
    const first = await login(user.email, DEFAULT_PASSWORD);

    const rotated = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: first.body.refreshToken });

    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).not.toBe(first.body.refreshToken);
    expect(rotated.body.accessToken).toEqual(expect.any(String));

    const reuse = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: first.body.refreshToken });

    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("invalid_refresh_token");

    const afterReuse = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: rotated.body.refreshToken });

    expect(afterReuse.status).toBe(401);
  });

  it("reuso de token revogado revoga a família inteira", async () => {
    const { user } = await seedUser();
    const loginResponse = await login(user.email, DEFAULT_PASSWORD);

    const rotated = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: loginResponse.body.refreshToken });

    await request(app).post("/auth/refresh").send({ refreshToken: loginResponse.body.refreshToken });

    const active = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(0);

    const attempt = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: rotated.body.refreshToken });
    expect(attempt.status).toBe(401);
  });

  it("rejeita token inválido ou expirado", async () => {
    const { user } = await seedUser();
    const loginResponse = await login(user.email, DEFAULT_PASSWORD);

    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const expired = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: loginResponse.body.refreshToken });
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe("invalid_refresh_token");

    const unknown = await request(app).post("/auth/refresh").send({ refreshToken: "nao-existe" });
    expect(unknown.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("revoga o refresh token e é idempotente", async () => {
    const { user } = await seedUser();
    const loginResponse = await login(user.email, DEFAULT_PASSWORD);
    const refreshToken = loginResponse.body.refreshToken as string;

    expect((await request(app).post("/auth/logout").send({ refreshToken })).status).toBe(204);
    expect((await request(app).post("/auth/logout").send({ refreshToken })).status).toBe(204);
    expect((await request(app).post("/auth/logout").send({})).status).toBe(204);

    const reuse = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(reuse.status).toBe(401);
  });
});

describe("POST /auth/change-password", () => {
  it("exige token, senha atual correta e senha forte", async () => {
    const { user } = await seedUser();
    const loginResponse = await login(user.email, DEFAULT_PASSWORD);
    const accessToken = loginResponse.body.accessToken as string;
    const refreshToken = loginResponse.body.refreshToken as string;

    const withoutToken = await request(app)
      .post("/auth/change-password")
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: "NovaSenha123", refreshToken });
    expect(withoutToken.status).toBe(401);

    const weak = await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: "fraca", refreshToken });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe("validation_error");

    const wrongCurrent = await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: "Errada123", newPassword: "NovaSenha123", refreshToken });
    expect(wrongCurrent.status).toBe(400);
    expect(wrongCurrent.body.error.code).toBe("invalid_current_password");

    const foreignRefresh = await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: "NovaSenha123", refreshToken: "de-outro" });
    expect(foreignRefresh.status).toBe(401);
    expect(foreignRefresh.body.error.code).toBe("invalid_refresh_token");

    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });

    const success = await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: "NovaSenha123", refreshToken });
    expect(success.status).toBe(204);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.mustChangePassword).toBe(false);
    await expect(
      request(app).post("/auth/login").send({ email: user.email, password: "NovaSenha123" }),
    ).resolves.toMatchObject({ status: 200 });

    const kept = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(kept.status).toBe(200);
  });

  it("revoga os outros refresh tokens e mantém a sessão informada", async () => {
    const { user } = await seedUser();
    const first = await login(user.email, DEFAULT_PASSWORD);
    const second = await login(user.email, DEFAULT_PASSWORD);

    const response = await request(app)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${second.body.accessToken}`)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: "NovaSenha123",
        refreshToken: second.body.refreshToken,
      });
    expect(response.status).toBe(204);

    const secondRefresh = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: second.body.refreshToken });
    expect(secondRefresh.status).toBe(200);

    const firstRefresh = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: first.body.refreshToken });
    expect(firstRefresh.status).toBe(401);
  });
});

describe("GET /auth/me", () => {
  it("devolve usuário e empresa do token", async () => {
    const { company, user } = await seedUser();
    const loginResponse = await login(user.email, DEFAULT_PASSWORD);

    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(user.id);
    expect(response.body.company).toEqual({ id: company.id, name: company.name });
  });

  it("rejeita token ausente ou inválido", async () => {
    expect((await request(app).get("/auth/me")).status).toBe(401);
    const invalid = await request(app).get("/auth/me").set("Authorization", "Bearer abc");
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe("invalid_token");
  });
});
