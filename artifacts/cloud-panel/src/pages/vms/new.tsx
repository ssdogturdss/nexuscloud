import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useCreateVm, useListImages, useListSshKeys, getListVmsQueryKey, getGetVmSummaryQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader, Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Label, Select, Button } from '../../components/ui';
import { Server, HardDrive, Cpu, MemoryStick, Shield } from 'lucide-react';

export default function VmNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data: images } = useListImages();
  const { data: sshKeys } = useListSshKeys();
  const createVm = useCreateVm();

  const [formData, setFormData] = useState({
    name: '',
    hostname: '',
    cpuCores: '2',
    ramMb: '4096',
    diskGb: '40',
    osImageId: '',
    sshKeyId: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createVm.mutate(
      {
        data: {
          name: formData.name,
          hostname: formData.hostname,
          cpuCores: parseInt(formData.cpuCores, 10),
          ramMb: parseInt(formData.ramMb, 10),
          diskGb: parseInt(formData.diskGb, 10),
          osImageId: parseInt(formData.osImageId, 10),
          sshKeyId: formData.sshKeyId ? parseInt(formData.sshKeyId, 10) : null
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListVmsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetVmSummaryQueryKey() });
          setLocation('/vms');
        }
      }
    );
  };

  const isFormValid = formData.name && formData.hostname && formData.osImageId && formData.cpuCores && formData.ramMb && formData.diskGb;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      <PageHeader 
        title="Deploy Instance" 
        description="Provision a new virtual machine on your hypervisor."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="w-4 h-4 text-primary" /> General
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Instance Name</Label>
                  <Input 
                    id="name" 
                    placeholder="e.g. web-server-01" 
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hostname">Hostname</Label>
                  <Input 
                    id="hostname" 
                    placeholder="e.g. web01.internal" 
                    value={formData.hostname}
                    onChange={e => setFormData({ ...formData, hostname: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-primary" /> Operating System
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="osImageId">OS Image</Label>
                  <Select 
                    id="osImageId"
                    value={formData.osImageId}
                    onChange={e => setFormData({ ...formData, osImageId: e.target.value })}
                  >
                    <option value="" disabled>Select an OS image...</option>
                    {images?.map(img => (
                      <option key={img.id} value={img.id} disabled={!img.isAvailable}>
                        {img.name} ({img.arch}){!img.isAvailable ? " — not downloaded" : ""}
                      </option>
                    ))}
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" /> Security
                </CardTitle>
                <CardDescription>Optional: Inject SSH key for root access</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sshKeyId">SSH Key</Label>
                  <Select 
                    id="sshKeyId"
                    value={formData.sshKeyId}
                    onChange={e => setFormData({ ...formData, sshKeyId: e.target.value })}
                  >
                    <option value="">No key — required for cloud images</option>
                    {sshKeys?.map(key => (
                      <option key={key.id} value={key.id}>{key.name}</option>
                    ))}
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary" /> Compute Resources
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="cpuCores">CPU Cores</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{formData.cpuCores} vCPU</span>
                  </div>
                  <input 
                    type="range" 
                    id="cpuCores"
                    min="1" max="16" step="1"
                    className="w-full accent-primary"
                    value={formData.cpuCores}
                    onChange={e => setFormData({ ...formData, cpuCores: e.target.value })}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1</span><span>16</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="ramMb">Memory</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{parseInt(formData.ramMb)/1024} GB</span>
                  </div>
                  <input 
                    type="range" 
                    id="ramMb"
                    min="512" max="32768" step="512"
                    className="w-full accent-primary"
                    value={formData.ramMb}
                    onChange={e => setFormData({ ...formData, ramMb: e.target.value })}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>512MB</span><span>32GB</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="diskGb">Block Storage</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{formData.diskGb} GB</span>
                  </div>
                  <input 
                    type="range" 
                    id="diskGb"
                    min="10" max="500" step="10"
                    className="w-full accent-primary"
                    value={formData.diskGb}
                    onChange={e => setFormData({ ...formData, diskGb: e.target.value })}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>10GB</span><span>500GB</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/30 border-primary/20">
              <CardContent className="p-6">
                <h4 className="font-medium text-sm mb-4 text-foreground uppercase tracking-wider">Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">Instance Type</span>
                    <span className="font-mono font-medium">{formData.cpuCores}C / {parseInt(formData.ramMb)/1024}G</span>
                  </div>
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">Boot Volume</span>
                    <span className="font-mono font-medium">{formData.diskGb} GB NVMe</span>
                  </div>
                  <div className="flex justify-between pb-2">
                    <span className="text-muted-foreground">Image</span>
                    <span className="font-medium truncate max-w-[150px]">{images?.find(i => i.id.toString() === formData.osImageId)?.name || 'Not selected'}</span>
                  </div>
                </div>
                <div className="mt-6">
                  <Button type="submit" className="w-full" disabled={!isFormValid || createVm.isPending}>
                    {createVm.isPending ? 'Provisioning...' : 'Deploy Instance'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}