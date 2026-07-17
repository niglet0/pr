# Hatch

A social platform for builders to launch products, post dev-stack updates, post bounties, and trade in a sandbox marketplace — with "SPQR Oracle," an AI agent chat that has real read/write access to the app's data.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/forum-romanum run dev` — run the web frontend ("Hatch")
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (Replit-managed Postgres via Drizzle)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- App data: Supabase (existing tables — launches, bounties, dev stacks, sandbox marketplace, posts, users, messages)
- Agent/chat persistence: Replit Postgres + Drizzle ORM (`lib/db/src/schema/spqr.ts` — conversations, messages, long-term memories)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite, `motion/react` for animation, `react-markdown` for chat rendering

## Where things live

- `artifacts/api-server/src/services/spqrAgent.ts` — SPQR Oracle agent: system prompt, tool definitions (query/write over Supabase tables), card builders, event emitter for live status
- `artifacts/api-server/src/routes/spqr.ts` — SSE streaming chat route (`POST /api/spqr/chat`) + conversation history route
- `artifacts/forum-romanum/src/views/Messages.tsx` — `BotChat` component (SPQR chat UI, SSE client)
- `artifacts/forum-romanum/src/components/spqr/SpqrCards.tsx` — themed card renderer for structured agent results (launches, bounties, stacks, products, users, posts)
- `lib/db/src/schema/spqr.ts` — Drizzle schema for agent conversations/messages/memories

## Architecture decisions

- SPQR Oracle uses Pollinations' free OpenAI-compatible endpoint (`https://text.pollinations.ai/openai/chat/completions`, model `openai-fast`) for LLM + tool calling, since paid Replit AI Integrations (Anthropic/OpenAI) were declined. See `.agents/memory/free-llm-fallback-pollinations.md`.
- The agent's system prompt strictly forbids leaking raw Supabase schema/table/column/UUID names to users — it must speak in plain product terms only.
- Structured data (launches, bounties, etc.) is returned via typed `SpqrCard[]` objects (not markdown tables) and rendered as UI cards on the frontend, avoiding broken/ugly markdown table rendering.
- Chat responses stream over SSE (`POST /api/spqr/chat`) with `status`/`tool`/`done`/`error` events so the UI can show a live "what the agent is doing" indicator instead of a static spinner.

## Product

- Users can launch products, post dev-stack updates, post/browse bounties, and buy/sell in a sandbox marketplace.
- Messaging includes 1:1 chats, groups, and the SPQR Oracle — an AI agent with real read/write access to launches, bounties, stacks, marketplace listings, posts, and user data, plus persistent memory across visits.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `BotChat`'s SSE stream must be consumed via `fetch` + `ReadableStream` reader, not `EventSource` (EventSource can't send POST bodies/auth headers).
- Auth: frontend fetches a Supabase access token via `supabase.auth.getSession()` and sends it as `Authorization: Bearer <token>`; backend's `populateAuth` middleware sets `req.userId`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
