// What the dropzone will and will not accept, shared by the browser and the
// route so the two can never disagree about it.

export const MAX_BYTES = 12 * 1024 * 1024;

// The limit the upload page states. The model can only count invoices after
// it has been paid to read them, so this is enforced after the fact: a file
// over it keeps its drafts and says so.
export const MAX_INVOICES_PER_FILE = 15;

// The limit that is enforced before anything is paid for: 15 invoices at up
// to two pages each. Past this a single call also gets less reliable.
export const MAX_PDF_PAGES = 30;

export const ACCEPTED = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
} as const;

export const ACCEPT_ATTRIBUTE = Object.keys(ACCEPTED).join(",");

export type Rejection = { reason: string };

/**
 * A rejection is per file and says what is wrong with that file. A batch that
 * fails as a whole because one file was a HEIC is the worst version of this.
 */
export function reject(file: { name: string; type: string; size: number }): Rejection | null {
  if (file.size === 0) {
    return { reason: "The file is empty." };
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return { reason: `${mb}MB is over the ${MAX_BYTES / 1024 / 1024}MB limit.` };
  }

  if (file.type in ACCEPTED) return null;

  // Photographing an invoice on an iPhone is the likeliest way one enters this
  // system, and HEIC is the default there, so it gets its own message rather
  // than the generic one.
  if (/\.hei[cf]$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif") {
    return {
      reason: "HEIC is not readable here yet. On iPhone, Settings, Camera, Formats, Most Compatible, or share it as JPEG.",
    };
  }

  return { reason: "Only PDF, JPEG, PNG and WebP can be read." };
}
