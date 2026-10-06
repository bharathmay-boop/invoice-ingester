// The demo contracts, and the documents they were read from.
//
// The invoice side of the demo had thirteen invoices to look at and the
// contract side had an empty state, so every variance tag, the four coverage
// answers and the money behind them had nothing to show until somebody uploaded
// a contract and waited for a model.
//
// These are built to produce findings against the invoices already in
// `dataset.ts`, not to look tidy. Between them they cover:
//
//   billed_above_contract     paper and folders drifting up over the year
//   billed_below_contract     one invoice under the agreed rate, which is
//                             worth seeing because it is not always an error
//   matches_contract          the quiet answer, so the screen is not all red
//   not_in_contract           ink and staplers nobody put a rate against
//   outside_contract_period   one invoice before a contract starts, and a
//                             supplier whose contract lapsed in June
//   units_differ              markers agreed by the box and billed by the piece
//
// Sharma Paper and Board is deliberately left with no contract, so its lines
// carry no tag at all. Silence for an uncontracted supplier is a decision, and
// a demo where every supplier has a contract would not show it.
//
// Rates are inert until reviewed, so these are seeded reviewed: an unreviewed
// rate is invisible to `coverageFor` by design and would show nothing.
import { normalize } from "../items/normalize.ts";
import type { PdfPage } from "./contract-pdf.ts";

export type SeedRate = {
  /** What the contract calls it, which is not always what the catalogue does. */
  printedName: string;
  /** The catalogue item, by its normalized name, or null to leave it unmatched. */
  item: string | null;
  rate: number;
  unit: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** The page the line is printed on, and the line itself, word for word. */
  page: number;
  quote: string;
};

export type SeedContract = {
  /** The supplier, by the GSTIN used in `dataset.ts`. */
  gstin: string;
  title: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  rates: SeedRate[];
  otherTerms: { kind: string; label: string; summary: string; page: number; quote: string }[];
  pages: PdfPage[];
};

/** Columns held by spaces, which is how a rate card is actually printed. */
function row(name: string, unit: string, rate: string): string {
  return `${name.padEnd(34)}${unit.padEnd(14)}${rate}`;
}

const ACME_RATES = [
  row("A4 Paper 500 Sheets", "ream", "265.00"),
  row("Stapler HD-45", "piece", "320.00"),
];
const ACME_REVISION = row("A4 Paper 500 Sheets", "ream", "285.00");

const NANDI_RATES = [
  row("Paper, A4, 1 ream", "ream", "260.00"),
  row("File Folder A4", "piece", "22.00"),
];

const VIDYA_RATES = [
  row("Whiteboard Marker Black", "box of 10", "420.00"),
  row("Sticky Notes 3x3", "pad", "31.00"),
  row("Envelope DL White", "piece", "2.40"),
];

