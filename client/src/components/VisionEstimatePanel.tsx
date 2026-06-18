import { useMemo, useRef, useState } from "react";
import {
  BarChart3,
  DollarSign,
  FileDown,
  ImagePlus,
  Loader2,
  Minus,
  Mic,
  MicOff,
  MessageSquare,
  Plus,
  RotateCcw,
  TrendingUp,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { loadPricingSettings } from "@/utils/pricingStorage";
import { downloadQuotePdf } from "@/utils/quotePdf";
import { analyzePhotos, loadVisionSettings } from "@/lib/visionStorage";
import type { VisionAnalysisResult } from "@/types/vision";

const MAX_PHOTOS = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(value) ? value : 0
  );

type UploadedPhoto = { id: string; dataUrl: string };

// Each row keeps a per-unit volume/weight so the quantity stepper rescales the
// line totals the same way the AI's original numbers were split.
type EditableItem = {
  id: string;
  item: string;
  quantity: number;
  perUnitCubicYards: number;
  perUnitWeight: number;
};

const makeId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(performance.now())}`;

/** Downscale + re-encode to keep the upload payload small (and OpenAI cost low). */
async function compressImage(file: File, maxDim = 1280, quality = 0.72): Promise<string> {
  const original = await readFileAsDataUrl(file);
  try {
    const img = await loadImage(original);
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return original;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function VisionCard({
  icon: Icon,
  title,
  children,
}: {
  icon?: typeof Upload;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-center gap-2.5">
          {Icon && <Icon className="size-5 text-[var(--moss-deep)]" />}
          <h3 className="font-display text-lg font-bold text-[var(--moss-deep)]">{title}</h3>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function VisionEstimatePanel() {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [details, setDetails] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<VisionAnalysisResult | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const pricing = useMemo(() => loadPricingSettings(), []);
  const ratePerTon = pricing.defaults.defaultFacilityRatePerTon;
  const truckCapacity =
    (pricing.vehicles.find((v) => v.isDefault) ?? pricing.vehicles[0])?.usableCubicYards ?? 9;

  const speechSupported =
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const totalCubicYards = items.reduce((sum, it) => sum + it.perUnitCubicYards * it.quantity, 0);
  const totalWeightLbs = items.reduce((sum, it) => sum + it.perUnitWeight * it.quantity, 0);
  const tons = totalWeightLbs / 2000;
  const landfillCost = tons * ratePerTon;
  const loadFraction = truckCapacity > 0 ? totalCubicYards / truckCapacity : 0;
  // Snap the analyzed volume to the CLOSEST benchmark (not the next bucket up),
  // so a near-empty load lands on the Minimum charge instead of jumping to the
  // 1/8-load price.
  const benchmarks = pricing.volumePricingBenchmarks;
  const minPricing = benchmarks.length
    ? benchmarks.reduce((closest, b) =>
        Math.abs(b.fraction - loadFraction) < Math.abs(closest.fraction - loadFraction)
          ? b
          : closest
      ).price
    : 0;

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      toast.error(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const accepted: UploadedPhoto[] = [];
    for (const file of incoming.slice(0, room)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`"${file.name}" is over 20MB and was skipped.`);
        continue;
      }
      const dataUrl = await compressImage(file);
      accepted.push({ id: makeId(), dataUrl });
    }
    if (accepted.length) setPhotos((prev) => [...prev, ...accepted]);
    if (incoming.length > room) {
      toast.message(`Only added ${room} — ${MAX_PHOTOS}-photo limit reached.`);
    }
  };

  const removePhoto = (id: string) => setPhotos((prev) => prev.filter((p) => p.id !== id));

  const toggleMic = () => {
    if (!speechSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition =
      (window as unknown as { webkitSpeechRecognition?: new () => unknown; SpeechRecognition?: new () => unknown })
        .webkitSpeechRecognition ||
      (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition() as {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: (event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    };
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      if (text.trim()) setDetails((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const handleAnalyze = async () => {
    if (!photos.length || analyzing) return;
    setAnalyzing(true);
    try {
      const analysis = await analyzePhotos({
        photos: photos.map((p) => p.dataUrl),
        details,
        settings: loadVisionSettings(),
      });
      setResult(analysis);
      setItems(
        analysis.itemBreakdown.map((it) => {
          const quantity = Math.max(1, it.quantity);
          return {
            id: makeId(),
            item: it.item,
            quantity,
            perUnitCubicYards: it.cubicYards / quantity,
            perUnitWeight: it.weight / quantity,
          };
        })
      );
      if (!analysis.itemBreakdown.length) {
        toast.message("The AI didn't find any removable items in these photos.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const updateQty = (id: string, delta: number) =>
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, quantity: Math.max(1, it.quantity + delta) } : it))
    );

  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const startOver = () => {
    setPhotos([]);
    setDetails("");
    setResult(null);
    setItems([]);
    setViewPhoto(null);
  };

  const handleDownloadPdf = async () => {
    try {
      const itemSummary = items
        .map((it) => `${it.item} x${it.quantity}`)
        .join(", ");
      await downloadQuotePdf({
        heading: "Junk Removal Estimate",
        total: minPricing,
        facts: [
          { label: "Estimated volume", value: `${totalCubicYards.toFixed(1)} yd³` },
          {
            label: "Estimated weight",
            value: `${Math.round(totalWeightLbs).toLocaleString()} lb · ${tons.toFixed(2)} tons`,
          },
          ...(result ? [{ label: "AI confidence", value: `${result.confidence}%` }] : []),
        ],
        includes: ["Labor", "Loading", "Haul-away", "Standard disposal"],
        notes: [itemSummary && `Items: ${itemSummary}`, details].filter(Boolean).join("\n") || undefined,
      });
      toast.success("PDF saved — ready to text or email.");
    } catch (error) {
      console.error("[VisionEstimatePanel] PDF failed", error);
      toast.error("Couldn't build the PDF. Please try again.");
    }
  };

  // ---- RESULTS VIEW ------------------------------------------------------
  if (result) {
    return (
      <div className="space-y-6">
        <VisionCard icon={ImagePlus} title="Uploaded Photos">
          <div className="flex flex-wrap gap-3">
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setViewPhoto(photo.dataUrl)}
                className="relative size-20 overflow-hidden rounded-lg border border-border"
              >
                <img src={photo.dataUrl} alt={`Photo ${index + 1}`} className="size-full object-cover" />
                <span className="absolute left-1 top-1 flex size-5 items-center justify-center rounded-full bg-[var(--moss-deep)] text-[11px] font-bold text-white">
                  {index + 1}
                </span>
              </button>
            ))}
          </div>
        </VisionCard>

        <h2 className="text-center font-display text-2xl font-bold text-foreground">Your Estimate</h2>

        <VisionCard icon={DollarSign} title="Estimated Landfill Costs">
          <dl className="divide-y divide-border">
            <Row label="Total Weight" value={`${tons.toFixed(2)} tons`} />
            <Row label="Landfill Price per Ton" value={money(ratePerTon)} />
            <Row label="Estimated Landfill Cost" value={money(landfillCost)} strong />
          </dl>
          {result.confidence > 0 && (
            <p className="mt-4 rounded-lg bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground">
              * Estimate based on AI analysis with {result.confidence}% confidence
            </p>
          )}
        </VisionCard>

        <VisionCard icon={BarChart3} title="Item Breakdown">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items left. Add photos and re-analyze.</p>
          ) : (
            <div className="space-y-3">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{it.item}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Qty:</span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() => updateQty(it.id, -1)}
                          disabled={it.quantity <= 1}
                          aria-label="Decrease quantity"
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        <span className="w-7 text-center text-sm font-medium">{it.quantity}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() => updateQty(it.id, 1)}
                          aria-label="Increase quantity"
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {(it.perUnitCubicYards * it.quantity).toFixed(1)} yd³ ·{" "}
                        {Math.round(it.perUnitWeight * it.quantity)} lbs
                      </p>
                      <p className="font-semibold text-[var(--moss-deep)]">
                        {money((it.perUnitWeight * it.quantity) / 2000 * ratePerTon)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(it.id)}
                      aria-label={`Remove ${it.item}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </VisionCard>

        <VisionCard title="Recommended Truck Load">
          <div className="flex items-center justify-between rounded-lg border border-[var(--moss-deep)]/20 bg-[#f0f4ec] px-4 py-4">
            <span className="font-semibold text-foreground">Minimum Pricing</span>
            <span className="font-display text-2xl font-bold text-[var(--moss-deep)]">
              {money(minPricing)}
            </span>
          </div>
          <p className="mt-3 rounded-lg bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground">
            * Recommended pricing based on the closest truck-load capacity that fits the analyzed volume
          </p>
        </VisionCard>

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={startOver}
          >
            <RotateCcw className="mr-2 size-4" />
            Start Over
          </Button>
          <Button
            type="button"
            className="w-full bg-[var(--moss-deep)] text-white hover:bg-[#1a7a4f]"
            onClick={handleDownloadPdf}
          >
            <FileDown className="mr-2 size-4" />
            Download PDF
          </Button>
        </div>

        {viewPhoto && <Lightbox src={viewPhoto} onClose={() => setViewPhoto(null)} />}
      </div>
    );
  }

  // ---- UPLOAD / INPUT VIEW ----------------------------------------------
  return (
    <div className="space-y-6">
      <VisionCard icon={Upload} title="Upload Photos">
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void addFiles(event.dataTransfer.files);
          }}
          className="flex min-h-[120px] items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-center"
        >
          <p className="text-sm text-muted-foreground">
            Drag photos here, or use the button below.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <div className="mt-4 flex items-center gap-3">
          <Button
            type="button"
            className="bg-[var(--moss-deep)] text-white hover:bg-[#1a7a4f]"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="mr-2 size-4" />
            Add Photos
          </Button>
          <span className="text-sm text-muted-foreground">Max 20MB each</span>
        </div>

        {photos.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-foreground">
              Uploaded ({photos.length}) <span className="font-normal text-muted-foreground">· Click to view</span>
            </p>
            <div className="flex flex-wrap gap-3">
              {photos.map((photo, index) => (
                <div key={photo.id} className="group relative size-16">
                  <button
                    type="button"
                    onClick={() => setViewPhoto(photo.dataUrl)}
                    className="size-full overflow-hidden rounded-lg border border-border"
                  >
                    <img src={photo.dataUrl} alt={`Photo ${index + 1}`} className="size-full object-cover" />
                    <span className="absolute left-1 top-1 flex size-5 items-center justify-center rounded-full bg-[var(--moss-deep)] text-[11px] font-bold text-white">
                      {index + 1}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-destructive text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Remove photo"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-3 text-center text-sm text-muted-foreground">{photos.length}/{MAX_PHOTOS} photos</p>
      </VisionCard>

      {photos.length > 0 && (
        <VisionCard icon={MessageSquare} title="Details">
          <p className="mb-3 text-sm text-muted-foreground">
            Reference photos by number (1{photos.length > 1 ? `–${photos.length}` : ""}) to describe
            hidden items, piles, or anything that might affect pricing.{" "}
            <span className="font-medium">Optional.</span>
          </p>
          <div className="relative">
            <Textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Ex: hidden 800lb safe behind the couch in photo 1"
              className="min-h-[110px] pr-12"
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleMic}
                className={`absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full border border-border bg-card transition-colors ${
                  listening ? "text-destructive" : "text-muted-foreground hover:text-[var(--moss-deep)]"
                }`}
                aria-label={listening ? "Stop dictation" : "Start dictation"}
              >
                {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </button>
            )}
          </div>
          {speechSupported && (
            <p className="mt-2 text-xs text-muted-foreground">
              Click the microphone to dictate. Works best in Chrome/Edge.
            </p>
          )}
        </VisionCard>
      )}

      <VisionCard icon={TrendingUp} title="Ready to Analyze">
        <Button
          type="button"
          className="w-full bg-[var(--moss-deep)] py-6 text-base text-white hover:bg-[#1a7a4f] disabled:opacity-60"
          onClick={handleAnalyze}
          disabled={!photos.length || analyzing}
        >
          {analyzing ? (
            <>
              <Loader2 className="mr-2 size-5 animate-spin" />
              Analyzing photos…
            </>
          ) : (
            <>
              <TrendingUp className="mr-2 size-5" />
              Analyze &amp; Get Estimate
            </>
          )}
        </Button>
        {!photos.length && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Upload photos to enable analysis
          </p>
        )}
      </VisionCard>

      {viewPhoto && <Lightbox src={viewPhoto} onClose={() => setViewPhoto(null)} />}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className={strong ? "font-bold text-foreground" : "text-sm text-muted-foreground"}>{label}</dt>
      <dd className={strong ? "font-bold text-[var(--moss-deep)]" : "font-medium text-foreground"}>{value}</dd>
    </div>
  );
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <img src={src} alt="Uploaded photo" className="max-h-full max-w-full rounded-lg object-contain" />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-white/90 text-foreground"
        aria-label="Close"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
