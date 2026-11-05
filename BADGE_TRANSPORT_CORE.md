# Badge central transport core

Status: implementation scaffold / not deployed / not persistent

This module implements only the fail-closed transport boundary:
- exact TAKY_BADGE_SOURCE_OBSERVATION_V1 validation
- allowed app validation
- observation-only authority checks
- app_id + event_id dedupe
- duplicate conflict rejection
- exact matcher tuple projection

It intentionally does NOT:
- persist to an external service
- activate badges
- award rewards/economy
- infer behavior semantics
- accept legacy badge events

The bundled memory ledger is test-only. Production persistence requires a separately reviewed immutable storage adapter.
