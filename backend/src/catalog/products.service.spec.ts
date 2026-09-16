import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProductsService } from "./products.service";

describe("ProductsService", () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const groupBy = jest.fn();
  const prisma = {
    product: { findMany, count },
    stockMovement: { groupBy },
    $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
  } as unknown as PrismaService;
  const service = new ProductsService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it("derives current and low-stock values from the movement ledger", async () => {
    findMany.mockResolvedValue([
      {
        id: "product-1",
        categoryId: "category-1",
        name: "Laptop",
        costPrice: new Prisma.Decimal(100),
        sellingPrice: new Prisma.Decimal(120),
        isSerialized: false,
        lowStockThreshold: 5,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: "category-1", name: "Computers", active: true },
      },
    ]);
    count.mockResolvedValue(1);
    groupBy.mockResolvedValue([{ productId: "product-1", _sum: { quantity: 3 } }]);

    const result = await service.findAll({ page: 1, limit: 20 });

    expect(result.data[0]).toEqual(expect.objectContaining({ currentStock: 3, lowStock: true }));
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });
});
