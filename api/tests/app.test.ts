import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("GET /health", () => {
  it("responde ok", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("não expõe x-powered-by e aplica helmet", async () => {
    const response = await request(app).get("/health");
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["content-security-policy"]).toBeDefined();
  });
});

describe("tratamento de erros", () => {
  it("rota inexistente devolve 404 no formato padrão", async () => {
    const response = await request(app).get("/nao-existe");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "not_found", message: "Rota não encontrada." },
    });
  });

  it("JSON inválido devolve 400 invalid_body", async () => {
    const response = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send("{invalido");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_body");
  });

  it("corpo grande demais devolve 413 payload_too_large", async () => {
    const big = JSON.stringify({ data: "x".repeat(20 * 1024) });
    const response = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send(big);
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("payload_too_large");
  });

  it("não vaza stack trace", async () => {
    const response = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send("{invalido");
    expect(JSON.stringify(response.body)).not.toContain("at ");
    expect(response.body.error).not.toHaveProperty("stack");
  });
});
