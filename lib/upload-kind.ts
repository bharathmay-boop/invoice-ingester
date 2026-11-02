/** Which kind of document the upload page is set to take (#150). */
export type UploadKind = "invoice" | "contract";

/** From `?kind=`, so a link can open the right tab; anything else is invoices. */
export function uploadKind(param: string | string[] | undefined): UploadKind {
  return param === "contract" ? "contract" : "invoice";
}
