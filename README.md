# TAKY Mobile MVP

Status: LOCAL MVP / NOT CANONICAL / NOT DEPLOYED

## Included
- Mobile-first TAKY chat shell
- `/` context-aware command palette
- Natural-language intent stubs
- `ㄱ` = continue signal
- WORK screen
- LAB screen
- TRACE screen
- LocalStorage persistence
- PWA manifest + service worker

## Run locally
Use any static HTTP server from this folder, e.g.

```bash
python -m http.server 8080
```

Then open:
`http://localhost:8080`

## Current boundary
This MVP does not write GitHub canonical, Google Drive, Notion, Mail, or deploy to Netlify.
Those require real adapters/server-side credentials.

## Next implementation queue
1. IndexedDB/Dexie storage contract
2. Canonical Loader (TAKY.md / MASTER / OS)
3. GitHub read adapter through secure gateway
4. Intent Router
5. Approval state
6. Handoff/Resume packet
7. Google Drive adapter
8. Runtime validation + deploy
