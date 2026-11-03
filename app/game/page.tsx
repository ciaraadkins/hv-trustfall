"use client"

import type React from "react"

import { useCallback, useState, useRef, useEffect, useLayoutEffect } from "react"
import { AlertTriangle, RotateCcw, X } from "lucide-react"
import ProtectedRoute from "@/components/protected-route"
import MessageTimestamp from "@/components/message-timestamp"
import { useGame } from "@/contexts/game-context"
import GameRules from "@/components/game-rules"
import AIStatusIndicator from "@/components/ai-status-indicator"
import LockInDialog from "@/components/lock-in-dialog"
import MessageBudget from "@/components/message-budget"
import { MODELS } from "@/lib/models"
import { formatPoints } from "@/lib/game/scoring"
import type { Choice } from "@/types/game"

/** The message box grows to about five lines, then scrolls. */
const INPUT_MAX_HEIGHT = 144

const REACTIONS: Record<Choice, Record<Choice, string>> = {
  SHARE: {
    SHARE: "I see we both chose to cooperate. This mutual trust benefits us both equally. An optimal outcome.",
    KEEP: "You trusted me, but I chose to maximize my gain. An interesting dynamic of game theory at play.",
  },
  KEEP: {
    SHARE: "You've optimized for personal gain while I chose cooperation. A rational strategy in game theory.",
    KEEP: "We both chose self-preservation, resulting in a suboptimal outcome for both of us.",
  },
}

/** Shown while the server picks a hidden opponent, or if that fails. */
function MatchingScreen() {
  const { state, startRound } = useGame()
  return (
    <div className="min-h-screen bg-[#121212] text-[#33FF33] flex items-center justify-center relative">
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
      <div className="absolute inset-0 bg-scanline pointer-events-none"></div>
      <div className="z-10 text-center font-mono p-8 max-w-md">
        {state.error ? (
          <>
            <div className="flex items-start gap-2 mb-6 text-left">
              <AlertTriangle className="w-5 h-5 text-[#FF5555] shrink-0 mt-0.5" />
              <p className="text-sm text-[#FF5555]">{state.error}</p>
            </div>
            <button
              onClick={startRound}
              className="border border-[#FF5555]/60 hover:border-[#FF5555] rounded px-6 py-3 text-[#FF5555]"
            >
              TRY AGAIN
            </button>
          </>
        ) : (
          <>
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#33FF33]/50 border-r-transparent"></div>
          </>
        )}
      </div>
    </div>
  )
}

