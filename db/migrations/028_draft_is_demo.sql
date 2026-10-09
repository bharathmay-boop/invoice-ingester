-- Mark a draft as part of the demo set, the same as vendor, item, invoice and
-- contract already are.
--
-- The seed leaves a draft behind so the review screen has something to show
-- (#206). It is safe to re-run only if it can tell its own draft from one
-- somebody uploaded, and the screenshot script refuses to run against a
-- database holding drafts that are not demo ones, since a draft is a document
-- somebody uploaded.
ALTER TABLE draft
  ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
