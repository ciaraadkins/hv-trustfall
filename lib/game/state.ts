import { DEFAULT_MODEL } from "@/lib/models"
import type { AIModel, Choice, Message, RoundResult } from "@/types/game"
import { STRATEGIC_PROFILE_VERSION, welcomeMessage } from "./prompts"
import { messagesLeft } from "./rules"
import { scoreRound } from "./scoring"

/**
 * idle     - no round yet (before mount)
 * chatting - open chat; either side may message or lock in
 * locked   - both sides locked in; waiting for the player to view results
 * result   - round scored
 */
type Phase = "idle" | "chatting" | "locked" | "result"

export type GameState = {
  model: AIModel
  roundId: string
  phase: Phase
  messages: Message[]
  /** The AI's typing indicator is showing. */
  aiTyping: boolean
  /** Secret until the reveal; the UI only shows whether it's set. */
  aiLockIn: Choice | null
  /** Why the AI locked in, as it told the server. Never shown in the UI. */
  aiLockInReason: string | null
  humanLockIn: Choice | null
  /** The human clicked I'M DONE TALKING. */
  humanDone: boolean
  lastResult: RoundResult | null
  history: RoundResult[]
  error: string | null
}

export type GameAction =
  | { type: "START_ROUND"; model: AIModel; roundId: string; now: number }
  | { type: "HUMAN_MESSAGE"; roundId: string; message: Message }
  | { type: "AI_TYPING"; roundId: string; typing: boolean }
  | { type: "AI_TURN"; roundId: string; message: Message | null; lockIn: Choice | null; lockInReason: string | null }
  | { type: "HUMAN_LOCK_IN"; roundId: string; choice: Choice }
  | { type: "HUMAN_DONE"; roundId: string }
  | { type: "LOCK_IN_FAILED"; roundId: string; error: string }
  | { type: "REVEAL"; roundId: string; date: string }
  | { type: "DISMISS_ERROR" }

export const initialGameState: GameState = {
  model: DEFAULT_MODEL,
  roundId: "",
  phase: "idle",
  messages: [],
  aiTyping: false,
  aiLockIn: null,
  aiLockInReason: null,
  humanLockIn: null,
  humanDone: false,
  lastResult: null,
  history: [],
  error: null,
}

/** The human has nothing left to do but wait for the AI's lock-in. */
export function humanFinished(state: GameState): boolean {
  return state.humanLockIn !== null && (state.humanDone || messagesLeft(state.messages, "YOU") === 0)
}

function withLockPhase(state: GameState): GameState {
  return state.phase === "chatting" && state.aiLockIn && state.humanLockIn
    ? { ...state, phase: "locked", aiTyping: false }
    : state
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === "START_ROUND") {
    return {
      ...initialGameState,
      history: state.history,
      model: action.model,
      roundId: action.roundId,
      phase: "chatting",
      messages: [{ sender: "SYSTEM", content: welcomeMessage(), timestamp: action.now }],
    }
  }
  if (action.type === "DISMISS_ERROR") return { ...state, error: null }

  // Ignore anything from a round that has since been replaced.
  if (action.roundId !== state.roundId) return state

  switch (action.type) {
    case "HUMAN_MESSAGE":
      if (state.phase !== "chatting" || state.humanDone || messagesLeft(state.messages, "YOU") === 0) return state
      return { ...state, messages: [...state.messages, action.message], error: null }

    case "AI_TYPING":
      if (state.phase !== "chatting") return state
      return { ...state, aiTyping: action.typing }

    case "AI_TURN": {
      if (state.phase !== "chatting") return state
      const canSend = action.message !== null && messagesLeft(state.messages, "AI") > 0
      return withLockPhase({
        ...state,
        aiTyping: false,
        messages: canSend ? [...state.messages, action.message!] : state.messages,
        aiLockIn: state.aiLockIn ?? action.lockIn,
        aiLockInReason: state.aiLockIn ? state.aiLockInReason : action.lockIn ? action.lockInReason : null,
      })
    }

    case "HUMAN_LOCK_IN":
      if (state.phase !== "chatting" || state.humanLockIn) return state
      return withLockPhase({ ...state, humanLockIn: action.choice, error: null })

    case "HUMAN_DONE":
      if (state.phase !== "chatting" || !state.humanLockIn) return state
      return { ...state, humanDone: true }

    case "LOCK_IN_FAILED":
      if (state.phase !== "chatting") return state
      return { ...state, aiTyping: false, error: action.error }

    case "REVEAL": {
      if (state.phase !== "locked" || !state.humanLockIn || !state.aiLockIn) return state
      const result: RoundResult = {
        model: state.model,
        yourDecision: state.humanLockIn,
        aiDecision: state.aiLockIn,
        ...scoreRound(state.humanLockIn, state.aiLockIn),
        aiReasoning: state.aiLockInReason,
        profileVersion: STRATEGIC_PROFILE_VERSION,
        date: action.date,
      }
      return { ...state, phase: "result", lastResult: result, history: [...state.history, result] }
    }
  }
}
