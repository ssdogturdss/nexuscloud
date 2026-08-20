import React from 'react';
import { useGetVmSummary, useListVms, useGetAgentStatus } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, PageHeader, Badge } from '../components/ui';
import { Cpu, MemoryStick, HardDrive, Server, Activity, ArrowRight, Play, Square, CircleAlert } from 'lucide-react';
import { Link } from 'wouter';

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetVmSummary();
  const { data: vms, isLoading: isLoadingVms } = useListVms();
  const { data: agent } = useGetAgentStatus();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader 
        title="Dashboard" 
        description="Overview of your compute infrastructure and resources."
      />

      {/* Resource Topline */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Virtual Machines" 
          value={isLoadingSummary ? "-" : summary?.totalVms?.toString() || "0"} 
          icon={<Server className="w-4 h-4 text-muted-foreground" />} 
          trend={`${summary?.runningVms || 0} running`}
        />
        <StatCard 
          title="Allocated vCPUs" 
          value={isLoadingSummary ? "-" : summary?.totalCpuCores?.toString() || "0"} 
          icon={<Cpu className="w-4 h-4 text-muted-foreground" />} 
          trend="Total across all VMs"
        />
        <StatCard 
          title="Provisioned RAM" 
          value={isLoadingSummary ? "-" : `${((summary?.totalRamMb || 0) / 1024).toFixed(1)} GB`} 
          icon={<MemoryStick className="w-4 h-4 text-muted-foreground" />} 
          trend="Total active memory"
        />
        <StatCard 
          title="Storage Utilized" 
          value={isLoadingSummary ? "-" : `${summary?.totalDiskGb || 0} GB`} 
          icon={<HardDrive className="w-4 h-4 text-muted-foreground" />} 
          trend="Total block storage"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Recent Compute Instances</h2>
            <Link href="/vms" className="text-sm text-primary font-medium hover:underline flex items-center">
              View all <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
          
          <Card>
            {isLoadingVms ? (
              <div className="p-8 text-center text-muted-foreground">Loading instances...</div>
            ) : vms?.length === 0 ? (
              <div className="p-12 text-center">
                <Server className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium">No instances found</h3>
                <p className="text-muted-foreground mb-4">Provision your first virtual machine to get started.</p>
                <Link href="/vms/new" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm">
                  Deploy Instance
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {vms?.slice(0, 5).map(vm => (
                  <Link key={vm.id} href={`/vms/${vm.id}`} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors block">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${
                        vm.status === 'running' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : 
                        vm.status === 'stopped' ? 'bg-muted text-muted-foreground' : 
                        vm.status === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                      }`}>
                        {vm.status === 'running' ? <Play className="w-4 h-4" /> : 
                         vm.status === 'stopped' ? <Square className="w-4 h-4" /> : 
                         vm.status === 'error' ? <CircleAlert className="w-4 h-4" /> : 
                         <Activity className="w-4 h-4 animate-pulse" />}
                      </div>
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {vm.name}
                          <Badge variant={
                            vm.status === 'running' ? 'success' : 
                            vm.status === 'stopped' ? 'secondary' : 
                            vm.status === 'error' ? 'destructive' : 'default'
                          } className="text-[10px] py-0 h-4">
                            {vm.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {vm.ipAddress || 'No IP assigned'} • {vm.cpuCores}C / {Math.round(vm.ramMb/1024)}GB / {vm.diskGb}GB
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold tracking-tight">System Health</h2>
          
          <Card>
            <CardHeader className="pb-3 border-b-0">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Hypervisor Agent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                {agent?.connected ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                      <Activity className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-lg text-emerald-700 dark:text-emerald-500">Connected</div>
                      <div className="text-xs text-muted-foreground font-mono mt-1">{agent.version || 'v1.0.0'} • {agent.hostInfo || 'Local KVM Node'}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center border border-destructive/20">
                      <CircleAlert className="w-6 h-6 text-destructive" />
                    </div>
                    <div>
                      <div className="font-semibold text-lg text-destructive">Disconnected</div>
                      <div className="text-xs text-muted-foreground mt-1">Unable to reach local agent.</div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 border-b-0">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Instance Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>Running</span>
                  <span className="font-mono">{summary?.runningVms || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-muted-foreground mr-2"></span>Stopped</span>
                  <span className="font-mono">{summary?.stoppedVms || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-primary mr-2"></span>Provisioning</span>
                  <span className="font-mono">{(summary?.totalVms || 0) - (summary?.runningVms || 0) - (summary?.stoppedVms || 0)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, trend }: { title: string, value: string, icon: React.ReactNode, trend?: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {icon}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <h3 className="text-3xl font-bold tracking-tight">{value}</h3>
        </div>
        {trend && <p className="text-xs text-muted-foreground mt-2">{trend}</p>}
      </CardContent>
    </Card>
  );
}