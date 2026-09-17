import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateCustomerDto } from "./dto/create-customer.dto";
import type { CustomerQueryDto } from "./dto/customer-query.dto";

const customerSelect = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
  address: true,
  createdAt: true,
} as const;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCustomerDto, actorId: string) {
    const phone = this.normalizePhone(input.phone);
    const duplicates = await this.prisma.customer.findMany({
      where: { phone },
      select: { id: true, fullName: true, phone: true },
      orderBy: { createdAt: "asc" },
    });

    const customer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          fullName: input.fullName.trim(),
          phone,
          email: input.email?.trim().toLowerCase(),
          address: input.address?.trim(),
        },
        select: customerSelect,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "CREATE",
          entity: "CUSTOMER",
          entityId: created.id,
        },
      });
      return created;
    });

    return {
      customer,
      warnings: duplicates.length ? [{
        code: "DUPLICATE_PHONE",
        message: "Another customer already uses this phone number",
        matches: duplicates,
      }] : [],
    };
  }

  async findAll(query: CustomerQueryDto) {
    const search = query.search?.trim();
    const phoneSearch = search ? this.normalizePhone(search) : undefined;
    const where: Prisma.CustomerWhereInput = search ? {
      OR: [
        { fullName: { contains: search, mode: "insensitive" } },
        { phone: { contains: phoneSearch } },
      ],
    } : {};
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        select: { ...customerSelect, _count: { select: { sales: true } } },
        orderBy: { fullName: "asc" },
        skip,
        take: query.limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { data, meta: { page: query.page, limit: query.limit, total } };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: { ...customerSelect, _count: { select: { sales: true } } },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  async history(id: string, query: CustomerQueryDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: customerSelect,
    });
    if (!customer) throw new NotFoundException("Customer not found");

    const skip = (query.page - 1) * query.limit;
    const where = { customerId: id };
    const [sales, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        include: {
          cashier: { select: { id: true, email: true, role: true } },
          saleItems: {
            include: {
              product: { select: { id: true, name: true } },
              serializedUnit: { select: { id: true, serialNumber: true, status: true } },
            },
          },
          payments: true,
          installmentPlan: { include: { schedules: { orderBy: { dueDate: "asc" } } } },
          invoices: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return {
      customer,
      sales: sales.map((sale) => {
        const grandTotal = sale.saleItems.reduce(
          (totalValue, item) => totalValue.plus(
            item.unitPrice.minus(item.discount).mul(item.quantity),
          ),
          new Prisma.Decimal(0),
        );
        const amountPaid = sale.payments.reduce(
          (totalValue, payment) => totalValue.plus(payment.amount),
          new Prisma.Decimal(0),
        );
        return {
          ...sale,
          totals: {
            grandTotal,
            amountPaid,
            outstanding: Prisma.Decimal.max(grandTotal.minus(amountPaid), 0),
          },
        };
      }),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  private normalizePhone(phone: string) {
    return phone.replace(/[\s()-]/g, "");
  }
}
