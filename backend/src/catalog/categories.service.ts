import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCategoryDto } from "./dto/create-category.dto";
import type { UpdateCategoryDto } from "./dto/update-category.dto";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
  }

  async create(input: CreateCategoryDto, actorId: string) {
    const name = input.name.trim();
    await this.ensureUniqueName(name);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.create({ data: { name } });
      await tx.auditLog.create({
        data: { actorId, action: "CREATE", entity: "CATEGORY", entityId: category.id },
      });
      return category;
    });
  }

  async update(id: string, input: UpdateCategoryDto, actorId: string) {
    await this.requireCategory(id);
    const name = input.name.trim();
    await this.ensureUniqueName(name, id);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.update({ where: { id }, data: { name } });
      await tx.auditLog.create({
        data: { actorId, action: "UPDATE", entity: "CATEGORY", entityId: category.id },
      });
      return category;
    });
  }

  async deactivate(id: string, actorId: string) {
    await this.requireCategory(id);
    const category = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({ where: { id }, data: { active: false } });
      await tx.product.updateMany({ where: { categoryId: id }, data: { active: false } });
      await tx.auditLog.create({
        data: { actorId, action: "DEACTIVATE", entity: "CATEGORY", entityId: id },
      });
      return updated;
    });
    return category;
  }

  private async requireCategory(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException("Category not found");
    return category;
  }

  private async ensureUniqueName(name: string, excludeId?: string) {
    const duplicate = await this.prisma.category.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (duplicate) throw new ConflictException("A category with this name already exists");
  }
}
