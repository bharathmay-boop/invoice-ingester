import { money } from "@/lib/format.ts";

/**
 * The hero. Not a screenshot of the product, and not a headline number: the
 * thing the product operates on, with one figure failing its check.
 *
 * Leading with a failure is the deliberate choice here. The whole claim is that
 * a number which does not add up gets held rather than quietly counted, and
 * that is easier to show on a broken invoice than to assert in a sentence.
 *
 * Every figure is set in the mono face, which is the vernacular of the document
 * it is imitating.
 */
export function InvoiceSpecimen() {
  const lines = [
    { description: "A4 Paper 500 Sheets", hsn: "4802", qty: "10", rate: 285, amount: 2850 },
    { description: "Stapler HD-45", hsn: "8305", qty: "2", rate: 320, amount: 640 },
    { description: "Ink Cartridge 803B", hsn: "8443", qty: "3", rate: 1090, amount: 3270 },
  ];
  const lineTotal = 6760;
  const statedSubtotal = 6640;

  return (
    <figure className="border-border bg-card rounded-xl border shadow-sm">
      <figcaption className="border-border flex items-baseline justify-between gap-3 border-b px-5 py-3">
        <span className="text-sm font-medium">Acme Traders Pvt Ltd</span>
        <span className="text-muted-foreground font-mono text-xs">INV-8841</span>
      </figcaption>

      <div className="border-border grid grid-cols-2 gap-x-4 gap-y-2 border-b px-5 py-3 sm:grid-cols-3">
        <Field label="GSTIN" value="29AABCA1234F1Z5" />
        <Field label="Date" value="04 Sep 2026" />
        <Field label="Place of supply" value="Karnataka" />
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">Line items on invoice INV-8841</caption>
        <thead>
          <tr className="text-muted-foreground text-[11px] uppercase tracking-wide">
            <th scope="col" className="px-5 py-2 text-left font-medium">Particulars</th>
            <th scope="col" className="hidden py-2 text-left font-medium sm:table-cell">HSN</th>
            <th scope="col" className="py-2 text-right font-medium">Qty</th>
            <th scope="col" className="px-5 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.hsn} className="border-border/60 border-t">
              <td className="px-5 py-2">{line.description}</td>
              <td className="hidden py-2 font-mono text-xs sm:table-cell">{line.hsn}</td>
              <td className="py-2 text-right font-mono tabular-nums">{line.qty}</td>
              <td className="px-5 py-2 text-right font-mono tabular-nums">
                {line.amount.toLocaleString("en-IN")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-border border-t px-5 py-3">
        {/* The disagreement, shown rather than described. */}
        <div className="flex items-baseline justify-between gap-3 rounded-lg bg-amber-500/10 px-3 py-2 ring-1 ring-amber-500/40">
          <span className="text-sm">
            Subtotal
            <span className="text-muted-foreground ml-2 text-xs">as printed</span>
          </span>
          <span className="font-mono tabular-nums text-amber-800 line-through dark:text-amber-300">
            {statedSubtotal.toLocaleString("en-IN")}
          </span>
        </div>
        <p className="mt-2 px-3 text-xs text-amber-800 dark:text-amber-300">
          The line items come to {money(lineTotal)}. This invoice is held, not counted.
        </p>

        <dl className="mt-3 space-y-1 px-3 text-sm">
          <Total label="CGST 9%" value="608.40" muted />
          <Total label="SGST 9%" value="608.40" muted />
          <Total label="Total" value="7,976.80" />
        </dl>
      </div>
    </figure>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 font-mono text-xs">{value}</dd>
    </div>
  );
}

function Total({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? "text-muted-foreground" : "font-medium"}>{label}</dt>
      <dd className={`font-mono tabular-nums ${muted ? "text-muted-foreground" : "font-medium"}`}>
        {value}
      </dd>
    </div>
  );
}
