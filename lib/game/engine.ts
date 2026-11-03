import type { Choice } from "@/types/game"
import { MAX_AI_STREAK, MAX_QUIET_CHECKS, aiStreak, messagesLeft } from "./rules"
import type { ScoreStats } from "@/types/game"
import type {
  FinishRequest,
  FinishResponse,
  StartRequest,
  StartResponse,
  Trigger,
  TurnRequest,
  TurnResponse,
} from "./schemas"
import { gameReducer, humanFinished, initialGameState, type GameAction, type GameState } from "./state"
import { HUMAN_MESSAGE_DEBOUNCE_MS, QUIET_MS, capPace, jitterPace, planDelivery, randomBetween } from "./timing"

/** A follow-up is skipped if the human typed this recently. */
const TYPING_GRACE_MS = 3000

type PendingTurn = {
  id: number
  trigger: Trigger
  mustLockIn: boolean
  startedAt: number
  /** requesting: waiting on the API. reading: silent delay. typing: indicator showing. */
  phase: "requesting" | "reading" | "typing"
  controller: AbortController
  timer?: ReturnType<typeof setTimeout>
}

type EngineDeps = {
  requestStart: (payload: Omit<StartRequest, "playerId">) => Promise<StartResponse>
  requestFinish: (payload: FinishRequest) => Promise<FinishResponse>
  requestTurn: (payload: TurnRequest, signal: AbortSignal) => Promise<TurnResponse>
  random?: () => number
}

/**
 * Runs a round: holds the game state and decides when the AI is asked to act,
 * how long its reply takes to appear, and what happens when messages cross.
 */
