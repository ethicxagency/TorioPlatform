-- An App Domain is a bare hostname (torio.example.com), never a URL: strip a pasted protocol, path and trailing slash.
UPDATE "meta_configuration"
SET "appDomain" = lower(regexp_replace(regexp_replace("appDomain", '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''), '[/?#:].*$', ''))
WHERE "appDomain" ~ '^[a-zA-Z][a-zA-Z0-9+.-]*://' OR "appDomain" ~ '[/?#]';
