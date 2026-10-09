import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isValidSession, sessionCookie } from "@/lib/auth.ts";
import { getInvoice } from "@/lib/invoices/queries.ts";
import { isUuid } from "@/lib/invoices/filter.ts";
import { TAGS } from "@/lib/contracts/tags.ts";
import type { Tag } from "@/lib/contracts/variance.ts";
import { formatDate, money, unitMoney } from "@/lib/format.ts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DemoNotice, Page, StatusBadge } from "../../ui.tsx";
import { InvoiceOriginal } from "../../invoice-original.tsx";

export const dynamic = "force-dynamic";

export const metadata = { title: "Invoice" };

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // A bad id in the URL is a 404, not a crash.
  if (!isUuid(id)) notFound();

  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  const jar = await cookies();
  const signedIn = await isValidSession(jar.get(sessionCookie.name)?.value);
  const dated = formatDate(invoice.invoice_date);

  return (
    <Page title={`Invoice ${invoice.invoice_number}`} lead={`${invoice.vendor_name}, ${dated}`}>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={invoice.status} />
        {signedIn && (
          <InvoiceOriginal
            invoiceNumber={invoice.invoice_number}
            date={dated}
            blobUrl={invoice.blob_url}
            contentType={invoice.content_type}
            firstPage={invoice.first_page}
          />
        )}
        <Link href={`/vendors/${invoice.vendor_id}`} className="text-sm underline underline-offset-4">
          {invoice.vendor_name}
        </Link>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Lines</h2>
      {invoice.lines.length === 0 ? (
        <p className="mt-2 text-sm opacity-70">This invoice was saved with no lines.</p>
      ) : (
        <Table className="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Check</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.lines.map((line) => {
              const tag = line.variance_tag ? TAGS[line.variance_tag as Tag] : undefined;
              const flagged = line.variance_tag !== null && line.variance_tag !== "matches_contract";
              return (
                <TableRow key={line.id}>
                  <TableCell className="whitespace-normal">
                    <span className="block">{line.raw_description}</span>
                    {line.item_id && line.item_name ? (
                      <Link
                        href={`/items/${line.item_id}`}
                        className="text-xs underline underline-offset-4 opacity-70"
                      >
                        {line.item_name}
                      </Link>
                    ) : (
                      <span className="text-xs opacity-60">Not matched to an item</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.quantity}
                    {line.unit && <span className="opacity-60"> {line.unit}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {unitMoney(line.unit_price, invoice.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(line.amount, invoice.currency)}
                  </TableCell>
                  <TableCell>
                    {flagged && tag ? (
                      <Link href={`/findings/${line.id}`} className="text-xs underline underline-offset-4">
                        {tag.label}
                      </Link>
                    ) : tag ? (
                      <span className="text-xs opacity-60">{tag.label}</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <dl className="mt-6 ml-auto flex max-w-sm flex-col gap-1.5 text-sm">
        <div className="flex justify-between gap-6">
          <dt className="opacity-70">Subtotal</dt>
          <dd className="tabular-nums">{money(invoice.subtotal, invoice.currency)}</dd>
        </div>
        {invoice.taxes.map((tax, index) => (
          <div key={`tax-${index}`} className="flex justify-between gap-6">
            <dt className="opacity-70">
              {tax.label}
              {tax.included && <span className="text-xs"> (already in the prices)</span>}
            </dt>
            <dd className="tabular-nums">{money(tax.amount, invoice.currency)}</dd>
          </div>
        ))}
        {invoice.adjustments.map((adjustment, index) => (
          <div key={`adj-${index}`} className="flex justify-between gap-6">
            <dt className="opacity-70">{adjustment.label}</dt>
            <dd className="tabular-nums">{money(adjustment.amount, invoice.currency)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-6 border-t border-black/10 pt-1.5 font-semibold dark:border-white/15">
          <dt>Total</dt>
          <dd className="tabular-nums">{money(invoice.total, invoice.currency)}</dd>
        </div>
      </dl>

      <p className="mt-8 text-sm">
        <Link href="/invoices" className="underline underline-offset-4">
          All invoices
        </Link>
      </p>
      <DemoNotice />
    </Page>
  );
}
