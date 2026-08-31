import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { UserRole, type User } from "@prisma/client";
import { hash } from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const loginAttemptCreate = jest.fn();
  const signAsync = jest.fn();
  const findByEmailForAuthentication = jest.fn();
  const prisma = { loginAttempt: { create: loginAttemptCreate } } as unknown as PrismaService;
  const users = { findByEmailForAuthentication } as unknown as UsersService;
  const jwt = { signAsync } as unknown as JwtService;
  const config = {
    get: jest.fn((_key: string, fallback: string) => fallback),
  } as unknown as ConfigService;
  const service = new AuthService(users, prisma, jwt, config);

  beforeEach(() => {
    jest.clearAllMocks();
    loginAttemptCreate.mockResolvedValue({});
    signAsync.mockResolvedValue("signed-token");
  });

  it("issues a role-bearing JWT and records a successful login", async () => {
    const user: User = {
      id: "d58b17d0-ac5b-4831-902c-e972d86b3c13",
      email: "admin@example.com",
      passwordHash: await hash("correct-password", 4),
      role: UserRole.ADMINISTRATOR,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    findByEmailForAuthentication.mockResolvedValue(user);

    const result = await service.login({
      email: " ADMIN@example.com ",
      password: "correct-password",
    });

    expect(signAsync).toHaveBeenCalledWith(
      { sub: user.id, email: user.email, role: UserRole.ADMINISTRATOR },
      { expiresIn: "8h" },
    );
    expect(loginAttemptCreate).toHaveBeenCalledWith({
      data: {
        email: "admin@example.com",
        userId: user.id,
        successful: true,
      },
    });
    expect(result.accessToken).toBe("signed-token");
    expect(result.user).not.toHaveProperty("passwordHash");
  });

  it("returns the same generic error and records an unknown email", async () => {
    findByEmailForAuthentication.mockResolvedValue(null);

    await expect(
      service.login({ email: "missing@example.com", password: "wrong" }),
    ).rejects.toEqual(new UnauthorizedException("Invalid email or password"));
    expect(loginAttemptCreate).toHaveBeenCalledWith({
      data: {
        email: "missing@example.com",
        userId: undefined,
        successful: false,
      },
    });
  });

  it("returns the same generic error and records a wrong password", async () => {
    findByEmailForAuthentication.mockResolvedValue({
      id: "d58b17d0-ac5b-4831-902c-e972d86b3c13",
      email: "worker@example.com",
      passwordHash: await hash("correct-password", 4),
      role: UserRole.WORKER,
      createdAt: new Date(),
    });

    await expect(
      service.login({ email: "worker@example.com", password: "wrong" }),
    ).rejects.toEqual(new UnauthorizedException("Invalid email or password"));
    expect(loginAttemptCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ successful: false }) }),
    );
  });
});
