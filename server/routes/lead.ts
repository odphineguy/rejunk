/**
 * Website lead API (Express, legacy/local server path).
 * POST /api/lead — email an estimate request from the public /estimate page.
 */

import { Router } from "express";
import {
  leadRateLimited,
  processLead,
  validateLeadPayload,
} from "../leadEmail";

export const leadRouter = Router();

leadRouter.post("/", async (req, res) => {
  const lead = validateLeadPayload(req.body);
  if (!lead) {
    res
      .status(400)
      .json({
        error: "A name, phone number, and at least one service are required.",
      });
    return;
  }
  // Honeypot hit: pretend success so bots don't learn the field exists.
  if (lead.isBot) {
    res.json({ sent: true, recorded: true });
    return;
  }
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(",")[0]
    )?.trim() ||
    req.ip ||
    "unknown";
  if (leadRateLimited(ip)) {
    res
      .status(429)
      .json({ error: "Please wait before sending another request." });
    return;
  }
  const result = await processLead(lead);
  if (result.emailError)
    console.error("[lead-api] Email failed:", result.emailError);
  if (result.crmError) console.error("[lead-api] CRM failed:", result.crmError);
  if (!result.recorded) {
    res
      .status(502)
      .json({ error: "The request could not be saved. Please try again." });
    return;
  }
  res.json({ sent: result.sent, recorded: true });
});
