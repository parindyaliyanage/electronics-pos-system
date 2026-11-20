import type { UserRole } from "@prisma/client";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** Issued-at (seconds), set by the JWT library. */
  iat?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  active: boolean;
  createdAt: Date;
}
