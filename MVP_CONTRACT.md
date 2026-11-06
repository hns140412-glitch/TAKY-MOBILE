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
- executable WORK continuation: implemented locally (`ㄱ`/WORK execute → action dispatch → receipt/TRACE)
- browser E2E: Ready & Set work → CONTINUE → OPEN_APP dispatch → `DISPATCHED` + `OPEN_DISPATCHED` receipt PASS (2026-10-09)
- canonical loader: implemented in source; authenticated remote behavior UNVERIFIED
- secure canonical/auth gateway: code and deployment evidenced; live authorization behavior UNVERIFIED
- other secure connectors: not implemented
- external writes: not implemented
- deployment: READY at recorded baseline; Release PASS UNVERIFIED


## Documentation reconciliation — 2026-09-08

Source baseline: `7ad757ef3caeb93f103c97b5fc6b6ab5efff39e9`.
Previously retrieved Netlify production evidence: deploy `6a9ea85873979b00083c30cf`, state `ready`, commit_ref matches baseline, published `2026-09-07T12:04:53.141Z`, https://taky-mobile.netlify.app.
This is deployment evidence only. Authenticated canonical retrieval, 30-day session behavior, real-device/offline/E2E and Release PASS remain UNVERIFIED. The earlier timeout plus reused local AUTH_REQUIRED response is not a successful fresh auth test.

## Runtime advancement — 2026-10-09

`CONTINUE` now executes the next explicitly executable WORK action instead of acknowledging only. Supported local execution contracts are `OPEN_APP`, `OPEN_SCREEN`, and `CANONICAL_REFRESH`; non-executable/HOLD work fails closed with `NO_EXECUTABLE_WORK`. Execution writes a per-work receipt (`DISPATCHED` / `VERIFIED` / `FAILED`) and a TRACE entry. `OPEN_APP` verifies dispatch, not cross-origin app completion. REVIEW is still local routing; CHAT still has no AI provider connected. Command recognition alone is not task completion.
Mobile AI Gateway and external write adapters remain deferred pending renewed need/cost/authority approval; existing project rules are not deleted.
2026-10-09 local runtime advancement adds explicit WORK execution for CONTINUE without deployment, remote push, provider API calls, or external writes. Deployment/Release PASS remains unchanged and unverified. Rollback source remains the recorded baseline above; review later changes before restoration.

## Learning-loop return contract — 2026-10-10

`START_LEARNING_LOOP` is distinct from `OPEN_APP`. Dispatching Ready places the WORK in `AWAITING_RESULT`; it is not complete merely because the app opened. Ready preserves the Mobile work-id/nonce across Hide/Snap/Play Camp specialist routing. Only after the Ready session is explicitly finalized does Ready offer `TAKY Mobile로 돌아가기` and return the aggregate factual task state. TAKY Mobile verifies work-id + one-time nonce + `from_app=ready-set` + session/result before marking the WORK `VERIFIED`.

Local browser E2E: TAKY Mobile `ㄱ` → Ready → Hide TRACE evidence → Ready specialist completion → Ready session end → explicit Mobile return → WORK `COMPLETED` / execution `VERIFIED` / `LEARNING_LOOP_RESULT_RECEIVED` PASS (2026-10-10). Existing `OPEN_APP` behavior remains dispatch-only. Play Camp has no invented direct deployment URL in Mobile and is shown as Ready-mediated.
No deployment, push, external write, or paid API call was performed for this contract.
