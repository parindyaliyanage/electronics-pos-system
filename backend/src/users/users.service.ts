import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { hash } from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateUserDto } from "./dto/create-user.dto";
import type { UpdateUserDto } from "./dto/update-user.dto";
import type { UserQueryDto } from "./dto/user-query.dto";

export const BCRYPT_ROUNDS = 12;

// Never includes passwordHash.
const safeUserSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

type Tx = Prisma.TransactionClient;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- used by auth -------------------------------------------------------

  findByEmailForAuthentication(email: string) {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
    });
  }

  findAuthenticatedUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { ...safeUserSelect, passwordChangedAt: true },
    });
  }

  // ---- FR1 user management (Administrator only) ----------------------------

  findAll(query: UserQueryDto = {}) {
    const search = query.search?.trim();
    return this.prisma.user.findMany({
      where: {
        ...(query.role ? { role: query.role } : {}),
        ...(query.active !== undefined ? { active: query.active } : {}),
        ...(search ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { fullName: { contains: search, mode: "insensitive" as const } },
          ],
        } : {}),
      },
      select: safeUserSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: safeUserSelect });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async create(input: CreateUserDto, actorId: string) {
    const email = this.normalizeEmail(input.email);
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException("A user with this email already exists");

    const passwordHash = await hash(input.password, BCRYPT_ROUNDS);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email, fullName: input.fullName.trim(), role: input.role, passwordHash },
          select: safeUserSelect,
        });
        await this.audit(tx, actorId, "CREATE", user.id);
        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A user with this email already exists");
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateUserDto, actorId: string) {
    if (input.fullName === undefined && input.role === undefined) {
      throw new BadRequestException("Provide fullName and/or role to update");
    }
    return this.withSerializableRetry(() => this.prisma.$transaction(async (tx) => {
      const user = await this.findForChange(tx, id);
      if (input.role !== undefined && input.role !== user.role) {
        if (id === actorId) {
          throw new BadRequestException("You cannot change your own role; ask another administrator");
        }
        if (user.role === UserRole.ADMINISTRATOR && user.active) {
          await this.assertAnotherActiveAdministrator(tx, id);
        }
      }
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
        },
        select: safeUserSelect,
      });
      await this.audit(tx, actorId, input.role !== undefined && input.role !== user.role ? "CHANGE_ROLE" : "UPDATE", id);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async deactivate(id: string, actorId: string) {
    if (id === actorId) throw new BadRequestException("You cannot deactivate your own account");
    return this.withSerializableRetry(() => this.prisma.$transaction(async (tx) => {
      const user = await this.findForChange(tx, id);
      if (!user.active) throw new ConflictException("User is already deactivated");
      if (user.role === UserRole.ADMINISTRATOR) await this.assertAnotherActiveAdministrator(tx, id);
      const updated = await tx.user.update({ where: { id }, data: { active: false }, select: safeUserSelect });
      await this.audit(tx, actorId, "DEACTIVATE", id);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async activate(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.findForChange(tx, id);
      if (user.active) throw new ConflictException("User is already active");
      const updated = await tx.user.update({ where: { id }, data: { active: true }, select: safeUserSelect });
      await this.audit(tx, actorId, "ACTIVATE", id);
      return updated;
    });
  }

  /** Administrator sets a new password; the user's existing sessions stop working. */
  async resetPassword(id: string, password: string, actorId: string) {
    const passwordHash = await hash(password, BCRYPT_ROUNDS);
    return this.prisma.$transaction(async (tx) => {
      await this.findForChange(tx, id);
      const updated = await tx.user.update({
        where: { id },
        data: { passwordHash, passwordChangedAt: new Date() },
        select: safeUserSelect,
      });
      await this.audit(tx, actorId, "RESET_PASSWORD", id);
      return updated;
    });
  }

  /** Used by POST /auth/change-password after the current password is verified. */
  async setOwnPassword(id: string, password: string) {
    const passwordHash = await hash(password, BCRYPT_ROUNDS);
    const changedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, passwordChangedAt: changedAt } });
      await this.audit(tx, id, "CHANGE_PASSWORD", id);
    });
    return changedAt;
  }

  // ---- helpers --------------------------------------------------------------

  private async findForChange(tx: Tx, id: string) {
    const user = await tx.user.findUnique({ where: { id }, select: { id: true, role: true, active: true } });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  /** The system must always keep at least one active administrator. */
  private async assertAnotherActiveAdministrator(tx: Tx, excludingId: string) {
    const others = await tx.user.count({
      where: { role: UserRole.ADMINISTRATOR, active: true, id: { not: excludingId } },
    });
    if (others === 0) {
      throw new ConflictException("This is the last active administrator; create or activate another administrator first");
    }
  }

  private audit(tx: Tx, actorId: string, action: string, userId: string) {
    return tx.auditLog.create({ data: { actorId, action, entity: "USER", entityId: userId } });
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
        if (!retryable || attempt === attempts) throw error;
      }
    }
    throw new Error("Unreachable transaction retry state");
  }
}
