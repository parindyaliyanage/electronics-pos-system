import { BadRequestException, UnauthorizedException } from "@nestjs/common";
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
  const userFindUnique = jest.fn();
  const setOwnPassword = jest.fn();
  const prisma = {
    loginAttempt: { create: loginAttemptCreate },
    user: { findUnique: userFindUnique },
  } as unknown as PrismaService;
  const users = { findByEmailForAuthentication, setOwnPassword } as unknown as UsersService;
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
      fullName: "Admin User",
      passwordHash: await hash("correct-password", 4),
      role: UserRole.ADMINISTRATOR,
      active: true,
      passwordChangedAt: null,
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

  it("rejects a deactivated account with the generic error and records the attempt", async () => {
    findByEmailForAuthentication.mockResolvedValue({
      id: "d58b17d0-ac5b-4831-902c-e972d86b3c13",
      email: "former@example.com",
      fullName: "Former Worker",
      passwordHash: await hash("correct-password", 4),
      role: UserRole.WORKER,
      active: false,
      passwordChangedAt: null,
      createdAt: new Date(),
    });

    await expect(
      service.login({ email: "former@example.com", password: "correct-password" }),
    ).rejects.toEqual(new UnauthorizedException("Invalid email or password"));
    expect(signAsync).not.toHaveBeenCalled();
    expect(loginAttemptCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ successful: false }) }),
    );
  });

  describe("changePassword", () => {
    const stored = async () => ({
      id: "d58b17d0-ac5b-4831-902c-e972d86b3c13",
      email: "worker@example.com",
      fullName: "Worker",
      passwordHash: await hash("OldPassw0rd", 4),
      role: UserRole.WORKER,
      active: true,
      passwordChangedAt: null,
      createdAt: new Date(),
    });

    it("rejects a wrong current password without changing anything", async () => {
      userFindUnique.mockResolvedValue(await stored());
      await expect(service.changePassword("d58b17d0-ac5b-4831-902c-e972d86b3c13", {
        currentPassword: "wrong",
        newPassword: "NewPassw0rd",
      })).rejects.toEqual(new BadRequestException("Current password is incorrect"));
      expect(setOwnPassword).not.toHaveBeenCalled();
    });

    it("stores the new password and returns a fresh token", async () => {
      userFindUnique.mockResolvedValue(await stored());
      const result = await service.changePassword("d58b17d0-ac5b-4831-902c-e972d86b3c13", {
        currentPassword: "OldPassw0rd",
        newPassword: "NewPassw0rd",
      });
      expect(setOwnPassword).toHaveBeenCalledWith("d58b17d0-ac5b-4831-902c-e972d86b3c13", "NewPassw0rd");
      expect(result.accessToken).toBe("signed-token");
    });
  });
});
