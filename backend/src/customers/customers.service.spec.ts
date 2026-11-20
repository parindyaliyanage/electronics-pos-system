import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CustomersService } from "./customers.service";

describe("CustomersService", () => {
  const customerFindMany = jest.fn();
  const customerFindUnique = jest.fn();
  const customerCount = jest.fn();
  const saleFindMany = jest.fn();
  const saleCount = jest.fn();
  const tx = {
    customer: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const transaction = jest.fn((operation: unknown) => {
    if (Array.isArray(operation)) return Promise.all(operation);
    return (operation as (client: typeof tx) => unknown)(tx);
  });
  const prisma = {
    customer: {
      findMany: customerFindMany,
      findUnique: customerFindUnique,
      count: customerCount,
    },
    sale: { findMany: saleFindMany, count: saleCount },
    $transaction: transaction,
  } as unknown as PrismaService;
  const service = new CustomersService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.auditLog.create.mockResolvedValue({});
  });

  it("creates a customer but warns rather than blocking a duplicate phone", async () => {
    customerFindMany.mockResolvedValue([{
      id: "existing-customer",
      fullName: "Existing Customer",
      phone: "0771234567",
    }]);
    tx.customer.create.mockResolvedValue({
      id: "new-customer",
      fullName: "New Customer",
      phone: "0771234567",
      email: undefined,
      address: undefined,
      createdAt: new Date(),
    });

    const result = await service.create({
      fullName: " New Customer ",
      phone: "077 123-4567",
    }, "actor-1");

    expect(tx.customer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phone: "0771234567" }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "CUSTOMER", entityId: "new-customer" }),
    });
    expect(result.customer.id).toBe("new-customer");
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "DUPLICATE_PHONE" }),
    ]);
  });

  it("searches customers by name or normalized phone", async () => {
    customerFindMany.mockResolvedValue([]);
    customerCount.mockResolvedValue(0);

    await service.findAll({ search: "077 123-4567", page: 1, limit: 20 });

    expect(customerFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { fullName: { contains: "077 123-4567", mode: "insensitive" } },
          { phone: { contains: "0771234567" } },
        ],
      },
    }));
  });

  it("returns sales and installment history with derived balances", async () => {
    customerFindUnique.mockResolvedValue({
      id: "customer-1",
      fullName: "Test Customer",
      phone: "0771234567",
      email: null,
      address: null,
      createdAt: new Date(),
    });
    saleFindMany.mockResolvedValue([{
      id: "sale-1",
      saleItems: [{
        quantity: 2,
        unitPrice: new Prisma.Decimal(100),
        discount: new Prisma.Decimal(10),
      }],
      payments: [{ amount: new Prisma.Decimal(100) }],
      installmentPlan: null,
    }]);
    saleCount.mockResolvedValue(1);

    const result = await service.history("customer-1", { page: 1, limit: 20 });

    expect(result.sales[0].totals.grandTotal.equals(180)).toBe(true);
    expect(result.sales[0].totals.totalPayable.equals(180)).toBe(true);
    expect(result.sales[0].totals.interest.equals(0)).toBe(true);
    expect(result.sales[0].totals.amountPaid.equals(100)).toBe(true);
    expect(result.sales[0].totals.outstanding.equals(80)).toBe(true);
  });

  it("includes installment interest in the outstanding balance", async () => {
    customerFindUnique.mockResolvedValue({ id: "customer-1" });
    // Grand total 120,000; deposit 20,000; 100,000 financed at 10% = 110,000
    // repaid in installments, so the customer owes 130,000 in total.
    saleFindMany.mockResolvedValue([{
      id: "sale-1",
      saleItems: [{
        quantity: 1,
        unitPrice: new Prisma.Decimal(120000),
        discount: new Prisma.Decimal(0),
      }],
      payments: [
        { amount: new Prisma.Decimal(20000) },
        { amount: new Prisma.Decimal(100000) },
      ],
      installmentPlan: {
        deposit: new Prisma.Decimal(20000),
        schedules: [
          { amount: new Prisma.Decimal(55000) },
          { amount: new Prisma.Decimal(55000) },
        ],
      },
    }]);
    saleCount.mockResolvedValue(1);

    const result = await service.history("customer-1", { page: 1, limit: 20 });

    expect(result.sales[0].totals.totalPayable.equals(130000)).toBe(true);
    expect(result.sales[0].totals.interest.equals(10000)).toBe(true);
    expect(result.sales[0].totals.outstanding.equals(10000)).toBe(true);
  });
});
