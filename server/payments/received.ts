import { z } from "zod";
const money = z
  .number()
  .finite()
  .min(0)
  .max(999999.99)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001);
export const receivedPaymentInput = z.object({
  requestId: z.string().uuid(),
  invoiceId: z.string().trim().min(1).max(200),
  method: z.enum(["Zelle", "Cash", "Check", "Offline Credit Card", "ACH"]),
  amount: money.refine(value => value > 0),
  expectedPaid: money,
  receivedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(value => {
      const parsed = new Date(value + "T12:00:00Z");
      return (
        Number.isFinite(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
      );
    }),
  reference: z.string().trim().min(1).max(200),
});
