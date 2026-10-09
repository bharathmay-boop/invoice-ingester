"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "all";

/**
 * Supplier and date range, kept in the address so a filtered list can be
 * bookmarked or sent, and so the back button does what it says. Changing one
 * applies it straight away; there is nothing to submit.
 */
export function InvoiceFilters({
  vendors,
  vendorId,
  from,
  to,
}: {
  vendors: { id: string; name: string }[];
  vendorId: string | null;
  from: string | null;
  to: string | null;
}) {
  const router = useRouter();

  // What the controls show. Held here rather than read from the address, which
  // only catches up when a navigation finishes: pick a supplier and change a
  // date before then, and the second URL would be built from stale props and
  // drop the supplier. The address still wins when it changes, so the back
  // button and Clear are followed.
  const [sel, setSel] = useState({ vendor: vendorId, from, to });
  const [seen, setSeen] = useState(`${vendorId}|${from}|${to}`);
  if (seen !== `${vendorId}|${from}|${to}`) {
    setSeen(`${vendorId}|${from}|${to}`);
    setSel({ vendor: vendorId, from, to });
  }

  function apply(next: Partial<typeof sel>) {
    const merged = { ...sel, ...next };
    setSel(merged);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    router.push(query ? `/invoices?${query}` : "/invoices");
  }

  const filtered = Boolean(sel.vendor || sel.from || sel.to);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invoice-vendor" className="text-xs font-normal">
          Supplier
        </Label>
        <Select
          value={sel.vendor ?? ALL}
          onValueChange={(value) => apply({ vendor: value === ALL ? null : value })}
        >
          <SelectTrigger id="invoice-vendor" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All suppliers</SelectItem>
            {vendors.map((vendor) => (
              <SelectItem key={vendor.id} value={vendor.id}>
                {vendor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invoice-from" className="text-xs font-normal">
          From
        </Label>
        <Input
          id="invoice-from"
          type="date"
          value={sel.from ?? ""}
          onChange={(event) => apply({ from: event.target.value || null })}
          className="w-40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invoice-to" className="text-xs font-normal">
          To
        </Label>
        <Input
          id="invoice-to"
          type="date"
          value={sel.to ?? ""}
          onChange={(event) => apply({ to: event.target.value || null })}
          className="w-40"
        />
      </div>

      {filtered && (
        <Link href="/invoices" className="pb-2 text-sm underline underline-offset-4">
          Clear
        </Link>
      )}
    </div>
  );
}
