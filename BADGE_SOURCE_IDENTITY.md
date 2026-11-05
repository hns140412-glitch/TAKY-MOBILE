# Badge source identity — asymmetric signing contract

Status: CODE/CONTRACT DRAFT / NOT DEPLOYED

Why:
- Ready has server functions, but Hide & Seek and Snap & Pop are currently static-first apps.
- A shared secret embedded in public client JavaScript would not authenticate the source app.
- TAKY Mobile trusted-device cookie is not inherited by product apps.

Model:
1. Each app installation creates an ECDSA P-256 keypair with WebCrypto.
2. The private key is non-extractable and remains in the installation's local browser storage.
3. The public JWK is registered to central transport through a separately authorized pairing flow.
4. Each badge observation signs the canonical source message.
5. Central transport verifies the signature and requires registered app_id == observation.app_id.
6. Revoked/inactive keys fail closed.

Canonical signed fields:
contract_version
event_id
app_id
event_family
behavior_code
occurred_at
source_contract_id
evidence_ref
explicit_child_action

A valid signature does NOT authorize badge activation, economy mutation, semantic inference, or catalog changes.

OPEN:
- durable public-key registry adapter
- authorized installation registration/pairing flow
- source-app signing helper integration
- live E2E
