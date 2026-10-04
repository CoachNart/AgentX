# AgentX

Quality-first X engagement assistant built around official X access, user review and durable jobs.

## Flow
Connect X with OAuth 2.0 + PKCE → paste links → normalize/deduplicate → persist batch → fetch permitted X data → analyze → generate → quality/repetition checks → review/edit/approve/skip → durable publish job → publish → record outcome.

## Stack
Next.js, TypeScript, Tailwind, PostgreSQL, Prisma, Zod, server-side AI provider and official X API.

## Setup
Copy .env.example to .env.local, create PostgreSQL, run npm install, run npm run db:migrate locally or npm run db:deploy in production, configure X callback and scopes, set AI credentials, then npm run dev.

## Worker
/api/queue/worker is the durable worker endpoint. CRON_SECRET protects it when set. Stale locks are recovered. A unique publication job and publishedReplyId prevent duplicate replies.

## Vercel
The included cron is daily because Vercel Hobby scheduling is daily-only. For near-real-time processing use an external scheduler/queue or a plan with the needed cron frequency.

## Safety
No passwords, cookies, browser session tokens, detection evasion, identity rotation, rate-limit bypass or deceptive automation.