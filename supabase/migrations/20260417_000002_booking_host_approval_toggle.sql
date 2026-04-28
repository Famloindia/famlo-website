ALTER TABLE hosts
  ADD COLUMN IF NOT EXISTS booking_requires_host_approval BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE families
  ADD COLUMN IF NOT EXISTS booking_requires_host_approval BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE hosts
SET booking_requires_host_approval = COALESCE(booking_requires_host_approval, FALSE);

UPDATE families
SET booking_requires_host_approval = COALESCE(booking_requires_host_approval, FALSE);

NOTIFY pgrst, 'reload schema';
