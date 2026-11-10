-- Two Meta apps. The existing row (id "default") is the Business Messaging app and keeps every value; the Customer
-- Authentication app (id "auth") is created on first save. Additive only. Rollback: ALTER TABLE "meta_configuration" DROP COLUMN "purpose";
ALTER TABLE "meta_configuration" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'BUSINESS_MESSAGING';
