import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { CustomersModule } from "./customers/customers.module";
import { CatalogModule } from "./catalog/catalog.module";
import { InventoryModule } from "./inventory/inventory.module";
import { SalesModule } from "./sales/sales.module";
import { PaymentsModule } from "./payments/payments.module";
import { InstallmentsModule } from "./installments/installments.module";
import { WorkflowsModule } from "./workflows/workflows.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { ReportsModule } from "./reports/reports.module";
import { AuditModule } from "./audit/audit.module";
import { AnalyticsModule } from "./analytics/analytics.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    CatalogModule,
    InventoryModule,
    SalesModule,
    PaymentsModule,
    InstallmentsModule,
    WorkflowsModule,
    InvoicesModule,
    ReportsModule,
    AuditModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
