import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const safeUserSelect = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmailForAuthentication(email: string) {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
    });
  }

  findAuthenticatedUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: safeUserSelect,
    });
  }

  findAll() {
    return this.prisma.user.findMany({
      select: safeUserSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }
}
