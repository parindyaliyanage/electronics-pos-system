import type { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { DashboardService } from "./dashboard.service";

const dec = (v: string) => new Prisma.Decimal(v);

describe("DashboardService", () => {
  const queryRaw = jest.fn();
  const config = { get: jest.fn(() => undefined) } as unknown as ConfigService;
  const service = new DashboardService({ $queryRaw: queryRaw } as unknown as PrismaService, config);

  beforeEach(() => queryRaw.mockReset());

  it("combines the cards and lists into one summary", async () => {
    queryRaw
      .mockResolvedValueOnce([{ count: 2, units: 3, revenue: dec("125000") }]) // today's sales
      .mockResolvedValueOnce([{ method: "CASH", total: dec("100000") }, { method: "CARD", total: dec("5000") }])
      .mockResolvedValueOnce([{ active_plans: 4, outstanding: dec("90000"), overdue_count: 1, overdue_amount: dec("7500"), overdue_customers: 1 }])
      .mockResolvedValueOnce([{
        id: "s1", plan_id: "p1", due_date: "2026-11-10", amount: dec("10000"), paid: dec("2500"),
        customer_id: "c1", customer: "Nimal Perera", phone: "0771234567", days: 10,
      }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ id: "pr1", name: "USB-C cable", category: "Accessories", threshold: 5, stock: 2 }]);

    // 20:00 UTC on 20 Nov is already 21 Nov in Colombo.
    const result = await service.summary(new Date("2026-11-20T20:00:00Z"));

    expect(result.date).toBe("2026-11-21");
    expect(result.todaySales).toEqual({ count: 2, units: 3, netRevenue: dec("125000"), averageSale: dec("62500") });
    expect(result.receivedToday.total.toString()).toBe("105000");
    expect(result.receivedToday.byMethod.BANK_TRANSFER.toString()).toBe("0");
    expect(result.installments).toMatchObject({ activePlans: 4, overdueInstallments: 1, overdueCustomers: 1 });
    expect(result.overdue.items[0]).toMatchObject({ daysOverdue: 10, dueDate: "2026-11-10" });
    expect(result.overdue.items[0].outstanding.toString()).toBe("7500");
    expect(result.lowStock).toEqual({
      count: 1,
      items: [{ productId: "pr1", name: "USB-C cable", category: "Accessories", stock: 2, threshold: 5, shortBy: 3 }],
    });
  });

  it("returns zeros, not nulls, on an empty day", async () => {
    queryRaw
      .mockResolvedValueOnce([{ count: 0, units: 0, revenue: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ active_plans: 0, outstanding: null, overdue_count: 0, overdue_amount: null, overdue_customers: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([]);

    const result = await service.summary();
    expect(result.todaySales.netRevenue.toString()).toBe("0");
    expect(result.todaySales.averageSale.toString()).toBe("0");
    expect(result.installments.outstandingBalance.toString()).toBe("0");
    expect(result.overdue).toEqual({ count: 0, items: [] });
  });
});
