-- The old shared Meta configuration used App ID 1533990358131449, which is neither Torio Platform nor Torio Auth.
-- The resolvers already ignore it; clearing a stored copy lets each app fall back to its own App ID.
-- Secrets, tokens, channels and every other setting are left untouched.
UPDATE "meta_configuration" SET "appId" = NULL WHERE "appId" = '1533990358131449';
