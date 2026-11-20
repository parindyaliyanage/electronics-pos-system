import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InvoiceType, PaymentType, Prisma, UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { nextDocumentNumber } from "./document-number";
import { DocumentStorageService } from "./document-storage.service";
import type { InvoiceQueryDto } from "./dto/invoice-query.dto";
import { renderInvoicePdf, renderReceiptPdf } from "./invoice-pdf";
import { buildInvoiceView, buildReceiptView, type StoreDetails } from "./invoice-view";

type Tx = Prisma.TransactionClient;

const invoiceSelect = {
  id: true,
  invoiceNumber: true,
  type: true,
  saleId: true,
  paymentId: true,
  issuedById: true,
  createdAt: true,
  documentUrl: true,
} as const;

const listSelect = {
  ...invoiceSelect,
  issuedBy: { select: { id: true, email: true, fullName: true } },
  sale: { select: { id: true, createdAt: true, customer: { select: { id: true, fullName: true, phone: true } } } },
  payment: { select: { id: true, amount: true, method: true, type: true } },
} as const;

export interface PdfFile {
  filename: string;
  buffer: Buffer;
}

/**
 * FR7 — invoices (one per sale) and receipts (one per installment payment).
 *
 * The number is assigned inside the sale/payment transaction, so a committed
 * sale always has its invoice number. The PDF is rendered right after commit
 * (in the background), stored once in object storage, and every later
 * download serves that stored file. If storage was unavailable at commit
 * time, the first download renders and stores it.
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly store: StoreDetails;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    config: ConfigService,
  ) {
    this.store = {
      name: config.get("STORE_NAME") ?? "SmartRetail Electronics",
      address: config.get("STORE_ADDRESS") || undefined,
      phone: config.get("STORE_PHONE") || undefined,
      timeZone: config.get("STORE_TIMEZONE") ?? "Asia/Colombo",
    };
  }

  // ---- called from inside the FR3 / FR5 transactions -----------------------

  async createSaleInvoice(tx: Tx, saleId: string, issuedById: string) {
    const invoiceNumber = await nextDocumentNumber(tx, InvoiceType.INVOICE);
    return tx.invoice.create({
      data: { saleId, issuedById, invoiceNumber, type: InvoiceType.INVOICE },
      select: invoiceSelect,
    });
  }

  async createPaymentReceipt(tx: Tx, saleId: string, paymentId: string, issuedById: string) {
    const invoiceNumber = await nextDocumentNumber(tx, InvoiceType.RECEIPT);
    return tx.invoice.create({
      data: { saleId, paymentId, issuedById, invoiceNumber, type: InvoiceType.RECEIPT },
      select: invoiceSelect,
    });
  }

  /** Fire-and-forget after commit; a failure is retried on first download. */
  generateInBackground(invoiceId: string) {
    void this.ensureDocument(invoiceId).catch((error: unknown) => {
      this.logger.warn(`PDF for invoice ${invoiceId} not stored yet; it will be generated on first download: ${String(error)}`);
    });
  }

  // ---- API ------------------------------------------------------------------

  async findAll(query: InvoiceQueryDto, user: AuthenticatedUser) {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.saleId ? { saleId: query.saleId } : {}),
      ...(query.customerId ? { sale: { customerId: query.customerId } } : {}),
      ...(query.number ? { invoiceNumber: { contains: query.number.trim(), mode: "insensitive" as const } } : {}),
      // Workers see only their own invoice/receipt history (FR1).
      ...(user.role === UserRole.WORKER ? { issuedById: user.id } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({ where, select: listSelect, orderBy: { createdAt: "desc" }, skip, take: query.limit }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data: rows.map((row) => this.present(row)), meta: { page: query.page, limit: query.limit, total } };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, select: listSelect });
    if (!invoice) throw new NotFoundException("Invoice not found");
    await this.assertCanAccess(user, invoice.issuedById, id);
    return this.present(invoice);
  }

  async download(id: string, user: AuthenticatedUser): Promise<PdfFile> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, select: invoiceSelect });
    if (!invoice) throw new NotFoundException("Invoice not found");
    await this.assertCanAccess(user, invoice.issuedById, id);
    return { filename: `${invoice.invoiceNumber}.pdf`, buffer: await this.ensureDocument(id) };
  }

  /** GET /sales/:id/invoice */
  async downloadForSale(saleId: string, user: AuthenticatedUser): Promise<PdfFile> {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId }, select: { id: true, cashierId: true } });
    if (!sale) throw new NotFoundException("Sale not found");
    await this.assertCanAccess(user, sale.cashierId, saleId);
    const invoice = await this.findOrCreate(
      (tx) => tx.invoice.findFirst({ where: { saleId, type: InvoiceType.INVOICE }, select: invoiceSelect }),
      (tx) => this.createSaleInvoice(tx, saleId, sale.cashierId), // sale made before FR7 existed
    );
    return { filename: `${invoice.invoiceNumber}.pdf`, buffer: await this.ensureDocument(invoice.id) };
  }

  /** GET /payments/:id/receipt */
  async downloadForPayment(paymentId: string, user: AuthenticatedUser): Promise<PdfFile> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, type: true, saleId: true, sale: { select: { cashierId: true } }, receipt: { select: invoiceSelect } },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.type !== PaymentType.INSTALLMENT) {
      throw new BadRequestException("Only installment payments have receipts; deposit and full payments are on the sale invoice");
    }
    await this.assertCanAccess(user, payment.receipt?.issuedById ?? payment.sale.cashierId, paymentId);
    const receipt = payment.receipt ?? await this.findOrCreate(
      (tx) => tx.invoice.findUnique({ where: { paymentId }, select: invoiceSelect }),
      // Payment recorded before FR7 existed: attribute it to the sale's cashier.
      (tx) => this.createPaymentReceipt(tx, payment.saleId, paymentId, payment.sale.cashierId),
    );
    return { filename: `${receipt.invoiceNumber}.pdf`, buffer: await this.ensureDocument(receipt.id) };
  }

  // ---- document generation -------------------------------------------------

  /** Returns the stored PDF, rendering and storing it first if it does not exist yet. */
  async ensureDocument(invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: invoiceSelect });
    if (invoice.documentUrl) {
      try {
        return await this.storage.get(invoice.documentUrl);
      } catch (error) {
        // Only re-render when the stored object is genuinely missing.
        if ((error as { name?: string }).name !== "NoSuchKey") throw error;
        this.logger.warn(`Stored PDF ${invoice.documentUrl} is missing; rendering it again`);
      }
    }
    const buffer = invoice.type === InvoiceType.INVOICE
      ? await this.renderInvoice(invoice)
      : await this.renderReceipt(invoice);
    const key = `${invoice.type === InvoiceType.INVOICE ? "invoices" : "receipts"}/${invoice.invoiceNumber}.pdf`;
    await this.storage.put(key, buffer);
    await this.prisma.invoice.update({ where: { id: invoice.id }, data: { documentUrl: key } });
    return buffer;
  }

  private async renderInvoice(invoice: { invoiceNumber: string; saleId: string }) {
    const sale = await this.prisma.sale.findUniqueOrThrow({
      where: { id: invoice.saleId },
      include: {
        customer: true,
        cashier: { select: { email: true, fullName: true } },
        saleItems: {
          include: {
            product: { select: { name: true, warrantyMonths: true } },
            serializedUnit: { select: { serialNumber: true, warrantyStartDate: true } },
          },
        },
        payments: { orderBy: { createdAt: "asc" } },
        installmentPlan: { include: { schedules: { orderBy: { dueDate: "asc" } } } },
      },
    });
    return renderInvoicePdf(buildInvoiceView(invoice.invoiceNumber, sale, this.store), this.store);
  }

  private async renderReceipt(invoice: { invoiceNumber: string; saleId: string; paymentId: string | null; issuedById: string }) {
    if (!invoice.paymentId) throw new Error(`Receipt ${invoice.invoiceNumber} has no payment`);
    const [payment, sale, receivedBy, saleInvoice] = await Promise.all([
      this.prisma.payment.findUniqueOrThrow({ where: { id: invoice.paymentId }, include: { allocations: true } }),
      this.prisma.sale.findUniqueOrThrow({
        where: { id: invoice.saleId },
        include: {
          customer: true,
          installmentPlan: {
            include: {
              schedules: {
                orderBy: { dueDate: "asc" },
                include: { allocations: { include: { payment: { select: { id: true, createdAt: true } } } } },
              },
            },
          },
        },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: invoice.issuedById }, select: { email: true, fullName: true } }),
      this.prisma.invoice.findFirst({ where: { saleId: invoice.saleId, type: InvoiceType.INVOICE }, select: { invoiceNumber: true } }),
    ]);
    if (!sale.installmentPlan) throw new Error(`Sale ${sale.id} has no installment plan`);
    const view = buildReceiptView({
      number: invoice.invoiceNumber,
      invoiceNumber: saleInvoice?.invoiceNumber ?? null,
      saleId: sale.id,
      customer: sale.customer,
      receivedBy,
      payment,
      plan: sale.installmentPlan,
      store: this.store,
    });
    return renderReceiptPdf(view, this.store);
  }

  // ---- helpers --------------------------------------------------------------

  /** Administrators see everything; a Worker only documents they issued. */
  private async assertCanAccess(user: AuthenticatedUser, ownerId: string, entityId: string) {
    if (user.role === UserRole.ADMINISTRATOR || user.id === ownerId) return;
    await this.prisma.auditLog.create({
      data: { actorId: user.id, action: "AUTHORIZATION_DENIED", entity: "INVOICE", entityId },
    });
    throw new ForbiddenException("Workers can only access their own invoices and receipts");
  }

  /** Find-or-create under SERIALIZABLE so two concurrent first downloads cannot create two documents. */
  private async findOrCreate<T>(find: (tx: Tx) => Promise<T | null>, create: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => (await find(tx)) ?? create(tx),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError
          && (error.code === "P2034" || error.code === "P2002");
        if (!retryable || attempt === 3) throw error;
      }
    }
  }

  private present<T extends { documentUrl: string | null; id: string }>(invoice: T) {
    const { documentUrl, ...rest } = invoice;
    return { ...rest, documentStored: Boolean(documentUrl), downloadPath: `/invoices/${invoice.id}/download` };
  }
}
