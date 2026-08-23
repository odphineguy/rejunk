import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";

import { hydrateSettings } from "@/lib/settingsStorage";
import { analyzePhotos, loadVisionSettings } from "@/lib/visionStorage";
import {
  hydratePricingData,
  loadPricingSettings,
} from "@/utils/pricingStorage";
import type { VisionAnalysisResult } from "@/types/vision";

import {
  bookingUrl,
  BRAND_NAME,
  PAGE_META,
  PHONE_DISPLAY,
} from "./content/site";
import { SiteLayout } from "./layout/SiteLayout";
import { usePageMeta } from "./lib/usePageMeta";
import { PALETTE } from "./palette";

const P = PALETTE;

/**
 * Public, photo-based "AI Instant Estimate" — the marketing-site twin of the
 * staff Vision tab (components/VisionEstimatePanel.tsx). Lead-gen first: we
 * require name + email + phone BEFORE running the (paid) AI call, capture the
 * lead into the office CRM and the owner notification email, then show a
 * floor-biased ballpark so the visitor gets instant value.
 *
 * Deliberately customer-facing: it shows the detected items and an estimated
 * price RANGE, and hides the internal numbers (landfill cost, tonnage, AI
 * confidence) that the staff panel surfaces.
 *
 * Lives in its own lazy chunk (see SiteRouter) so the heavier deps it pulls in
 * — Supabase-backed pricing/settings, the OpenAI call, jsPDF — never weigh down
 * the marketing home page.
 */

const MAX_PHOTOS = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const HYDRATE_TIMEOUT_MS = 2500;

const TIMING_OPTIONS = ["Today", "This week", "Flexible"] as const;

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

type UploadedPhoto = { id: string; dataUrl: string };

interface FormState {
  details: string;
  zip: string;
  timing: string;
  name: string;
  phone: string;
  email: string;
  /** SMS opt-in. Unchecked by default — consent must be affirmative (A2P 10DLC). */
  smsConsent: boolean;
  /** Honeypot — humans never see or fill this. */
  company: string;
}

const INITIAL_FORM: FormState = {
  details: "",
  zip: "",
  timing: "Flexible",
  name: "",
  phone: "",
  email: "",
  smsConsent: false,
  company: "",
};

