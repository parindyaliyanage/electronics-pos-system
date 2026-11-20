import { Controller, Get, Param, ParseUUIDPipe, Query, StreamableFile } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { InvoiceQueryDto } from "./dto/invoice-query.dto";
import { InvoicesService, type PdfFile } from "./invoices.service";

const asPdf = ({ filename, buffer }: PdfFile) => new StreamableFile(buffer, {
  type: "application/pdf",
  disposition: `inline; filename="${filename}"`,
  length: buffer.length,
});

// FR7 — invoice/receipt history and downloads.
// Administrators: everything. Workers: documents they issued.
@Controller("invoices")
@Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  findAll(@Query() query: InvoiceQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.findAll(query, user);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.findOne(id, user);
  }

  @Get(":id/download")
  async download(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return asPdf(await this.invoices.download(id, user));
  }
}

// FR7 — convenience downloads addressed by the sale or payment.
@Controller()
@Roles(UserRole.ADMINISTRATOR, UserRole.WORKER)
export class SaleDocumentsController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get("sales/:id/invoice")
  async saleInvoice(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return asPdf(await this.invoices.downloadForSale(id, user));
  }

  @Get("payments/:id/receipt")
  async paymentReceipt(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return asPdf(await this.invoices.downloadForPayment(id, user));
  }
}
