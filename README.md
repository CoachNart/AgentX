# AgentX

Production foundation for a quality-first X engagement assistant.

## Stack
Next.js App Router + TypeScript + Tailwind CSS + Zod.

## Core workflow
Paste X links → validate/deduplicate → fetch through official X API → analyze server-side → generate context-aware reply → quality/repetition checks → review → approve → publish through permitted X API access.

## Safety
AgentX does not implement detection evasion, identity rotation, API-limit bypasses, credential scraping, spoofing, or deceptive engagement automation.

## Environment
Copy .env.example to .env.local and provide provider credentials only on the server. Never expose secrets to client code.

## Next implementation layers
1. PostgreSQL/Prisma persistence and migrations.
2. Official X OAuth 2.0 flow and encrypted token storage.
3. Server-side X API adapter.
4. AI analysis/reply/evaluation services with Zod schemas.
5. Durable queue and idempotent publishing jobs.
6. Review, history, settings, voice profile, diagnostics.
7. Unit/integration/E2E tests with mocked external APIs.
