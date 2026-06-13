import { useState } from "react";

import { saveClient } from "@/lib/clientStorage";

import type { ImageBriefId } from "./content/imageBriefs";
import { PAGE_META, PHONE_DISPLAY, PHONE_HREF, SMS_HREF } from "./content/site";
import { ImagePlaceholder } from "./components/ImagePlaceholder";
import { SiteLayout } from "./layout/SiteLayout";
import { usePageMeta } from "./lib/usePageMeta";
import { PALETTE } from "./palette";

const P = PALETTE;

/**
 * Estimate request flow — deliberately NOT a live price quote (the quoting
 * engine isn't public-ready yet). Step 1 mirrors the proven "select all that
 * apply" pattern; step 2 captures details + contact; the lead is emailed to
 * the owner via POST /api/lead. If the send fails, we fall back to call/text
 * so a lead is never dead-ended.
 *
 * Plain controlled inputs on purpose — no react-hook-form/zod, keeps the
 * marketing chunk light.
 */

const SERVICE_OPTIONS: Array<{
  key: string;
  label: string;
  sub: string;
  imageId: ImageBriefId;
  detailPrompt: string;
}> = [
  {
    key: "Junk Removal",
    label: "Junk Removal",
    sub: "single items to full cleanouts",
    imageId: "estimate-junk",
    detailPrompt: "What are we hauling? (e.g. sofa, fridge, garage full of boxes)",
  },
  {
    key: "Moving",
    label: "Moving",
    sub: "local moves & big-item delivery",
    imageId: "estimate-moving",
    detailPrompt: "What's the move? (e.g. 1-bedroom apartment, one couch across town)",
  },
  {
    key: "Assembly & Handyman",
    label: "Assembly & Handyman",
    sub: "assembly, mounting, small fixes",
    imageId: "estimate-assembly",
    detailPrompt: "What needs doing? (e.g. IKEA dresser, TV mount, grab bars)",
  },
];

const TIMING_OPTIONS = ["Today", "This week", "Flexible"] as const;

function newId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`;
}

/**
 * Mirror the submitted lead into the shared `clients` table as a `kind:"lead"`
 * record so it lands on the office Clients page automatically — not just in the
 * notification email. The clients table RLS allows any authenticated (anonymous)
 * visitor to write, and `saveClient` fire-and-forgets to Supabase, so this works
 * straight from the public browser with no server-side key.
 *
 * Always a fresh random id (never phone-derived): a deterministic id could later
 * overwrite a real client who shares the phone — downgrading them back to a lead
 * and wiping their contact log. A rare duplicate lead row is the safe trade.
 */
function recordWebsiteLead(form: FormState) {
  const parts = form.name.trim().split(/\s+/);
  const firstName = parts.shift() ?? form.name.trim();
  const lastName = parts.join(" ");

  const detailLines = form.services.map(service =>
    form.details[service]?.trim()
      ? `${service}: ${form.details[service].trim()}`
      : service
  );
  const summary = [
    `Website estimate request — ${form.services.join(" + ") || "no service selected"}.`,
    `Wants it: ${form.timing}.`,
    form.zip.trim() ? `ZIP ${form.zip.trim()}.` : "",
    detailLines.length ? `Details — ${detailLines.join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  saveClient({
    kind: "lead",
    firstName,
    lastName,
    phone: form.phone.trim(),
    email: form.email.trim() || undefined,
    zip: form.zip.trim() || undefined,
    leadSource: "Website",
    contactLog: [
      { id: newId("note"), createdAt: new Date().toISOString(), text: summary },
    ],
  });
}

type Step = "services" | "details" | "done";

interface FormState {
  services: string[];
  details: Record<string, string>;
  zip: string;
  timing: string;
  name: string;
  phone: string;
  email: string;
  /** Honeypot — humans never see or fill this. */
  company: string;
}

const INITIAL_FORM: FormState = {
  services: [],
  details: {},
  zip: "",
  timing: "Flexible",
  name: "",
  phone: "",
  email: "",
  company: "",
};

const inputClass =
  "w-full rounded-xl border px-4 py-3 text-base outline-none transition-colors focus:border-[#052a2b]";

