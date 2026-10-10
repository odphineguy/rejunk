import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";

import {
  BOOKING_DEPOSIT,
  BOOKING_DEPOSIT_CARD_FEE,
  BOOKING_DEPOSIT_CARD_TOTAL,
  BOOKING_GROUPS,
  BOOKING_REFUND_HOURS,
  BOOKING_SERVICES,
  bookingDateLabel,
  inServiceArea,
  priceBooking,
  type BookingGroup,
  type BookingService,
} from "@shared/bookingCatalog";

import { BRAND_NAME, PAGE_META, PHONE_DISPLAY, PHONE_HREF } from "./content/site";
import { SiteLayout } from "./layout/SiteLayout";
import { usePageMeta } from "./lib/usePageMeta";
import { PALETTE } from "./palette";

const P = PALETTE;
/** Errors and warnings — amber, never red (Abe's design rule). */
const WARN = "#9a6a00";

/**
 * Public online booking (ONLINE_BOOKING_SPEC phase 1) — Rejunk's replacement
 * for the Housecall Pro booking page. Same order as HCP: ZIP → service →
 * addresses → contact → arrival window → confirm. Prices come from the shared
 * catalog; /api/book re-prices and re-checks the window before writing.
 *
 * v1 takes no card: the confirmation explains the $50 deposit is collected by
 * the office (then recorded on the booking's invoice).
 */

type Step = "zip" | "service" | "where" | "you" | "when" | "review" | "done";
const STEPS: Step[] = ["zip", "service", "where", "you", "when", "review"];

interface Address {
  street: string;
  unit: string;
  city: string;
  zip: string;
  flights: number;
  elevator: boolean;
  access: string;
}

const EMPTY_ADDRESS: Address = { street: "", unit: "", city: "", zip: "", flights: 0, elevator: false, access: "" };

interface Day {
  date: string;
  windows: { key: "am" | "pm"; label: string; open: boolean }[];
}

