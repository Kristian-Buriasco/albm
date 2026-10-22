# API tokens

For scripts and AI assistants (the Albm MCP server). Create one in **Settings > Sharing > API tokens**. The token is shown
once, starts with `albm_`, is stored only as a hash, and can be revoked at any time.

| | Read only | Read and write |
|---|---|---|
| Look at galleries, photos, tags, folders, clients, comments, inquiries, testimonials, version | yes | yes |
| Create and update galleries, photos' metadata, sections, tags, folders; invite collaborators; moderate comments | no | yes |
| Upload, replace and delete-by-publish photos through `/api/publish` | no | yes |
| **Delete anything** through the admin API | no | **no** |
| Settings, security and passkeys, sessions, storage settings, other tokens, updater, maintenance, audit log | no | **no** |

Use it as `Authorization: Bearer albm_...` against `/api/admin/*` (and `/api/publish/*` with a write token).

How it is enforced: the middleware signs each token request's method and path with `SESSION_SECRET`; the auth code only
trusts a signed pair, checks the route against an allow-list (`TOKEN_ROUTES` in `src/lib/api-tokens.ts`) and the
scope, and refuses everything else with `401`. A new admin route is therefore **closed to tokens until it is added to
that list**. Every write made with a token is audit-logged as `api_token.write` with the token's name.

Photo upload through `/api/admin/galleries/{id}/photos` is refused for tokens (middleware would cap the body at 10 MB);
use `/api/publish/{galleryId}/photos` with the same token.

Treat a write token like a password: it can publish and change galleries. Give each person or tool its own, and revoke it
when it is no longer needed. Note that `/api/publish` can still replace or delete photos it uploaded, so write tokens
are not fully delete-proof there.
