import { asExtraction, build, vendors, type Draft } from "./dataset.ts";
import { validateArithmetic } from "../extract/validate.ts";

/**
 * The invoice the demo leaves waiting for review (#206).
 *
 * Its total is higher than its lines and taxes add up to, so the review
 * screen has a discrepancy to show and a reason for the draft to be there
 * instead of already saved. The discrepancy is found by the same check the
 * upload route runs, not typed in.
 */
const DRAFT: Draft = {
  gstin: "29AAECV3456J1Z4",
  number: "VOS/3307",
  date: "2026-09-29",
  brokenTotal: 9_000,
  lines: [
    { description: "A4 Copier Paper 75 GSM (Ream)", itemCode: null, quantity: 20, unit: "ream", unitPrice: 295 },
    { description: "Whiteboard Marker Black", itemCode: null, quantity: 24, unit: "pcs", unitPrice: 38 },
    { description: "Stapler HD-45", itemCode: null, quantity: 3, unit: "pcs", unitPrice: 165 },
  ],
};

export function demoDraft() {
  const invoice = build(DRAFT);
  const vendor = vendors.find((v) => v.gstin === invoice.gstin)!;
  const extracted = {
    ...asExtraction(invoice),
    vendor_name: vendor.name,
    vendor_address: vendor.address,
  };
  const { discrepancies } = validateArithmetic(extracted);
  return { invoice, vendor, extracted, discrepancies };
}

const pad = (text: string, width: number) => text.slice(0, width).padEnd(width);
const money = (n: number) => n.toFixed(2).padStart(10);

/** What the image says, so the document and the fields beside it agree. */
export function draftText(): string[] {
  const { invoice, vendor } = demoDraft();
  return [
    "TAX INVOICE",
    "",
    vendor.name,
    vendor.address,
    `GSTIN ${invoice.gstin}`,
    "",
    `INVOICE NO ${invoice.number}`,
    `DATE ${invoice.date}`,
    "",
    `${pad("DESCRIPTION", 34)}${"QTY".padStart(5)}${"RATE".padStart(10)}${"AMOUNT".padStart(11)}`,
    ...invoice.lines.map(
      (l) =>
        `${pad(l.description, 34)}${String(l.quantity).padStart(5)}${money(l.unitPrice)}${money(l.amount)} `,
    ),
    "",
    `${pad("SUBTOTAL", 49)}${money(invoice.subtotal)} `,
    ...invoice.taxes.map((t) => `${pad(t.label, 49)}${money(t.amount)} `),
    `${pad("TOTAL", 49)}${money(invoice.total)} `,
  ];
}