export default function EstimatePage() {
  usePageMeta(PAGE_META.estimate);

  const [step, setStep] = useState<Step>("services");
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [validationError, setValidationError] = useState("");

  const toggleService = (key: string) => {
    setForm(prev => ({
      ...prev,
      services: prev.services.includes(key)
        ? prev.services.filter(s => s !== key)
        : [...prev.services, key],
    }));
  };

  const selectedOptions = SERVICE_OPTIONS.filter(option => form.services.includes(option.key));

  const submit = async () => {
    if (!form.name.trim()) {
      setValidationError("Please tell us your name.");
      return;
    }
    if (!/^[\d\s()+.-]{7,20}$/.test(form.phone.trim())) {
      setValidationError("Please enter a phone number we can reach you at.");
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setValidationError("That email doesn't look right — or leave it blank.");
      return;
    }
    setValidationError("");
    setSubmitting(true);

    // Capture the lead into the office CRM first, in its own guard so a CRM
    // hiccup can never block the notification email or the confirmation screen.
    if (!form.company.trim()) {
      try {
        recordWebsiteLead(form);
      } catch {
        // Non-fatal — the email below is still the primary notification path.
      }
    }

    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          services: form.services,
          details: form.details,
          zip: form.zip.trim(),
          timing: form.timing,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          company: form.company,
        }),
      });
      setSendFailed(!response.ok);
    } catch {
      setSendFailed(true);
    } finally {
      setSubmitting(false);
      setStep("done");
    }
  };

  return (
    <SiteLayout>
      <section className="px-5 py-10 md:px-8 md:py-16">
        <div className="mx-auto max-w-4xl">
          {step === "services" && (
            <>
              <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl" style={{ color: P.pine }}>
                How can we help you?
              </h1>
              <p className="mt-3 text-base" style={{ color: P.inkSoft }}>
                Select all that apply — lots of jobs combine two or all three.
              </p>
              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {SERVICE_OPTIONS.map(option => {
                  const selected = form.services.includes(option.key);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleService(option.key)}
                      className="flex flex-col overflow-hidden rounded-2xl border-2 text-left transition-all hover:shadow-md"
                      style={{
                        borderColor: selected ? P.pine : P.line,
                        background: selected ? P.limeSoft : P.paperBg,
                      }}
                    >
                      <ImagePlaceholder id={option.imageId} className="rounded-none border-0" />
                      <div className="flex items-center justify-between gap-2 p-5">
                        <div>
                          <h2 className="font-display text-lg font-bold" style={{ color: P.ink }}>
                            {option.label}
                          </h2>
                          <p className="mt-0.5 text-xs" style={{ color: P.inkSoft }}>
                            {option.sub}
                          </p>
                        </div>
                        <span
                          aria-hidden="true"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-bold"
                          style={{
                            borderColor: selected ? P.pine : P.line,
                            background: selected ? P.pine : "transparent",
                            color: selected ? P.lime : "transparent",
                          }}
                        >
                          ✓
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-8 flex flex-col items-start gap-4">
                <button
                  type="button"
                  disabled={form.services.length === 0}
                  onClick={() => setStep("details")}
                  className="rounded-xl px-10 py-4 text-lg font-bold shadow-lg transition-transform enabled:hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: P.lime, color: P.pine }}
                >
                  Get my estimate
                </button>
                <p className="text-sm" style={{ color: P.inkSoft }}>
                  Prefer to talk?{" "}
                  <a href={PHONE_HREF} className="font-bold" style={{ color: P.pine }}>
                    Call {PHONE_DISPLAY}
                  </a>{" "}
                  or{" "}
                  <a href={SMS_HREF} className="font-bold" style={{ color: P.pine }}>
                    text us a photo
                  </a>
                  .
                </p>
              </div>
            </>
          )}

          {step === "details" && (
            <>
              <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl" style={{ color: P.pine }}>
                A few details
              </h1>
              <p className="mt-3 text-base" style={{ color: P.inkSoft }}>
                {form.services.join(" + ")} — tell us a little more and we'll text or call back
                with your quote, usually within the hour.
              </p>

              <form
                className="mt-8 flex flex-col gap-5"
                onSubmit={event => {
                  event.preventDefault();
                  void submit();
                }}
              >
                {selectedOptions.map(option => (
                  <label key={option.key} className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold" style={{ color: P.ink }}>
                      {option.label} <span className="font-normal" style={{ color: P.inkSoft }}>(optional)</span>
                    </span>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      placeholder={option.detailPrompt}
                      className={inputClass}
                      style={{ borderColor: P.line }}
                      value={form.details[option.key] ?? ""}
                      onChange={event =>
                        setForm(prev => ({
                          ...prev,
                          details: { ...prev.details, [option.key]: event.target.value },
                        }))
                      }
                    />
                  </label>
                ))}

                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold" style={{ color: P.ink }}>
                      ZIP code <span className="font-normal" style={{ color: P.inkSoft }}>(optional)</span>
                    </span>
                    <input
                      inputMode="numeric"
                      maxLength={5}
                      placeholder="85225"
                      className={inputClass}
                      style={{ borderColor: P.line }}
                      value={form.zip}
                      onChange={event => setForm(prev => ({ ...prev, zip: event.target.value.replace(/\D/g, "") }))}
                    />
                  </label>
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="text-sm font-bold" style={{ color: P.ink }}>
                      When do you need it?
                    </legend>
                    <div className="mt-1.5 flex gap-2">
                      {TIMING_OPTIONS.map(option => (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={form.timing === option}
                          onClick={() => setForm(prev => ({ ...prev, timing: option }))}
                          className="flex-1 rounded-xl border-2 px-3 py-3 text-sm font-bold transition-colors"
                          style={{
                            borderColor: form.timing === option ? P.pine : P.line,
                            background: form.timing === option ? P.limeSoft : "transparent",
                            color: P.ink,
                          }}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
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
                      onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold" style={{ color: P.ink }}>
                      Phone (we'll text your quote here)
                    </span>
                    <input
                      type="tel"
                      autoComplete="tel"
                      maxLength={20}
                      placeholder="(480) 555-1234"
                      className={inputClass}
                      style={{ borderColor: P.line }}
                      value={form.phone}
                      onChange={event => setForm(prev => ({ ...prev, phone: event.target.value }))}
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold" style={{ color: P.ink }}>
                    Email <span className="font-normal" style={{ color: P.inkSoft }}>(optional)</span>
                  </span>
                  <input
                    type="email"
                    autoComplete="email"
                    maxLength={200}
                    className={inputClass}
                    style={{ borderColor: P.line }}
                    value={form.email}
                    onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))}
                  />
                </label>

                {/* Honeypot: visually hidden, bots fill it, server drops those. */}
                <input
                  type="text"
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="absolute -left-[9999px] h-0 w-0 opacity-0"
                  value={form.company}
                  onChange={event => setForm(prev => ({ ...prev, company: event.target.value }))}
                />

                {validationError && (
                  <p role="alert" className="text-sm font-semibold text-red-700">
                    {validationError}
                  </p>
                )}

                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-xl px-10 py-4 text-lg font-bold shadow-lg transition-transform enabled:hover:scale-[1.03] disabled:opacity-60"
                    style={{ background: P.lime, color: P.pine }}
                  >
                    {submitting ? "Sending…" : "Request my quote"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("services")}
                    className="px-2 py-2 text-sm font-bold"
                    style={{ color: P.inkSoft }}
                  >
                    ← Back to services
                  </button>
                </div>
              </form>
            </>
          )}

          {step === "done" && (
            <div className="mx-auto max-w-xl py-10 text-center">
              {sendFailed ? (
                <>
                  <h1 className="font-display text-4xl font-bold tracking-tight" style={{ color: P.pine }}>
                    Almost there — call or text us
                  </h1>
                  <p className="mt-4 text-base" style={{ color: P.inkSoft }}>
                    The request didn't go through on our end. So you're not stuck waiting, reach
                    us directly and we'll get your quote going right away.
                  </p>
                </>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl font-bold"
                    style={{ background: P.lime, color: P.pine }}
                  >
                    ✓
                  </span>
                  <h1 className="font-display mt-6 text-4xl font-bold tracking-tight" style={{ color: P.pine }}>
                    Got it, {form.name.split(" ")[0] || "neighbor"}.
                  </h1>
                  <p className="mt-4 text-base" style={{ color: P.inkSoft }}>
                    We'll text or call you at <strong style={{ color: P.ink }}>{form.phone}</strong> with
                    your quote — usually within the hour during business hours. Want it even
                    faster?
                  </p>
                </>
              )}
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <a
                  href={PHONE_HREF}
                  className="rounded-xl px-8 py-4 text-lg font-bold shadow-lg transition-transform hover:scale-[1.03]"
                  style={{ background: P.pine, color: P.paper }}
                >
                  Call {PHONE_DISPLAY}
                </a>
                <a
                  href={SMS_HREF}
                  className="rounded-xl border-2 px-8 py-4 text-lg font-bold transition-transform hover:scale-[1.03]"
                  style={{ borderColor: P.pine, color: P.pine }}
                >
                  Text us a photo
                </a>
              </div>
            </div>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}
