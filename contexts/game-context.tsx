"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { OPPONENT_NAME } from "@/lib/models"
import { requestFinish, requestStart, requestStats, requestTurn } from "@/lib/game/api-client"
import { createGameEngine, type GameEngine } from "@/lib/game/engine"
import { messagesLeft } from "@/lib/game/rules"
import { EMPTY_STATS } from "@/lib/game/scoring"
import { humanFinished, initialGameState, type GameState } from "@/lib/game/state"
import type { Choice, ScoreStats } from "@/types/game"

interface GameContextType {
  state: GameState
  /** What the opponent is called until the reveal. */
  aiName: string
  /** The overall Humans vs AI score, from the local round log. Zero until it loads. */
  stats: ScoreStats
  yourMessagesLeft: number
  aiMessagesLeft: number
  /** You've locked in and have nothing left to do but wait for the AI. */
  waitingOnAi: boolean
  sendMessage: (content: string) => boolean
  notifyTyping: () => void
  lockIn: (choice: Choice) => void
  doneTalking: () => void
  retryLockIn: () => void
  reveal: () => void
  /** Start a fresh round against a new hidden opponent. */
  startRound: () => void
  dismissError: () => void
}

const GameContext = createContext<GameContextType | null>(null)

export const useGame = () => {
  const context = useContext(GameContext)
  if (!context) throw new Error("useGame must be used inside GameProvider")
  return context
}

function newRoundId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [engine] = useState<GameEngine>(() => createGameEngine({ requestStart, requestFinish, requestTurn }))
  // The provider lives in the root layout for the whole session, so the engine is never torn down.
  const state = useSyncExternalStore(engine.subscribe, engine.getState, () => initialGameState)

  // Load the overall score once; each finished round brings back the updated one.
  useEffect(() => {
    requestStats().then(engine.setStats, (error: Error) => console.error("Couldn't load the score", error))
  }, [engine])

  const startRound = useCallback(() => {
    void engine.startRound(newRoundId())
  }, [engine])

  const value = useMemo<GameContextType>(
    () => ({
      state,
      aiName: OPPONENT_NAME,
      stats: state.stats ?? EMPTY_STATS,
      yourMessagesLeft: messagesLeft(state.messages, "YOU"),
      aiMessagesLeft: messagesLeft(state.messages, "AI"),
      waitingOnAi: state.phase === "chatting" && !state.aiLockIn && humanFinished(state),
      sendMessage: engine.sendMessage,
      notifyTyping: engine.notifyTyping,
      lockIn: engine.lockIn,
      doneTalking: engine.doneTalking,
      retryLockIn: engine.retryLockIn,
      reveal: () => void engine.reveal(),
      startRound,
      dismissError: engine.dismissError,
    }),
    [state, engine, startRound],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}
