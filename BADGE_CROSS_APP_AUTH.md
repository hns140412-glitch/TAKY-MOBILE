# Badge cross-app auth boundary

Status: CONTRACT_ONLY / NOT DEPLOYED

The existing TAKY Mobile trusted-device cookie is for the TAKY Mobile browser and MUST NOT be treated as inherited authentication for Ready-Set, Hide-Seek, or Snap-Pop.

A production badge observation ingest endpoint therefore requires a separate app-to-server authentication contract.

Required properties:
- each source app has an explicit trusted identity;
- credentials are not embedded in public client JavaScript;
- transport can authenticate app_id independently of payload claims;
- authenticated source identity must equal observation.app_id;
- replay handling remains separate from semantic dedupe;
- auth failure must not create ledger entries or matcher inputs;
- no auth mechanism grants badge activation/economy authority.

Current status:
- source observation schema validation: implemented on draft branch
- transport dedupe core: implemented on draft branch
- durable ledger adapter: not configured
- cross-app authentication: not implemented
- production endpoint deployment: HOLD
