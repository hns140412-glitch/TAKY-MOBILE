# TAKY Mobile MVP

Status: RUNTIME MVP / NOT CANONICAL / NOT DEPLOYED

## Implemented
- Mobile-first TAKY chat shell
- `/` context-aware command palette
- deterministic Natural Language Intent Router
- `ㄱ` = current next-step continuation intent
- WORK / LAB / TRACE screens
- IndexedDB-first runtime persistence with LocalStorage fallback
- Handoff `.md` export with embedded machine-resume state
- Resume import from TAKY Handoff `.md`
- cached TAKY Canonical Loader
- Netlify server-side GitHub canonical gateway
- trusted-device one-time access-key authentication
- 30-day HttpOnly session cookie
- PWA manifest + service worker

## Authority boundary
`TAKY-MOBILE != CANONICAL AUTHORITY`

- `hns140412-glitch/TAKY` = canonical MASTER / OS / DOMAIN authority
- `TAKY-MOBILE` = runtime / UI / orchestration projection
- browser client SHALL NOT hold GitHub secret tokens
- browser client SHALL NOT persist the TAKY access key

## Authentication boundary
TAKY Mobile protects access to the private TAKY canonical repository.

Flow:

`first trusted-device access -> access key once -> server validates -> HttpOnly session -> canonical access`

The session currently lasts 30 days. A new device, cleared cookies, or session expiry requires the key again.

This TAKY Mobile authentication is NOT inherited by Snap & Pop, Ready & Set, or Hide & Seek. Product-app authentication remains project-specific.

## Canonical loader traffic policy
The client uses a 30-minute IndexedDB canonical cache by default.
A fresh GitHub read occurs only when:
- no fresh cache exists at session start, or
- the user explicitly presses `기준 새로고침` / status chip.

This avoids treating GitHub as a continuously polled runtime database.

## Local run
Use any static HTTP server from this folder, e.g.

```bash
python -m http.server 8080
```

Local static mode can test UI, IndexedDB, Intent, WORK/LAB/TRACE and Handoff/Resume.
The private canonical gateway requires Netlify Functions (or an equivalent secure backend).

## Netlify secure gateway
Configure these environment variables in Netlify, never in client JS or committed `.env` files:

- `GITHUB_TOKEN` = GitHub token/app credential with read access to the private TAKY repository
- `TAKY_APP_ACCESS_KEY` = one-time trusted-device access key chosen by the owner
- `TAKY_SESSION_SECRET` = long random server-only secret used to sign sessions
- optional `TAKY_COOKIE_SECURE` = defaults to secure cookies; only set `false` for local development
- optional `TAKY_CANONICAL_REPO` = defaults to `hns140412-glitch/TAKY`
- optional `TAKY_CANONICAL_REF` = defaults to `main`
- optional `TAKY_CANONICAL_FILES` = comma-separated override list

Default files loaded:
- `TAKY.md`
- `MASTER/MASTER_LOGIC.md`
- `OS/COMMAND_INTERACTION.md`
- `OS/WORK_OS.md`

## Current execution truth
- repository source write: PASS
- IndexedDB runtime layer: IMPLEMENTED
- Intent Router: IMPLEMENTED_LOCAL
- Handoff/Resume: IMPLEMENTED_LOCAL
- trusted-device auth flow: IMPLEMENTED / DEPLOYMENT REQUIRED
- Canonical secure gateway code: IMPLEMENTED / DEPLOYMENT REQUIRED
- Canonical remote runtime verification: NOT YET PASS
- Google Drive adapter: NOT IMPLEMENTED
- canonical write adapter: NOT IMPLEMENTED
- Netlify deployment: NOT PERFORMED
- release: NOT PERFORMED

## Next implementation queue
1. deploy Netlify preview/runtime
2. configure `GITHUB_TOKEN`, `TAKY_APP_ACCESS_KEY`, `TAKY_SESSION_SECRET`
3. verify first-device authentication and 30-day session
4. verify Canonical Loader against private TAKY
5. add governed Approval + canonical write adapter
6. add Google Drive source/artifact adapter
7. integrated Handoff/Resume + regression test
8. real mobile PWA validation
