import { BadRequestException } from "@nestjs/common";
import { StockMovementType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "./inventory.service";

describe("InventoryService", () => {
  const tx = {
    product: { findUnique: jest.fn() },
    stockMovement: { aggregate: jest.fn(), create: jest.fn() },
    serializedUnit: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const transaction = jest.fn((operation: (client: typeof tx) => unknown) => operation(tx));
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  const service = new InventoryService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.auditLog.create.mockResolvedValue({});
  });

  it("rejects a PURCHASE with a negative quantity before opening a transaction", async () => {
    await expect(service.createMovement({
      productId: "23ca4937-e79c-4011-b50e-1b29ba401f5f",
      type: StockMovementType.PURCHASE,
      quantity: -1,
    }, "actor-1")).rejects.toThrow("PURCHASE quantity must be positive");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("prevents a movement from making stock negative", async () => {
    tx.product.findUnique.mockResolvedValue({ active: true, isSerialized: false });
    tx.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 2 } });

    await expect(service.createMovement({
      productId: "23ca4937-e79c-4011-b50e-1b29ba401f5f",
      type: StockMovementType.DAMAGED,
      quantity: -3,
    }, "actor-1")).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("registers a serialized unit and its PURCHASE movement atomically", async () => {
    tx.product.findUnique.mockResolvedValue({ active: true, isSerialized: true });
    tx.serializedUnit.create.mockResolvedValue({
      id: "unit-1",
      productId: "23ca4937-e79c-4011-b50e-1b29ba401f5f",
      serialNumber: "IMEI-123",
    });
    tx.stockMovement.create.mockResolvedValue({ id: "movement-1" });

    const result = await service.registerSerializedUnit({
      productId: "23ca4937-e79c-4011-b50e-1b29ba401f5f",
      serialNumber: " imei-123 ",
    }, "actor-1");

    expect(tx.serializedUnit.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ serialNumber: "IMEI-123" }),
    }));
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: StockMovementType.PURCHASE, quantity: 1 }),
    });
    expect(result).toEqual(expect.objectContaining({ stockMovementId: "movement-1" }));
  });
});
