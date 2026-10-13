SET lock_timeout = '10s';

BEGIN;

-- Freight and COD charges are already debited from the seller wallet during
-- booking. Pending COD remittances must therefore remain equal to the full COD
-- amount collected. Credited rows are preserved for settlement reconciliation.
UPDATE cod_remittances
SET
  deductions = 0,
  remittable_amount = cod_amount,
  updated_at = NOW()
WHERE status = 'pending'
  AND (
    deductions IS DISTINCT FROM 0::numeric
    OR remittable_amount IS DISTINCT FROM cod_amount
  );

COMMIT;
