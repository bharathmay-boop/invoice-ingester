// Vendor identity needs stable comparison forms for values that are printed
// differently on otherwise matching invoices. The printed values are retained
// separately so these functions never change what a person sees.

/** Remove presentation differences without changing the registration itself. */
export function normalizeTaxId(taxId: string): string {
  return taxId.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

/** Make address spelling and spacing irrelevant while preserving its words. */
export function normalizeAddress(address: string): string {
  return address
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
