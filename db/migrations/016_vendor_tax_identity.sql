-- A vendor's tax registration is generic, but the existing identity must keep
-- working until the new build has stopped writing the GSTIN column. The old
-- column and index therefore stay in this migration. They are compatibility
-- state, not part of the new identity, and can be removed after deployment.
ALTER TABLE vendor
  ADD COLUMN tax_id text,
  ADD COLUMN tax_id_kind text,
  ADD COLUMN normalized_tax_id text,
  ADD COLUMN normalized_address text NOT NULL DEFAULT '';

-- The existing address is kept as printed while its comparison form is built
-- separately. Empty normalized addresses compare equal because absence is
-- absence, and without that rule PostgreSQL would make every missing address
-- unique.
UPDATE vendor
SET normalized_tax_id = upper(regexp_replace(gstin, '[^[:alnum:]]', '', 'g')),
    tax_id = gstin,
    tax_id_kind = CASE WHEN gstin IS NULL THEN NULL ELSE 'gstin' END,
    -- Coalesced, not trimmed directly. `address` is nullable and three of the
    -- seven vendors in the live database have none, and `trim(NULL)` is NULL,
    -- which this NOT NULL column would refuse. The migration would abort.
    --
    -- Empty is the right value for a missing address rather than NULL: the
    -- identity index below treats two vendors with the same name and no
    -- address as one supplier, which is the honest answer when there is
    -- nothing to tell them apart. A NULL would make every addressless vendor
    -- unique instead, since NULLs do not compare equal, and the same supplier
    -- would multiply on every invoice.
    normalized_address = lower(regexp_replace(trim(coalesce(address, '')), '[^[:alnum:]]+', ' ', 'g'));

ALTER TABLE vendor
  ADD CONSTRAINT vendor_tax_id_kind_is_closed
    CHECK (tax_id_kind IS NULL OR tax_id_kind IN ('gstin', 'vat', 'ein')),
  ADD CONSTRAINT vendor_tax_id_pair
    CHECK ((tax_id IS NULL) = (tax_id_kind IS NULL) AND (tax_id IS NULL) = (normalized_tax_id IS NULL));

-- A tax registration is compared in its normalised form, while the printed
-- value remains available for display. The kind belongs in the identity so
-- similarly shaped numbers from different registration systems cannot merge.
CREATE UNIQUE INDEX vendor_tax_identity
  ON vendor (tax_id_kind, normalized_tax_id)
  WHERE tax_id IS NOT NULL;

-- With no tax registration, name and address are both part of identity. A
-- disagreement is enough to keep two businesses apart because a false merge
-- would silently corrupt their price history.
CREATE UNIQUE INDEX vendor_name_address_without_tax_id
  ON vendor (normalized_name, normalized_address)
  WHERE tax_id IS NULL;

-- Migration 010's index cannot remain in the final schema because it makes
-- address irrelevant for rows whose old GSTIN is null. Removing it here would
-- break the currently deployed save statement before the new build is live, so
-- it is deliberately retained as deployment compatibility and must be dropped
-- in a later migration after this code has been deployed.