export function createGameEngine({ requestStart, requestFinish, requestTurn, random = Math.random }: EngineDeps) {
  let state: GameState = initialGameState
  const listeners = new Set<() => void>()

  let turn: PendingTurn | null = null
  let queued: Trigger | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let quietTimer: ReturnType<typeof setTimeout> | null = null
  let quietChecks = 0
  let lastTypingAt = -Infinity
  let seq = 0

  function dispatch(action: GameAction): boolean {
    const next = gameReducer(state, action)
    if (next === state) return false
    state = next
    listeners.forEach((listener) => listener())
    return true
  }

  const active = () => state.phase === "chatting"

  function clearTimer(timer: ReturnType<typeof setTimeout> | null) {
    if (timer) clearTimeout(timer)
    return null
  }

  function cancelTurn() {
    if (!turn) return
    turn.controller.abort()
    clearTimer(turn.timer ?? null)
    if (turn.phase === "typing") dispatch({ type: "AI_TYPING", roundId: state.roundId, typing: false })
    turn = null
  }

  function stopAll() {
    cancelTurn()
    queued = null
    debounceTimer = clearTimer(debounceTimer)
    quietTimer = clearTimer(quietTimer)
  }

  function scheduleQuiet() {
    quietTimer = clearTimer(quietTimer)
    if (!active() || messagesLeft(state.messages, "AI") === 0 || quietChecks >= MAX_QUIET_CHECKS) return
    quietTimer = setTimeout(() => {
      quietTimer = null
      request("human_quiet")
    }, randomBetween(QUIET_MS, random))
  }

  function debounce(trigger: Trigger) {
    debounceTimer = clearTimer(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      request(trigger)
    }, randomBetween(HUMAN_MESSAGE_DEBOUNCE_MS, random))
  }

  function runQueued(): boolean {
    const next = queued
    queued = null
    if (next) request(next)
    return next !== null
  }

  /** What to do after an AI turn ends without anything else scheduled. */
  function continueAfterTurn() {
    if (runQueued()) return
    const aiLeft = messagesLeft(state.messages, "AI")
    if (!state.aiLockIn && (aiLeft === 0 || humanFinished(state))) {
      // request() marks this as a required lock-in.
      request(humanFinished(state) ? "human_finished" : "human_quiet")
      return
    }
    scheduleQuiet()
  }

  function request(requested: Trigger) {
    if (!active() || !state.roundToken) return
    const aiLeft = messagesLeft(state.messages, "AI")
    if (state.aiLockIn && aiLeft === 0) return

    const finished = !state.aiLockIn && humanFinished(state)
    const trigger: Trigger = finished ? "human_finished" : requested

    if (trigger === "follow_up") {
      const humanTyping = Date.now() - lastTypingAt < TYPING_GRACE_MS
      if (aiStreak(state.messages) >= MAX_AI_STREAK || humanTyping) {
        scheduleQuiet()
        return
      }
    }

    // A message that's already being typed is delivered; handle this trigger after it.
    if (turn?.phase === "typing") {
      if (queued !== "human_finished") queued = trigger
      return
    }
    cancelTurn()
    quietTimer = clearTimer(quietTimer)

    const mustLockIn = !state.aiLockIn && (finished || aiLeft === 0)
    const pending: PendingTurn = {
      id: ++seq,
      trigger,
      mustLockIn,
      startedAt: Date.now(),
      phase: "requesting",
      controller: new AbortController(),
    }
    turn = pending

    requestTurn(
      {
        roundToken: state.roundToken,
        roundId: state.roundId,
        messages: state.messages,
        now: Date.now(),
        trigger,
        humanLockedIn: state.humanLockIn !== null,
        aiLockIn: state.aiLockIn,
        mustLockIn,
      },
      pending.controller.signal,
    ).then(
      (response) => {
        if (turn === pending) deliver(pending, response)
      },
      (error: Error) => {
        if (turn !== pending) return
        turn = null
        if (mustLockIn) {
          // The human is waiting on this one: surface it with a retry, never invent a move.
          dispatch({ type: "LOCK_IN_FAILED", roundId: state.roundId, error: error.message })
          return
        }
        // Otherwise treat it as the AI staying silent; the next trigger tries again.
        scheduleQuiet()
        runQueued()
      },
    )
  }

  function deliver(pending: PendingTurn, response: TurnResponse) {
    const { message, lockIn } = response
    if (!message && !lockIn) {
      turn = null
      if (pending.trigger === "human_quiet") quietChecks++
      continueAfterTurn()
      return
    }

    let pace = jitterPace(response.pace, random)
    if (pending.mustLockIn) pace = capPace(pace, "soon")
    const { readingMs, typingMs } = planDelivery(
      { pace, messageLength: message?.length ?? 0, elapsedMs: Date.now() - pending.startedAt },
      random,
    )

    pending.phase = "reading"
    pending.timer = setTimeout(() => {
      if (turn !== pending) return
      if (!message) return finish(pending, response)
      pending.phase = "typing"
      dispatch({ type: "AI_TYPING", roundId: state.roundId, typing: true })
      pending.timer = setTimeout(() => {
        if (turn === pending) finish(pending, response)
      }, typingMs)
    }, readingMs)
  }

  function finish(pending: PendingTurn, response: TurnResponse) {
    turn = null
    dispatch({
      type: "AI_TURN",
      roundId: state.roundId,
      message: response.message ? { sender: "AI", content: response.message, timestamp: Date.now() } : null,
      lockIn: response.lockIn,
      lockInReason: response.lockInReason,
    })
    if (response.message) quietChecks = 0

    if (!active()) {
      stopAll()
      return
    }
    if (queued) {
      runQueued()
      return
    }
    if (response.followUp && response.message) {
      request("follow_up")
      return
    }
    continueAfterTurn()
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    /** Ask the server for a hidden opponent, then open the chat. */
    async startRound(roundId: string) {
      stopAll()
      quietChecks = 0
      dispatch({ type: "MATCHING", roundId })
      try {
        const { roundToken } = await requestStart({ roundId })
        if (!dispatch({ type: "START_ROUND", roundId, roundToken, now: Date.now() })) return
        // The AI may open the chat if the human stays quiet.
        scheduleQuiet()
      } catch (error) {
        dispatch({ type: "MATCH_FAILED", roundId, error: (error as Error).message })
      }
    },

    sendMessage(content: string): boolean {
      const text = content.trim()
      if (!text || !active()) return false
      const sent = dispatch({
        type: "HUMAN_MESSAGE",
        roundId: state.roundId,
        message: { sender: "YOU", content: text, timestamp: Date.now() },
      })
      if (!sent) return false

      quietChecks = 0
      quietTimer = clearTimer(quietTimer)
      // The AI hadn't started typing yet: drop its pending reply and reconsider with this message.
      if (turn && turn.phase !== "typing") cancelTurn()
      debounce("human_message")
      return true
    },

    notifyTyping() {
      lastTypingAt = Date.now()
      let restart = quietTimer !== null
      if (turn?.trigger === "follow_up" && turn.phase !== "typing") {
        cancelTurn()
        restart = true
      }
      if (restart) scheduleQuiet()
    },

    lockIn(choice: Choice) {
      if (!dispatch({ type: "HUMAN_LOCK_IN", roundId: state.roundId, choice })) return
      if (!active()) {
        stopAll()
        return
      }
      debounce("human_locked_in")
    },

    doneTalking() {
      if (!dispatch({ type: "HUMAN_DONE", roundId: state.roundId })) return
      debounceTimer = clearTimer(debounceTimer)
      request("human_finished")
    },

    retryLockIn() {
      dispatch({ type: "DISMISS_ERROR" })
      request("human_finished")
    },

    /** Log the round on the server, then score it and find out who the opponent was. */
    async reveal() {
      const { roundId, roundToken, messages, humanLockIn, aiLockIn, aiLockInReason } = state
      if (!roundToken || !humanLockIn || !aiLockIn || !dispatch({ type: "REVEAL_STARTED", roundId })) return
      try {
        const finished = await requestFinish({
          roundId,
          roundToken,
          messages,
          humanDecision: humanLockIn,
          aiDecision: aiLockIn,
          aiLockInReason,
        })
        dispatch({ type: "REVEAL", roundId, ...finished, date: new Date().toISOString() })
      } catch (error) {
        dispatch({ type: "REVEAL_FAILED", roundId, error: (error as Error).message })
      }
    },

    setStats(stats: ScoreStats) {
      dispatch({ type: "STATS_LOADED", stats })
    },

    dismissError() {
      dispatch({ type: "DISMISS_ERROR" })
    },
  }
}

export type GameEngine = ReturnType<typeof createGameEngine>
