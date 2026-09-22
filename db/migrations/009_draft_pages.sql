-- Where in its file a draft's invoice sits.
--
-- One PDF can hold several invoices, each becoming its own draft that shares
-- the one stored original. The review screen opens the original at first_page
-- so the invoice being checked is the one on screen. Nullable because drafts
-- made before this have no pages recorded, and page 1 is the right default for
-- them.
ALTER TABLE draft
  ADD COLUMN first_page integer CHECK (first_page >= 1),
  ADD COLUMN last_page  integer CHECK (last_page >= first_page);

-- Siblings from one file are looked up by their shared original.
CREATE INDEX draft_blob_url ON draft (blob_url);
