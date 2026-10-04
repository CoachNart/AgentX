# AgentX

AgentX is an AI-assisted workflow application for working with selected X posts through the official X API.

## Persistence

AgentX uses **Firebase Firestore** through the server-side Firebase Admin SDK. No Firebase client credentials are exposed to the browser.

Set these server-side environment variables:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `ENCRYPTION_KEY`

X OAuth, AI, queue processing, review, approval and publishing continue to use the existing server-side architecture.

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
