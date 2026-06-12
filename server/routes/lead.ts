/**
 * Website lead API (Express, legacy/local server path).
 * POST /api/lead — email an estimate request from the public /estimate page.
 */

import { Router } from "express";
import { sendLeadEmail, validateLeadPayload } from "../leadEmail";

export const leadRouter = Router();

leadRouter.post("/", async (req, res) => {
  const lead = validateLeadPayload(req.body);
  if (!lead) {
    res.status(400).json({ error: "A name, phone number, and at least one service are required." });
    return;
  }
  // Honeypot hit: pretend success so bots don't learn the field exists.
  if (lead.isBot) {
    res.json({ sent: true });
    return;
  }
  const result = await sendLeadEmail(lead);
  if (!result.sent) {
    res.status(502).json({ error: result.error ?? "The lead email could not be sent." });
    return;
  }
  res.json({ sent: true });
});
