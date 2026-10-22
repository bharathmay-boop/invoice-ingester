import type { SessionRole } from "@/lib/auth.ts";

/**
 * The main navigation, in the order it reads. Kept apart from the component so
 * a test can hold it, since the nav is a client component that cannot be loaded
 * outside Next.
 *
 * Findings has its own entry because it is the output of the contract check: a
 * held invoice nobody can find is the same as no check at all (#120).
 */
export const NAV_LINKS = [
  { href: "/upload", label: "Upload" },
  { href: "/items", label: "Items" },
  { href: "/invoices", label: "Invoices" },
  { href: "/contracts", label: "Contracts" },
  { href: "/vendors", label: "Vendors" },
  { href: "/suggestions", label: "Suggestions" },
  { href: "/findings", label: "Findings" },
] as const;

/** Entries that carry a count of things waiting on a person. */
export const COUNTED = new Set<string>(["/suggestions", "/findings"]);

const SETTINGS = { href: "/settings", label: "Settings" } as const;

/**
 * What the nav offers each kind of session. Signed out, none of these exist:
 * the proxy sends every one of them to the sign in page. The demo reads
 * everything but gets neither Upload, which would only refuse it, nor
 * Settings, which the proxy sends it away from (#234).
 */
export function linksFor(role: SessionRole | null) {
  if (role === "owner") return [...NAV_LINKS, SETTINGS];
  if (role === "demo") return NAV_LINKS.filter((link) => link.href !== "/upload");
  return [];
}
