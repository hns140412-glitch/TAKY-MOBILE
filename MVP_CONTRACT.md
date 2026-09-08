# TAKY Mobile MVP Contract

## Runtime authority
TAKY Mobile is a projection/runtime layer.

`APP STATE != CANONICAL AUTHORITY`

## Primary flow
USER INPUT
→ INTENT
→ PROJECT/DOMAIN
→ REQUIRED SOURCE
→ APPLICABLE MASTER
→ WORKFLOW
→ EXECUTION
→ VALIDATION
→ TRACE

## MVP states
Decision:
DRAFT / CANDIDATE / VALIDATED / APPROVED / COMMITTED / RELEASED / SUPERSEDED

Execution:
INTENDED / PLANNED / ATTEMPTED / WRITTEN / SAVED / VERIFIED / IMPLEMENTED / DEPLOYED / RELEASE_VERIFIED

## Current MVP
- UI shell: implemented
- local persistence: implemented
- command palette: implemented
- simple natural-language routing: implemented
- trace seed: implemented
- PWA app shell: implemented
- canonical loader: implemented in source; authenticated remote behavior UNVERIFIED
- secure canonical/auth gateway: code and deployment evidenced; live authorization behavior UNVERIFIED
- other secure connectors: not implemented
- external writes: not implemented
- deployment: READY at recorded baseline; Release PASS UNVERIFIED


## Documentation reconciliation — 2026-09-08

Source baseline: `7ad757ef3caeb93f103c97b5fc6b6ab5efff39e9`.
Previously retrieved Netlify production evidence: deploy `6a9ea85873979b00083c30cf`, state `ready`, commit_ref matches baseline, published `2026-09-07T12:04:53.141Z`, https://taky-mobile.netlify.app.
This is deployment evidence only. Authenticated canonical retrieval, 30-day session behavior, real-device/offline/E2E and Release PASS remain UNVERIFIED. The earlier timeout plus reused local AUTH_REQUIRED response is not a successful fresh auth test.
`CONTINUE` currently records a trace and acknowledgement; it does not execute the next work item. REVIEW is local routing; CHAT has no AI provider connected. Command recognition is not task completion.
Current user-approved scope is documentation correction only. Mobile AI Gateway and external write adapters are deferred pending renewed need/cost/authority approval; existing project rules are not deleted.
This documentation-only change uses `[skip netlify]` and does not request deployment. Runtime code/configuration are unchanged. Rollback source is the baseline commit above; review later changes before restoration.
