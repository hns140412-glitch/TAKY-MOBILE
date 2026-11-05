# Codex execution brief — TAKY two-family operational verification

## Authority and constraints
User explicitly authorizes Codex for local non-production operational review and mock testing. Preserve all dirty worktrees and approved TAKY canonical authority. No commit, push, merge, deploy, reset, checkout, clean, stash, paid API, secret disclosure, or production data mutation. Do not modify Master Logic. Use minimum necessary calls. Distinguish mock/local evidence from real deployed E2E. Never mark success without test output.

## Fixture
Family H: father, mother, Heewon (female, grade 5), Jiwon (male, age 6). Family I: Irae (female, grade 4), distinct family; other members unknown. Create fictional IDs and trusted local mock parent principals; never use real family credentials. Parents manage only authorized children. Two families may connect for approved joint activities but remain separate authorization, storage, learning state, and backup scopes. Test invite, accept, revoke and unauthorized cross-family access where implementation exists; otherwise HOLD, not PASS.

## Inspect and execute
Inspect TAKY-MOBILE and ../TAKY/LEARNING (transport, receipts, intake, runtime, projection, planner consumer), and relevant Ready/Hide/Snap/Play Camp adapters. Run local tests with isolated temporary storage and deterministic mocks. Verify: 1 identity and family permissions; 2 event creation; 3 authenticated evidence ingestion and persistence, reload, dedupe; 4 server verification versus observation-only; 5 central learning engine decision consumption and correct member scope; 6 Planner dated allocation handoff versus intent-only; 7 cross-family joint activity sharing without leakage; 8 backup/restore and recovery; 9 app navigation and owner operations status; 10 regression and no regressions. Add narrowly scoped tests if needed, but never loosen authentication. Correct harness fixture inputs rather than bypassing security.

## Report
Write artifacts/CODEX_TWO_FAMILY_OPERATIONS_REVIEW.md with exact files, commands, exit codes, PASS/FAIL/HOLD per scenario, observed evidence, gaps and next actions. Explain if a component is only mocked. Report actual local HEAD/status without modifying existing dirty changes.

## Noninteractive reliability
Before any retry inspect existing Codex process and execution receipt. Do not start a duplicate running agent. The prior process remained at 'Reading additional input from stdin...' with STARTED receipt. Diagnose stdin ownership across Remote Desktop Commander -> PowerShell -> TAKY_CODEX_SHIM.ps1 -> codex.cmd. For the next attempt use a single bounded, noninteractive invocation, prompt from this file, explicit stdin EOF (or redirected null input), stdout/stderr log files, exit-code receipt, timeout and duplicate-process guard. Validate the wrapper first with a short harmless command. Do not spin retries or consume quota while stuck. If environment cannot support noninteractive invocation, mark BLOCKED with evidence rather than claiming completed.
