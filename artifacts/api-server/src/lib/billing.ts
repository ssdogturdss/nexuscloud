import { db, vmsTable } from "@workspace/db";

const HOURLY_COST_PER_CPU = 0.005; // $0.005 / vCPU / hour

/**
 * Calculate running seconds for a VM.
 * If the VM is currently running, add elapsed seconds since startedAt.
 */
export function calcRunningSeconds(vm: {
  status: string;
  accumulatedSeconds: number;
  startedAt: Date | null;
}): number {
  let total = vm.accumulatedSeconds;
  if (vm.status === "running" && vm.startedAt) {
    const elapsedMs = Date.now() - new Date(vm.startedAt).getTime();
    total += Math.floor(elapsedMs / 1000);
  }
  return total;
}

export function calcHours(seconds: number): number {
  return seconds / 3600;
}

export function calcCost(cpuCores: number, hours: number): number {
  return cpuCores * HOURLY_COST_PER_CPU * hours;
}
