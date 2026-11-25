import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: "not_found", message: "Rota não encontrada." },
  });
};

function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    const message = err.issues[0]?.message ?? "Dados inválidos.";
    res.status(400).json({ error: { code: "validation_error", message } });
    return;
  }

  if (isBodyParserError(err) && err.status >= 400 && err.status < 500) {
    const tooLarge = err.status === 413;
    res.status(err.status).json({
      error: {
        code: tooLarge ? "payload_too_large" : "invalid_body",
        message: tooLarge ? "Corpo da requisição muito grande." : "Corpo da requisição inválido.",
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    res.status(409).json({
      error: { code: "conflict", message: "Já existe um registro com esses dados." },
    });
    return;
  }

  const name = err instanceof Error ? err.name : "UnknownError";
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[erro-nao-tratado] ${name}: ${message}`);

  res.status(500).json({
    error: { code: "internal_error", message: "Erro interno do servidor." },
  });
};
