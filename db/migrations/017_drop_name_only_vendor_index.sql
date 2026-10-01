-- RUN THIS AFTER DEPLOYING, NOT BEFORE. 016 is safe to run ahead of a deploy.
-- This one is not, and the two are not interchangeable.
--
-- Migration 010 made a vendor without a GSTIN unique on its name alone. 016
-- replaced that rule with name AND address, so two suppliers who share a name
-- at different addresses stay two vendors. Both indexes cover the same rows,
-- and the older one is the stricter of the two, so while it exists the new
-- rule cannot take effect.
--
-- It is worse than inert. The new save path conflicts on
-- (normalized_name, normalized_address), so a second "Hopkins and Sons" at a
-- different address does not match the conflict target and proceeds to an
-- insert, which 010's index then rejects outright. The save fails rather than
-- merging. Loud rather than silent, but still broken.
--
-- It could not be dropped in 016 either: the build deployed at that moment
-- conflicts on (normalized_name) WHERE gstin IS NULL, and an ON CONFLICT with
-- no matching index is an error. So the order is 016, deploy, then this.
DROP INDEX IF EXISTS vendor_name_without_gstin;

-- The old column goes with it. Nothing reads it after the deploy that precedes
-- this migration, and leaving it would be a second place a vendor's tax number
-- lives, drifting out of step with the first the moment anybody writes one.
ALTER TABLE vendor
  DROP COLUMN IF EXISTS gstin;
