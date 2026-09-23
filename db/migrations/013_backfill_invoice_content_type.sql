-- Content types for invoices saved before 012 added the column.
--
-- Their drafts are long gone, so the only thing left that says what the file
-- is, is the name it was stored under. The upload route only ever accepts the
-- four types below and keeps the original extension, so the mapping is exact
-- rather than a guess.
--
-- Anything that still ends up null cannot be rendered safely and the screens
-- show no icon for it, which is better than an icon that opens a broken image.
UPDATE invoice
SET content_type = CASE
  WHEN blob_url ILIKE '%.pdf'  THEN 'application/pdf'
  WHEN blob_url ILIKE '%.jpg'  THEN 'image/jpeg'
  WHEN blob_url ILIKE '%.jpeg' THEN 'image/jpeg'
  WHEN blob_url ILIKE '%.png'  THEN 'image/png'
  WHEN blob_url ILIKE '%.webp' THEN 'image/webp'
END
WHERE blob_url IS NOT NULL AND content_type IS NULL;
