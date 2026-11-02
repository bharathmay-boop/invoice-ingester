"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UploadKind } from "@/lib/upload-kind.ts";

const REMEMBERED = "upload-kind";

/**
 * One upload page for both kinds of document, with the kind picked by the
 * person rather than guessed from the file: they know what they are holding,
 * and a contract read as an invoice fails in a way that is hard to explain
 * (#150). The last choice is remembered in this browser, and the address
 * carries it so a link can open the right tab.
 */
export function UploadTabs({
  initial,
  explicit,
  invoices,
  contracts,
}: {
  initial: UploadKind;
  /** Whether the address named a kind, which wins over the remembered one. */
  explicit: boolean;
  invoices: React.ReactNode;
  contracts: React.ReactNode;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<UploadKind>(initial);
  // Follows the address when it changes (the remembered tab below, or back and
  // forward), set during render rather than by remounting, which would take
  // keyboard focus off the tab just chosen (Kimi K2.5 review on #291).
  const [shown, setShown] = useState(initial);
  if (initial !== shown) {
    setShown(initial);
    setKind(initial);
  }

  // Only when the address did not say: open the tab chosen last time by
  // putting it in the address, so the server renders it as chosen.
  useEffect(() => {
    if (explicit) return;
    try {
      if (localStorage.getItem(REMEMBERED) === "contract") {
        router.replace("/upload?kind=contract", { scroll: false });
      }
    } catch {
      // Storage can be blocked; the page works on its default.
    }
  }, [explicit, router]);

  function choose(value: string) {
    const next: UploadKind = value === "contract" ? "contract" : "invoice";
    setKind(next);
    try {
      localStorage.setItem(REMEMBERED, next);
    } catch {
      // Not remembered, which is fine.
    }
    router.replace(`/upload?kind=${next}`, { scroll: false });
  }

  return (
    <Tabs value={kind} onValueChange={choose} className="mt-8">
      <TabsList aria-label="Kind of document to upload">
        <TabsTrigger value="invoice">Invoices</TabsTrigger>
        <TabsTrigger value="contract">Contracts</TabsTrigger>
      </TabsList>
      <TabsContent value="invoice" className="mt-6">
        {invoices}
      </TabsContent>
      <TabsContent value="contract" className="mt-6">
        {contracts}
      </TabsContent>
    </Tabs>
  );
}
