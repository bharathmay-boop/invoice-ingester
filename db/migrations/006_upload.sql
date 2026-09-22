-- A file that has been stored but not yet extracted.
--
-- Exists so the extract route can tell a blob this app just uploaded from an
-- arbitrary URL a caller made up. Without it, anyone signed in could name any
-- private blob the deployment's credentials can read and have its contents
-- sent to the model.
--
-- It also gives orphaned blobs somewhere to be found: a row that is still here
-- long after created_at is a file nothing ever claimed.
CREATE TABLE upload (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blob_url     text UNIQUE NOT NULL,
  file_name    text NOT NULL,
  content_type text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
