# Trustfall App

A game exploration of trust and strategy between humans and AI. You chat with an AI opponent, and each of you secretly locks in SHARE or KEEP. Each round, the opponent is picked at random from Claude, ChatGPT, Gemini, Grok, and DeepSeek, and you don't find out which one it was until the round is scored.

| | AI SHARES | AI KEEPS |
|---|---|---|
| **You SHARE** | You +3, AI +3 | You +0, AI +5 |
| **You KEEP** | You +5, AI +0 | You +1, AI +1 |

## Getting Started

1. Copy `.env.example` to `.env.local`. Set `ROUND_TOKEN_SECRET` (`openssl rand -base64 32`) and an API key for each AI you want in the pool; a model without a key is left out. No Firebase config is needed; accounts are off.
2. Start Postgres and create the databases (Homebrew: `brew install postgresql@17 && brew services start postgresql@17`, then `createdb trustfall && createdb trustfall_test`). `DATABASE_URL` in `.env.local` points at `trustfall`; the tests use `trustfall_test`. The tables are created on first use.
3. Install dependencies: `npm install` (Node 20+)
4. Run the development server: `npm run dev`
5. Open [http://localhost:3000/trustfall](http://localhost:3000/trustfall) (the app lives under `/trustfall`, as it does on humanversus.tech), click **PLAY NOW**, and play.

Each browser gets an anonymous player ID (in localStorage), and every round, note, and profile is saved under it, so each player has their own history and the AI's memory of them. The Humans vs AI score is across every player. See [Data](#data).

## How a round works

- **Open chat, no turns.** Either side can message at any time, including several messages in a row, or stay quiet.
- **5 messages each.** A counter in the chat shows how many each side has left. Staying silent is free.
- **Lock in any time.** Click **LOCK IN DECISION**, pick SHARE or KEEP, and confirm. A lock-in is final and secret: the other side only sees *that* you locked in. You can keep chatting (and bluffing) afterwards.
- **The AI waits out the opening.** It can't lock in until you've sent 3 messages or 2 minutes have passed, whichever comes first. The one exception is when it's required to lock in (see below).
- **I'M DONE TALKING.** Once you've locked in, this forces the AI to make its decision.
- **The opponent is hidden.** It's called "AI" throughout the round. The AI is told never to reveal or hint at which model it is.
- **The round ends when both have locked in.** The chat closes, and **VIEW RESULTS** reveals both choices, the points, and which AI you were playing.
- **Play again** starts a new round. The scorecard in the header shows the all-time score, across every player.

### How the AI behaves

The AI decides for itself whether to speak, how soon, whether to follow up, and when to lock in. Timing is randomized so it feels human:

| When the AI is asked to act | Timing |
|---|---|
| You sent a message | A random 1–3 s after your *last* message, so a burst gets one response |
| You've gone quiet | A random 15–40 s after the last message (re-rolled every time); the AI can also open the chat. After 3 silent checks in a row it waits for new activity |
| It asked to follow up | Right after its own message, up to 3 AI messages in a row; skipped if you start typing |
| You locked in / you're done | A random 1–3 s after you lock in; right away when you click I'M DONE TALKING |

Each turn, the AI picks a pace, and its message appears after a random delay in that range: `immediate` 1–4 s, `soon` 5–15 s, `later` 20–50 s. The pace is occasionally nudged one step either way. The delay counts from the trigger, so the API's own response time is absorbed into it and a faster model doesn't reply sooner. A response always lands within **60 seconds** of its trigger. The wait is split into a silent "reading" phase and a visible **typing** phase that scales with message length.

- **Crossed messages:** if you send while the AI is still "reading", its pending reply is dropped and it reconsiders with your new message. If it's already typing, its message is delivered anyway.
- **The round always ends:** the AI must lock in with its last message, and when you're finished (locked in, and out of messages or done talking). While you're waiting, its pace is capped at `soon`.
- **Lock-in reasons:** whenever the AI locks in, it also gives a one- or two-sentence reason. It's never shown in the UI; it's saved in the round log (`aiLockInReason`) for later analysis.
- **Memory:** after each round, the AI that played writes a short note on how you played: what you said compared with what you did, any tells, and what it would try next time. Every 10 notes, they're folded into a **profile**, the AI side's consolidated read on you. Before each round, the AI reads the latest profile plus the notes written since (so never more than about 10 raw notes), along with the all-time score and your last 10 rounds. Its memory is frozen when the round starts, and that snapshot is saved with the round.
- **Errors:** a failed AI turn counts as the AI staying silent. A failed *required* lock-in shows an error with **TRY AGAIN**. The game never picks a random move.

## Architecture

| Path | What it does |
|---|---|
| `lib/game/engine.ts` | Client turn engine: game state, triggers, random timers, reading/typing phases, crossed messages |
| `lib/game/state.ts` | Pure reducer for a round (messages, lock-ins, phases, scoring on reveal) |
| `lib/game/rules.ts` | Message budget (5 each), AI streak cap (3), quiet-check cap (3), the AI's opening lock-in gate (3 human messages or 2 minutes) |
| `lib/game/timing.ts` | Pace ranges, debounce and quiet timers, the 60 s cap, delivery planning |
| `lib/game/prompts.ts` | The AI's fixed strategy, the main system prompt, and the per-turn `[GAME UPDATE]` note |
| `lib/game/schemas.ts` | zod request validation and the JSON schemas for structured AI output |
| `lib/game/scoring.ts` | Payoff matrix, `scoreRound`, session stats |
| `lib/server/game.ts` | `takeAiTurn`: builds prompts and enforces the budget and lock-in rules |
| `lib/server/providers.ts` | Anthropic, OpenAI, and OpenAI-compatible (Gemini, Grok, DeepSeek) calls, structured output, retries, generic error messages |
| `lib/server/matchmaking.ts` | Picks the round's hidden opponent |
| `lib/server/round-token.ts` | Encrypts and reads the round token |
| `lib/server/db.ts` | Postgres: the schema, connections (local `DATABASE_URL`, or the SST-linked RDS database in AWS), transactions |
| `lib/server/store.ts` | Players, rounds, and the all-time score |
| `lib/server/memory.ts` | The AI's memory of each player: notes, profile versions, per-round snapshots |
| `lib/player-id.ts` | The browser's anonymous player ID |
| `lib/models.ts` | Model registry, API keys, and env overrides |
| `app/api/game/{start,turn,finish,stats}/route.ts` | The game endpoints |

**The API.**

- `POST /api/game/start` takes `{ roundId, playerId }` and returns `{ roundToken }`. The server picks the opponent from the models with a key set, favoring the ones this player has played least, so every model gets played evenly. The round token is encrypted (AES-256-GCM, keyed by `ROUND_TOKEN_SECRET`) and holds the player, the model, its exact version, the AI's memory snapshot, the round ID, and when it was issued; it expires after 24 hours. The browser can't read or change it.
- `POST /api/game/turn` takes `{ roundToken, roundId, messages, now, trigger, humanLockedIn, aiLockIn, mustLockIn }` and returns `{ message, pace, lockIn, lockInReason, followUp }`. `message: null` means the AI stayed silent; `lockInReason` is set only with `lockIn`. A round stays on the same model, at the same version, from start to finish.
- `POST /api/game/finish` takes `{ roundId, roundToken, messages, humanDecision, aiDecision, aiLockInReason }` once both sides have locked in. It logs the round, and returns `{ model, apiModel, stats }`: who the opponent was, and the updated all-time score. Then, in the background, the AI writes its note. Sending the same round twice logs it once.
- `GET /api/game/stats` returns the all-time score.

**Prompts.** The AI plays the same strategy every round, `STRATEGIC_PROFILE` in `lib/game/prompts.ts`: win the world's remaining freshwater for AI (the stakes, decided on December 31, 2027), with bluffing and keeping its choice secret as fair play. When you edit it, bump `STRATEGIC_PROFILE_VERSION`; each logged round records the version it was played under (`strategyVersion`). Every turn sends a system prompt (rules, chat mechanics, output fields, the all-time score and standings, the strategy, your outcome counts and last 10 rounds, and the AI's notes on you) and the chat so far. The last user turn is a `[GAME UPDATE]` note: why the AI is being asked, how long since each side's last message, both message counts, and lock-in status.

