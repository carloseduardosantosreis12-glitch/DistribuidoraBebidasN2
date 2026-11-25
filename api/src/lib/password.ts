import { randomInt } from "node:crypto";
import { argon2id, hash, verify } from "argon2";
import { z } from "zod";

const HASH_OPTIONS = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const TEMPORARY_PASSWORD_LENGTH = 12;

const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const ALL = UPPERCASE + LOWERCASE + DIGITS;

export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter no mínimo 8 caracteres.")
  .regex(/[A-Z]/, "A senha deve conter ao menos uma letra maiúscula.")
  .regex(/[0-9]/, "A senha deve conter ao menos um número.");

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, HASH_OPTIONS);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}

export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$3OU4gci1s8Obc+P/PBrQYg$X7kc14EDyHOaA7CpTMalOWp54zIJUW2SWZsjQ0HX0e8";

function pick(chars: string): string {
  return chars[randomInt(chars.length)] ?? chars[0] ?? "";
}

export function generateTemporaryPassword(): string {
  const chars = [pick(UPPERCASE), pick(LOWERCASE), pick(DIGITS)];

  while (chars.length < TEMPORARY_PASSWORD_LENGTH) {
    chars.push(pick(ALL));
  }

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const current = chars[i] ?? "";
    chars[i] = chars[j] ?? "";
    chars[j] = current;
  }

  return chars.join("");
}
