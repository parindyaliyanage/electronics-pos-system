import { Module } from "@nestjs/common";

// FR9 (optional) — reads demand_forecasts/risk_scores written by ml-service/,
// and computes reorder suggestions (FR9.3, a formula) and anomaly flags
// (FR9.4, a stat rule) directly in TypeScript — no Python needed for those two.
@Module({})
export class AnalyticsModule {}
