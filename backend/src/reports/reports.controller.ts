import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Response } from "express";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CreateReportDto } from "./dto/create-report.dto";
import { ReportQueryDto } from "./dto/report-query.dto";
import { ReportsService } from "./reports.service";

// FR8 — reports are Administrator-only (FR1).
@Controller("reports")
@Roles(UserRole.ADMINISTRATOR)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** 201 with a COMPLETED (or FAILED) job for small reports; 202 with a QUEUED job for large ones. */
  @Post()
  async create(
    @Body() input: CreateReportDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { queued, job } = await this.reports.create(input, admin.id);
    res.status(queued ? 202 : 201);
    return job;
  }

  @Get()
  findAll(@Query() query: ReportQueryDto) {
    return this.reports.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.reports.findOne(id);
  }

  @Get(":id/download")
  async download(@Param("id", ParseUUIDPipe) id: string) {
    const file = await this.reports.download(id);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.buffer.length,
    });
  }

  @Post(":id/retry")
  @HttpCode(202)
  retry(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.reports.retry(id, admin.id);
  }
}
