import React from 'react';
import { Link } from 'wouter';
import { useListVms } from '@workspace/api-client-react';
import { PageHeader, Button, Card, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge } from '../../components/ui';
import { Plus, Terminal, Play, Square, Activity, CircleAlert, Server } from 'lucide-react';

export default function VmList() {
  const { data: vms, isLoading } = useListVms();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="Virtual Machines" 
        description="Manage and monitor your compute instances."
        actions={
          <Link href="/vms/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Deploy Instance
            </Button>
          </Link>
        }
      />

      <Card>
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : vms?.length === 0 ? (
          <div className="p-16 text-center">
            <Server className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium">No virtual machines</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">You haven't provisioned any compute instances yet. Deploy your first VM to get started.</p>
            <Link href="/vms/new">
              <Button>Deploy Instance</Button>
            </Link>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Instance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Specs</TableHead>
                <TableHead>Image</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vms?.map((vm) => (
                <TableRow key={vm.id} className="group">
                  <TableCell>
                    <div className="font-medium text-sm text-foreground">{vm.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{vm.hostname}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      vm.status === 'running' ? 'success' : 
                      vm.status === 'stopped' ? 'secondary' : 
                      vm.status === 'error' ? 'destructive' : 'default'
                    } className="gap-1.5 py-0.5">
                      {vm.status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                      {vm.status === 'stopped' && <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />}
                      {vm.status === 'error' && <span className="w-1.5 h-1.5 rounded-full bg-destructive" />}
                      {vm.status === 'provisioning' && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />}
                      {vm.status.charAt(0).toUpperCase() + vm.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {vm.ipAddress ? (
                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded border border-border">{vm.ipAddress}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs whitespace-nowrap">
                      {vm.cpuCores} vCPU • {Math.round(vm.ramMb / 1024)}GB RAM • {vm.diskGb}GB Disk
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                      {vm.osImageName}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/vms/${vm.id}`}>
                      <Button variant="secondary" size="sm">Manage</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}