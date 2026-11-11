-- Brain maturity evaluation, stored beside the Brain document it was computed from. Additive and derived: existing rows
-- keep working (the value is recomputed on read until the next save), and nothing is moved or deleted.
ALTER TABLE "brain_configs" ADD COLUMN "maturity" JSONB, ADD COLUMN "maturityAt" TIMESTAMP(3);
