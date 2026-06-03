import { OperationsShell } from "@/components/OperationsShell";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <OperationsShell title={title} eyebrow="Workspace">
      <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
        {title} will live here. The navigation, global search, and persistent Add New menu are ready for this section.
      </div>
    </OperationsShell>
  );
}
