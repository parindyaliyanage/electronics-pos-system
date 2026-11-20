import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { InvoiceType, PaymentType, UserRole } from "@prisma/client";
import type { ConfigService } from "@nestjs/config";
import type { AuthenticatedUser } from "../auth/auth.types";
import type { PrismaService } from "../prisma/prisma.service";
import type { DocumentStorageService } from "./document-storage.service";
import { InvoicesService } from "./invoices.service";

const user = (role: UserRole, id: string): AuthenticatedUser => ({
  id, role, email: `${id}@shop.lk`, fullName: null, active: true, createdAt: new Date(),
});
const admin = user(UserRole.ADMINISTRATOR, "admin");
const cashier = user(UserRole.WORKER, "cashier");
const otherWorker = user(UserRole.WORKER, "other");

describe("InvoicesService", () => {
  const stored = {
    id: "inv-1", invoiceNumber: "INV-000001", type: InvoiceType.INVOICE, saleId: "sale-1",
    paymentId: null, issuedById: "cashier", createdAt: new Date(), documentUrl: "invoices/INV-000001.pdf",
  };
  const prisma = {
    invoice: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    payment: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
  } as unknown as PrismaService & {
    invoice: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock };
    payment: { findUnique: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  const storage = { get: jest.fn(), put: jest.fn() } as unknown as DocumentStorageService & { get: jest.Mock; put: jest.Mock };
  const config = { get: jest.fn(() => undefined) } as unknown as ConfigService;
  const service = new InvoicesService(prisma, storage, config);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.invoice.findUnique.mockResolvedValue(stored);
    prisma.invoice.findUniqueOrThrow.mockResolvedValue(stored);
    storage.get.mockResolvedValue(Buffer.from("%PDF-stored"));
  });

  it("serves the stored PDF without regenerating it", async () => {
    const file = await service.download("inv-1", admin);
    expect(file.filename).toBe("INV-000001.pdf");
    expect(file.buffer.toString()).toBe("%PDF-stored");
    expect(storage.get).toHaveBeenCalledWith("invoices/INV-000001.pdf");
    expect(storage.put).not.toHaveBeenCalled();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it("lets the cashier who issued it download it", async () => {
    await expect(service.download("inv-1", cashier)).resolves.toMatchObject({ filename: "INV-000001.pdf" });
  });

  it("blocks another worker and records the denial in the audit log", async () => {
    await expect(service.download("inv-1", otherWorker)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { actorId: "other", action: "AUTHORIZATION_DENIED", entity: "INVOICE", entityId: "inv-1" },
    });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("rejects a receipt request for a deposit/full payment", async () => {
    prisma.payment.findUnique.mockResolvedValue({
      id: "pay-1", type: PaymentType.DEPOSIT, saleId: "sale-1", sale: { cashierId: "cashier" }, receipt: null,
    });
    await expect(service.downloadForPayment("pay-1", admin)).rejects.toBeInstanceOf(BadRequestException);
  });
});
