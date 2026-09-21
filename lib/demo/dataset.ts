// The demo dataset. This is what a logged out visitor lands on, so it has to
// read like a real year of buying rather than lorem ipsum: the same paper
// bought from two vendors at drifting prices, one invoice that does not add up,
// and enough dates that a trend line is a line.
//
// Figures are computed from quantity and unit price rather than typed twice, so
// the dataset cannot contradict itself. The one invoice that is meant to
// disagree says so explicitly.
import { normalize } from "../items/normalize.ts";

/** Karnataka. A vendor in another state bills IGST instead of CGST and SGST. */
const HOME_STATE = "29";

export type SeedVendor = {
  gstin: string;
  name: string;
  address: string;
};

export const vendors: SeedVendor[] = [
  {
    gstin: "29AABCA1234F1Z5",
    name: "Acme Traders Pvt Ltd",
    address: "14 Residency Road, Bengaluru 560025",
  },
  {
    gstin: "29AACFN5678G1Z2",
    name: "Nandi Stationers",
    address: "3rd Cross, Malleshwaram, Bengaluru 560003",
  },
  {
    gstin: "07AAGCS9012H1Z8",
    name: "Sharma Paper and Board",
    address: "Chawri Bazar, Delhi 110006",
  },
  {
    gstin: "29AAECV3456J1Z4",
    name: "Vidya Office Supplies",
    address: "Jayanagar 4th Block, Bengaluru 560011",
  },
];

type Line = {
  description: string;
  hsn: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
};

type Draft = {
  gstin: string;
  number: string;
  date: string;
  lines: Line[];
  /** Set only on the invoice that is meant to fail its arithmetic check. */
  brokenTotal?: number;
};

