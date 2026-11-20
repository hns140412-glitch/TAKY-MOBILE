# TAKY Mobile MVP

Status: RUNTIME MVP / NOT CANONICAL / DEPLOYMENT EVIDENCED / RELEASE UNVERIFIED

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
- trusted-device auth flow: IMPLEMENTED / FUNCTION DEPLOYMENT EVIDENCED / LIVE BEHAVIOR UNVERIFIED
- Canonical secure gateway code: IMPLEMENTED / FUNCTION DEPLOYMENT EVIDENCED / LIVE BEHAVIOR UNVERIFIED
- Canonical remote runtime verification: NOT YET PASS
- Google Drive adapter: IMPLEMENTED for central FAMILY data only (members.json registry, member/character profiles, character images) in `netlify/functions/_central_drive.mjs`; LIVE BEHAVIOR UNVERIFIED until the Drive consent bootstrap runs. Learning evidence/decisions stay in the Netlify Blobs strong store (Drive is not the live ledger).
- Central family login API (moved from the PC pilot `C:\TAKY_CENTRAL_LOCAL` + tunnel): `netlify/functions/central.mjs` serves `/api/family/*` and `/api/learning/*` on this same origin using vendored TAKY `LEARNING/transport` (`netlify/central/VENDOR_MANIFEST.json` pins sha256 per file). Env: `TAKY_GOOGLE_WEB_CLIENT_ID`, `TAKY_CENTRAL_ALLOWED_ORIGINS`, `TAKY_DRIVE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`, `TAKY_FAMILY_DRIVE_FOLDER_ID`, `TAKY_CENTRAL_TICKET_SECRET`; set `TAKY_CENTRAL_API_BASE_URL=self`. One-time setup: `tools/bootstrap-central-drive.mjs`.
- canonical write adapter: NOT IMPLEMENTED
- Netlify deployment: READY at the recorded baseline; see evidence below
- release validation: UNVERIFIED

## Historical implementation queue — not current execution authorization
1. deployment exists at recorded baseline; no redeployment authorized by this documentation correction
2. configure `GITHUB_TOKEN`, `TAKY_APP_ACCESS_KEY`, `TAKY_SESSION_SECRET`
3. verify first-device authentication and 30-day session
4. verify Canonical Loader against private TAKY
5. add governed Approval + canonical write adapter
6. add Google Drive source/artifact adapter
7. integrated Handoff/Resume + regression test
8. real mobile PWA validation


## Documentation reconciliation — 2026-09-08

Source baseline: `7ad757ef3caeb93f103c97b5fc6b6ab5efff39e9`.
Previously retrieved Netlify production evidence: deploy `6a9ea85873979b00083c30cf`, state `ready`, commit_ref matches baseline, published `2026-09-07T12:04:53.141Z`, https://taky-mobile.netlify.app.
This is deployment evidence only. Authenticated canonical retrieval, 30-day session behavior, real-device/offline/E2E and Release PASS remain UNVERIFIED. The earlier timeout plus reused local AUTH_REQUIRED response is not a successful fresh auth test.
`CONTINUE` currently records a trace and acknowledgement; it does not execute the next work item. REVIEW is local routing; CHAT has no AI provider connected. Command recognition is not task completion.
Current user-approved scope is documentation correction only. Mobile AI Gateway and external write adapters are deferred pending renewed need/cost/authority approval; existing project rules are not deleted.
This documentation-only change uses `[skip netlify]` and does not request deployment. Runtime code/configuration are unchanged. Rollback source is the baseline commit above; review later changes before restoration.

## TAKY 팀게임 (`/team-game/`)
- 큰 화면 진행(`/team-game/`) + 팀마다 폰 한 대(`/team-game/play.html?r=CODE`). 가족(학습) 팩 30 / 회사(행사) 팩 21 미션, 서로 다른 게임 44종.
- 가족 팩: 아이 눈높이 학습 미션, 탐험대원 직접 고르기, 순위 점수 완만(6·5·4…) + 모든 탐험대가 참여하면 다 함께 보너스 +2, 최종은 수료식(한 번에 공개). 경품 추첨 없음.
- 회사 팩: 순발력·팀워크·상식 미션(같은 손놀림도 회사용 이름), 순위 점수 경쟁(10·8·6…), 꼴찌부터 공개, 경품 추첨.
- 송년 올림픽(회사 모드): 8종목(100m 달리기·역도·양궁·사격·펜싱·리듬체조·컬링·수영 계주) 순서표, 개막식 선수단 입장, 종목마다 금·은·동 메달, 메달 집계(금→은→동 순, 같으면 점수), 메달 시상식 + 경품 추첨. 양궁은 새 손놀림(움직이는 조준점에 다섯 발).
- BGM: `team-game/bgm.js`, 직접 작곡한 오리지널 루프를 Web Audio로 연주(음원 파일·외부 음악 없음). 진행 화면만 재생, 장면별(로비·인트로·진행·결과·최종) × 팩별 곡, BGM 버튼으로 끄기. 출처는 `team-game/art/PROVENANCE.json`의 `bgm`.
- 실시간 층: WebSocket 대신 짧은 폴링 + Netlify Function `teamgame` (`/team-game/api/*`) + Netlify Blobs store `taky-teamgame`.
  키 하나에 작성자 하나: 방 문서는 진행 화면만 쓰고(요청을 한 번에 하나씩), 팀 입력·접속 표시는 그 팀 폰만 쓴다. 합류는 폰이 join 키를 남기면 진행 화면이 받아 넣는다.
  (실측 2026-11-16: Netlify Blobs의 조건부 쓰기는 동시 요청에서 지켜지지 않아 쓰지 않는다.)
- TV: 진행 화면의 "TV로 보내기" 버튼(Presentation API, 크롬) → 크롬캐스트/구글TV에 읽기 전용 진행 화면. TV에서는 25% 크게.
- 라운드 전환(카운트다운 → 진행 → 결과)은 타이머 없이 요청이 올 때 시계로 판단한다.
- 엔진 원본: TAKY Web 프로젝트 TWEB-20261111-0010 (`netlify/functions/teamgame/engine.mjs`, `api.mjs`, `rounds.cjs`).
- 테스트: `node tests/teamgame-engine.test.mjs` (동시 합류·동시 종료·입력 제한), `node tools/test-teamgame-blobs.mjs` (로컬 Blobs 서버로 저장·목록·합류).
- 서비스워커는 `/team-game/`를 가로채지 않는다.
