import { onlyDemoData } from "@/lib/demo/notice.ts";

/**
 * Said while the data is still the seeded demo, and gone once it is not
 * (#158). In its own file so the shared ui.tsx never pulls a server-only
 * database read into a client component that imports it (Kimi K2.5, #288).
 */
export async function DemoNotice() {
  if (!(await onlyDemoData())) return null;
  return <p className="mt-8 text-xs opacity-60">These are seeded demo invoices, not anyone&rsquo;s real spending.</p>;
}
