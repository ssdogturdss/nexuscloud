import React, { useState } from 'react';
import { useListImages } from '@workspace/api-client-react';
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Badge, Button } from '../components/ui';
import { HardDrive, Server, CheckCircle, XCircle } from 'lucide-react';

export default function Images() {
  const { data: images, isLoading, refetch } = useListImages();
  const [toggling, setToggling] = useState<number | null>(null);

  async function toggleAvailability(id: number, current: boolean) {
    setToggling(id);
    try {
      const res = await fetch(`/api/images/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: !current }),
      });
      if (res.ok) refetch();
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="OS Images"
        description="Operating system images available for provisioning. Mark an image ready once its file exists on the hypervisor."
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-32" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {images?.map(image => (
            <Card
              key={image.id}
              className={`transition-all ${image.isAvailable ? 'hover:border-primary/50 hover:shadow-md' : 'opacity-80'}`}
            >
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-base flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <HardDrive className={`w-4 h-4 ${image.isAvailable ? 'text-primary' : 'text-muted-foreground'}`} />
                    {image.name}
                  </div>
                  {image.isAvailable ? (
                    <Badge variant="success" className="text-[10px]">Ready</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Not downloaded</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <p className="text-sm text-muted-foreground h-10 line-clamp-2">
                  {image.description}
                </p>
                <div className="flex gap-3 text-xs">
                  <div className="bg-muted px-2 py-1 rounded font-mono border border-border">
                    <span className="text-muted-foreground mr-2 text-[10px] uppercase">Ver</span>
                    {image.version}
                  </div>
                  <div className="bg-muted px-2 py-1 rounded font-mono border border-border">
                    <span className="text-muted-foreground mr-2 text-[10px] uppercase">Arch</span>
                    {image.arch}
                  </div>
                </div>

                {/* Manual availability toggle — for when image is already on the hypervisor */}
                <Button
                  variant={image.isAvailable ? 'outline' : 'default'}
                  size="sm"
                  className="w-full"
                  disabled={toggling === image.id}
                  onClick={() => toggleAvailability(image.id, image.isAvailable)}
                >
                  {image.isAvailable ? (
                    <><XCircle className="w-3.5 h-3.5 mr-1.5" /> Mark unavailable</>
                  ) : (
                    <><CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Mark as ready</>
                  )}
                </Button>

                {!image.isAvailable && image.isoPath && (
                  <p className="text-[11px] text-muted-foreground font-mono break-all leading-relaxed">
                    {image.isoPath}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          {images?.length === 0 && (
            <div className="col-span-full p-12 text-center bg-card border border-border rounded-lg">
              <Server className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium">No images found</h3>
              <p className="text-muted-foreground">No OS images are configured yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
