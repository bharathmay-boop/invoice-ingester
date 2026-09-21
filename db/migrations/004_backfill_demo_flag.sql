-- Rows written by the seed before is_demo existed. The seed has always tagged
-- them in extraction_meta, so they can be identified exactly rather than by
-- assuming everything present is demo data.
UPDATE invoice SET is_demo = true
WHERE extraction_meta->>'source' = 'demo-seed';

UPDATE vendor SET is_demo = true
WHERE EXISTS (
  SELECT 1 FROM invoice i WHERE i.vendor_id = vendor.id AND i.is_demo
)
AND NOT EXISTS (
  SELECT 1 FROM invoice i WHERE i.vendor_id = vendor.id AND NOT i.is_demo
);

UPDATE item SET is_demo = true
WHERE EXISTS (
  SELECT 1 FROM line_item li JOIN invoice i ON i.id = li.invoice_id
  WHERE li.item_id = item.id AND i.is_demo
)
AND NOT EXISTS (
  SELECT 1 FROM line_item li JOIN invoice i ON i.id = li.invoice_id
  WHERE li.item_id = item.id AND NOT i.is_demo
);
