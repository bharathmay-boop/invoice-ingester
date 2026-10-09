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
