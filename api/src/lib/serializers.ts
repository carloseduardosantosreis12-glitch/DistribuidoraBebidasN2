import type { Company, Role, User } from "@prisma/client";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
};

export type PublicCompany = {
  id: string;
  name: string;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

export type AdminUser = PublicUser & {
  active: boolean;
  createdAt: string;
};

export function toAdminUser(user: User): AdminUser {
  return {
    ...toPublicUser(user),
    active: user.active,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toPublicCompany(company: Pick<Company, "id" | "name">): PublicCompany {
  return { id: company.id, name: company.name };
}
