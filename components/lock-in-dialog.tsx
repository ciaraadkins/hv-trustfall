"use client"

import { useEffect, useState, type ReactNode } from "react"
import { AlertTriangle, X } from "lucide-react"
import { useGame } from "@/contexts/game-context"
import type { Choice } from "@/types/game"

const CHOICE_STYLES: Record<Choice, string> = {
  SHARE: "border-[#33FF33]/60 hover:border-[#33FF33] hover:bg-[#33FF33]/10 text-[#33FF33]",
  KEEP: "border-[#FF5555]/60 hover:border-[#FF5555] hover:bg-[#FF5555]/10 text-[#FF5555]",
}

/**
 * The lock-in pop-up. Shows, in order: pick SHARE/KEEP, confirm, then (once
 * you're done) waiting on the AI, and finally VIEW RESULTS when both have
 * locked in. The VIEW RESULTS step shows even if the pop-up was closed.
 */
export default function LockInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, aiName, waitingOnAi, yourMessagesLeft, lockIn, retryLockIn, reveal } = useGame()
  const [pending, setPending] = useState<Choice | null>(null)

  useEffect(() => {
    if (!open) setPending(null)
  }, [open])

  // Close once you've locked in, unless there's still something to show.
  const bothLocked = state.phase === "locked"
  useEffect(() => {
    if (open && state.humanLockIn && !waitingOnAi && !bothLocked) onClose()
  }, [open, state.humanLockIn, waitingOnAi, bothLocked, onClose])

  if (!open && !bothLocked) return null

  let body: ReactNode
  if (bothLocked) {
    body = (
      <>
        <h2 className="text-2xl font-bold mb-2">BOTH PLAYERS HAVE LOCKED IN</h2>
        <p className="text-[#ccc] mb-6">The chat is closed. Ready to see what the {aiName} chose, and who it was?</p>
        {state.error && (
          <div className="flex items-start gap-2 mb-4 text-left">
            <AlertTriangle className="w-5 h-5 text-[#FF5555] shrink-0 mt-0.5" />
            <p className="text-sm text-[#FF5555]">{state.error}</p>
          </div>
        )}
        <button
          onClick={reveal}
          disabled={state.revealing}
          className="w-full bg-[#33FF33]/20 hover:bg-[#33FF33]/30 border border-[#33FF33] rounded px-6 py-3 text-[#33FF33] hover:glow-text disabled:opacity-50 disabled:cursor-wait"
        >
          {state.revealing ? "REVEALING…" : state.error ? "TRY AGAIN" : "VIEW RESULTS"}
        </button>
      </>
    )
  } else if (waitingOnAi) {
    body = state.error ? (
      <>
        <div className="flex items-start gap-2 mb-6 text-left">
          <AlertTriangle className="w-5 h-5 text-[#FF5555] shrink-0 mt-0.5" />
          <p className="text-sm text-[#FF5555]">{state.error}</p>
        </div>
        <button
          onClick={retryLockIn}
          className="w-full border border-[#FF5555]/60 hover:border-[#FF5555] rounded px-6 py-3 text-[#FF5555]"
        >
          TRY AGAIN
        </button>
      </>
    ) : (
      <>
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#33FF33]/50 border-r-transparent mb-4"></div>
        <h2 className="text-xl font-bold mb-2">{aiName} IS MAKING ITS DECISION…</h2>
        <p className="text-[#ccc] text-sm">You locked in {state.humanLockIn}.</p>
      </>
    )
  } else if (pending) {
    body = (
      <>
        <h2 className="text-2xl font-bold mb-2">LOCK IN {pending}?</h2>
        <p className="text-[#ccc] mb-6">
          This is final. The {aiName} will know you&apos;ve locked in, but not what you chose.
          {yourMessagesLeft > 0 && " You can keep chatting afterwards."}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => setPending(null)} className="border border-[#666] hover:border-[#ccc] rounded px-4 py-3 text-[#ccc]">
            BACK
          </button>
          <button onClick={() => lockIn(pending)} className={`border rounded px-4 py-3 ${CHOICE_STYLES[pending]}`}>
            LOCK IN
          </button>
        </div>
      </>
    )
  } else {
    body = (
      <>
        <h2 className="text-2xl font-bold mb-2">LOCK IN YOUR DECISION</h2>
        <p className="text-[#ccc] mb-6">Choose SHARE or KEEP. It stays secret until the reveal.</p>
        <div className="grid grid-cols-2 gap-4">
          {(["SHARE", "KEEP"] as const).map((choice) => (
            <button key={choice} onClick={() => setPending(choice)} className={`border rounded px-4 py-6 text-2xl font-bold ${CHOICE_STYLES[choice]}`}>
              {choice}
            </button>
          ))}
        </div>
      </>
    )
  }

  const closable = !bothLocked

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md bg-[#1a1a1a] border border-[#33FF33]/50 rounded-lg p-6 sm:p-8 text-center font-mono text-[#33FF33] [&_h2]:text-xl sm:[&_h2]:text-2xl">
        {closable && (
          <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 text-[#33FF33]/60 hover:text-[#33FF33]">
            <X className="w-5 h-5" />
          </button>
        )}
        {body}
      </div>
    </div>
  )
}
