import { invoicePayment, paymentWebhook } from "./service";
import { PaymentError } from "./core";

export async function readPaymentBody(req: AsyncIterable<Buffer | string>) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 256 * 1024) throw new PaymentError(413, "Request too large.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export async function dispatchPaymentRequest(
  req: any,
  res: any,
  webhook = false
) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  const send = (status: number, data: unknown) => {
    res.statusCode = status;
    res.end(JSON.stringify(data));
  };
  if (req.method !== "POST") return send(405, { error: "Use POST." });
  try {
    // Do not access Vercel's lazy req.body helper: signature verification
    // needs the original stream, and these routes run before Express parsers.
    const raw = await readPaymentBody(req);
    if (webhook) {
      const signature = req.headers["stripe-signature"];
      if (typeof signature !== "string")
        throw new PaymentError(400, "Stripe signature required.");
      return send(200, await paymentWebhook(raw, signature));
    }
    let body;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new PaymentError(400, "Invalid JSON.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new PaymentError(400, "Invalid request.");
    return send(200, await invoicePayment(body));
  } catch (error) {
    // Never echo credentials, Stripe request objects or customer records.
    send(error instanceof PaymentError ? error.status : 503, {
      error:
        error instanceof PaymentError
          ? error.message
          : "Payment service unavailable. Try again shortly.",
    });
  }
}
