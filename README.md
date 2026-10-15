# AgentX

AgentX is an AI-assisted workspace for reviewing and publishing replies to selected X posts.

## Local-first storage

The active workspace is designed to run without a database while the product is being built:

- Workspace queue, imported-post records, generated replies, metrics, drafts, history and settings are saved in the browser's `localStorage`.
- X OAuth tokens are kept in an encrypted, HTTP-only server cookie. Tokens are not written to browser storage.
- Post retrieval, AI analysis/reply generation and publishing use stateless server endpoints; workspace records remain on the user's device.
- Local data belongs to the current browser and device. Clearing browser site data removes it, and it does not sync across devices. Add a database later for durable cross-device storage and background processing.

## Environment

Configure these server-side variables:

- `X_CLIENT_ID`
- `X_CLIENT_SECRET` (if required by your X OAuth app)
- `X_REDIRECT_URI` (must exactly match the callback configured with X)
- `AI_API_KEY`
- `AI_API_URL` (optional; defaults to the OpenAI-compatible chat completions endpoint)
- `AI_MODEL`
- `ENCRYPTION_KEY` (required to encrypt the OAuth session cookie)

Firebase credentials are not required by the active local-first workspace.

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
