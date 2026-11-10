-- Separate redirect URIs for Customer Portal Facebook sign-in. Additive: existing channel settings are untouched.
ALTER TABLE "meta_configuration" ADD COLUMN "customerAuthRedirectUri" TEXT;
ALTER TABLE "meta_configuration" ADD COLUMN "customerAuthAllowedRedirectUris" TEXT[] DEFAULT ARRAY[]::TEXT[];
