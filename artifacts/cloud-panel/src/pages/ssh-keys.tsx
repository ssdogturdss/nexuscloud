import React, { useState } from 'react';
import { useListSshKeys, useCreateSshKey, useDeleteSshKey, getListSshKeysQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Button, Input, Label, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui';
import { Key, Trash2, Plus } from 'lucide-react';

export default function SshKeys() {
  const queryClient = useQueryClient();
  const { data: keys, isLoading } = useListSshKeys();
  const createKey = useCreateSshKey();
  const deleteKey = useDeleteSshKey();

  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ name: '', publicKey: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createKey.mutate({ data: formData }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSshKeysQueryKey() });
        setIsAdding(false);
        setFormData({ name: '', publicKey: '' });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm('Delete this SSH key? VMs already provisioned with this key will retain access, but it cannot be used for new VMs.')) {
      deleteKey.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSshKeysQueryKey() })
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="SSH Keys" 
        description="Manage public keys used for accessing your virtual machines."
        actions={
          !isAdding && (
            <Button onClick={() => setIsAdding(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Add Key
            </Button>
          )
        }
      />

      {isAdding && (
        <Card className="border-primary/50 shadow-md">
          <CardHeader className="bg-primary/5 pb-4 border-b border-primary/10">
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" /> Add New Public Key
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Key Name</Label>
                <Input 
                  id="name" 
                  placeholder="e.g. Mac Laptop" 
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="publicKey">Public Key (ssh-rsa, ssh-ed25519, etc)</Label>
                <textarea 
                  id="publicKey" 
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI..." 
                  value={formData.publicKey}
                  onChange={e => setFormData({ ...formData, publicKey: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={!formData.name || !formData.publicKey || createKey.isPending}>
                  {createKey.isPending ? 'Saving...' : 'Save Key'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading SSH keys...</div>
        ) : keys?.length === 0 ? (
          <div className="p-12 text-center">
            <Key className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium">No SSH Keys</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">Add a public key to inject into newly provisioned virtual machines.</p>
            {!isAdding && <Button onClick={() => setIsAdding(true)}>Add Key</Button>}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Name</TableHead>
                <TableHead>Fingerprint</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys?.map(key => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground border border-border">
                      {key.fingerprint}
                    </code>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(key.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(key.id)}
                      disabled={deleteKey.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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