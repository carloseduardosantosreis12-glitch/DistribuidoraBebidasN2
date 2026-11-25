# BebMais Auth API

API de autenticação do app Electron BebMais (PDV para distribuidoras). É o único componente online do sistema: autentica usuários, emite tokens e gerencia perfis. Não armazena estoque, vendas nem produtos.

## Pré-requisitos

- Node.js 20 ou superior
- PostgreSQL 14 ou superior (banco de desenvolvimento + banco de testes)
- npm 10 ou superior

## Configuração local

### 1. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | URL de conexão PostgreSQL (`postgresql://user:pass@host:5432/db`) |
| `JWT_SECRET` | Sim | Chave do access token JWT (mínimo 32 caracteres aleatórios) |
| `SEED_ADMIN_PASSWORD` | Na 1ª inicialização | Senha do ADMIN master (8+ chars, 1 maiúscula, 1 número). Pode ficar vazia depois que o master existir. |
| `ACCESS_TOKEN_TTL` | Não | Validade do access token (padrão: `15m`) |
| `PORT` | Não | Porta do servidor (padrão: `3333`) |
| `NODE_ENV` | Não | `development` / `test` / `production` (padrão: `development`) |

Gere um `JWT_SECRET` seguro:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 2. Banco de dados — via Docker (recomendado)

Sobe o PostgreSQL com os bancos de desenvolvimento e teste já criados:

```bash
docker compose up -d
```

O `docker-compose.yml` cria o banco `bebmais_auth` e, via `docker/init-test-db.sql`, também o banco `bebmais_auth_test`.

### 2. Banco de dados — instalação local

Crie os dois bancos manualmente:

```sql
CREATE USER bebmais_auth WITH PASSWORD 'sua_senha';
CREATE DATABASE bebmais_auth OWNER bebmais_auth;
CREATE DATABASE bebmais_auth_test OWNER bebmais_auth;
```

### 3. Instalar dependências

```bash
npm install
```

### 4. Aplicar migrations

```bash
npx prisma migrate dev
```

### 5. Rodar em desenvolvimento

```bash
npm run dev
```

O servidor sobe na porta configurada (padrão `3333`) e cria o ADMIN master automaticamente se ele não existir.

## ADMIN master

O sistema sempre precisa de um ADMIN master. Ele é criado automaticamente na primeira inicialização do servidor (ou via `npm run seed`) usando as constantes em `src/lib/master-admin.ts`:

```ts
export const MASTER_COMPANY_NAME = "BebMais";
export const MASTER_ADMIN_NAME   = "Administrador";
export const MASTER_ADMIN_EMAIL  = "admin@bebmais.com";
```

Ajuste essas constantes antes do primeiro uso. A **senha** vem de `SEED_ADMIN_PASSWORD` (nunca fica no código).

O master nasce com `mustChangePassword: true`. Troque a senha em `POST /auth/change-password` no primeiro login.

Para criar o master manualmente (sem subir o servidor):

```bash
npm run seed
```

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor em modo watch (tsx) |
| `npm run build` | Compila TypeScript + gera Prisma Client |
| `npm start` | Inicia a versão compilada (`dist/server.js`) |
| `npm run typecheck` | Verificação de tipos sem compilar |
| `npm test` | Roda todos os testes (vitest) |
| `npm run seed` | Cria/garante o ADMIN master no banco |

## Testes

Os testes rodam contra um banco PostgreSQL real (`bebmais_auth_test`). O banco de testes é escolhido automaticamente: o setup deriva o nome do banco de desenvolvimento acrescentando `_test`.

```bash
npm test
```

O `globalSetup` aplica as migrations no banco de testes antes de rodar. Cada teste começa com o banco limpo (TRUNCATE com CASCADE).

Para apontar para um banco de testes diferente, defina `TEST_DATABASE_URL`.

## Contrato da API

### Autenticação

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `POST` | `/auth/login` | — | Login com e-mail, senha e `rememberMe` opcional |
| `POST` | `/auth/refresh` | — | Renova o par de tokens (rotação) |
| `POST` | `/auth/logout` | — | Revoga o refresh token |
| `POST` | `/auth/change-password` | Bearer | Troca de senha (exige senha atual e refresh token) |
| `GET` | `/auth/me` | Bearer | Dados do usuário autenticado |
| `GET` | `/health` | — | Health check |

### Usuários (somente ADMIN)

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/users` | Cria usuário na empresa do token (retorna senha temporária) |
| `GET` | `/users` | Lista usuários da empresa |
| `PATCH` | `/users/:id` | Edita nome, perfil ou status |
| `POST` | `/users/:id/reset-password` | Gera nova senha temporária |

Formato de erro (todos os endpoints):

```json
{ "error": { "code": "invalid_credentials", "message": "E-mail ou senha incorretos." } }
```

## Produção

> A API **deve ser servida exclusivamente via HTTPS** em produção. O TLS fica por conta do reverse proxy ou do ambiente de deploy (nginx, Caddy, Railway, etc.). Nunca exponha a porta HTTP diretamente na internet.

Fluxo resumido:

```bash
npm run build
npm start
```

Certifique-se de que todas as variáveis de ambiente estão definidas e que as migrations estão aplicadas (`npx prisma migrate deploy`) antes de subir.
