"use client"

import { useGame } from "@/contexts/game-context"

const AIStatusIndicator = () => {
  const { state, aiName, waitingOnAi } = useGame()
  const lockedIn = state.aiLockIn !== null

  // The AI's silent "reading" phase is deliberately not shown.
  const [dot, label] = lockedIn
    ? ["bg-[#33FF33] shadow-[0_0_8px_rgba(51,255,51,0.8)]", `${aiName} HAS LOCKED IN`]
    : state.aiTyping
      ? ["bg-[#FFAA55] animate-pulse", `${aiName} IS TYPING...`]
      : waitingOnAi
        ? ["bg-[#FFAA55] animate-pulse", `${aiName} IS DECIDING...`]
        : ["bg-[#555]", `${aiName} HASN'T LOCKED IN`]

  return (
    <div className="flex items-center justify-center gap-3 my-1 sm:my-2 flex-shrink-0">
      <div className="h-px flex-grow bg-[#33FF33]/20"></div>
      <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#33FF33]/30 rounded-full px-3 sm:px-4 py-1 sm:py-2">
        <div className={`w-3 h-3 rounded-full ${dot}`}></div>
        <span className="font-mono text-xs">{label}</span>
      </div>
      <div className="h-px flex-grow bg-[#33FF33]/20"></div>
    </div>
  )
}

export default AIStatusIndicator
