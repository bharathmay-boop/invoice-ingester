/**
 * Contracts are not large invoices, and the invoice limits do not fit them.
 *
 * An invoice is a page or two and is posted through a route. A rate contract
 * is routinely a couple of hundred pages, which is past the 4.5 MB a Vercel
 * function will accept as a request body, so a contract goes straight from the
 * browser to blob storage and the server only ever sees its URL.
 */

/** Past this a document is not a contract, it is a filing cabinet. */
export const MAX_CONTRACT_PAGES = 400;

/** Comfortably above a scanned 200 page agreement, well under what Blob takes. */
export const MAX_CONTRACT_BYTES = 50 * 1024 * 1024;

/**
 * A contract arrives as a PDF. Photographs of a two hundred page agreement are
 * not a thing anybody does, and accepting images here would mean one contract
 * spread over ninety files with no way to know their order.
 */
export const CONTRACT_ACCEPTED: Record<string, string> = {
  ".pdf": "application/pdf",
};

export const CONTRACT_ACCEPT_ATTRIBUTE = Object.keys(CONTRACT_ACCEPTED).join(",");

/** How many a person can drop at once, which is also how deep the queue goes. */
export const MAX_CONTRACTS_PER_BATCH = 20;

export type Refusal = { reason: string };

export function rejectContract(file: {
  name: string;
  type: string;
  size: number;
}): Refusal | null {
  if (file.type !== "application/pdf") {
    return {
      reason: `${file.name} is not a PDF. Contracts are read as PDFs, so export or scan it to one first.`,
    };
  }
  if (file.size > MAX_CONTRACT_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    return {
      reason: `${file.name} is ${mb} MB, over the ${MAX_CONTRACT_BYTES / (1024 * 1024)} MB limit.`,
    };
  }
  if (file.size === 0) {
    return { reason: `${file.name} is empty.` };
  }
  return null;
}
