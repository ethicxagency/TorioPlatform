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

## Logo processing, variants and the dark-background logo

- **Trim.** A logo's empty margins (transparent, or the flat colour around the artwork) are trimmed at full resolution before it is
  scaled, so no artwork is touched. A result that is almost nothing (under 2% of the image) means the logo fills the image and is kept
  whole. Proportions are never changed; the logo is never enlarged and never exceeds 1024x512.
- **Variants.** One WebP is stored. `GET /api/v1/images/:id?w=160|360|720` serves it scaled down (never up) to a standard width; the
  id names one immutable picture, so responses are cached for a year and resized copies are kept in a small in-memory cache.
- **Dark-background logo.** Optional second picture (`stored_images` kind `WORKSPACE_LOGO_LIGHT`, no extra column or migration),
  `PUT/DELETE /workspaces/:id/logo-light`, same permission (`workspace:update`) and processing. It is returned as `logoLight` and
  used only on dark surfaces; without it the main logo is used.
- **One renderer.** The web app draws every logo through `WorkspaceLogo` (`components/workspace-logo.tsx`) with a context
  (`invoice`, `document`, `header`, `preview`, `compact`): each is a maximum box with `object-fit: contain`, and a missing or broken logo
  falls back to initials. Invoices read the stored logo bytes directly (converted to PNG, transparency kept) and fall back to the store
  name.
- **Replacing.** The new file is validated and processed before anything is stored, so a refused or cancelled upload leaves the saved
  logo unchanged. Invoices are rendered on demand from the current logo; they do not keep a snapshot, so replacing the logo changes the
  header of a re-downloaded older invoice.
