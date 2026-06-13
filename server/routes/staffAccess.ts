/**
 * Office (staff) access API — Express mount (legacy/local server path).
 *
 * POST /api/staff  with { action, ... }. All logic lives in
 * server/staffAccess.ts (shared with the Vite dev middleware). The deployed
 * static site uses the Vercel function api/staff.ts instead (a self-contained
 * copy — keep it in sync).
 */

import { Router } from "express";
import { handleStaffAction } from "../staffAccess";

export const staffAccessRouter = Router();

staffAccessRouter.post("/", async (req, res) => {
  const { status, body } = await handleStaffAction(req.body);
  res.status(status).json(body);
});
