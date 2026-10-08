// Vendor identity needs stable comparison forms for values that are printed
// differently on otherwise matching invoices. The printed values are retained
// separately so these functions never change what a person sees.

/** Remove presentation differences without changing the registration itself. */
export function normalizeTaxId(taxId: string): string {
  return taxId.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

/** Make address spelling and spacing irrelevant while preserving its words. */
export function normalizeAddress(address: string): string {
  return collapse(address);
}

/** Make supplier name punctuation, case and spacing irrelevant. */
export function normalizeName(name: string): string {
  return collapse(name);
}

function collapse(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Which supplier the review screen should open on.
 *
 * The match is exact once punctuation and case are off, and nothing more. A
 * loose match, on a shared first word or a stripped "Pvt Ltd", would quietly
 * attach a contract to a supplier who never signed it, which is the whole
 * cost this is here to avoid. When in doubt it offers the new supplier, which
 * a reviewer can see is new.
 */
export function defaultVendorId(
  vendors: { id: string; name: string }[],
  suggestedName: string,
): string {
  const wanted = normalizeName(suggestedName);
  if (!wanted) return "new";
  return vendors.find((vendor) => normalizeName(vendor.name) === wanted)?.id ?? "new";
}
