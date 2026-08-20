import React from 'react';
import { useGetBillingSummary } from '@workspace/api-client-react';
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui';
import { Receipt, Calendar, DollarSign, Clock } from 'lucide-react';

export default function Billing() {
  const { data: billing, isLoading } = useGetBillingSummary();

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(val);
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="Billing & Usage" 
        description="Compute usage hours and estimated costs for the current period."
      />

      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground">Loading usage data...</div>
      ) : !billing ? (
        <Card><CardContent className="p-12 text-center text-destructive">Could not load billing data.</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-primary text-primary-foreground border-primary shadow-lg relative overflow-hidden">
              <div className="absolute -right-4 -top-4 opacity-10">
                <DollarSign className="w-32 h-32" />
              </div>
              <CardContent className="p-6 relative z-10">
                <div className="text-primary-foreground/80 text-sm font-medium uppercase tracking-wider mb-2">Estimated Cost</div>
                <div className="text-5xl font-bold tracking-tight">{formatCurrency(billing.estimatedCostUsd)}</div>
                <div className="text-xs text-primary-foreground/70 mt-4 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(billing.periodStart)} — {formatDate(billing.periodEnd)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 h-full flex flex-col justify-center">
                <div className="text-muted-foreground text-sm font-medium uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Total Compute Hours
                </div>
                <div className="text-3xl font-bold tracking-tight">{billing.totalVmHours.toFixed(1)} <span className="text-sm font-medium text-muted-foreground ml-1">hrs</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 h-full flex flex-col justify-center">
                <div className="text-muted-foreground text-sm font-medium uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Receipt className="w-4 h-4" /> Active Instances
                </div>
                <div className="text-3xl font-bold tracking-tight">{billing.vmBreakdown.length}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Instance Breakdown</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instance</TableHead>
                  <TableHead className="text-right">Usage (Hours)</TableHead>
                  <TableHead className="text-right">Estimated Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {billing.vmBreakdown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">No usage recorded in this period.</TableCell>
                  </TableRow>
                ) : (
                  billing.vmBreakdown.map(line => (
                    <TableRow key={line.vmId}>
                      <TableCell className="font-medium">
                        {line.vmName}
                        <div className="text-xs text-muted-foreground font-mono">ID: {line.vmId}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{line.hoursRunning.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-mono font-medium">{formatCurrency(line.estimatedCostUsd)}</TableCell>
                    </TableRow>
                  ))
                )}
                {billing.vmBreakdown.length > 0 && (
                  <TableRow className="bg-muted/30 font-bold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right font-mono">{billing.totalVmHours.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-mono text-primary">{formatCurrency(billing.estimatedCostUsd)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}