export const contracts: SeedContract[] = [
  {
    gstin: "29AABCA1234F1Z5",
    title: "Acme Traders rate contract 2026-27",
    effectiveFrom: "2026-04-01",
    effectiveTo: "2027-03-31",
    // Two periods for paper, because a contract that raises a rate partway
    // through is the ordinary case and the lookup is built around it: the
    // later of two overlapping rates wins on the invoice date.
    rates: [
      {
        printedName: "A4 Paper 500 Sheets",
        item: normalize("A4 Paper 500 Sheets"),
        rate: 265,
        unit: "ream",
        effectiveFrom: "2026-04-01",
        effectiveTo: "2026-08-31",
        page: 1,
        quote: ACME_RATES[0],
      },
      {
        printedName: "A4 Paper 500 Sheets",
        item: normalize("A4 Paper 500 Sheets"),
        rate: 285,
        unit: "ream",
        effectiveFrom: "2026-09-01",
        effectiveTo: "2027-03-31",
        page: 2,
        quote: ACME_REVISION,
      },
      {
        printedName: "Stapler HD-45",
        item: normalize("Stapler HD-45"),
        rate: 320,
        unit: "piece",
        effectiveFrom: "2026-04-01",
        effectiveTo: "2027-03-31",
        page: 1,
        quote: ACME_RATES[1],
      },
    ],
    otherTerms: [
      {
        kind: "escalation",
        label: "Revision of paper rate",
        summary: "The A4 paper rate rises to 285.00 per ream from 1 September 2026.",
        page: 2,
        quote: "The rate for A4 Paper 500 Sheets is revised to 285.00 per ream",
      },
    ],
    pages: [
      [
        "RATE CONTRACT 2026-27",
        "",
        "Supplier: Acme Traders Pvt Ltd, 14 Residency Road, Bengaluru 560025",
        "GSTIN: 29AABCA1234F1Z5",
        "",
        "Term: 1 April 2026 to 31 March 2027",
        "All rates in INR, exclusive of GST.",
        "",
        "SCHEDULE 1 - AGREED RATES",
        "",
        row("Item", "Unit", "Rate"),
        ...ACME_RATES,
        "",
        "Rates in Schedule 1 hold for the term unless revised in writing.",
        "Items not listed above are not covered by this contract.",
      ],
      [
        "REVISION LETTER 1",
        "",
        "To: Acme Traders Pvt Ltd",
        "Reference: Rate Contract 2026-27",
        "",
        "The rate for A4 Paper 500 Sheets is revised to 285.00 per ream",
        "with effect from 1 September 2026. All other rates and terms are",
        "unchanged.",
        "",
        row("Item", "Unit", "Rate"),
        ACME_REVISION,
      ],
    ],
  },
  {
    gstin: "29AACFN5678G1Z2",
    title: "Nandi Stationers supply agreement, first half",
    effectiveFrom: "2026-03-01",
    // Ends in June and is never renewed, so the August and September invoices
    // come out as billed after the contract lapsed. That answer needs no
    // correct rate to be right, which makes it the sturdiest finding here and
    // the one most easily missed in real buying.
    effectiveTo: "2026-06-30",
    rates: [
      {
        printedName: "Paper, A4, 1 ream",
        item: normalize("A4 Paper 500 Sheets"),
        rate: 260,
        unit: "ream",
        effectiveFrom: "2026-03-01",
        effectiveTo: "2026-06-30",
        page: 1,
        quote: NANDI_RATES[0],
      },
      {
        printedName: "File Folder A4",
        item: normalize("File Folder A4"),
        rate: 22,
        unit: "piece",
        effectiveFrom: "2026-03-01",
        effectiveTo: "2026-06-30",
        page: 1,
        quote: NANDI_RATES[1],
      },
    ],
    otherTerms: [
      {
        kind: "other",
        label: "Renewal",
        summary: "The agreement ends on 30 June 2026 and renews only in writing.",
        page: 1,
        quote: "This agreement ends on 30 June 2026 and renews only in writing.",
      },
    ],
    pages: [
      [
        "SUPPLY AGREEMENT",
        "",
        "Supplier: Nandi Stationers, 3rd Cross, Malleshwaram, Bengaluru 560003",
        "GSTIN: 29AACFN5678G1Z2",
        "",
        "Term: 1 March 2026 to 30 June 2026",
        "All rates in INR, exclusive of GST.",
        "",
        "AGREED RATES",
        "",
        row("Item", "Unit", "Rate"),
        ...NANDI_RATES,
        "",
        "This agreement ends on 30 June 2026 and renews only in writing.",
      ],
    ],
  },
  {
    gstin: "29AAECV3456J1Z4",
    title: "Vidya Office Supplies price list 2026",
    effectiveFrom: "2026-04-01",
    effectiveTo: null,
    rates: [
      {
        printedName: "Whiteboard Marker Black",
        item: normalize("Whiteboard Marker Black"),
        // Agreed by the box and billed by the piece. A box of ten is a pack
        // size, not a unit anything can convert, so the check refuses to
        // compare rather than dividing by a number it guessed.
        rate: 420,
        unit: "box of 10",
        effectiveFrom: "2026-04-01",
        effectiveTo: null,
        page: 1,
        quote: VIDYA_RATES[0],
      },
      {
        printedName: "Sticky Notes 3x3",
        item: normalize("Sticky Notes 3x3"),
        rate: 31,
        unit: "pad",
        effectiveFrom: "2026-04-01",
        effectiveTo: null,
        page: 1,
        quote: VIDYA_RATES[1],
      },
      {
        printedName: "Envelope DL White",
        item: normalize("Envelope DL White"),
        rate: 2.4,
        unit: "piece",
        effectiveFrom: "2026-04-01",
        effectiveTo: null,
        page: 1,
        quote: VIDYA_RATES[2],
      },
    ],
    otherTerms: [
      {
        kind: "other",
        label: "Open ended",
        summary: "The price list applies from 1 April 2026 until replaced.",
        page: 1,
        quote: "This price list applies from 1 April 2026 until replaced.",
      },
    ],
    pages: [
      [
        "PRICE LIST 2026",
        "",
        "Supplier: Vidya Office Supplies, Jayanagar 4th Block, Bengaluru 560011",
        "GSTIN: 29AAECV3456J1Z4",
        "",
        "All rates in INR, exclusive of GST.",
        "",
        row("Item", "Unit", "Rate"),
        ...VIDYA_RATES,
        "",
        "This price list applies from 1 April 2026 until replaced.",
        "Markers are supplied in boxes of ten and are not sold singly.",
      ],
    ],
  },
];
