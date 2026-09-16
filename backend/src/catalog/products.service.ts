import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Product } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateProductDto } from "./dto/create-product.dto";
import type { ProductQueryDto } from "./dto/product-query.dto";
import type { UpdateProductDto } from "./dto/update-product.dto";

const productInclude = { category: true } as const;
type ProductWithCategory = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ProductQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      active: query.active ?? true,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { category: { name: { contains: search, mode: "insensitive" } } },
          { serializedUnits: { some: { serialNumber: { contains: search, mode: "insensitive" } } } },
        ],
      } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { name: "asc" },
        skip,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: await this.withStockLevels(products),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { ...productInclude, serializedUnits: { orderBy: { serialNumber: "asc" } } },
    });
    if (!product) throw new NotFoundException("Product not found");
    const [result] = await this.withStockLevels([product]);
    return result;
  }

  async create(input: CreateProductDto, actorId: string) {
    await this.requireActiveCategory(input.categoryId);
    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ...input,
          name: input.name.trim(),
          costPrice: new Prisma.Decimal(input.costPrice),
          sellingPrice: new Prisma.Decimal(input.sellingPrice),
        },
        include: productInclude,
      });
      await tx.auditLog.create({
        data: { actorId, action: "CREATE", entity: "PRODUCT", entityId: created.id },
      });
      return created;
    });
    return this.addStockLevel(product, 0);
  }

  async update(id: string, input: UpdateProductDto, actorId: string) {
    const existing = await this.requireProduct(id);
    if (input.categoryId) await this.requireActiveCategory(input.categoryId);
    if (input.isSerialized !== undefined && input.isSerialized !== existing.isSerialized) {
      const hasInventoryHistory = await this.prisma.stockMovement.count({ where: { productId: id } });
      if (hasInventoryHistory) {
        throw new BadRequestException("Serialization mode cannot change after stock history exists");
      }
    }
    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          ...input,
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.costPrice !== undefined ? { costPrice: new Prisma.Decimal(input.costPrice) } : {}),
          ...(input.sellingPrice !== undefined ? { sellingPrice: new Prisma.Decimal(input.sellingPrice) } : {}),
        },
        include: productInclude,
      });
      await tx.auditLog.create({
        data: { actorId, action: "UPDATE", entity: "PRODUCT", entityId: updated.id },
      });
      return updated;
    });
    const currentStock = await this.currentStock(id);
    return this.addStockLevel(product, currentStock);
  }

  async deactivate(id: string, actorId: string) {
    await this.requireProduct(id);
    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: { active: false },
        include: productInclude,
      });
      await tx.auditLog.create({
        data: { actorId, action: "DEACTIVATE", entity: "PRODUCT", entityId: updated.id },
      });
      return updated;
    });
    const currentStock = await this.currentStock(id);
    return this.addStockLevel(product, currentStock);
  }

  async requireProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  async currentStock(productId: string) {
    const aggregate = await this.prisma.stockMovement.aggregate({
      where: { productId },
      _sum: { quantity: true },
    });
    return aggregate._sum.quantity ?? 0;
  }

  private async requireActiveCategory(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException("Category not found");
    if (!category.active) throw new BadRequestException("Category is inactive");
  }

  private async withStockLevels<T extends ProductWithCategory>(products: T[]) {
    if (!products.length) return [];
    const totals = await this.prisma.stockMovement.groupBy({
      by: ["productId"],
      where: { productId: { in: products.map(({ id }) => id) } },
      _sum: { quantity: true },
    });
    const stockByProduct = new Map(totals.map((row) => [row.productId, row._sum.quantity ?? 0]));
    return products.map((product) => this.addStockLevel(product, stockByProduct.get(product.id) ?? 0));
  }

  private addStockLevel<T extends Product>(product: T, currentStock: number) {
    return {
      ...product,
      currentStock,
      lowStock: currentStock < product.lowStockThreshold,
    };
  }
}
