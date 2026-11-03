"use client"

import Link from "next/link"
import { PlayCircle } from "lucide-react"
import { AUTH_ENABLED, useAuth } from "@/contexts/auth-context"
import { useGame } from "@/contexts/game-context"

export default function Home() {
  const { user } = useAuth()
  const { stats } = useGame()

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-[#121212] text-[#33FF33] relative overflow-hidden">
      {/* Subtle tech pattern overlay */}
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>

      {/* Scan lines effect */}
      <div className="absolute inset-0 bg-scanline pointer-events-none"></div>

      <div className="z-10 w-full max-w-4xl flex flex-col items-center px-4 py-10">
        <h1 className="font-display text-5xl sm:text-7xl tracking-wide glow-text mb-8 sm:mb-10">TRUSTFALL</h1>

        <div className="w-full flex justify-between items-center mb-8 sm:mb-12">
          <div className="text-center flex-1 p-4 sm:p-8 rounded-xl transition-all duration-300 hover:bg-[#33FF33]/5">
            <div className="text-lg sm:text-2xl mb-2 sm:mb-3 font-mono text-[#33FF33]/90">HUMANS</div>
            <div className="text-5xl sm:text-7xl text-[#33FF33] font-bold font-mono glow-text animate-pulse-subtle">{stats.humanTotal.toLocaleString()}</div>
          </div>
          <div className="h-24 sm:h-32 w-px bg-[#33FF33]/30 mx-2 sm:mx-4"></div>
          <div className="text-center flex-1 p-4 sm:p-8 rounded-xl transition-all duration-300 hover:bg-[#FF5555]/5">
            <div className="text-lg sm:text-2xl mb-2 sm:mb-3 font-mono text-[#FF5555]/90">AI</div>
            <div className="text-5xl sm:text-7xl text-[#FF5555] font-bold font-mono glow-text animate-pulse-subtle">{stats.aiTotal.toLocaleString()}</div>
          </div>
        </div>

        <p className="text-center font-mono text-sm sm:text-base text-[#ccc] mb-8 max-w-2xl">
          Can you outsmart AI in a game of trust and strategy? Help us understand the dynamics of human-AI cooperation.
        </p>

        <Link
          href="/game"
          className="inline-flex items-center gap-3 bg-[#33FF33]/20 hover:bg-[#33FF33]/30 border-2 border-[#33FF33] rounded-lg px-8 sm:px-10 py-4 sm:py-5 font-mono text-[#33FF33] text-xl sm:text-2xl transition-all duration-200 hover:glow-text animate-pulse-subtle"
        >
          <PlayCircle className="w-7 h-7 sm:w-8 sm:h-8" />
          PLAY NOW
        </Link>

        {AUTH_ENABLED && !user && (
          <Link
            href="/auth"
            className="font-mono text-[#00FFFF] hover:text-[#00FFFF]/80 mt-4 text-sm"
          >
            LOGIN / SIGNUP TO TRACK YOUR PROGRESS
          </Link>
        )}
      </div>
    </main>
  )
}
