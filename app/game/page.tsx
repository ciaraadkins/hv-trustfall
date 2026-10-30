"use client"

import type React from "react"

import { useCallback, useState, useRef, useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RotateCcw, Send, X } from "lucide-react"
import ProtectedRoute from "@/components/protected-route"
import MessageTimestamp from "@/components/message-timestamp"
import { useGame } from "@/contexts/game-context"
import Scoreboard from "@/components/scoreboard"
import GameRules from "@/components/game-rules"
import AIStatusIndicator from "@/components/ai-status-indicator"
import LockInDialog from "@/components/lock-in-dialog"
import MessageBudget from "@/components/message-budget"
import { formatPoints } from "@/lib/game/scoring"
import type { Choice } from "@/types/game"

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

function RoundResultScreen() {
  const { state, aiName, sessionStats, startRound } = useGame()
  const result = state.lastResult
  if (!result) return null

  const decisionColor = (choice: Choice) => (choice === "SHARE" ? "text-[#33FF33]" : "text-[#FF5555]")

  return (
    <div className="min-h-screen bg-[#121212] text-[#33FF33] flex items-center justify-center relative">
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
      <div className="absolute inset-0 bg-scanline pointer-events-none"></div>

      <div className="container max-w-4xl mx-auto p-8 z-10">
        <h1 className="text-3xl font-mono font-bold text-center mb-4">ROUND RESULT</h1>

        <Scoreboard className="mb-6" />

        <div className="grid grid-cols-2 gap-8 mb-12">
          <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-6 text-center">
            <h2 className="text-xl font-mono mb-4">YOUR DECISION</h2>
            <div className={`text-4xl font-bold font-mono mb-4 ${decisionColor(result.yourDecision)}`}>
              {result.yourDecision}
            </div>
            <div className="text-2xl font-mono">{formatPoints(result.yourPoints)}</div>
          </div>

          <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-6 text-center">
            <h2 className="text-xl font-mono mb-4">{aiName}&apos;S DECISION</h2>
            <div className={`text-4xl font-bold font-mono mb-4 ${decisionColor(result.aiDecision)}`}>
              {result.aiDecision}
            </div>
            <div className="text-2xl font-mono">{formatPoints(result.aiPoints)}</div>
          </div>
        </div>

        <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-6 mb-8">
          <h3 className="text-xl font-mono mb-2">{aiName} RESPONSE</h3>
          <p className="font-mono text-[#ccc]">{REACTIONS[result.yourDecision][result.aiDecision]}</p>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="font-mono">
            <div>
              YOUR SESSION SCORE: <span className="text-[#33FF33]">{sessionStats.humanTotal}</span>
            </div>
            <div>
              AI SESSION SCORE: <span className="text-[#00FFFF]">{sessionStats.aiTotal}</span>
            </div>
          </div>

          <div className="flex gap-4">
            <Link
              href="/summary"
              className="bg-[#1e1e1e] border border-[#00FFFF]/50 hover:border-[#00FFFF] rounded px-6 py-3 font-mono text-[#00FFFF] transition-all duration-200"
            >
              VIEW RESULTS_
            </Link>
            <button
              onClick={() => startRound()}
              className="inline-flex items-center gap-2 bg-[#33FF33]/20 hover:bg-[#33FF33]/30 border border-[#33FF33] rounded px-6 py-3 font-mono text-[#33FF33] transition-all duration-200 hover:glow-text"
            >
              <RotateCcw className="w-4 h-4" />
              PLAY AGAIN
            </button>
          </div>
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
  } = useGame()
  const { messages, aiTyping, humanLockIn, phase, error } = state
  const chatting = phase === "chatting"
  const canType = chatting && !state.humanDone && yourMessagesLeft > 0
  const conversationStarted = messages.some((m) => m.sender !== "SYSTEM")
  // Nudge the player when the round is only waiting on their lock-in.
  const lockInUrgent = chatting && !humanLockIn && (yourMessagesLeft === 0 || aiMessagesLeft === 0)

  const [inputValue, setInputValue] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, aiTyping])

  // This page stays mounted across rounds (the result screen renders here too), so reset per round.
  useEffect(() => {
    setDialogOpen(false)
    setInputValue("")
  }, [state.roundId])

  // Once you're only waiting on the AI, show its progress in the pop-up.
  useEffect(() => {
    if (waitingOnAi) setDialogOpen(true)
  }, [waitingOnAi])

  const closeDialog = useCallback(() => setDialogOpen(false), [])

  const handleSendMessage = () => {
    if (inputValue.trim() === "" || !canType) return
    if (sendMessage(inputValue)) setInputValue("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleDoneTalking = () => {
    doneTalking()
    setDialogOpen(true)
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
        : "Type your message..."

  return (
    <ProtectedRoute allowGuest={true}>
      <main className="h-screen bg-[#121212] text-[#33FF33] flex flex-col relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
        <div className="absolute inset-0 bg-scanline pointer-events-none"></div>

        <div className="container mx-auto max-w-4xl px-4 py-2 z-10 flex-shrink-0">
          <Scoreboard />
          <GameRules />
        </div>

        <div className="container mx-auto max-w-4xl flex-1 flex flex-col px-4 z-10 overflow-hidden">
          <div className="bg-[#191919] border border-[#33FF33]/30 rounded-lg flex-1 flex flex-col overflow-hidden h-full">
            <div className="bg-[#1d1d1d] border-b border-[#33FF33]/30 p-3">
              <h2 className="font-mono text-sm text-[#00FFFF]">CONVERSATION WITH {aiName}</h2>
            </div>

            <MessageBudget />

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message, index) => (
                <div key={`${message.timestamp}-${index}`} className="font-mono">
                  <span
                    className={`font-bold ${
                      message.sender === "SYSTEM"
                        ? "text-white"
                        : message.sender === "YOU"
                          ? "text-[#00FFFF]"
                          : "text-[#33FF33]"
                    }`}
                  >
                    {message.sender === "AI" ? aiName : message.sender}:
                  </span>{" "}
                  <span className="text-[#ccc]">{message.content}</span>
                  {message.sender !== "SYSTEM" && <MessageTimestamp timestamp={message.timestamp} />}
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

              {!conversationStarted && chatting && (
                <div className="font-mono text-center p-4 border border-dashed border-[#33FF33]/30 rounded-lg mt-4">
                  <p className="text-[#ccc]">
                    Anyone can talk first. You each get 5 messages, and either of you can lock in at any time.
                  </p>
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
                  You locked in {humanLockIn} · {state.aiLockIn ? `${aiName} has locked in too` : `waiting on ${aiName}`}
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

            <div className="border-t border-[#33FF33]/30 p-4 flex-shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value)
                      notifyTyping()
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    maxLength={2000}
                    disabled={!canType}
                    className="w-full bg-[#1e1e1e] border border-[#33FF33]/30 rounded px-4 py-3 font-mono text-white focus:outline-none focus:border-[#33FF33] focus:ring-1 focus:ring-[#33FF33] disabled:opacity-50 disabled:cursor-not-allowed"
                  />

                  {canType && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-xs text-[#666]">
                      <span>{inputValue.length}</span>
                      <button
                        onClick={handleSendMessage}
                        disabled={inputValue.trim() === ""}
                        aria-label="Send message"
                        className="text-[#33FF33] disabled:text-[#33FF33]/30"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
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
                      LOCK IN DECISION
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