// Descriptions vary the way real invoices do. Every spelling of the paper here
// normalises to the same key, which is the point.
const drafts: Draft[] = [
  {
    gstin: "29AABCA1234F1Z5",
    number: "INV-8021",
    date: "2026-03-04",
    lines: [
      { description: "A4 Paper 500 Sheets", hsn: "4802", quantity: 20, unit: "ream", unitPrice: 262 },
      { description: "Ballpoint Pen Blue (Pack of 10)", hsn: "9608", quantity: 15, unit: "pack", unitPrice: 84 },
    ],
  },
  {
    gstin: "29AACFN5678G1Z2",
    number: "NS/0884",
    date: "2026-03-18",
    lines: [
      { description: "Paper, A4, 1 ream", hsn: "4802", quantity: 30, unit: "ream", unitPrice: 258 },
      { description: "File Folder A4", hsn: "4820", quantity: 50, unit: "pc", unitPrice: 22 },
    ],
  },
  {
    gstin: "07AAGCS9012H1Z8",
    number: "SPB/2026/114",
    date: "2026-04-02",
    lines: [
      { description: "A4 PAPER (500 sheets)", hsn: "4802", quantity: 40, unit: "ream", unitPrice: 254 },
      { description: "Envelope DL White", hsn: "4817", quantity: 500, unit: "pc", unitPrice: 2.4 },
    ],
  },
  {
    gstin: "29AAECV3456J1Z4",
    number: "VOS-311",
    date: "2026-04-21",
    lines: [
      { description: "Whiteboard Marker Black", hsn: "9608", quantity: 24, unit: "pc", unitPrice: 38 },
      { description: "Sticky Notes 3x3", hsn: "4820", quantity: 40, unit: "pad", unitPrice: 31 },
      { description: "Stapler HD-45", hsn: "8305", quantity: 4, unit: "pc", unitPrice: 320 },
    ],
  },
  {
    gstin: "29AABCA1234F1Z5",
    number: "INV-8155",
    date: "2026-05-11",
    lines: [
      { description: "Ink Cartridge 803B", hsn: "8443", quantity: 6, unit: "pc", unitPrice: 545 },
      { description: "A4 Paper 500 Sheets", hsn: "4802", quantity: 10, unit: "ream", unitPrice: 271 },
    ],
  },
  {
    gstin: "29AACFN5678G1Z2",
    number: "NS/0991",
    date: "2026-06-08",
    lines: [
      { description: "Paper, A4, 1 ream", hsn: "4802", quantity: 25, unit: "ream", unitPrice: 265 },
      { description: "Ballpoint Pen Blue (Pack of 10)", hsn: "9608", quantity: 20, unit: "pack", unitPrice: 86 },
      { description: "File Folder A4", hsn: "4820", quantity: 60, unit: "pc", unitPrice: 23 },
    ],
  },
  {
    gstin: "29AABCA1234F1Z5",
    number: "INV-8402",
    date: "2026-07-02",
    lines: [
      { description: "A4 Paper 500 Sheets", hsn: "4802", quantity: 20, unit: "ream", unitPrice: 279 },
      { description: "Stapler HD-45", hsn: "8305", quantity: 2, unit: "pc", unitPrice: 330 },
    ],
  },
  {
    gstin: "07AAGCS9012H1Z8",
    number: "SPB/2026/288",
    date: "2026-07-19",
    lines: [
      { description: "A4 PAPER (500 sheets)", hsn: "4802", quantity: 50, unit: "ream", unitPrice: 268 },
    ],
  },
  {
    gstin: "29AAECV3456J1Z4",
    number: "VOS-407",
    date: "2026-08-05",
    lines: [
      { description: "Ink Cartridge 803B", hsn: "8443", quantity: 4, unit: "pc", unitPrice: 559 },
      { description: "Whiteboard Marker Black", hsn: "9608", quantity: 36, unit: "pc", unitPrice: 39 },
    ],
  },
  {
    gstin: "29AACFN5678G1Z2",
    number: "NS/1129",
    date: "2026-08-18",
    lines: [
      { description: "Paper, A4, 1 ream", hsn: "4802", quantity: 20, unit: "ream", unitPrice: 262 },
      { description: "Sticky Notes 3x3", hsn: "4820", quantity: 25, unit: "pad", unitPrice: 33 },
    ],
  },
  {
    gstin: "29AABCA1234F1Z5",
    number: "INV-8841",
    date: "2026-09-04",
    lines: [
      { description: "A4 Paper 500 Sheets", hsn: "4802", quantity: 10, unit: "ream", unitPrice: 285 },
      { description: "Stapler HD-45", hsn: "8305", quantity: 2, unit: "pc", unitPrice: 320 },
      { description: "Ink Cartridge 803B", hsn: "8443", quantity: 3, unit: "pc", unitPrice: 545 },
    ],
  },
  {
    gstin: "29AAECV3456J1Z4",
    number: "VOS-455",
    date: "2026-09-12",
    lines: [
      { description: "File Folder A4", hsn: "4820", quantity: 40, unit: "pc", unitPrice: 24 },
      { description: "Envelope DL White", hsn: "4817", quantity: 300, unit: "pc", unitPrice: 2.5 },
    ],
  },
  {
    // The one that does not add up. A model read the total off a smudged line
    // and got it wrong by Rs450, which is exactly the case needs_review exists
    // for: nothing else in the system would have said a word.
    gstin: "29AACFN5678G1Z2",
    number: "NS/1207",
    date: "2026-09-16",
    lines: [
      { description: "Paper, A4, 1 ream", hsn: "4802", quantity: 15, unit: "ream", unitPrice: 264 },
      { description: "Ballpoint Pen Blue (Pack of 10)", hsn: "9608", quantity: 10, unit: "pack", unitPrice: 88 },
    ],
    brokenTotal: 5_000,
  },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export type SeedLineItem = {
  description: string;
  normalizedName: string;
  hsn: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
};

export type SeedInvoice = {
  gstin: string;
  number: string;
  date: string;
  lines: SeedLineItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  status: "confirmed" | "needs_review";
};

function build(draft: Draft): SeedInvoice {
  const lines = draft.lines.map((line) => ({
    description: line.description,
    normalizedName: normalize(line.description),
    hsn: line.hsn,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unitPrice,
    amount: round2(line.quantity * line.unitPrice),
  }));

  const subtotal = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  const interState = !draft.gstin.startsWith(HOME_STATE);

  const cgst = interState ? 0 : round2(subtotal * 0.09);
  const sgst = interState ? 0 : round2(subtotal * 0.09);
  const igst = interState ? round2(subtotal * 0.18) : 0;

  return {
    gstin: draft.gstin,
    number: draft.number,
    date: draft.date,
    lines,
    subtotal,
    cgst,
    sgst,
    igst,
    total: draft.brokenTotal ?? round2(subtotal + cgst + sgst + igst),
    status: draft.brokenTotal ? "needs_review" : "confirmed",
  };
}

export const invoices: SeedInvoice[] = drafts.map(build);

/**
 * The catalogue, built from the descriptions rather than listed separately, so
 * it cannot drift from what the invoices actually say. The first spelling seen
 * becomes the display name.
 */
export const items = (() => {
  // A Map built from pairs keeps the LAST value for a repeated key, so the
  // entries are added explicitly to keep the first spelling instead.
  const seen = new Map<string, { canonicalName: string; normalizedName: string }>();
  for (const line of invoices.flatMap((i) => i.lines)) {
    if (!seen.has(line.normalizedName)) {
      seen.set(line.normalizedName, {
        canonicalName: line.description,
        normalizedName: line.normalizedName,
      });
    }
  }
  return [...seen.values()];
})();
