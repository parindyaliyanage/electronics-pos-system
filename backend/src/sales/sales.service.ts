import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PaymentType,
  Prisma,
  SerializedUnitStatus,
  StockMovementType,
  UserRole,
} from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { CheckoutDto } from "./dto/checkout.dto";
import type { CheckoutItemDto } from "./dto/checkout-item.dto";

const saleInclude = {
  customer: true,
  cashier: { select: { id: true, email: true, role: true } },
  saleItems: {
    include: {
      product: { select: { id: true, name: true, isSerialized: true } },
      serializedUnit: true,
    },
  },
  payments: true,
} as const;

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async checkout(input: CheckoutDto, cashierId: string, idempotencyKey: string) {
    const existing = await this.prisma.sale.findUnique({ where: { idempotencyKey } });
    if (existing) {
      throw new ConflictException("This checkout request has already been processed");
    }

    try {
      return await this.withSerializableRetry(() => this.prisma.$transaction(async (tx) => {
        const duplicate = await tx.sale.findUnique({ where: { idempotencyKey } });
        if (duplicate) {
          throw new ConflictException("This checkout request has already been processed");
        }

        const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
        if (!customer) throw new NotFoundException("Customer not found");

        const productIds = [...new Set(input.items.map(({ productId }) => productId))];
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
        });
        if (products.length !== productIds.length) {
          throw new NotFoundException("One or more products were not found");
        }
        const productById = new Map(products.map((product) => [product.id, product]));

        this.validateLines(input.items, productById);
        await this.validateStock(tx, input.items, productById);

        const subtotal = input.items.reduce(
          (total, item) => total.plus(new Prisma.Decimal(item.unitPrice).mul(item.quantity)),
          new Prisma.Decimal(0),
        );
        const totalDiscount = input.items.reduce(
          (total, item) => total.plus(new Prisma.Decimal(item.discount).mul(item.quantity)),
          new Prisma.Decimal(0),
        );
        const grandTotal = subtotal.minus(totalDiscount);
        this.validatePayment(input.payment.type, new Prisma.Decimal(input.payment.amount), grandTotal);

        const sale = await tx.sale.create({
          data: {
            customerId: input.customerId,
            cashierId,
            idempotencyKey,
          },
        });

        for (const item of input.items) {
          await tx.saleItem.create({
            data: {
              saleId: sale.id,
              productId: item.productId,
              serializedUnitId: item.serializedUnitId,
              quantity: item.quantity,
              unitPrice: new Prisma.Decimal(item.unitPrice),
              discount: new Prisma.Decimal(item.discount),
            },
          });

          if (item.serializedUnitId) {
            const changed = await tx.serializedUnit.updateMany({
              where: {
                id: item.serializedUnitId,
                productId: item.productId,
                status: SerializedUnitStatus.IN_STOCK,
              },
              data: { status: SerializedUnitStatus.SOLD },
            });
            if (changed.count !== 1) {
              throw new ConflictException("A serialized unit is no longer available");
            }
          }

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              createdById: cashierId,
              type: StockMovementType.SALE,
              quantity: -item.quantity,
            },
          });
        }

        const payment = await tx.payment.create({
          data: {
            saleId: sale.id,
            amount: new Prisma.Decimal(input.payment.amount),
            method: input.payment.method,
            type: input.payment.type,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: cashierId,
            action: "CREATE",
            entity: "SALE",
            entityId: sale.id,
          },
        });

        const createdSale = await tx.sale.findUniqueOrThrow({
          where: { id: sale.id },
          include: saleInclude,
        });
        return {
          ...createdSale,
          totals: { subtotal, totalDiscount, grandTotal, amountPaid: payment.amount },
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This checkout request has already been processed");
      }
      throw error;
    }
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: saleInclude });
    if (!sale) throw new NotFoundException("Sale not found");
    if (requester.role === UserRole.WORKER && sale.cashierId !== requester.id) {
      throw new ForbiddenException("Workers can only view their own sales");
    }
    return sale;
  }

  private validateLines(
    items: CheckoutItemDto[],
    productById: Map<string, { id: string; active: boolean; isSerialized: boolean; sellingPrice: Prisma.Decimal }>,
  ) {
    const serializedUnitIds = new Set<string>();
    const nonSerializedProductIds = new Set<string>();

    for (const item of items) {
      const product = productById.get(item.productId)!;
      if (!product.active) throw new BadRequestException(`Product ${product.id} is inactive`);
      if (!product.sellingPrice.equals(item.unitPrice)) {
        throw new ConflictException(`Price changed for product ${product.id}; refresh the cart`);
      }
      if (new Prisma.Decimal(item.discount).greaterThan(product.sellingPrice)) {
        throw new BadRequestException(`Discount cannot exceed price for product ${product.id}`);
      }

      if (product.isSerialized) {
        if (item.quantity !== 1 || !item.serializedUnitId) {
          throw new BadRequestException(
            `Serialized product ${product.id} requires quantity 1 and serializedUnitId`,
          );
        }
        if (serializedUnitIds.has(item.serializedUnitId)) {
          throw new BadRequestException("A serialized unit cannot appear twice in one cart");
        }
        serializedUnitIds.add(item.serializedUnitId);
      } else {
        if (item.serializedUnitId) {
          throw new BadRequestException(`Non-serialized product ${product.id} cannot have serializedUnitId`);
        }
        if (nonSerializedProductIds.has(product.id)) {
          throw new BadRequestException("Combine duplicate non-serialized products into one cart line");
        }
        nonSerializedProductIds.add(product.id);
      }
    }
  }

  private async validateStock(
    tx: Prisma.TransactionClient,
    items: CheckoutItemDto[],
    productById: Map<string, { id: string; isSerialized: boolean }>,
  ) {
    const nonSerializedItems = items.filter((item) => !productById.get(item.productId)!.isSerialized);
    if (nonSerializedItems.length) {
      const totals = await tx.stockMovement.groupBy({
        by: ["productId"],
        where: { productId: { in: nonSerializedItems.map(({ productId }) => productId) } },
        _sum: { quantity: true },
      });
      const stockByProduct = new Map(totals.map((row) => [row.productId, row._sum.quantity ?? 0]));
      for (const item of nonSerializedItems) {
        if ((stockByProduct.get(item.productId) ?? 0) < item.quantity) {
          throw new ConflictException(`Insufficient stock for product ${item.productId}`);
        }
      }
    }

    const serializedItems = items.filter(({ serializedUnitId }) => serializedUnitId);
    if (serializedItems.length) {
      const availableUnits = await tx.serializedUnit.findMany({
        where: {
          id: { in: serializedItems.map(({ serializedUnitId }) => serializedUnitId!) },
          status: SerializedUnitStatus.IN_STOCK,
        },
        select: { id: true, productId: true },
      });
      const availableById = new Map(availableUnits.map((unit) => [unit.id, unit]));
      for (const item of serializedItems) {
        const unit = availableById.get(item.serializedUnitId!);
        if (!unit || unit.productId !== item.productId) {
          throw new ConflictException(`Serialized unit is unavailable for product ${item.productId}`);
        }
      }
    }
  }

  private validatePayment(type: PaymentType, amount: Prisma.Decimal, grandTotal: Prisma.Decimal) {
    if (grandTotal.lessThanOrEqualTo(0)) {
      throw new BadRequestException("Sale grand total must be greater than zero");
    }
    if (type === PaymentType.FULL && !amount.equals(grandTotal)) {
      throw new BadRequestException("Full payment amount must equal the grand total");
    }
    if (type === PaymentType.DEPOSIT) {
      throw new BadRequestException(
        "Installment checkout requires FR5 plan and schedule details",
      );
    }
    if (type === PaymentType.INSTALLMENT) {
      throw new BadRequestException("INSTALLMENT payments are recorded through FR5, not checkout");
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
