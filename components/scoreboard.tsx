"use client"

import { useGame } from "@/contexts/game-context"

/** The overall Humans vs AI score, from the local round log. */
const Scoreboard = ({ className = "mb-4" }: { className?: string }) => {
  const { stats } = useGame()

  return (
    <div className={`bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-4 ${className}`}>
      <h3 className="text-center text-sm text-[#00FFFF] mb-2 font-mono">SCOREBOARD</h3>
      <div className="flex justify-between items-center">
        <div className="text-center flex-1">
          <div className="text-xs mb-1">HUMANS</div>
          <div className="text-xl text-[#33FF33] font-bold">{stats.humanTotal.toLocaleString()}</div>
        </div>
        <div className="h-10 w-px bg-[#33FF33]/30"></div>
        <div className="text-center flex-1">
          <div className="text-xs mb-1">AI</div>
          <div className="text-xl text-[#FF5555] font-bold">{stats.aiTotal.toLocaleString()}</div>
        </div>
      </div>
      <p className="text-center text-[10px] text-[#33FF33]/50 mt-2 font-mono">
        ALL TIME · {stats.gamesPlayed} {stats.gamesPlayed === 1 ? "ROUND" : "ROUNDS"}
      </p>
    </div>
  )
}

export default Scoreboard
