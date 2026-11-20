import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from "class-validator";
import { PaymentMethod, ReportFormat, ReportJobType } from "@prisma/client";

const toBoolean = ({ value }: { value: unknown }) => (value === "true" ? true : value === "false" ? false : value);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Which filters apply to which report type is checked in ReportsService
 * (SRS FR8 table), so an irrelevant filter is a 400, not silently ignored.
 */
export class CreateReportDto {
  @IsEnum(ReportJobType)
  type!: ReportJobType;

  @IsOptional()
  @IsEnum(ReportFormat)
  format: ReportFormat = ReportFormat.PDF;

  /** Inclusive start date, YYYY-MM-DD (store time zone). */
  @IsOptional()
  @Matches(ISO_DATE, { message: "from must be a date in YYYY-MM-DD format" })
  from?: string;

  /** Inclusive end date, YYYY-MM-DD (store time zone). */
  @IsOptional()
  @Matches(ISO_DATE, { message: "to must be a date in YYYY-MM-DD format" })
  to?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  cashierId?: string;

  @IsOptional()
  @IsIn(["DAY", "MONTH"])
  groupBy?: "DAY" | "MONTH";

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stockThreshold?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  lowStockOnly?: boolean;

  @IsOptional()
  @IsIn(["ACTIVE", "OVERDUE", "COMPLETED"])
  status?: "ACTIVE" | "OVERDUE" | "COMPLETED";

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  /** Force a background job even for a small report (e.g. to see the pending status). */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  runInBackground?: boolean;
}
