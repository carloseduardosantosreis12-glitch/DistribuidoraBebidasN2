export function resolveTestDatabaseUrl(
  base: string | undefined = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
): string {
  if (!base) {
    throw new Error(
      "DATABASE_URL não definida. Crie o .env antes de rodar os testes (ou defina TEST_DATABASE_URL).",
    );
  }

  const url = new URL(base);
  const current = url.pathname.replace(/^\//, "");

  if (!current) {
    throw new Error("DATABASE_URL não contém o nome do banco de dados.");
  }

  const name = current.endsWith("_test") ? current : `${current}_test`;
  url.pathname = `/${name}`;

  return url.toString();
}

export function assertTestDatabase(url: string | undefined): string {
  if (!url) {
    throw new Error("DATABASE_URL não definida para os testes.");
  }

  let name: string;

  try {
    name = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error("DATABASE_URL inválida para os testes.");
  }

  if (!name.endsWith("_test")) {
    throw new Error(`Recusando operar no banco "${name}": o nome não termina em _test.`);
  }

  return name;
}
