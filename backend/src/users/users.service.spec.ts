import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { compare } from "bcrypt";
import type { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  const adminId = "11111111-1111-4111-8111-111111111111";
  const otherId = "22222222-2222-4222-8222-222222222222";

  const tx = {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
  } as unknown as PrismaService & { user: { findUnique: jest.Mock; findMany: jest.Mock } };
  const service = new UsersService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.user.update.mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data }));
    tx.auditLog.create.mockResolvedValue({});
  });

  describe("create", () => {
    it("hashes the password, never returns it, and audits the creation", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      tx.user.create.mockResolvedValue({ id: otherId, email: "new@shop.lk", role: UserRole.WORKER });

      await service.create(
        { email: "New@Shop.lk", fullName: " Sunil ", role: UserRole.WORKER, password: "Passw0rd1" },
        adminId,
      );

      const { data, select } = tx.user.create.mock.calls[0][0];
      expect(data.email).toBe("new@shop.lk");
      expect(data.fullName).toBe("Sunil");
      expect(data.passwordHash).not.toBe("Passw0rd1");
      expect(await compare("Passw0rd1", data.passwordHash)).toBe(true);
      expect(select).not.toHaveProperty("passwordHash");
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: { actorId: adminId, action: "CREATE", entity: "USER", entityId: otherId },
      });
    });

    it("rejects a duplicate email with 409", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: otherId });
      await expect(service.create(
        { email: "admin@shop.lk", fullName: "X", role: UserRole.WORKER, password: "Passw0rd1" },
        adminId,
      )).rejects.toBeInstanceOf(ConflictException);
      expect(tx.user.create).not.toHaveBeenCalled();
    });
  });

  describe("deactivate", () => {
    it("blocks deactivating your own account", async () => {
      await expect(service.deactivate(adminId, adminId)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("blocks deactivating the last active administrator", async () => {
      tx.user.findUnique.mockResolvedValue({ id: otherId, role: UserRole.ADMINISTRATOR, active: true });
      tx.user.count.mockResolvedValue(0);
      await expect(service.deactivate(otherId, adminId)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it("deactivates a worker and audits it", async () => {
      tx.user.findUnique.mockResolvedValue({ id: otherId, role: UserRole.WORKER, active: true });
      await service.deactivate(otherId, adminId);
      expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { active: false } }));
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: { actorId: adminId, action: "DEACTIVATE", entity: "USER", entityId: otherId },
      });
    });

    it("rejects an already deactivated user with 409 and an unknown one with 404", async () => {
      tx.user.findUnique.mockResolvedValueOnce({ id: otherId, role: UserRole.WORKER, active: false });
      await expect(service.deactivate(otherId, adminId)).rejects.toBeInstanceOf(ConflictException);
      tx.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.deactivate(otherId, adminId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("update", () => {
    it("blocks changing your own role", async () => {
      tx.user.findUnique.mockResolvedValue({ id: adminId, role: UserRole.ADMINISTRATOR, active: true });
      await expect(service.update(adminId, { role: UserRole.WORKER }, adminId))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it("blocks demoting the last active administrator", async () => {
      tx.user.findUnique.mockResolvedValue({ id: otherId, role: UserRole.ADMINISTRATOR, active: true });
      tx.user.count.mockResolvedValue(0);
      await expect(service.update(otherId, { role: UserRole.WORKER }, adminId))
        .rejects.toBeInstanceOf(ConflictException);
    });

    it("promotes a worker and records CHANGE_ROLE", async () => {
      tx.user.findUnique.mockResolvedValue({ id: otherId, role: UserRole.WORKER, active: true });
      await service.update(otherId, { role: UserRole.ADMINISTRATOR }, adminId);
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: { actorId: adminId, action: "CHANGE_ROLE", entity: "USER", entityId: otherId },
      });
    });

    it("requires at least one field", async () => {
      await expect(service.update(otherId, {}, adminId)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it("resetPassword stores a new hash and stamps passwordChangedAt so old tokens die", async () => {
    tx.user.findUnique.mockResolvedValue({ id: otherId, role: UserRole.WORKER, active: true });
    await service.resetPassword(otherId, "N3wPassword", adminId);
    const { data } = tx.user.update.mock.calls[0][0];
    expect(await compare("N3wPassword", data.passwordHash)).toBe(true);
    expect(data.passwordChangedAt).toBeInstanceOf(Date);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: { actorId: adminId, action: "RESET_PASSWORD", entity: "USER", entityId: otherId },
    });
  });
});
