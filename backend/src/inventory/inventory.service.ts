import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, StockMovementType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateSerializedUnitDto } from "./dto/create-serialized-unit.dto";
import type { CreateStockMovementDto } from "./dto/create-stock-movement.dto";
import type { InventoryQueryDto } from "./dto/inventory-query.dto";

const POSITIVE_MOVEMENTS = new Set<StockMovementType>([
  StockMovementType.PURCHASE,
  StockMovementType.RETURN,
]);
const NEGATIVE_MOVEMENTS = new Set<StockMovementType>([
  StockMovementType.SALE,
  StockMovementType.DAMAGED,
]);

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async createMovement(input: CreateStockMovementDto, actorId: string) {
    this.validateMovementSign(input.type, input.quantity);

    return this.withSerializableRetry(async () => this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: input.productId } });
      if (!product) throw new NotFoundException("Product not found");
      if (!product.active) throw new BadRequestException("Stock cannot change for an inactive product");
      if (product.isSerialized) {
        throw new BadRequestException(
          "Serialized stock must be changed through serialized-unit operations",
        );
      }

      const stock = await tx.stockMovement.aggregate({
        where: { productId: input.productId },
        _sum: { quantity: true },
      });
      const currentStock = stock._sum.quantity ?? 0;
      const resultingStock = currentStock + input.quantity;
      if (resultingStock < 0) {
        throw new BadRequestException("Stock movement would make current stock negative");
      }

      const movement = await tx.stockMovement.create({
        data: { ...input, createdById: actorId },
        include: {
          product: { select: { id: true, name: true } },
          createdBy: { select: { id: true, email: true, role: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: input.type,
          entity: "STOCK_MOVEMENT",
          entityId: movement.id,
        },
      });
      return { ...movement, previousStock: currentStock, currentStock: resultingStock };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async findMovements(query: InventoryQueryDto) {
    const where: Prisma.StockMovementWhereInput = query.productId
      ? { productId: query.productId }
      : {};
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, name: true } },
          createdBy: { select: { id: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { data, meta: { page: query.page, limit: query.limit, total } };
  }

  async registerSerializedUnit(input: CreateSerializedUnitDto, actorId: string) {
    const serialNumber = input.serialNumber.trim().toUpperCase();
    try {
      return await this.withSerializableRetry(async () => this.prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({ where: { id: input.productId } });
        if (!product) throw new NotFoundException("Product not found");
        if (!product.active) throw new BadRequestException("Unit cannot be added to an inactive product");
        if (!product.isSerialized) {
          throw new BadRequestException("Product is not configured as serialized");
        }

        const unit = await tx.serializedUnit.create({
          data: {
            productId: input.productId,
            serialNumber,
            warrantyStartDate: input.warrantyStartDate,
          },
          include: { product: { select: { id: true, name: true } } },
        });
        const movement = await tx.stockMovement.create({
          data: {
            productId: input.productId,
            createdById: actorId,
            type: StockMovementType.PURCHASE,
            quantity: 1,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "REGISTER",
            entity: "SERIALIZED_UNIT",
            entityId: unit.id,
          },
        });
        return { ...unit, stockMovementId: movement.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Serial number already exists");
      }
      throw error;
    }
  }

  async findSerializedUnits(query: InventoryQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.SerializedUnitWhereInput = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(search ? {
        OR: [
          { serialNumber: { contains: search, mode: "insensitive" } },
          { product: { name: { contains: search, mode: "insensitive" } } },
          { product: { category: { name: { contains: search, mode: "insensitive" } } } },
        ],
      } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.serializedUnit.findMany({
        where,
        include: { product: { include: { category: true } } },
        orderBy: { serialNumber: "asc" },
        skip,
        take: query.limit,
      }),
      this.prisma.serializedUnit.count({ where }),
    ]);
    return { data, meta: { page: query.page, limit: query.limit, total } };
  }

  private validateMovementSign(type: StockMovementType, quantity: number) {
    if (POSITIVE_MOVEMENTS.has(type) && quantity <= 0) {
      throw new BadRequestException(`${type} quantity must be positive`);
    }
    if (NEGATIVE_MOVEMENTS.has(type) && quantity >= 0) {
      throw new BadRequestException(`${type} quantity must be negative`);
    }
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
