import { ConflictException } from "@nestjs/common";
import { PaymentMethod, PaymentType, Prisma, SerializedUnitStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CheckoutDto } from "./dto/checkout.dto";
import { SalesService } from "./sales.service";

describe("SalesService", () => {
  const productId = "2f9c7f32-cdbc-40c4-9b60-33858cbfed73";
  const customerId = "6d084e57-3f6d-4fa0-b85c-4b94786716fd";
  const cashierId = "4f91608d-0bb9-4dd6-b726-b0376e084547";
  const idempotencyKey = "6510c697-726c-46ba-8625-a091ef830b01";
  const tx = {
    sale: { findUnique: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
    customer: { findUnique: jest.fn() },
    product: { findMany: jest.fn() },
    stockMovement: { groupBy: jest.fn(), create: jest.fn() },
    serializedUnit: { findMany: jest.fn(), updateMany: jest.fn() },
    saleItem: { create: jest.fn() },
    payment: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const saleFindUnique = jest.fn();
  const transaction = jest.fn((operation: (client: typeof tx) => unknown) => operation(tx));
  const prisma = {
    sale: { findUnique: saleFindUnique },
    $transaction: transaction,
  } as unknown as PrismaService;
  const service = new SalesService(prisma);

  const checkout: CheckoutDto = {
    customerId,
    items: [{ productId, quantity: 2, unitPrice: 100, discount: 10 }],
    payment: { method: PaymentMethod.CASH, type: PaymentType.FULL, amount: 180 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    saleFindUnique.mockResolvedValue(null);
    tx.sale.findUnique.mockResolvedValue(null);
    tx.customer.findUnique.mockResolvedValue({ id: customerId });
    tx.product.findMany.mockResolvedValue([{
      id: productId,
      active: true,
      isSerialized: false,
      sellingPrice: new Prisma.Decimal(100),
    }]);
    tx.stockMovement.groupBy.mockResolvedValue([{
      productId,
      _sum: { quantity: 5 },
    }]);
    tx.sale.create.mockResolvedValue({ id: "sale-1" });
    tx.saleItem.create.mockResolvedValue({ id: "item-1" });
    tx.stockMovement.create.mockResolvedValue({ id: "movement-1" });
    tx.payment.create.mockResolvedValue({ id: "payment-1", amount: new Prisma.Decimal(180) });
    tx.auditLog.create.mockResolvedValue({});
    tx.sale.findUniqueOrThrow.mockResolvedValue({
      id: "sale-1",
      customerId,
      cashierId,
      saleItems: [],
      payments: [],
    });
  });

  it("creates sale, item, payment, stock movement and audit data atomically", async () => {
    const result = await service.checkout(checkout, cashierId, idempotencyKey);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.sale.create).toHaveBeenCalledWith({
      data: { customerId, cashierId, idempotencyKey },
    });
    expect(tx.saleItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ productId, quantity: 2 }),
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ productId, quantity: -2, createdById: cashierId }),
    });
    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ saleId: "sale-1", amount: new Prisma.Decimal(180) }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "SALE", entityId: "sale-1" }),
    });
    expect(result.totals.grandTotal.equals(180)).toBe(true);
  });

  it("rejects a repeated idempotency key before starting another transaction", async () => {
    saleFindUnique.mockResolvedValue({ id: "existing-sale" });

    await expect(service.checkout(checkout, cashierId, idempotencyKey))
      .rejects.toBeInstanceOf(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a stale cart price before creating a sale", async () => {
    tx.product.findMany.mockResolvedValue([{
      id: productId,
      active: true,
      isSerialized: false,
      sellingPrice: new Prisma.Decimal(110),
    }]);

    await expect(service.checkout(checkout, cashierId, idempotencyKey))
      .rejects.toThrow("Price changed");
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it("rejects deposits until FR5 can create the plan and schedule", async () => {
    const depositCheckout: CheckoutDto = {
      ...checkout,
      payment: { method: PaymentMethod.CASH, type: PaymentType.DEPOSIT, amount: 50 },
    };

    await expect(service.checkout(depositCheckout, cashierId, idempotencyKey))
      .rejects.toThrow("requires FR5 plan and schedule details");
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it("sells a selected serialized unit and deducts exactly one", async () => {
    const serializedUnitId = "304f63d0-ec85-471b-879f-37388b61fe5d";
    tx.product.findMany.mockResolvedValue([{
      id: productId,
      active: true,
      isSerialized: true,
      sellingPrice: new Prisma.Decimal(100),
    }]);
    tx.serializedUnit.findMany.mockResolvedValue([{
      id: serializedUnitId,
      productId,
    }]);
    tx.serializedUnit.updateMany.mockResolvedValue({ count: 1 });
    const serializedCheckout: CheckoutDto = {
      customerId,
      items: [{ productId, serializedUnitId, quantity: 1, unitPrice: 100, discount: 0 }],
      payment: { method: PaymentMethod.CARD, type: PaymentType.FULL, amount: 100 },
    };
    tx.payment.create.mockResolvedValue({ id: "payment-1", amount: new Prisma.Decimal(100) });

    await service.checkout(serializedCheckout, cashierId, idempotencyKey);

    expect(tx.serializedUnit.updateMany).toHaveBeenCalledWith({
      where: { id: serializedUnitId, productId, status: SerializedUnitStatus.IN_STOCK },
      data: { status: SerializedUnitStatus.SOLD },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ quantity: -1 }),
    });
  });
});