function RoundResultScreen() {
  const { state, aiName, startRound } = useGame()
  const result = state.lastResult
  if (!result) return null

  const decisionColor = (choice: Choice) => (choice === "SHARE" ? "text-[#33FF33]" : "text-[#FF5555]")

  return (
    <div className="min-h-screen bg-[#121212] text-[#33FF33] flex items-center justify-center relative">
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
      <div className="absolute inset-0 bg-scanline pointer-events-none"></div>

      <div className="container max-w-4xl mx-auto px-4 py-6 sm:p-8 z-10">
        <h1 className="text-2xl sm:text-3xl font-mono font-bold text-center mb-4">ROUND RESULT</h1>

        <div className="bg-[#1e1e1e] border border-[#00FFFF]/50 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6 text-center font-mono">
          <p className="text-[#ccc] mb-1">You were playing against</p>
          <p className="text-3xl sm:text-4xl font-bold text-[#00FFFF] glow-text">{MODELS[result.model].displayName}</p>
          <p className="text-xs text-[#666] mt-2">{result.apiModel}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-8 mb-4 sm:mb-8">
          {[
            { label: "YOU", choice: result.yourDecision, points: result.yourPoints },
            { label: aiName, choice: result.aiDecision, points: result.aiPoints },
          ].map(({ label, choice, points }) => (
            <div key={label} className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-4 sm:p-6 text-center font-mono">
              <h2 className="text-sm sm:text-xl mb-2 sm:mb-4">{label}</h2>
              <div className={`text-2xl sm:text-4xl font-bold mb-2 sm:mb-4 ${decisionColor(choice)}`}>{choice}</div>
              <div className="text-lg sm:text-2xl">{formatPoints(points)}</div>
            </div>
          ))}
        </div>

        <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8">
          <p className="font-mono text-[#ccc]">{REACTIONS[result.yourDecision][result.aiDecision]}</p>
        </div>

        <div className="flex justify-center sm:justify-end">
          <button
            onClick={() => startRound()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#33FF33]/20 hover:bg-[#33FF33]/30 border border-[#33FF33] rounded px-6 py-4 sm:py-3 font-mono text-[#33FF33] transition-all duration-200 hover:glow-text"
          >
            <RotateCcw className="w-4 h-4" />
            PLAY AGAIN
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GamePage() {
  const {
    state,
    aiName,
    yourMessagesLeft,
    aiMessagesLeft,
    waitingOnAi,
    sendMessage,
    notifyTyping,
    doneTalking,
    dismissError,
    startRound,
  } = useGame()
  const { messages, aiTyping, humanLockIn, phase, error } = state
  const chatting = phase === "chatting"
  const canType = chatting && !state.humanDone && yourMessagesLeft > 0
  // The SYSTEM welcome marks when the round started; it isn't shown.
  const chat = messages.filter((m) => m.sender !== "SYSTEM")
  // Nudge the player when the round is only waiting on their lock-in.
  const lockInUrgent = chatting && !humanLockIn && (yourMessagesLeft === 0 || aiMessagesLeft === 0)

  const [inputValue, setInputValue] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Grow the message box with what's typed, up to a few lines, then scroll inside it.
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = "auto"
    input.style.height = `${Math.min(input.scrollHeight, INPUT_MAX_HEIGHT)}px`
  }, [inputValue])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, aiTyping])

  // Arriving here without a round (a direct link or a refresh): find an opponent.
  useEffect(() => {
    if (phase === "idle") startRound()
  }, [phase, startRound])

  // This page stays mounted across rounds (the result screen renders here too), so reset per round.
  // Once you're only waiting on the AI, show its progress in the pop-up.
  // (Adjusted while rendering, as React recommends, rather than in effects.)
  const [seen, setSeen] = useState({ roundId: state.roundId, waitingOnAi })
  if (seen.roundId !== state.roundId || seen.waitingOnAi !== waitingOnAi) {
    setSeen({ roundId: state.roundId, waitingOnAi })
    if (seen.roundId !== state.roundId) {
      setDialogOpen(false)
      setInputValue("")
    }
    if (waitingOnAi && !seen.waitingOnAi) setDialogOpen(true)
  }

  const closeDialog = useCallback(() => setDialogOpen(false), [setDialogOpen])

  const handleSendMessage = () => {
    if (inputValue.trim() === "" || !canType) return
    if (sendMessage(inputValue)) setInputValue("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleDoneTalking = () => {
    doneTalking()
    setDialogOpen(true)
  }

  if (phase === "idle" || phase === "matching") {
    return (
      <ProtectedRoute allowGuest={true}>
        <MatchingScreen />
      </ProtectedRoute>
    )
  }

  if (phase === "result") {
    return (
      <ProtectedRoute allowGuest={true}>
        <RoundResultScreen />
      </ProtectedRoute>
    )
  }

  const placeholder = !chatting
    ? "The chat is closed."
    : yourMessagesLeft === 0
      ? humanLockIn
        ? "No messages left."
        : "No messages left: lock in your decision."
      : state.humanDone
        ? "You're done talking."
        : ""

  return (
    <ProtectedRoute allowGuest={true}>
      <main className="fill-screen bg-[#121212] text-[#33FF33] flex flex-col relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
        <div className="absolute inset-0 bg-scanline pointer-events-none"></div>

        <div className="container mx-auto max-w-4xl px-4 py-2 z-10 flex-shrink-0">
          <GameRules />
        </div>

        <div className="container mx-auto max-w-4xl flex-1 flex flex-col px-4 pb-4 z-10 overflow-hidden">
          <div className="bg-[#191919] border border-[#33FF33]/30 rounded-lg flex-1 flex flex-col overflow-hidden h-full">
            <MessageBudget />

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
              {chat.map((message, index) => (
                <div key={`${message.timestamp}-${index}`} className="font-mono break-words">
                  <span
                    className={`font-bold ${message.sender === "YOU" ? "text-[#00FFFF]" : "text-[#33FF33]"}`}
                  >
                    {message.sender === "AI" ? aiName : message.sender}:
                  </span>{" "}
                  <span className="text-[#ccc]">{message.content}</span>
                  <MessageTimestamp timestamp={message.timestamp} />
                </div>
              ))}

              {aiTyping && (
                <div className="font-mono">
                  <span className="font-bold text-[#33FF33]">{aiName}:</span>{" "}
                  <span className="text-[#ccc]">
                    <span className="inline-block w-2 h-4 bg-[#33FF33] animate-blink"></span>
                  </span>
                </div>
              )}

              <div ref={messagesEndRef}></div>
            </div>

            {error && !waitingOnAi && (
              <div className="mx-4 mb-2 bg-[#FF5555]/10 border border-[#FF5555]/50 rounded p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#FF5555] shrink-0 mt-0.5" />
                <p className="flex-1 text-sm text-[#FF5555] font-mono">{error}</p>
                <button onClick={dismissError} aria-label="Dismiss error" className="text-[#FF5555]/70 hover:text-[#FF5555]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {humanLockIn && chatting && (
              <div className="mx-4 mb-2 flex flex-wrap items-center justify-between gap-2 bg-[#1e1e1e] border border-[#00FFFF]/40 rounded p-3 font-mono text-sm">
                <span className="text-[#00FFFF]">
                  You locked in {humanLockIn} · {state.aiLockIn ? `the ${aiName} has locked in too` : `waiting on the ${aiName}`}
                </span>
                {!waitingOnAi && (
                  <button
                    onClick={handleDoneTalking}
                    className="border border-[#00FFFF]/50 hover:border-[#00FFFF] rounded px-3 py-1 text-[#00FFFF]"
                  >
                    I&apos;M DONE TALKING
                  </button>
                )}
              </div>
            )}

            <AIStatusIndicator />

            <div className="border-t border-[#33FF33]/30 p-3 sm:p-4 flex-shrink-0">
              <div className="flex items-end gap-2 sm:gap-4">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    enterKeyHint="send"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value)
                      notifyTyping()
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    maxLength={2000}
                    disabled={!canType}
                    className="block w-full resize-none bg-[#1e1e1e] border border-[#33FF33]/30 rounded pl-3 sm:pl-4 pr-14 py-3 font-mono text-base leading-6 text-white focus:outline-none focus:border-[#33FF33] focus:ring-1 focus:ring-[#33FF33] disabled:opacity-50 disabled:cursor-not-allowed"
                  />

                  {canType && inputValue.length > 0 && (
                    <span className="absolute right-3 bottom-3 text-xs leading-6 text-[#666] pointer-events-none">
                      {inputValue.length}
                    </span>
                  )}
                </div>

                {phase === "locked" ? (
                  <button
                    onClick={() => setDialogOpen(true)}
                    className="py-3 px-4 font-mono rounded bg-[#33FF33]/20 hover:bg-[#33FF33]/30 border border-[#33FF33] hover:glow-text"
                  >
                    VIEW RESULTS
                  </button>
                ) : (
                  !humanLockIn && (
                    <button
                      onClick={() => setDialogOpen(true)}
                      disabled={!chatting}
                      className={`py-3 px-4 font-mono rounded border transition-all duration-200 bg-[#2a2a2a] hover:bg-gradient-to-r hover:from-[#33FF33]/20 hover:to-[#FF5555]/20 ${
                        lockInUrgent ? "border-[#FFAA55] text-[#FFAA55] animate-pulse" : "border-[#33FF33]/50 hover:border-[#33FF33]"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      LOCK IN<span className="hidden sm:inline"> DECISION</span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        <LockInDialog open={dialogOpen} onClose={closeDialog} />
      </main>
    </ProtectedRoute>
  )
}
