# surfer

Static file server with a Vue admin UI and a CLI uploader. Backend is `server.js`; frontend is built with Vite (`npm run dev` / `npm run build` at the repo root).

Sibling s42 apps live in `../`. Shared Vue UI is `@cloudron/pankow` (source: `../../utils/pankow`). Shared Node helpers are `@cloudron/tegel` (source: `../../utils/tegel`) — use tegel when adding new auth/session code; this app still has its own OIDC wiring. Platform code is `../../platform`. App-bridge server and the rest of the platform live in `../../platform/box`.

Reuse patterns from sibling s42 apps instead of inventing new ones. Prefer pankow components whenever they exist.

## Develop

Export OIDC env vars (issuer, client id/secret, `APP_ORIGIN`) then:

```bash
./develop.sh
```

That starts `node ./server.js`. Frontend hot reload in a second terminal:

```bash
npm run dev
```

Admin UI is at e.g. `http://localhost:5173/admin.html`.

## Test

Local unit and route tests:

```bash
npm test
```

Those live in `src/test/` and `src/routes/test/`. Route tests start the server with `SURFER_ENV=test`, which turns on Tegel `testMode` so requests are already signed in.

The Cloudron end-to-end suite is separate:

```bash
npm run test:e2e
```

That file is `test/test.js`.

## Shared libraries

- **Pankow** — Vue 3 components (`MainLayout`, `TopBar`, `Button`, `Dialog`, `TextInput`, `TableView`, `LoginView`, …). Import from `@cloudron/pankow`. Do not add a parallel UI kit.
- **Tegel** — prefer `createExpressApp()`, OIDC helpers, `HttpError` / `HttpSuccess`, and `appBridge` for new work.
- **Box app-bridge** — platform HTTP API (`../../platform/box/src/app-bridge.js`). Apps call it through `tegel.appBridge`, not by copying box code.

## Code style

- Javascript ESM
- Single quotes, semicolons
- Function declarations, not function expressions
- Functional patterns where possible
- Remove trailing whitespace
- Vue 3 `<script setup>`; use `@cloudron/pankow` as much as possible
- Async fallible calls use `safe()` from `@cloudron/safetydance`, not try/catch. `await safe(promise)` returns `[error, result]`. Synchronous try/catch is fine.
- Match the indent of the file being edited