const makeId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.round(performance.now())}`;

/** Downscale + re-encode to keep the upload payload small (and OpenAI cost low). */
async function compressImage(
  file: File,
  maxDim = 1280,
  quality = 0.72
): Promise<string> {
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

/** A customer-facing price band derived from the live volume benchmarks. Rounds
 * UP to the next benchmark bucket so a public quote never underprices the
 * job (the "bias toward the floor" rule), then offers a modest upper bound. */
interface PriceEstimate {
  totalCubicYards: number;
  hasPrice: boolean;
  lower: number;
  upper: number;
  loadLabel: string;
}

function buildEstimate(result: VisionAnalysisResult): PriceEstimate {
  const pricing = loadPricingSettings();
  const truckCapacity =
    (pricing.vehicles.find(v => v.isDefault) ?? pricing.vehicles[0])
      ?.usableCubicYards ?? 9;

  const totalCubicYards = result.itemBreakdown.reduce(
    (sum, it) => sum + it.cubicYards,
    0
  );
  const loadFraction = truckCapacity > 0 ? totalCubicYards / truckCapacity : 0;

  const benchmarks = [...pricing.volumePricingBenchmarks].sort(
    (a, b) => a.fraction - b.fraction
  );
  // Round UP to the first bucket that fully covers the analyzed volume (never
  // below it), falling back to the largest bucket for over-full loads.
  const bucket =
    benchmarks.find(b => b.fraction >= loadFraction) ??
    benchmarks[benchmarks.length - 1];
  const aboveBucket = benchmarks.find(
    b => bucket && b.fraction > bucket.fraction
  );

  const lower = bucket?.price ?? 0;
  const upper = aboveBucket?.price ?? Math.round(lower * 1.3);

  const pct = Math.min(100, Math.max(0, Math.round(loadFraction * 100)));
  const loadLabel = `about ${totalCubicYards.toFixed(1)} yd³ (≈ ${pct}% of a truck)`;

  return {
    totalCubicYards,
    hasPrice: lower > 0,
    lower,
    upper: Math.max(upper, lower),
    loadLabel,
  };
}

function summarizeItems(result: VisionAnalysisResult): string {
  return result.itemBreakdown
    .map(it => `${it.item}${it.quantity > 1 ? ` x${it.quantity}` : ""}`)
    .join(", ");
}

const inputClass =
  "w-full rounded-xl border px-4 py-3 text-base outline-none transition-colors focus:border-[#052a2b]";

type Step = "form" | "result";

export default function InstantEstimatePage() {
  usePageMeta(PAGE_META.instantEstimate);

  const [step, setStep] = useState<Step>("form");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<VisionAnalysisResult | null>(null);
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);
  const [aiFailed, setAiFailed] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Pull the live pricing benchmarks + tuned AI prompt into the warm cache so
  // the public estimate matches what the owner configured internally (the
  // landing bundle skips the staff hydration kickoff). Read synchronously from
  // cache at submit time; falls back to bundled defaults if this hasn't landed
  // yet — the page still works either way.
  useEffect(() => {
    const ready = Promise.all([hydratePricingData(), hydrateSettings()]).then(
      () => undefined
    );
    const timeout = new Promise<void>(resolve =>
      setTimeout(resolve, HYDRATE_TIMEOUT_MS)
    );
    void Promise.race([ready, timeout]).catch(() => undefined);
  }, []);

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setValidationError(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const accepted: UploadedPhoto[] = [];
    for (const file of incoming.slice(0, room)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_FILE_BYTES) continue;
      const dataUrl = await compressImage(file);
      accepted.push({ id: makeId(), dataUrl });
    }
    if (accepted.length) {
      setPhotos(prev => [...prev, ...accepted]);
      setValidationError("");
    }
  };

  const removePhoto = (id: string) =>
    setPhotos(prev => prev.filter(p => p.id !== id));

  /**
   * The server records the lead in the CRM with a service-role credential and
   * sends the owner notification. The public browser never receives CRM write
   * access.
   */
  const notifyOwner = (summary: string) => {
    return fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        services: ["Junk Removal"],
        details: form.details.trim()
          ? { "Junk Removal": form.details.trim() }
          : {},
        zip: form.zip.trim(),
        timing: form.timing,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        smsConsent: form.smsConsent,
        company: form.company,
        source: "AI Estimate",
        aiSummary: summary,
      }),
    }).catch(() => undefined);
  };

  const submit = async () => {
    if (!photos.length) {
      setValidationError(
        "Add at least one photo so the AI can size up the job."
      );
      return;
    }
    if (!form.name.trim()) {
      setValidationError("Please tell us your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setValidationError("Please enter an email so we can send your estimate.");
      return;
    }
    if (!/^[\d\s()+.-]{7,20}$/.test(form.phone.trim())) {
      setValidationError("Please enter a phone number we can reach you at.");
      return;
    }
    setValidationError("");
    setAnalyzing(true);

    // Honeypot: a filled hidden field means a bot — skip the paid AI call and
    // the CRM/email writes entirely, but show the normal screen so it learns
    // nothing.
    if (form.company.trim()) {
      setAiFailed(true);
      setAnalyzing(false);
      setStep("result");
      return;
    }

    let analysis: VisionAnalysisResult | null = null;
    try {
      analysis = await analyzePhotos({
        photos: photos.map(p => p.dataUrl),
        details: form.details,
        settings: loadVisionSettings(),
        source: "public",
      });
    } catch (error) {
      // Rate-limited: stay on the form with the server's message and do NOT
      // record a lead / email the owner — otherwise a throttled bot could still
      // spam the CRM and the owner's inbox.
      if ((error as { status?: number }).status === 429) {
        setValidationError(
          error instanceof Error
            ? error.message
            : "You've run a lot of estimates in a short time. Please wait a few minutes, or call/text us."
        );
        setAnalyzing(false);
        return;
      }
      analysis = null;
    }

    // Capture the lead whether or not the AI succeeded — a paid-API hiccup must
    // never lose us the lead.
    const priced = analysis ? buildEstimate(analysis) : null;
    const summary = buildLeadSummary(analysis, priced, form.details);
    await notifyOwner(summary);

    setResult(analysis);
    setEstimate(priced);
    setAiFailed(!analysis || analysis.itemBreakdown.length === 0);
    setAnalyzing(false);
    setStep("result");
  };

  const handleDownloadPdf = async () => {
    if (!result || !estimate) return;
    setDownloadingPdf(true);
    try {
      // Dynamic import keeps jsPDF out of the page chunk until it's actually needed.
      const { downloadQuotePdf } = await import("@/utils/quotePdf");
      await downloadQuotePdf({
        heading: "Junk Removal Estimate",
        customerName: form.name.trim() || undefined,
        total: estimate.lower,
        rangeLower: estimate.lower,
        rangeUpper: estimate.upper,
        facts: [
          {
            label: "Estimated volume",
            value: `${estimate.totalCubicYards.toFixed(1)} yd³`,
          },
        ],
        includes: ["Labor", "Loading", "Haul-away", "Standard disposal"],
        notes:
          [
            summarizeItems(result) && `Items: ${summarizeItems(result)}`,
            form.details.trim(),
          ]
            .filter(Boolean)
            .join("\n") || undefined,
      });
    } catch {
      setValidationError(
        "Couldn't build the PDF — please call or text us and we'll send it."
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  const startOver = () => {
    setPhotos([]);
    setForm(INITIAL_FORM);
    setResult(null);
    setEstimate(null);
    setAiFailed(false);
    setValidationError("");
    setStep("form");
  };

  // ---- RESULT VIEW -------------------------------------------------------
  if (step === "result") {
    return (
      <SiteLayout>
        <section className="px-5 py-10 md:px-8 md:py-16">
          <div className="mx-auto max-w-3xl">
            {aiFailed || !result || !estimate ? (
              <div className="text-center">
                <p
                  className="text-xs font-bold uppercase tracking-[0.2em]"
                  style={{ color: P.pine }}
                >
                  Request received
                </p>
                <h1
                  className="font-display mt-3 text-4xl font-bold tracking-tight"
                  style={{ color: P.pine }}
                >
                  Got it, {form.name.split(" ")[0] || "neighbor"}.
                </h1>
                <p
                  className="mx-auto mt-4 max-w-xl text-base"
                  style={{ color: P.inkSoft }}
                >
                  Our AI couldn't size this one up from the photos, but we've
                  got your request and your photos help. We'll text or call you
                  at <strong style={{ color: P.ink }}>{form.phone}</strong> with
                  your quote — usually within the hour during business hours.
                </p>
                <Cta startOver={startOver} />
              </div>
            ) : (
              <>
                <div className="text-center">
                  <p
                    className="text-xs font-semibold uppercase tracking-[0.25em]"
                    style={{ color: P.pine }}
                  >
                    Your AI instant estimate
                  </p>
                  <h1
                    className="font-display mt-3 text-4xl font-bold tracking-tight md:text-5xl"
                    style={{ color: P.pine }}
                  >
                    {estimate.hasPrice
                      ? `${money(estimate.lower)} – ${money(estimate.upper)}`
                      : "We'll send your quote"}
                  </h1>
                  <p
                    className="mx-auto mt-3 max-w-xl text-base"
                    style={{ color: P.inkSoft }}
                  >
                    Estimated for {estimate.loadLabel}. This is a ballpark from
                    your photos — we'll confirm the final price on site before
                    any work or extra charges.
                  </p>
                </div>

                <div
                  className="mt-10 rounded-2xl border p-6"
                  style={{ borderColor: P.line, background: P.mist }}
                >
                  <h2
                    className="font-display text-lg font-bold"
                    style={{ color: P.pine }}
                  >
                    What we spotted
                  </h2>
                  <ul className="mt-4 divide-y" style={{ borderColor: P.line }}>
                    {result.itemBreakdown.map((it, index) => (
                      <li
                        key={`${it.item}-${index}`}
                        className="flex items-center justify-between gap-4 py-2.5 text-sm"
                        style={{ color: P.ink }}
                      >
                        <span className="font-semibold">{it.item}</span>
                        <span style={{ color: P.inkSoft }}>
                          Qty {it.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs" style={{ color: P.inkSoft }}>
                    Don’t see everything? We’ll confirm the full list before the
                    job. Heavy or hidden items such as safes, concrete, or dirt
                    can change the price.
                  </p>
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf}
                    className="rounded-xl px-8 py-4 text-center text-lg font-bold shadow-lg transition-transform enabled:hover:scale-[1.03] disabled:opacity-60"
                    style={{ background: P.lime, color: P.pine }}
                  >
                    {downloadingPdf
                      ? "Building PDF…"
                      : "Download estimate (PDF)"}
                  </button>
                  <a
                    href={bookingUrl("ai-estimate-result")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border-2 px-8 py-4 text-center text-lg font-bold transition-transform hover:scale-[1.03]"
                    style={{ borderColor: P.pine, color: P.pine }}
                  >
                    Book this service
                  </a>
                </div>
                {validationError && (
                  <p
                    role="alert"
                    className="mt-4 text-sm font-semibold text-red-700"
                  >
                    {validationError}
                  </p>
                )}
                <p
                  className="mt-6 text-center text-sm"
                  style={{ color: P.inkSoft }}
                >
                  We've emailed your details to our team — expect a quick
                  follow-up.{" "}
                  <button
                    type="button"
                    onClick={startOver}
                    className="font-bold underline"
                    style={{ color: P.pine }}
                  >
                    Estimate another job
                  </button>
                </p>
              </>
            )}
          </div>
        </section>
      </SiteLayout>
    );
  }

  // ---- FORM VIEW ---------------------------------------------------------
  return (
    <SiteLayout>
      <section className="px-5 py-10 md:px-8 md:py-16">
        <div className="mx-auto max-w-3xl">
          <p
            className="text-xs font-semibold uppercase tracking-[0.25em]"
            style={{ color: P.pine }}
          >
            AI Instant Estimate
          </p>
          <h1
            className="font-display mt-3 text-4xl font-bold tracking-tight md:text-5xl"
            style={{ color: P.pine }}
          >
            Snap a few photos, get a ballpark price.
          </h1>
          <p className="mt-3 max-w-xl text-base" style={{ color: P.inkSoft }}>
            Upload photos of your junk and our AI sizes up the load — then we
            email your estimate and a real person follows up to lock in the
            price. Free, no obligation.
          </p>

          <form
            className="mt-8 flex flex-col gap-6"
            onSubmit={event => {
              event.preventDefault();
              void submit();
            }}
          >
            {/* Photos */}
            <div
              className="rounded-2xl border p-5"
              style={{ borderColor: P.line }}
            >
              <h2
                className="font-display text-lg font-bold"
                style={{ color: P.pine }}
              >
                1. Add photos
              </h2>
              <div
                onDragOver={event => event.preventDefault()}
                onDrop={event => {
                  event.preventDefault();
                  void addFiles(event.dataTransfer.files);
                }}
                className="mt-3 flex min-h-[110px] items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center"
                style={{ borderColor: P.line, background: P.mist }}
              >
                <p className="text-sm" style={{ color: P.inkSoft }}>
                  Drag photos here, or use the button below. Up to {MAX_PHOTOS},
                  20MB each.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={event => {
                  void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 rounded-xl px-6 py-3 text-sm font-bold shadow-sm transition-transform hover:scale-[1.03]"
                style={{ background: P.pine, color: P.paper }}
              >
                Add photos
              </button>

              {photos.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {photos.map((photo, index) => (
                    <div key={photo.id} className="group relative size-20">
                      <img
                        src={photo.dataUrl}
                        alt={`Photo ${index + 1}`}
                        className="size-full overflow-hidden rounded-lg border object-cover"
                        style={{ borderColor: P.line }}
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full text-white shadow"
                        style={{ background: P.pine }}
                        aria-label={`Remove photo ${index + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Details */}
            <div
              className="rounded-2xl border p-5"
              style={{ borderColor: P.line }}
            >
              <h2
                className="font-display text-lg font-bold"
                style={{ color: P.pine }}
              >
                2. Anything we should know?{" "}
                <span
                  className="text-sm font-normal"
                  style={{ color: P.inkSoft }}
                >
                  (optional)
                </span>
              </h2>
              <textarea
                rows={3}
                maxLength={1000}
                placeholder="Ex: there's a heavy safe behind the couch, everything in the garage goes, stairs to the unit…"
                className={`mt-3 ${inputClass}`}
                style={{ borderColor: P.line }}
                value={form.details}
                onChange={event =>
                  setForm(prev => ({ ...prev, details: event.target.value }))
                }
              />
            </div>

            {/* Contact */}
            <div
              className="rounded-2xl border p-5"
              style={{ borderColor: P.line }}
            >
              <h2
                className="font-display text-lg font-bold"
                style={{ color: P.pine }}
              >
                3. Where do we send it?
              </h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold" style={{ color: P.ink }}>
                    Your name
                  </span>
                  <input
                    autoComplete="name"
                    maxLength={120}
                    className={inputClass}
                    style={{ borderColor: P.line }}
                    value={form.name}
                    onChange={event =>
                      setForm(prev => ({ ...prev, name: event.target.value }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold" style={{ color: P.ink }}>
                    Email (we'll send your estimate here)
                  </span>
                  <input
                    type="email"
                    autoComplete="email"
                    maxLength={200}
                    className={inputClass}
                    style={{ borderColor: P.line }}
                    value={form.email}
                    onChange={event =>
                      setForm(prev => ({ ...prev, email: event.target.value }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold" style={{ color: P.ink }}>
                    Phone (we'll call/text to confirm)
                  </span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    maxLength={20}
                    placeholder="(480) 555-1234"
                    className={inputClass}
                    style={{ borderColor: P.line }}
                    value={form.phone}
                    onChange={event =>
                      setForm(prev => ({ ...prev, phone: event.target.value }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold" style={{ color: P.ink }}>
                    ZIP code{" "}
                    <span className="font-normal" style={{ color: P.inkSoft }}>
                      (optional)
                    </span>
                  </span>
                  <input
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="85225"
                    className={inputClass}
                    style={{ borderColor: P.line }}
                    value={form.zip}
                    onChange={event =>
                      setForm(prev => ({
                        ...prev,
                        zip: event.target.value.replace(/\D/g, ""),
                      }))
                    }
                  />
                </label>
              </div>

              <fieldset className="mt-5">
                <legend className="text-sm font-bold" style={{ color: P.ink }}>
                  When do you need it?
                </legend>
                <div className="mt-2 flex gap-2">
                  {TIMING_OPTIONS.map(option => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={form.timing === option}
                      onClick={() =>
                        setForm(prev => ({ ...prev, timing: option }))
                      }
                      className="flex-1 rounded-xl border-2 px-3 py-3 text-sm font-bold transition-colors"
                      style={{
                        borderColor: form.timing === option ? P.pine : P.line,
                        background:
                          form.timing === option ? P.limeSoft : "transparent",
                        color: P.ink,
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            {/* Honeypot: visually hidden, bots fill it, we drop those. */}
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              value={form.company}
              onChange={event =>
                setForm(prev => ({ ...prev, company: event.target.value }))
              }
            />

            <label
              className="flex items-start gap-3 rounded-xl border p-4"
              style={{ borderColor: P.line }}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#052a2b]"
                checked={form.smsConsent}
                onChange={event =>
                  setForm(prev => ({
                    ...prev,
                    smsConsent: event.target.checked,
                  }))
                }
              />
              <span className="text-sm font-bold" style={{ color: P.ink }}>
                Text me about this quote from {BRAND_NAME} at {PHONE_DISPLAY}.{" "}
                <span className="font-normal" style={{ color: P.inkSoft }}>
                  (Optional — we'll still call you either way.)
                </span>
              </span>
            </label>

            <p className="text-xs leading-5" style={{ color: P.inkSoft }}>
              By submitting, you agree to be contacted about your request. If
              you check the box above, you consent to receive service-related
              text messages (quote, scheduling, and ETA updates) from{" "}
              {BRAND_NAME}. Message frequency varies; message and data rates may
              apply. Reply STOP to opt out or HELP for help. Consent is not a
              condition of purchase. See our{" "}
              <Link
                href="/terms"
                className="font-semibold underline"
                style={{ color: P.pine }}
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="font-semibold underline"
                style={{ color: P.pine }}
              >
                Privacy Policy
              </Link>
              .
            </p>

            {validationError && (
              <p role="alert" className="text-sm font-semibold text-red-700">
                {validationError}
              </p>
            )}

            <div className="flex flex-col items-start gap-4">
              <button
                type="submit"
                disabled={analyzing}
                className="rounded-xl px-10 py-4 text-lg font-bold shadow-lg transition-transform enabled:hover:scale-[1.03] disabled:opacity-60"
                style={{ background: P.lime, color: P.pine }}
              >
                {analyzing
                  ? "Analyzing your photos…"
                  : "Get my instant estimate"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </SiteLayout>
  );
}

function Cta({ startOver }: { startOver: () => void }) {
  return (
    <>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <a
          href={bookingUrl("ai-estimate-cta")}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl px-8 py-4 text-lg font-bold shadow-lg transition-transform hover:scale-[1.03]"
          style={{ background: P.pine, color: P.paper }}
        >
          Book online
        </a>
      </div>
      <p className="mt-6 text-center text-sm" style={{ color: P.inkSoft }}>
        <button
          type="button"
          onClick={startOver}
          className="font-bold underline"
          style={{ color: P.pine }}
        >
          Try the instant estimate again
        </button>
      </p>
    </>
  );
}

/** Plain-text summary written to the CRM contact log and the owner's lead email. */
function buildLeadSummary(
  analysis: VisionAnalysisResult | null,
  priced: PriceEstimate | null,
  details: string
): string {
  if (!analysis || !priced || analysis.itemBreakdown.length === 0) {
    return [
      "AI Instant Estimate request (photos uploaded).",
      "The AI couldn't size it up — follow up by phone.",
      details.trim() ? `Customer note: ${details.trim()}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  const priceLabel = priced.hasPrice
    ? `${money(priced.lower)}–${money(priced.upper)}`
    : "needs manual quote";
  return [
    `AI Instant Estimate — est. ${priceLabel} (${priced.loadLabel}).`,
    `Items: ${summarizeItems(analysis)}.`,
    details.trim() ? `Customer note: ${details.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