async function callApi(body: Record<string, unknown>) {
  const response = await fetch("/api/book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, json };
}

const inputClass =
  "w-full rounded-xl border px-4 py-3 text-base outline-none transition-colors focus:border-[#052a2b]";

export default function BookPage() {
  usePageMeta(PAGE_META.book);

  const [step, setStep] = useState<Step>("zip");
  const [serviceIds, setServiceIds] = useState<string[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [zip, setZip] = useState("");
  const [group, setGroup] = useState<BookingGroup | null>(null);
  const [service, setService] = useState<BookingService | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([{ ...EMPTY_ADDRESS }]);
  const [notes, setNotes] = useState("");
  const [contact, setContact] = useState({ firstName: "", lastName: "", phone: "", email: "", smsConsent: false, company: "" });
  const [days, setDays] = useState<Day[] | null>(null);
  const [daysError, setDaysError] = useState("");
  const [date, setDate] = useState("");
  const [windowKey, setWindowKey] = useState<"am" | "pm" | "">("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ jobNumber: string; arrival: string } | null>(null);
  const [cardDeposit, setCardDeposit] = useState(false);
  const search = useSearch();
  const returned = useMemo(() => {
    const params = new URLSearchParams(search);
    const deposit = params.get("deposit");
    const ref = params.get("ref") ?? "";
    return deposit === "paid" || deposit === "cancelled" ? { deposit, ref } : null;
  }, [search]);
  const [payingAgain, setPayingAgain] = useState(false);

  useEffect(() => {
    callApi({ action: "options" })
      .then(({ ok, json }) => {
        if (!ok || json.enabled === false) {
          setClosed(true);
          return;
        }
        setServiceIds(Array.isArray(json.serviceIds) ? (json.serviceIds as string[]) : []);
        setCardDeposit(json.cardDeposit === true);
      })
      .catch(() => setClosed(true));
  }, []);

  const services = useMemo(
    () => BOOKING_SERVICES.filter(s => !serviceIds || serviceIds.includes(s.id)),
    [serviceIds]
  );
  const groups = BOOKING_GROUPS.filter(g => services.some(s => s.group === g.id));

  const go = (next: Step) => {
    setError("");
    setStep(next);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const loadDays = (target: BookingService) => {
    setDays(null);
    setDaysError("");
    callApi({ action: "availability", serviceId: target.id })
      .then(({ ok, json }) => {
        if (!ok) throw new Error(String(json.error ?? ""));
        const list = (json.days as Day[]) ?? [];
        setDays(list);
        const first = list.find(d => d.windows.some(w => w.open));
        setDate(current => (current && list.some(d => d.date === current && d.windows.some(w => w.open)) ? current : first?.date ?? ""));
      })
      .catch(e => setDaysError(e instanceof Error && e.message ? e.message : "We couldn't load open times."));
  };

  const pickService = (picked: BookingService) => {
    setService(picked);
    setAddresses(prev => {
      const first = { ...(prev[0] ?? EMPTY_ADDRESS), zip: prev[0]?.zip || zip };
      return picked.twoAddresses ? [first, prev[1] ?? { ...EMPTY_ADDRESS }] : [first];
    });
    setWindowKey("");
    loadDays(picked);
    go("where");
  };

  const price = service && date ? priceBooking(service, date, addresses.map(a => a.flights)) : null;
  const pricePreview = service ? priceBooking(service, date || todayIso(), addresses.map(a => a.flights)) : null;
  const selectedDay = days?.find(d => d.date === date);
  const selectedWindow = selectedDay?.windows.find(w => w.key === windowKey && w.open);

  const updateAddress = (index: number, patch: Partial<Address>) =>
    setAddresses(prev => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));

  const checkZip = () => {
    if (!/^\d{5}$/.test(zip)) return setError("Enter your 5-digit ZIP code.");
    if (!inServiceArea(zip)) return setError(`We don't book online in ${zip} yet — call us at ${PHONE_DISPLAY} and we'll see what we can do.`);
    setAddresses(prev => prev.map((a, i) => (i === 0 && !a.zip ? { ...a, zip } : a)));
    go("service");
  };

  const checkWhere = () => {
    for (const a of addresses) {
      if (!a.street.trim() || !a.city.trim() || !/^\d{5}$/.test(a.zip)) return setError("Please fill in the street, city and ZIP for each address.");
    }
    go("you");
  };

  const checkYou = () => {
    if (!contact.firstName.trim() || !contact.lastName.trim()) return setError("Please enter your first and last name.");
    if (contact.phone.replace(/\D/g, "").length < 10) return setError("Please enter a 10-digit phone number.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) return setError("Please enter a valid email.");
    go("when");
  };

  const submit = async () => {
    if (!service || !date || !windowKey) return;
    setSubmitting(true);
    setError("");
    try {
      const { ok, status, json } = await callApi({
        action: "book",
        serviceId: service.id,
        date,
        window: windowKey,
        addresses,
        notes,
        ...contact,
      });
      if (!ok) {
        setError(String(json.error ?? `Something went wrong. Please call ${PHONE_DISPLAY}.`));
        if (status === 409) {
          setWindowKey("");
          loadDays(service);
          go("when");
          setError(String(json.error));
        }
        return;
      }
      if (typeof json.checkoutUrl === "string" && json.checkoutUrl) {
        window.location.assign(json.checkoutUrl);
        return;
      }
      setResult({ jobNumber: String(json.jobNumber ?? ""), arrival: String(json.arrival ?? "") });
      go("done");
    } catch {
      setError(`We couldn't reach the booking system. Please try again or call ${PHONE_DISPLAY}.`);
    } finally {
      setSubmitting(false);
    }
  };

  const payDepositAgain = async () => {
    if (!returned?.ref) return;
    setPayingAgain(true);
    setError("");
    try {
      const { ok, json } = await callApi({ action: "deposit", ref: returned.ref });
      if (ok && typeof json.checkoutUrl === "string") return window.location.assign(json.checkoutUrl);
      if (ok && json.paid) return setError("Your deposit is already paid — you're all set.");
      setError(String(json.error ?? `We couldn't open the payment page. Please call ${PHONE_DISPLAY}.`));
    } catch {
      setError(`We couldn't open the payment page. Please call ${PHONE_DISPLAY}.`);
    } finally {
      setPayingAgain(false);
    }
  };

  if (returned) {
    const paid = returned.deposit === "paid";
    return (
      <SiteLayout>
        <section className="px-5 py-16 md:px-8">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: P.pine }}>
              {paid ? "Booking confirmed" : "Booking saved"}
            </p>
            <h1 className="font-display mt-3 text-4xl font-bold tracking-tight" style={{ color: P.pine }}>
              {paid ? "You're booked — deposit received!" : "Your deposit isn't paid yet"}
            </h1>
            <p className="mt-4 text-base" style={{ color: P.inkSoft }}>
              {paid
                ? `Thanks! Your $${BOOKING_DEPOSIT} deposit comes off your final bill. Your confirmation email has all the details.`
                : `We saved your booking, but the $${BOOKING_DEPOSIT} deposit that holds your spot didn't go through.`}
            </p>
            {!paid && (
              <div className="mt-8 flex flex-col items-center gap-4">
                <PrimaryButton onClick={() => void payDepositAgain()} disabled={payingAgain}>
                  {payingAgain ? "Opening…" : `Pay $${BOOKING_DEPOSIT_CARD_TOTAL.toFixed(2)} deposit`}
                </PrimaryButton>
                <ErrorLine text={error} />
              </div>
            )}
            <p className="mt-8 text-base" style={{ color: P.inkSoft }}>
              Questions or changes? Call or text{" "}
              <a href={PHONE_HREF} className="font-bold underline" style={{ color: P.pine }}>
                {PHONE_DISPLAY}
              </a>
              .
            </p>
          </div>
        </section>
      </SiteLayout>
    );
  }

  const stepIndex = STEPS.indexOf(step);
  const crumbs = [group ? BOOKING_GROUPS.find(g => g.id === group)?.label : null, service?.name].filter(Boolean);

  if (closed) {
    return (
      <SiteLayout>
        <section className="px-5 py-16 md:px-8">
          <div className="mx-auto max-w-xl text-center">
            <h1 className="font-display text-4xl font-bold tracking-tight" style={{ color: P.pine }}>
              Online booking is taking a break
            </h1>
            <p className="mt-4 text-base" style={{ color: P.inkSoft }}>
              Call or text us and we'll get you on the schedule.
            </p>
            <a href={PHONE_HREF} className="mt-8 inline-block rounded-xl px-8 py-4 text-lg font-bold shadow-lg" style={{ background: P.lime, color: P.pine }}>
              {PHONE_DISPLAY}
            </a>
          </div>
        </section>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <section className="px-5 py-10 md:px-8 md:py-14">
        <div className="mx-auto max-w-3xl">
          {step !== "done" && (
            <div className="mb-8">
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: P.line }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%`, background: P.pine }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-4 text-sm">
                {stepIndex > 0 ? (
                  <button
                    type="button"
                    className="shrink-0 whitespace-nowrap font-bold"
                    style={{ color: P.inkSoft }}
                    onClick={() => (step === "service" && group ? setGroup(null) : go(STEPS[stepIndex - 1]))}
                  >
                    ← Back
                  </button>
                ) : (
                  <span />
                )}
                {crumbs.length > 0 && stepIndex > 0 && (
                  <span className="truncate text-right" style={{ color: P.inkSoft }}>
                    {crumbs.join(" › ")}
                  </span>
                )}
              </div>
            </div>
          )}

          {step === "zip" && (
            <>
              <Heading title={`Welcome to ${BRAND_NAME}`} sub="Let us check that we work in your area." />
              <div className="mt-8 flex max-w-md flex-col gap-4">
                <input
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="ZIP code, e.g. 85225"
                  className={inputClass}
                  style={{ borderColor: P.line }}
                  value={zip}
                  onChange={e => setZip(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={e => e.key === "Enter" && checkZip()}
                />
                <PrimaryButton onClick={checkZip} disabled={!serviceIds}>
                  {serviceIds ? "Check my ZIP" : "Loading…"}
                </PrimaryButton>
              </div>
            </>
          )}

          {step === "service" && !group && (
            <>
              <Heading title="What can we do for you?" sub="Pick the kind of job." />
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {groups.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGroup(g.id)}
                    className="rounded-2xl border-2 p-5 text-left transition-shadow hover:shadow-md"
                    style={{ borderColor: P.line, background: P.paperBg }}
                  >
                    <span className="font-display block text-lg font-bold" style={{ color: P.ink }}>
                      {g.label}
                    </span>
                    <span className="mt-1 block text-sm" style={{ color: P.inkSoft }}>
                      {g.blurb}
                    </span>
                  </button>
                ))}
              </div>
              <SomethingElse />
            </>
          )}

          {step === "service" && group && (
            <>
              <Heading title={BOOKING_GROUPS.find(g => g.id === group)?.label ?? ""} sub="Choose your service. Prices are all-in — travel included." />
              {Array.from(new Set(services.filter(s => s.group === group).map(s => s.subgroup))).map(subgroup => (
                <div key={subgroup} className="mt-8">
                  {group === "moving" && (
                    <h2 className="font-display mb-3 text-xl font-bold" style={{ color: P.pine }}>
                      {subgroup}
                    </h2>
                  )}
                  <div className="grid gap-3">
                    {services
                      .filter(s => s.group === group && s.subgroup === subgroup)
                      .map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => pickService(s)}
                          className="flex flex-col gap-2 rounded-2xl border-2 p-5 text-left transition-shadow hover:shadow-md sm:flex-row sm:items-start sm:justify-between"
                          style={{ borderColor: service?.id === s.id ? P.pine : P.line, background: P.paperBg }}
                        >
                          <span>
                            <span className="font-display block text-lg font-bold" style={{ color: P.ink }}>
                              {s.name}
                            </span>
                            <span className="mt-1 block text-sm" style={{ color: P.inkSoft }}>
                              {s.description}
                            </span>
                          </span>
                          <span className="shrink-0 text-base font-bold sm:text-right" style={{ color: P.pine }}>
                            {priceLabel(s)}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
              <SomethingElse />
            </>
          )}

          {step === "where" && service && (
            <>
              <Heading
                title={service.twoAddresses ? "Where are we going?" : "Where's the job?"}
                sub={
                  service.stairs === "extra_flight"
                    ? "The first flight of stairs at each address is included."
                    : service.stairs === "per_location"
                      ? "Tell us about stairs so we bring the right gear."
                      : "Tell us about stairs and access so the crew comes ready."
                }
              />
              <div className="mt-8 flex flex-col gap-6">
                {addresses.map((a, index) => (
                  <fieldset key={index} className="rounded-2xl border p-5 md:p-6" style={{ borderColor: P.line, background: P.mist }}>
                    <legend className="px-2 font-display text-xl font-bold" style={{ color: P.pine }}>
                      {service.twoAddresses ? (index === 0 ? "Loading address" : "Unloading address") : "Service address"}
                    </legend>
                    <div className="grid gap-4 sm:grid-cols-6">
                      <Field label="Street address" className="sm:col-span-4">
                        <input autoComplete={index === 0 ? "address-line1" : "off"} maxLength={160} className={inputClass} style={{ borderColor: P.line, background: P.paperBg }} value={a.street} onChange={e => updateAddress(index, { street: e.target.value })} />
                      </Field>
                      <Field label="Apt / unit" optional className="sm:col-span-2">
                        <input maxLength={40} className={inputClass} style={{ borderColor: P.line, background: P.paperBg }} value={a.unit} onChange={e => updateAddress(index, { unit: e.target.value })} />
                      </Field>
                      <Field label="City" className="sm:col-span-4">
                        <input autoComplete={index === 0 ? "address-level2" : "off"} maxLength={80} className={inputClass} style={{ borderColor: P.line, background: P.paperBg }} value={a.city} onChange={e => updateAddress(index, { city: e.target.value })} />
                      </Field>
                      <Field label="ZIP" className="sm:col-span-2">
                        <input inputMode="numeric" maxLength={5} className={inputClass} style={{ borderColor: P.line, background: P.paperBg }} value={a.zip} onChange={e => updateAddress(index, { zip: e.target.value.replace(/\D/g, "") })} />
                      </Field>
                      <Field label="Flights of stairs" className="sm:col-span-3">
                        <select className={inputClass} style={{ borderColor: P.line, background: P.paperBg }} value={a.flights} onChange={e => updateAddress(index, { flights: Number(e.target.value) })}>
                          <option value={0}>None — ground floor</option>
                          {[1, 2, 3, 4, 5].map(n => (
                            <option key={n} value={n}>
                              {n} flight{n > 1 ? "s" : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <label className="flex items-center gap-3 sm:col-span-3 sm:mt-7">
                        <input type="checkbox" className="h-5 w-5 accent-[#052a2b]" checked={a.elevator} onChange={e => updateAddress(index, { elevator: e.target.checked })} />
                        <span className="text-sm font-bold" style={{ color: P.ink }}>
                          There's an elevator
                        </span>
                      </label>
                      <Field label="Gate code, parking or access notes" optional className="sm:col-span-6">
                        <input maxLength={300} className={inputClass} style={{ borderColor: P.line, background: P.paperBg }} value={a.access} onChange={e => updateAddress(index, { access: e.target.value })} />
                      </Field>
                    </div>
                  </fieldset>
                ))}
                <Field label="Anything else we should know?" optional>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    placeholder={service.group === "junk" ? "What are we hauling? (e.g. sofa, fridge, boxes)" : "Heavy or fragile items, tight spaces, timing…"}
                    className={inputClass}
                    style={{ borderColor: P.line }}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </Field>
                {pricePreview && (
                  <div>
                    <PriceBox price={pricePreview} />
                    {date && (
                      <p className="mt-2 text-xs" style={{ color: P.inkSoft }}>
                        Shown for {bookingDateLabel(date)}, the first open day. Weekend and month-end dates cost a little more — you'll see the final price before you book.
                      </p>
                    )}
                  </div>
                )}
                <ErrorLine text={error} />
                <PrimaryButton onClick={checkWhere}>Continue</PrimaryButton>
              </div>
            </>
          )}

          {step === "you" && (
            <>
              <Heading title="Your contact details" sub="We'll send your confirmation here." />
              <div className="mt-8 flex flex-col gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="First name">
                    <input autoComplete="given-name" maxLength={60} className={inputClass} style={{ borderColor: P.line }} value={contact.firstName} onChange={e => setContact(c => ({ ...c, firstName: e.target.value }))} />
                  </Field>
                  <Field label="Last name">
                    <input autoComplete="family-name" maxLength={60} className={inputClass} style={{ borderColor: P.line }} value={contact.lastName} onChange={e => setContact(c => ({ ...c, lastName: e.target.value }))} />
                  </Field>
                  <Field label="Mobile phone">
                    <input type="tel" autoComplete="tel" maxLength={20} placeholder="(480) 555-1234" className={inputClass} style={{ borderColor: P.line }} value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} />
                  </Field>
                  <Field label="Email">
                    <input type="email" autoComplete="email" maxLength={200} className={inputClass} style={{ borderColor: P.line }} value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} />
                  </Field>
                </div>
                {/* Honeypot: hidden from people, bots fill it, the server drops those. */}
                <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={contact.company} onChange={e => setContact(c => ({ ...c, company: e.target.value }))} />
                <label className="flex items-start gap-3 rounded-xl border p-4" style={{ borderColor: P.line }}>
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#052a2b]" checked={contact.smsConsent} onChange={e => setContact(c => ({ ...c, smsConsent: e.target.checked }))} />
                  <span className="text-sm font-bold" style={{ color: P.ink }}>
                    Text me about this booking from {BRAND_NAME} at {PHONE_DISPLAY}.{" "}
                    <span className="font-normal" style={{ color: P.inkSoft }}>
                      (Optional.)
                    </span>
                  </span>
                </label>
                <p className="text-xs leading-5" style={{ color: P.inkSoft }}>
                  If you check the box above, you consent to receive service-related text messages (scheduling, deposit and arrival updates) from {BRAND_NAME} at {PHONE_DISPLAY}. Message frequency varies; message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase. See our{" "}
                  <Link href="/terms" className="font-semibold underline" style={{ color: P.pine }}>
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="font-semibold underline" style={{ color: P.pine }}>
                    Privacy Policy
                  </Link>
                  .
                </p>
                <ErrorLine text={error} />
                <PrimaryButton onClick={checkYou}>Pick a time</PrimaryButton>
              </div>
            </>
          )}

          {step === "when" && service && (
            <>
              <Heading title="Pick an arrival window" sub="We'll arrive within the window you choose. Times are Arizona time." />
              <div className="mt-8">
                {!days && !daysError && <p style={{ color: P.inkSoft }}>Loading open times…</p>}
                {daysError && (
                  <p className="font-semibold" style={{ color: WARN }}>
                    {daysError}{" "}
                    <button type="button" className="underline" onClick={() => loadDays(service)}>
                      Try again
                    </button>
                  </p>
                )}
                {days && (
                  <>
                    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-3 md:mx-0 md:px-0">
                      {days.map(d => {
                        const open = d.windows.some(w => w.open);
                        const active = d.date === date;
                        return (
                          <button
                            key={d.date}
                            type="button"
                            disabled={!open}
                            onClick={() => {
                              setDate(d.date);
                              setWindowKey("");
                            }}
                            className="flex w-20 shrink-0 flex-col items-center rounded-xl border-2 px-2 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                            style={{ borderColor: active ? P.pine : P.line, background: active ? P.limeSoft : P.paperBg, color: P.ink }}
                          >
                            <span className="font-bold">{bookingDateLabel(d.date).split(" ")[0]}</span>
                            <span>{bookingDateLabel(d.date).split(" ").slice(1).join(" ")}</span>
                            <span className="mt-1 text-[0.65rem] uppercase tracking-wide" style={{ color: P.inkSoft }}>
                              {open ? "Open" : "Full"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {!days.some(d => d.windows.some(w => w.open)) && (
                      <p className="mt-4 font-semibold" style={{ color: WARN }}>
                        No open times online right now — call {PHONE_DISPLAY} and we'll find you a spot.
                      </p>
                    )}
                    {selectedDay && (
                      <div className="mt-6">
                        <p className="mb-3 font-bold" style={{ color: P.ink }}>
                          {bookingDateLabel(selectedDay.date, true)}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {selectedDay.windows.map(w => (
                            <button
                              key={w.key}
                              type="button"
                              disabled={!w.open}
                              onClick={() => setWindowKey(w.key)}
                              className="rounded-xl border-2 px-4 py-4 text-left font-bold disabled:cursor-not-allowed disabled:opacity-40"
                              style={{ borderColor: windowKey === w.key ? P.pine : P.line, background: windowKey === w.key ? P.limeSoft : P.paperBg, color: P.ink }}
                            >
                              {w.label}
                              <span className="block text-xs font-normal" style={{ color: P.inkSoft }}>
                                {w.open ? (service.fullDay ? "Full-day move — we start in the morning" : "Arrival window") : "Unavailable"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="mt-8 flex flex-col gap-4">
                  <ErrorLine text={error} />
                  <PrimaryButton onClick={() => go("review")} disabled={!selectedWindow}>
                    Review my booking
                  </PrimaryButton>
                </div>
              </div>
            </>
          )}

          {step === "review" && service && price && selectedWindow && (
            <>
              <Heading title="Confirm your booking" sub="Check the details, then book." />
              <div className="mt-8 flex flex-col gap-4">
                <SummaryRow label="Service" value={service.name} />
                <SummaryRow label="Arriving" value={`${bookingDateLabel(date, true)}, between ${selectedWindow.label} (Arizona time)`} />
                {addresses.map((a, i) => (
                  <SummaryRow
                    key={i}
                    label={service.twoAddresses ? (i === 0 ? "Loading" : "Unloading") : "Address"}
                    value={`${a.street}${a.unit ? ` ${a.unit}` : ""}, ${a.city} ${a.zip} — ${a.flights ? `${a.flights} flight${a.flights > 1 ? "s" : ""} of stairs` : "no stairs"}${a.elevator ? ", elevator" : ""}`}
                  />
                ))}
                <SummaryRow label="Contact" value={`${contact.firstName} ${contact.lastName} · ${contact.phone} · ${contact.email}`} />
                {notes.trim() && <SummaryRow label="Notes" value={notes.trim()} />}
                <PriceBox price={price} />
                <div className="rounded-2xl p-5 text-sm leading-6" style={{ background: P.limeSoft, color: P.ink }}>
                  <p className="font-bold">${BOOKING_DEPOSIT} deposit holds your spot</p>
                  <p className="mt-1">
                    {cardDeposit
                      ? `Deposit payment only — next you'll pay $${BOOKING_DEPOSIT} plus a 3% card processing fee ($${BOOKING_DEPOSIT_CARD_FEE.toFixed(2)}), $${BOOKING_DEPOSIT_CARD_TOTAL.toFixed(2)} total, on our secure payment page. The rest is due after the job.`
                      : `We'll contact you shortly to collect a $${BOOKING_DEPOSIT} deposit.`}{" "}
                    It comes off your final bill, and it's fully refundable if you cancel at least {BOOKING_REFUND_HOURS} hours before your appointment.
                  </p>
                </div>
                <ErrorLine text={error} />
                <PrimaryButton onClick={() => void submit()} disabled={submitting}>
                  {submitting ? "Booking…" : cardDeposit ? `Book & pay $${BOOKING_DEPOSIT_CARD_TOTAL.toFixed(2)} deposit` : "Book my appointment"}
                </PrimaryButton>
              </div>
            </>
          )}

          {step === "done" && result && (
            <div className="mx-auto max-w-xl py-10 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: P.pine }}>
                Booking confirmed
              </p>
              <h1 className="font-display mt-3 text-4xl font-bold tracking-tight" style={{ color: P.pine }}>
                You're booked, {contact.firstName}!
              </h1>
              <p className="mt-4 text-base" style={{ color: P.inkSoft }}>
                We'll see you <strong style={{ color: P.ink }}>{result.arrival}</strong>. A confirmation is on its way to{" "}
                <strong style={{ color: P.ink }}>{contact.email}</strong>.
              </p>
              <p className="mt-4 text-base" style={{ color: P.inkSoft }}>
                We'll reach out shortly about your ${BOOKING_DEPOSIT} deposit. Questions or changes? Call or text{" "}
                <a href={PHONE_HREF} className="font-bold underline" style={{ color: P.pine }}>
                  {PHONE_DISPLAY}
                </a>
                . Booking {result.jobNumber}.
              </p>
            </div>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}

function todayIso() {
  return new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);
}

function priceLabel(s: BookingService) {
  const { weekday, weekend } = s.pricing;
  const unit = s.pricing.kind === "hourly" ? "/hr" : "";
  return weekday === weekend ? `$${weekday}${unit}` : `$${weekday}${unit} · $${weekend}${unit} weekends`;
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl" style={{ color: P.pine }}>
        {title}
      </h1>
      <p className="mt-3 text-base" style={{ color: P.inkSoft }}>
        {sub}
      </p>
    </>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="self-start rounded-xl px-10 py-4 text-lg font-bold shadow-lg transition-transform enabled:hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: P.lime, color: P.pine }}
    >
      {children}
    </button>
  );
}

function Field({ label, optional, className, children }: { label: string; optional?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-sm font-bold" style={{ color: P.ink }}>
        {label}{" "}
        {optional && (
          <span className="font-normal" style={{ color: P.inkSoft }}>
            (optional)
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function ErrorLine({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-sm font-semibold" style={{ color: WARN }}>
      {text}
    </p>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b pb-3 sm:flex-row sm:gap-4" style={{ borderColor: P.line }}>
      <span className="w-28 shrink-0 text-sm font-bold" style={{ color: P.inkSoft }}>
        {label}
      </span>
      <span className="text-base" style={{ color: P.ink }}>
        {value}
      </span>
    </div>
  );
}

function PriceBox({ price }: { price: ReturnType<typeof priceBooking> }) {
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: P.line, background: P.mist }}>
      {price.lines.map((line, i) => (
        <div key={i} className="flex justify-between gap-4 text-sm" style={{ color: P.ink }}>
          <span>
            {line.name}
            {line.quantity > 1 && !price.hourly ? ` × ${line.quantity}` : ""}
          </span>
          <span className="font-bold">${line.amount * line.quantity}</span>
        </div>
      ))}
      <p className="mt-3 text-sm font-bold" style={{ color: P.pine }}>
        {price.summary}
      </p>
    </div>
  );
}

function SomethingElse() {
  return (
    <Link
      href="/estimate"
      className="mt-6 block rounded-2xl border-2 border-dashed p-5"
      style={{ borderColor: P.line, color: P.ink }}
    >
      <span className="font-display block text-lg font-bold">Something else?</span>
      <span className="mt-1 block text-sm" style={{ color: P.inkSoft }}>
        Don't see your service? Tell us what you need and we'll text you a quote.
      </span>
    </Link>
  );
}
