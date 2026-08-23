# Settings, branding, and uploads

**Status: planned, not built.** Recorded so the schema is designed once rather than
improvised later. See `decisions/ADR-012-tenant-theming.md` for the theming reasoning.

## Revising an earlier position

ADR-012 originally excluded logo upload on the grounds that attachments are out of
scope project-wide. That was too broad, and the distinction is worth making:

| Ticket attachments (out of scope) | Brand logo and avatar (planned) |
|---|---|
| Arbitrary files, any type | Images only, three known types |
| Unbounded count | Exactly one per organisation, one per user |
| Uploaded by anyone, including from outside | Uploaded by an authenticated internal user |
| Needs virus scanning, quarantine, download policy | Needs MIME validation and a size cap |

Different risk, different work. Including one and not the other is consistent, provided
the reason is stated — which is what this file is for.

## Schema

### OrganizationSettings — a single row

| Column | Type | Notes |
|---|---|---|
| `Id` | `smallint` | Always 1. A check constraint enforces it, so a second row cannot exist |
| `BrandColor` | `char(7)` | `#RRGGBB`, validated for contrast before it is stored |
| `SidebarMode` | `varchar(10)` | `Light` · `Dark` · `Brand` |
| `LogoBytes` | `bytea?` | ≤ 200KB |
| `LogoContentType` | `varchar(30)?` | `image/png` · `image/jpeg` · `image/svg+xml` |
| `LogoUpdatedAtUtc` | `datetime2(3)?` | Drives the `ETag` |
| `UpdatedByUserId` | `uniqueidentifier` | No FK — same reasoning as the audit log |
| `UpdatedAtUtc` | `datetime2(3)` | |

### SupportUser — two added columns

| Column | Type | Notes |
|---|---|---|
| `AvatarBytes` | `bytea?` | ≤ 200KB |
| `AvatarContentType` | `varchar(30)?` | |

## Storing images in the database

Generally the wrong call. Here it is the right one, and the reasoning should be stated
rather than assumed:

- **One logo, plus one avatar per user.** A handful of rows under 200KB each.
- **It removes an entire infrastructure dependency.** No S3, no MinIO, no OSS, no
  credentials, no bucket policy, no lifecycle rules — for three images.
- **Transactional and backed up with everything else.** No orphaned blobs when a row
  is deleted, no separate backup story.
- **`ETag` plus `Cache-Control: max-age=31536000, immutable`** means the browser fetches
  each image once. The database is not being hit per page view.

**It is wrong at any real scale**, and the migration path is one repository
implementation: swap `bytea` for a URL column, move the bytes, keep the endpoint shape
identical. Recorded here so nobody has to rediscover it.

## Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| `GET` | `/api/settings/branding` | Any | Returned in bootstrap too, so the theme applies before first paint |
| `PUT` | `/api/settings/branding` | Manager | Colour and sidebar mode. `400` if contrast fails, with a message |
| `PUT` | `/api/settings/branding/logo` | Manager | `multipart/form-data` |
| `DELETE` | `/api/settings/branding/logo` | Manager | Reverts to the product mark |
| `GET` | `/api/settings/branding/logo` | Any | `ETag`, immutable cache. Unauthenticated — it is a logo |
| `PUT` | `/api/me/avatar` | Self | |
| `DELETE` | `/api/me/avatar` | Self | Reverts to initials |
| `GET` | `/api/users/:id/avatar` | Any | `ETag`, immutable cache |

## Upload validation, in this order

1. **Size before anything else.** Reject over 200KB at the request-size limit, before
   the body is read into memory.
2. **Content type from the bytes, not the header.** Sniff the magic number.
   `Content-Type` is client-supplied and therefore a claim, not a fact.
3. **Dimensions.** Reject above 1024×1024.
4. **SVG is a special case.** SVG is XML and can carry `<script>`. Either sanitise it
   with a strict allowlist, or **do not accept SVG at all**. Accepting unsanitised SVG
   is a stored XSS vector, and it is the mistake that makes logo upload dangerous.
5. **Re-encode raster images** through an image library. This strips EXIF — which can
   contain GPS — and neutralises anything hidden in the original container.

**Recommendation: PNG and JPEG only.** SVG's benefit here is sharpness at a size where
nobody can see the difference; its cost is a sanitisation surface that has to be right
forever.

## Audit

Every one of these is a state change and writes an audit row (BR-9.1):
`Settings.BrandingChanged`, `Settings.LogoUploaded`, `Settings.LogoRemoved`,
`User.AvatarChanged`.

The row records **that** an image changed, never the bytes (BR-9.7).

## Fallbacks

| Missing | Renders |
|---|---|
| No logo | The product mark |
| No avatar | Initials on `--navy-900`, as today |
| Logo fails to load | Product mark, no broken-image icon |

The fallback is the default state, not an error state. A fresh organisation has no logo
and that is normal.

## Where this sits

Release 2 or later, as one story. The theming **architecture** is in the skeleton
(ADR-012); this is the screen and the storage that expose it.
