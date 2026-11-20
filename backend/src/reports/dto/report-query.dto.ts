import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { ReportJobStatus, ReportJobType } from "@prisma/client";

export class ReportQueryDto {
  @IsOptional()
  @IsEnum(ReportJobType)
  type?: ReportJobType;

  @IsOptional()
  @IsEnum(ReportJobStatus)
  status?: ReportJobStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
