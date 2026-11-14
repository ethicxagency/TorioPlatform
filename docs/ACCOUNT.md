# Sign-in methods, profile pictures and the brand logo

## Sign-in methods (Settings → Security)

Shown from what the server holds: Google and Facebook are "Connected" only when a `UserIdentity` exists (tokens and provider ids are
never returned), and the password is "Set" only when `User.passwordSetAt` is set. The stored hash of a social-only account is a
random unusable value, so `passwordSetAt` is the source of truth. It is set at email sign-up, on a password reset and on a password
change/first password. The migration backfills it for accounts with no social sign-in and for those with a recorded password change or
reset; accounts that signed up with Google/Facebook and may have set a password some other way show "Password not set" and can set one.

**First password for a social-only account.** `POST /users/me/password/code` emails a 6-digit code (stored only as a hash, valid 10
minutes, one per minute, five wrong guesses retire it). `POST /users/me/password/set` takes the code, the new password (existing
strength rules) and its confirmation, saves the hash, signs out other devices, writes an audit entry, and keeps the social sign-ins
and the account untouched. It needs email delivery (RESEND_API_KEY and MAIL_FROM); without it the dialog says so. Accounts that already
have a password use **Change password**, which still needs the current one.

## Pictures

Two separate systems: the personal avatar (`User.image`, `imageSource` CUSTOM / PROVIDER / NONE, `providerImage`) and the workspace
logo (`Workspace.logo`). Both are stored in `stored_images` (one row per kind and owner), always re-encoded to WebP by the server
with `sharp` (avatars 512x512 cover, logos up to 1024x512, transparency kept). An SVG logo is accepted only as plain shapes and is
drawn to pixels; no SVG is stored or served. Input is limited to 2 MB; the browser crops avatars first. Replacing or removing deletes
the previous row, so nothing is left behind. Pictures are served from `GET /api/v1/images/:id` (unguessable id, new on every upload,
`nosniff`, locked-down CSP, immutable cache) because `<img>` cannot send a bearer token. The stored URL is built from `API_URL` (else
`WEB_URL`): change the domain and old URLs need re-saving.

A provider picture is remembered even when a custom one is used. A custom or removed picture is never overwritten by a later social
sign-in. Avatars are personal and need only a signed-in user; the logo needs `workspace:update` (Owner/Admin). The invoice PDF header
uses the stored logo (converted to PNG); the store switcher and top bar read `Workspace.logo`, and saving refreshes the shared store
list. Other open browsers see a change on their next refresh of that list.

## Limits

- There is no endpoint to disconnect or connect a Google/Facebook account from Settings, so those rows show status only.
- `sharp` is loaded when an image is uploaded or an invoice is made, not at start-up, and is an external in the Vercel bundle. If its
  native binary is not present on the host, uploads fail with an error; nothing else is affected.
- Integration tests: `test/account-images.integration.test.ts` (needs `TEST_DATABASE_URL` with migration `20261124000000`).
