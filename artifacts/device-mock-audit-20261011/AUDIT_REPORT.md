# TAKY — Device Mock Verification 2026-10-11

STATUS: MOCK_BROWSER_PASS / PHYSICAL_DEVICE_UNVERIFIED
This report is audit evidence, not a canonical TAKY or release-state promotion.

## Environment
- Windows PC + installed Chrome/Playwright; mobile viewport/touch emulation (SAVEY mobile DPR 3).
- Test fixtures / local mock identity, no real family login or financial cloud write.
- No paid API, deploy, push, commit, master changes. All 6 temporary local ports closed.

## 1. Full five-app journey — PASS
- At 390x844, launched local TAKY Mobile, Ready & Set, Hide & Seek, Snap & Pop and Play Camp on 5 HTTP/Vite servers.
- Navigated Mobile -> Ready -> Hide -> Ready -> Snap -> Ready -> Play Camp -> Ready -> Mobile.
- Three Ready/planner tasks COMPLETED with correct specialist source. Mobile receipt LEARNING_LOOP_RESULT_RECEIVED; return parameters cleared; errors=[] and gaps=[].
- Evidence: D:\Git PWA\TAKY-MOBILE\artifacts\device-mock-audit-20261011\multi-specialist.log
- Earlier attempt failed with all 5 local ports stopped; after starting all 5 the same journey passed. This was test setup, not a confirmed app defect.

## 2. SAVEY parent/child tap and record flow — PASS 10/10
- 320x720, 375x812, 390x844, 430x932, 1024x768, each for parent and child preview.
- Tap quick record -> manual entry -> "오늘 마트에서 12500원 카드로 결제" -> review, 12,500원.
- No document horizontal overflow and no browser pageerror in tested flows.
- Evidence: D:\Git PWA\SAVEY\artifacts\device-mock-audit-20261011\result.json and 390x844 home/confirm PNGs.
- Visible UX issues: merchant text wrongly parsed as "마트에서 로"; category remains for confirmation. Child preview has inconsistent example numbers (12,000 available vs 18,000 remaining), hard-coded nickname and clock. Production fallback differs from preview; mock screenshots cannot prove live ledger behavior.
- Original Golden matching, receipt-photo multi-line OCR, financial write/ACK, actual account login and Safari behavior not checked.

## 3. Play Camp tablet — PASS
- npm run smoke:tablet: 1024x768 PASS, 1180x820 PASS, LAN insecure voice fallback PASS, exit 0.
- Script covers local onboarding/crew visual and control overflow. Physical iPad and final voice casting not verified.

## Decision
- S3 internal mock integration: PASS_WITH_MOCKS.
- S4 source-Golden screen parity: OPEN.
- S5 physical iOS/iPadOS Safari, camera, mic, PWA install/update, safe areas, offline/reconnect and deployed auth: UNVERIFIED.
- S6 production release equality: UNVERIFIED.
- Next functional fix candidate: SAVEY natural-language merchant parsing and contradictory demo numbers, then focused emulator rerun. Deployed physical-device validation remains separate.

MOCK PASS != DEVICE PASS != PRODUCTION PASS.