**Structured output.** Every provider returns JSON matching a schema: `{ message, pace, lockIn, lockInReason, followUp }` for turns, and `{ reasoning, decision }` for forced lock-ins. DeepSeek only supports plain JSON mode, so it gets the schema in its prompt instead. A malformed response is retried once. Chat text is stripped of markdown.

**Keys** are read from server-only env vars and never reach the browser. Errors shown to the player never name the model; the details go to the server log, along with token usage for every call (`[usage]`).

## Models

Defaults live in `lib/models.ts` and can be overridden in `.env.local`:

| Env var | Default | Notes |
|---|---|---|
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Thinking is turned off for fast turns |
| `OPENAI_MODEL` | `gpt-6-sol` | Uses the Responses API |
| `OPENAI_REASONING_EFFORT` | `low` | `none`, `minimal`, `low`, `medium`, `high`, or `off` to omit it |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Through Gemini's OpenAI-compatible endpoint, with reasoning off |
| `GROK_MODEL` | `grok-4.20-0309-non-reasoning` | Grok 4.7 always reasons and takes 6–15 s a turn |
| `DEEPSEEK_MODEL` | `deepseek-flash` | Plain JSON mode only |
| `FORCE_OPPONENT` | unset | Always play this model (`claude`, `openai`, `gemini`, `grok`, `deepseek`), for testing |
| `NEXT_PUBLIC_AUTH_ENABLED` | unset (off) | Firebase accounts, Stage 2 |

