import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { MASTER_ADMIN_EMAIL } from "../../src/lib/master-admin.js";
import { passwordSchema } from "../../src/lib/password.js";
import { createCompany, createUser, DEFAULT_PASSWORD } from "../helpers/fixtures.js";
import { prisma } from "../helpers/db.js";

const app = createApp({ authRateLimit: { windowMs: 60_000, limit: 10_000 } });

async function login(email: string, password = DEFAULT_PASSWORD) {
  const response = await request(app).post("/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  return response.body.accessToken as string;
}

async function seedCompany(companyName: string, adminEmail: string) {
  const company = await createCompany(companyName);
  const admin = await createUser({
    companyId: company.id,
    email: adminEmail,
    name: "Admin",
    role: "ADMIN",
  });
  return { company, admin };
}

describe("POST /users", () => {
  it("ADMIN cria usuário e recebe senha temporária válida uma única vez", async () => {
    const { company } = await seedCompany("Empresa A", "admin.a@test.com");
    const token = await login("admin.a@test.com");

    const response = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Novo Vendedor", email: "  Vendedor@Test.com ", role: "VENDEDOR" });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe("vendedor@test.com");
    expect(response.body.user.mustChangePassword).toBe(true);
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(passwordSchema.safeParse(response.body.temporaryPassword).success).toBe(true);
    expect(response.body.temporaryPassword).toHaveLength(12);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: "vendedor@test.com" },
    });
    expect(stored.companyId).toBe(company.id);
    expect(stored.mustChangePassword).toBe(true);
  });

  it("VENDEDOR e ESTOQUISTA recebem 403", async () => {
    const { company } = await seedCompany("Empresa A", "admin.a@test.com");
    await createUser({ companyId: company.id, email: "vendedor.a@test.com", role: "VENDEDOR" });
    await createUser({ companyId: company.id, email: "estoque.a@test.com", role: "ESTOQUISTA" });

    for (const email of ["vendedor.a@test.com", "estoque.a@test.com"]) {
      const token = await login(email);

      const create = await request(app)
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "X", email: `x-${email}`, role: "VENDEDOR" });
      expect(create.status).toBe(403);
      expect(create.body.error.code).toBe("forbidden");

      const list = await request(app).get("/users").set("Authorization", `Bearer ${token}`);
      expect(list.status).toBe(403);
    }
  });

  it("e-mail duplicado no sistema inteiro devolve 409", async () => {
    await seedCompany("Empresa A", "admin.a@test.com");
    const companyB = await createCompany("Empresa B");
    await createUser({ companyId: companyB.id, email: "repetido@test.com" });
    const token = await login("admin.a@test.com");

    const response = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Repetido", email: "repetido@test.com", role: "VENDEDOR" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("email_already_in_use");
  });
});

