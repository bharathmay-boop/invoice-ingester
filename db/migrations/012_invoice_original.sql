-- What a saved invoice needs to show its original.
--
-- `blob_url` was already carried over from the draft, but not how to render it
-- or where to open it. Without the content type the viewer cannot tell a PDF
-- from a photo, and without the page a multi invoice PDF opens on someone
-- else's invoice.
--
-- Nullable: invoices saved before this, and the seeded demo ones, have no
-- original at all.
ALTER TABLE invoice
  ADD COLUMN content_type text,
  ADD COLUMN first_page integer CHECK (first_page >= 1);