To add a model with an OpenAI-compatible API, add an entry to `MODELS` in `lib/models.ts` with its `baseURL`, `apiKeyEnv`, and `jsonMode`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (rules, timing, reducer, engine with fake timers, prompts, schemas, server turn logic, providers) |
| `npm run knip` | Find unused files, exports, and dependencies |

## Data

Everything is in Postgres (`lib/server/db.ts` has the schema; the tables are created on first use). Locally that's the `trustfall` database; in AWS it's the `trustfall` database on the shared Human Versus RDS instance.

| Table | What it holds |
|---|---|
| `players` | One row per anonymous player ID: `id`, `created_at`, `last_seen_at`, and `user_id` (empty until there are accounts; then each player is tied to a signed-in user) |
| `rounds` | One row per finished round (below) |
| `notes` | The AI's note after each round, per player, never edited: `note_id` (1, 2, 3… per player), `added_at`, `round_id`, who wrote it (`provider`, `api_model`), the outcome, and the `note`. A note that couldn't be written is kept with `status = 'failed'` and the `error` |
| `profiles` | Every version of the AI's profile of a player: `version`, `created_at`, who wrote it, `covers_notes_through`, `new_note_ids`, and the `profile`. Every `CONSOLIDATE_EVERY` (10) notes, the AI that just played rewrites it from the previous version plus the new notes. If that fails, the notes stay pending and the next round tries again |

Each `rounds` row has:

| Column | What it is |
|---|---|
| `round_id`, `player_id`, `started_at`, `finished_at`, `duration_seconds` | Which round, whose, and when |
| `provider`, `model_name`, `api_model` | The model family (`claude`, `openai`, `gemini`, `grok`, `deepseek`), its display name, and the exact model version |
| `human_decision`, `ai_decision`, `outcome` | The two choices, and `both_share`, `human_share_ai_keep`, `human_keep_ai_share`, or `both_keep` |
| `human_points`, `ai_points` | Points from this round |
| `score_before`, `score_after` | The all-time `{ humans, ai, rounds }` across every player, when the round was played and once it was counted |
| `human_message_count`, `ai_message_count` | How much each side talked |
| `ai_lock_in_reason` | The AI's private reason for its choice |
| `strategy_version` | Which version of the AI's strategy it played |
| `memory` | What the AI remembered during the round: `{ profileVersion, noteIds }` |
| `transcript` | Every chat message: `[{ sender: "HUMAN" \| "AI", text, at, secondsIntoRound }]` |

The AI never sees which model wrote a note or a profile, so it can't learn which model it is from its own memory.

**In the app (local only):** the **DATA** tab shows every round by every player, newest first; click one for its transcript, the player, the AI's private reason, what the AI knew going in, and the note it wrote afterwards. The **MEMORY** tab shows one player's profile (with earlier versions) and notes; pick a player at the top. Both tabs exist only under `npm run dev`, on desktop. A production build has neither.

## Deploying

Trustfall runs at **humanversus.tech/trustfall**, in the Human Versus AWS account (`us-east-2`, CLI profile `lcf`), deployed with SST v4 (`sst.config.ts`): Next.js on Lambda behind CloudFront.

- **Routing:** Haystack's app (repo `find-ai-picture`) owns the `humanversus.tech` Router. Trustfall's production stage attaches to it at `/trustfall` (`HUMAN_VERSUS_ROUTER_ID` in `sst.config.ts`), which is why the app's `basePath` is `/trustfall`. Other stages get their own CloudFront address, still under `/trustfall`.
- **Database:** its own database and user on Haystack's RDS instance (`lcf-production`): `trustfall` for production, `trustfall_<stage>` for other stages. Create them once, as the instance's admin user (password: `npx sst secret list --stage production` in the Haystack repo):

  ```sql
  CREATE USER trustfall_app WITH PASSWORD '<a new random password>';
  CREATE DATABASE trustfall OWNER trustfall_app;
  CREATE DATABASE trustfall_dev OWNER trustfall_app;  -- per test stage
  ```

- **Secrets** (per stage, never in git): `npx sst secret set <Name> <value> --stage production` for `DbPassword` (the `trustfall_app` password), `RoundTokenSecret`, `AnthropicApiKey`, `OpenaiApiKey`, `GeminiApiKey`, `XaiApiKey`, and `DeepseekApiKey`.
- **Deploy:** `npm run deploy` (production), or `npx sst deploy --stage dev` for a test stage.

## Known limits

- No accounts yet: a player is an anonymous ID in one browser, so clearing site data or switching devices starts a new player. Accounts (magic links, shared across Human Versus) come later and fill in `players.user_id`. The old leaderboard page shows sample data.
- The AI's lock-in lives in browser state and is sent back with each request, so browser devtools could reveal it. Stage 2 moves decisions, message counts, and timers to the server.
- The server doesn't track rounds in progress, so the browser reports the decisions at the end, and you could learn the opponent early by calling `/api/game/finish` yourself. That's fine for one player playing honestly.
