import React, { useRef } from 'react';
import { useRoute, useLocation, Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useGetVm, 
  useVmPowerAction, 
  useSyncVm, 
  useDeleteVm, 
  getGetVmQueryKey, 
  getListVmsQueryKey, 
  getGetVmSummaryQueryKey,
  PowerActionAction
} from '@workspace/api-client-react';
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Button, Badge } from '../../components/ui';
import { Play, Square, RotateCw, RefreshCw, Trash2, Terminal, Copy, Cpu, HardDrive, ShieldCheck, Clock } from 'lucide-react';

export default function VmDetail() {
  const [, params] = useRoute('/vms/:id');
  const id = parseInt(params?.id || '0', 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: vm, isLoading } = useGetVm(id, { query: { enabled: !!id, queryKey: getGetVmQueryKey(id) } });
  const powerAction = useVmPowerAction();
  const syncVm = useSyncVm();
  const deleteVm = useDeleteVm();

  const handlePowerAction = (action: PowerActionAction) => {
    powerAction.mutate({ id, data: { action } }, {
      onSuccess: (updatedVm) => {
        queryClient.setQueryData(getGetVmQueryKey(id), updatedVm);
        queryClient.invalidateQueries({ queryKey: getListVmsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetVmSummaryQueryKey() });
      }
    });
  };

  const handleSync = () => {
    syncVm.mutate({ id }, {
      onSuccess: (updatedVm) => {
        queryClient.setQueryData(getGetVmQueryKey(id), updatedVm);
      }
    });
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this VM? This action is destructive and irreversible.')) {
      deleteVm.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListVmsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetVmSummaryQueryKey() });
          setLocation('/vms');
        }
      });
    }
  };

  if (isLoading) return <div className="p-12 text-center animate-pulse">Loading instance details...</div>;
  if (!vm) return <div className="p-12 text-center text-destructive">Instance not found.</div>;

  // Cloud images use a distro-specific default user, not root.
  // Infer from the OS image name when the server doesn't supply it explicitly.
  const sshUser = (() => {
    const n = (vm.osImageName ?? '').toLowerCase();
    if (n.includes('ubuntu'))    return 'ubuntu';
    if (n.includes('debian'))    return 'debian';
    if (n.includes('almalinux')) return 'almalinux';
    if (n.includes('centos'))    return 'centos';
    if (n.includes('fedora'))    return 'fedora';
    return 'ubuntu'; // sensible default for most cloud images
  })();
  const sshCommand = `ssh ${sshUser}@${vm.ipAddress || '<pending>'}`;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="mb-4 text-sm text-muted-foreground flex items-center gap-2">
        <Link href="/vms" className="hover:text-foreground transition-colors">Virtual Machines</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{vm.name}</span>
      </div>

      <PageHeader 
        title={vm.name}
        description={`id: ${vm.id} • ${vm.region}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncVm.isPending} className="gap-2">
              <RefreshCw className={`w-3.5 h-3.5 ${syncVm.isPending ? 'animate-spin' : ''}`} />
              Sync State
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteVm.isPending} className="gap-2">
              <Trash2 className="w-3.5 h-3.5" />
              Destroy
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" /> Connection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-sidebar text-sidebar-foreground border border-sidebar-border shadow-inner">
                <div>
                  <div className="text-xs text-sidebar-foreground/50 font-mono uppercase tracking-wider mb-1">Public IPv4</div>
                  <div className="font-mono text-lg">{vm.ipAddress || 'Pending allocation...'}</div>
                </div>
                <div className="bg-black/50 p-2 rounded border border-white/10 flex items-center justify-between gap-4 w-full sm:w-auto">
                  <code className="text-xs text-emerald-400">{sshCommand}</code>
                  <button 
                    onClick={() => navigator.clipboard.writeText(sshCommand)}
                    className="text-sidebar-foreground/50 hover:text-white transition-colors p-1"
                    title="Copy to clipboard"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="border border-border rounded p-3">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Hostname</div>
                  <div className="font-mono text-sm">{vm.hostname}</div>
                </div>
                <div className="border border-border rounded p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">State</div>
                    <Badge variant={
                        vm.status === 'running' ? 'success' : 
                        vm.status === 'stopped' ? 'secondary' : 
                        vm.status === 'error' ? 'destructive' : 'default'
                      } className="uppercase text-[10px] tracking-widest">
                        {vm.status}
                    </Badge>
                  </div>
                  {vm.status === 'running' && (
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end"><Clock className="w-3 h-3" /> Uptime</div>
                      <div className="text-sm font-mono">{vm.uptimeSeconds ? Math.floor(vm.uptimeSeconds / 3600) + 'h ' + Math.floor((vm.uptimeSeconds % 3600) / 60) + 'm' : 'Just started'}</div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" /> Specifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Compute</div>
                  <div className="text-2xl font-bold tracking-tight">{vm.cpuCores}<span className="text-sm font-medium text-muted-foreground ml-1">vCPU</span></div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Memory</div>
                  <div className="text-2xl font-bold tracking-tight">{Math.round(vm.ramMb / 1024)}<span className="text-sm font-medium text-muted-foreground ml-1">GB</span></div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Storage</div>
                  <div className="text-2xl font-bold tracking-tight">{vm.diskGb}<span className="text-sm font-medium text-muted-foreground ml-1">GB</span></div>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-border flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Image:</span>
                  <span className="font-medium">{vm.osImageName}</span>
                </div>
                {vm.sshKeyId && (
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span className="text-muted-foreground">SSH Key Injected</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Power Operations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                className="w-full justify-start gap-3" 
                variant={vm.status === 'running' ? 'outline' : 'default'}
                disabled={vm.status === 'running' || powerAction.isPending}
                onClick={() => handlePowerAction('start')}
              >
                <Play className="w-4 h-4" /> Start Instance
              </Button>
              <Button 
                className="w-full justify-start gap-3" 
                variant={vm.status === 'stopped' ? 'outline' : 'secondary'}
                disabled={vm.status === 'stopped' || powerAction.isPending}
                onClick={() => handlePowerAction('reboot')}
              >
                <RotateCw className="w-4 h-4" /> Reboot (Graceful)
              </Button>
              <Button 
                className="w-full justify-start gap-3 text-destructive hover:bg-destructive hover:text-destructive-foreground" 
                variant="outline"
                disabled={vm.status === 'stopped' || powerAction.isPending}
                onClick={() => handlePowerAction('stop')}
              >
                <Square className="w-4 h-4" /> Force Stop
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
              <div className="flex justify-between">
                <span>Created At</span>
                <span className="font-mono">{new Date(vm.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Last Updated</span>
                <span className="font-mono">{new Date(vm.updatedAt).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}