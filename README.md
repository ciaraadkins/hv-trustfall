# Trustfall App

A game exploration of trust and strategy between humans and AI. You chat with an AI opponent (Claude or ChatGPT), and each of you secretly locks in SHARE or KEEP.

| | AI SHARES | AI KEEPS |
|---|---|---|
| **You SHARE** | You +3, AI +3 | You +0, AI +5 |
| **You KEEP** | You +5, AI +0 | You +1, AI +1 |

## Getting Started

1. Copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`. No Firebase config is needed; accounts are off and everyone plays as a local guest.
2. Install dependencies: `npm install` (Node 20+)
3. Run the development server: `npm run dev`
4. Open [http://localhost:3000](http://localhost:3000), pick an opponent, and play.

Scores and round history live in memory for the browser tab and reset on refresh.

## How a round works

- **Open chat, no turns.** Either side can message at any time, including several messages in a row, or stay quiet.
- **5 messages each.** A counter in the chat shows how many each side has left. Staying silent is free.
- **Lock in any time.** Click **LOCK IN DECISION**, pick SHARE or KEEP, and confirm. A lock-in is final and secret: the other side only sees *that* you locked in. You can keep chatting (and bluffing) afterwards.
- **The AI waits out the opening.** It can't lock in until you've sent 3 messages or 2 minutes have passed, whichever comes first. The one exception is when it's required to lock in (see below).
- **I'M DONE TALKING.** Once you've locked in, this forces the AI to make its decision.
- **The round ends when both have locked in.** The chat closes, and **VIEW RESULTS** reveals both choices and the points.
- **Play again** starts a new round; session totals carry over. `/summary` lists this session's rounds.

### How the AI behaves

The AI decides for itself whether to speak, how soon, whether to follow up, and when to lock in. Timing is randomized so it feels human:

| When the AI is asked to act | Timing |
|---|---|
| You sent a message | A random 1–3 s after your *last* message, so a burst gets one response |
| You've gone quiet | A random 15–40 s after the last message (re-rolled every time); the AI can also open the chat. After 3 silent checks in a row it waits for new activity |
| It asked to follow up | Right after its own message, up to 3 AI messages in a row; skipped if you start typing |
| You locked in / you're done | A random 1–3 s after you lock in; right away when you click I'M DONE TALKING |

Each turn, the AI picks a pace, and its message appears after a random delay in that range: `immediate` 1–4 s, `soon` 5–15 s, `later` 20–50 s. The pace is occasionally nudged one step either way. A response always lands within **60 seconds** of its trigger. The wait is split into a silent "reading" phase and a visible **typing** phase that scales with message length.

- **Crossed messages:** if you send while the AI is still "reading", its pending reply is dropped and it reconsiders with your new message. If it's already typing, its message is delivered anyway.
- **The round always ends:** the AI must lock in with its last message, and when you're finished (locked in, and out of messages or done talking). While you're waiting, its pace is capped at `soon`.
- **Lock-in reasons:** whenever the AI locks in, it also gives a one- or two-sentence reason. It's never shown in the UI; it's stored on the round result (`aiReasoning`) for later analysis.
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
| `lib/server/providers.ts` | Anthropic and OpenAI SDK calls, structured output, retries, error messages |
| `lib/models.ts` | Model registry and env overrides |
| `app/api/game/turn/route.ts` | The single game endpoint |

**The API.** `POST /api/game/turn` takes `{ model, roundId, messages, sessionStats, now, trigger, humanLockedIn, aiLockIn, mustLockIn }` and returns `{ message, pace, lockIn, lockInReason, followUp }`. `message: null` means the AI stayed silent; `lockInReason` is set only with `lockIn`.

**Prompts.** The AI plays the same strategy every round, `STRATEGIC_PROFILE` in `lib/game/prompts.ts`: outwit the humans and win, with bluffing and keeping its choice secret as fair play. When you edit it, bump `STRATEGIC_PROFILE_VERSION`; each round result records the version it was played under (`profileVersion`). Every turn sends a system prompt (rules, chat mechanics, output fields, scores and standings, the strategy, the human's history) and the chat so far. The last user turn is a `[GAME UPDATE]` note: why the AI is being asked, how long since each side's last message, both message counts, and lock-in status.

**Structured output.** Both providers return JSON matching a schema: `{ message, pace, lockIn, lockInReason, followUp }` for turns, and `{ reasoning, decision }` for forced lock-ins. A malformed response is retried once. Chat text is stripped of markdown.

**Keys** are read from server-only env vars and never reach the browser.

## Models

Defaults live in `lib/models.ts` and can be overridden in `.env.local`:

| Env var | Default | Notes |
|---|---|---|
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Thinking is turned off for fast turns |
| `OPENAI_MODEL` | `gpt-6-sol` | Uses the Responses API |
| `OPENAI_REASONING_EFFORT` | `low` | `none`, `minimal`, `low`, `medium`, `high`, or `off` to omit it |
| `NEXT_PUBLIC_AUTH_ENABLED` | unset (off) | Firebase accounts, Stage 2 |

Gemini is hidden until it's built.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (rules, timing, reducer, engine with fake timers, prompts, schemas, server turn logic, providers) |
| `npm run knip` | Find unused files, exports, and dependencies |

## Known limits (Stage 1)

- Everything is local: no accounts, no saved games, and the leaderboard shows sample data.
- The AI's lock-in lives in browser state and is sent back with each request, so browser devtools could reveal it. Stage 2 moves decisions, message counts, and timers to the server.
- Round results, including the AI's lock-in reasoning, only live in the browser tab. Stage 2 saves them for analysis.
