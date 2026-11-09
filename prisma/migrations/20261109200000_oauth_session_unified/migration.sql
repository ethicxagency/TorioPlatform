-- One Meta authorization can discover several products, so the session no longer has a single provider.
ALTER TABLE "channel_oauth_sessions" ALTER COLUMN "provider" DROP NOT NULL;
