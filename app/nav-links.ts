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

/**
 * The signed out header: the home page's sections, so a visitor from an
 * outreach email can find their way without scrolling the whole page (#237).
 * Each one has a test that its section exists.
 */
export const PUBLIC_LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#answers", label: "What it answers" },
  { href: "/#contracts", label: "Contracts" },
  { href: "/#limits", label: "Limits" },
] as const;

export const SOURCE_URL = "https://github.com/bharathmay-boop/invoice-ingester";

/**
 * The section a link points at when it is on the page already open, or null
 * when following it means going to another page. The phone menu scrolls to
 * the first itself, once its scroll lock has let go (#266).
 */
export function samePageSection(href: string, pathname: string): string | null {
  const [path, id] = href.split("#");
  return id && path === pathname ? id : null;
}
