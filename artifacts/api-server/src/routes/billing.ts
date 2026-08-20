import { Router, type IRouter } from "express";
import { db, vmsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { calcRunningSeconds, calcHours, calcCost } from "../lib/billing";

const router: IRouter = Router();

/** GET /api/billing/summary */
router.get("/billing/summary", async (_req, res): Promise<void> => {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const vms = await db.select().from(vmsTable).where(sql`${vmsTable.status} != 'deleted'`);

  let totalVmHours = 0;
  let estimatedCostUsd = 0;

  const vmBreakdown = vms.map((vm) => {
    const seconds = calcRunningSeconds(vm);
    const hours = calcHours(seconds);
    const cost = calcCost(vm.cpuCores, hours);

    totalVmHours += hours;
    estimatedCostUsd += cost;

    return {
      vmId: vm.id,
      vmName: vm.name,
      hoursRunning: Math.round(hours * 100) / 100,
      estimatedCostUsd: Math.round(cost * 100) / 100,
    };
  });

  res.json({
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalVmHours: Math.round(totalVmHours * 100) / 100,
    estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100,
    vmBreakdown,
  });
});

export default router;
