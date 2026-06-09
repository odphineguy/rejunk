import { Camera } from "lucide-react";

/**
 * Mandatory photo reminder (Pricebook v4 photo rules). Shown whenever an estimate
 * contains a junk-removal or moving item (or any item flagged photoRequired). This
 * is an operational rule, not advice — it is intentionally not dismissable.
 */
export function PhotoRequiredBanner({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 ${className ?? ""}`}
      role="alert"
    >
      <Camera className="mt-0.5 size-4 shrink-0" />
      <div>
        <div className="font-semibold">Photos required</div>
        <div>Photos required before confirming final price with customer.</div>
      </div>
    </div>
  );
}