describe("isolamento entre empresas", () => {
  it("lista e altera somente usuários da própria empresa", async () => {
    const companyA = await seedCompany("Empresa A", "admin.a@test.com");
    const companyB = await seedCompany("Empresa B", "admin.b@test.com");
    const token = await login("admin.a@test.com");

    const list = await request(app).get("/users").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);

    const emails = (list.body.users as { email: string }[]).map((user) => user.email);
    expect(emails).toContain("admin.a@test.com");
    expect(emails).not.toContain("admin.b@test.com");

    const patch = await request(app)
      .patch(`/users/${companyB.admin.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Invasão" });
    expect(patch.status).toBe(404);
    expect(patch.body.error.code).toBe("user_not_found");

    const reset = await request(app)
      .post(`/users/${companyB.admin.id}/reset-password`)
      .set("Authorization", `Bearer ${token}`);
    expect(reset.status).toBe(404);

    const untouched = await prisma.user.findUniqueOrThrow({ where: { id: companyB.admin.id } });
    expect(untouched.name).toBe("Admin");
    expect(companyA.company.id).not.toBe(companyB.company.id);
  });
});

describe("PATCH /users/:id", () => {
  it("edita nome, perfil e desativa revogando as sessões", async () => {
    const { company } = await seedCompany("Empresa A", "admin.a@test.com");
    const alvo = await createUser({ companyId: company.id, email: "alvo@test.com" });
    const alvoLogin = await request(app)
      .post("/auth/login")
      .send({ email: "alvo@test.com", password: DEFAULT_PASSWORD });
    const token = await login("admin.a@test.com");

    const response = await request(app)
      .patch(`/users/${alvo.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Alvo Editado", role: "ESTOQUISTA" });

    expect(response.status).toBe(200);
    expect(response.body.user.name).toBe("Alvo Editado");
    expect(response.body.user.role).toBe("ESTOQUISTA");

    const deactivate = await request(app)
      .patch(`/users/${alvo.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ active: false });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.user.active).toBe(false);

    const refresh = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: alvoLogin.body.refreshToken });
    expect(refresh.status).toBe(401);

    const loginInactive = await request(app)
      .post("/auth/login")
      .send({ email: "alvo@test.com", password: DEFAULT_PASSWORD });
    expect(loginInactive.status).toBe(401);
  });

  it("rejeita corpo vazio", async () => {
    const { company } = await seedCompany("Empresa A", "admin.a@test.com");
    const alvo = await createUser({ companyId: company.id, email: "alvo@test.com" });
    const token = await login("admin.a@test.com");

    const response = await request(app)
      .patch(`/users/${alvo.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_error");
  });

  it("bloqueia auto-desativação e auto-rebaixamento", async () => {
    const { admin } = await seedCompany("Empresa A", "admin.a@test.com");
    const token = await login("admin.a@test.com");

    const deactivateSelf = await request(app)
      .patch(`/users/${admin.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ active: false });
    expect(deactivateSelf.status).toBe(409);
    expect(deactivateSelf.body.error.code).toBe("self_protected");

    const demoteSelf = await request(app)
      .patch(`/users/${admin.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "VENDEDOR" });
    expect(demoteSelf.status).toBe(409);
    expect(demoteSelf.body.error.code).toBe("self_protected");
  });

  it("protege o ADMIN master de desativação e rebaixamento", async () => {
    const { company } = await seedCompany("Empresa A", "admin.a@test.com");
    const master = await createUser({
      companyId: company.id,
      email: MASTER_ADMIN_EMAIL,
      name: "Administrador",
      role: "ADMIN",
    });
    const otherAdminToken = await login("admin.a@test.com");
    const masterToken = await login(MASTER_ADMIN_EMAIL);

    for (const token of [otherAdminToken, masterToken]) {
      const deactivate = await request(app)
        .patch(`/users/${master.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active: false });
      expect(deactivate.status).toBe(409);
      expect(deactivate.body.error.code).toBe("master_protected");

      const demote = await request(app)
        .patch(`/users/${master.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ role: "VENDEDOR" });
      expect(demote.status).toBe(409);
      expect(demote.body.error.code).toBe("master_protected");
    }

    const stillMaster = await prisma.user.findUniqueOrThrow({ where: { id: master.id } });
    expect(stillMaster.active).toBe(true);
    expect(stillMaster.role).toBe("ADMIN");
  });
});

describe("POST /users/:id/reset-password", () => {
  it("gera nova senha temporária e revoga as sessões anteriores", async () => {
    const { company } = await seedCompany("Empresa A", "admin.a@test.com");
    const alvo = await createUser({ companyId: company.id, email: "alvo@test.com" });
    const loginBefore = await request(app)
      .post("/auth/login")
      .send({ email: "alvo@test.com", password: DEFAULT_PASSWORD });
    const token = await login("admin.a@test.com");

    const response = await request(app)
      .post(`/users/${alvo.id}/reset-password`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(passwordSchema.safeParse(response.body.temporaryPassword).success).toBe(true);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(stored.mustChangePassword).toBe(true);

    const oldRefresh = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: loginBefore.body.refreshToken });
    expect(oldRefresh.status).toBe(401);

    const oldPassword = await request(app)
      .post("/auth/login")
      .send({ email: "alvo@test.com", password: DEFAULT_PASSWORD });
    expect(oldPassword.status).toBe(401);

    const tempPassword = await request(app)
      .post("/auth/login")
      .send({ email: "alvo@test.com", password: response.body.temporaryPassword });
    expect(tempPassword.status).toBe(200);
    expect(tempPassword.body.user.mustChangePassword).toBe(true);
  });

  it("não permite redefinir a própria senha por esta rota", async () => {
    const { admin } = await seedCompany("Empresa A", "admin.a@test.com");
    const token = await login("admin.a@test.com");

    const response = await request(app)
      .post(`/users/${admin.id}/reset-password`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("self_protected");
  });
});
