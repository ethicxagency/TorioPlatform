-- Capability flags per plan (courier, brands), enforced server-side. Additive: existing plans get an empty list.
ALTER TABLE "plans" ADD COLUMN "entitlements" TEXT[] DEFAULT ARRAY[]::TEXT[];
