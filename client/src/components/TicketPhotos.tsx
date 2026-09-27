import { useMemo, useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { uploadJobPhoto } from "@/lib/driverStorage";
import { photoSource, photoSourceLabels, type JobPhoto } from "@/types/driver";

/**
 * One photo strip on the office ticket: customer photos from the Thumbtack thread,
 * office uploads and crew photos, each tagged. The crew sees the same strip.
 */
export function TicketPhotos({ jobId, photos }: { jobId: string; photos: JobPhoto[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const sorted = useMemo(() => {
    const rank = { customer: 0, office: 1, crew: 2 } as const;
    return [...photos].sort((a, b) => rank[photoSource(a)] - rank[photoSource(b)] || b.createdAt.localeCompare(a.createdAt));
  }, [photos]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadJobPhoto({ jobId, file, photoType: "other", visibility: "internal", fromOffice: true });
      }
      toast.success(files.length === 1 ? "Photo added" : `${files.length} photos added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Photo upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Photos</CardTitle>
          <CardDescription>From the customer, the office and the crew. The crew sees these on their phones.</CardDescription>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void upload(event.target.files)} />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Upload className="size-4 animate-pulse" /> : <Camera className="size-4" />}
          {uploading ? "Uploading..." : "Add photos"}
        </Button>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {sorted.map((photo) => (
              <a
                key={photo.id}
                href={photo.publicUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                title={photo.caption || photoSourceLabels[photoSource(photo)]}
              >
                {photo.publicUrl && <img src={photo.publicUrl} alt={photo.caption || "Job photo"} loading="lazy" className="h-full w-full object-cover" />}
                <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold">{photoSourceLabels[photoSource(photo)]}</span>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
