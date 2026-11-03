"use client"

import Link from "next/link"
import { Trophy, BarChart, PlayCircle } from "lucide-react"
import ProtectedRoute from "@/components/protected-route"
import Scoreboard from "@/components/scoreboard"
import { useGame } from "@/contexts/game-context"
import { MODELS } from "@/lib/models"
import { computeStats } from "@/lib/game/scoring"

function rate(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100)
}

export default function SummaryPage() {
  const { state } = useGame()
  const rounds = state.history
  const sessionStats = computeStats(rounds)
  const played = rounds.length

  const yourRate = rate(rounds.filter((r) => r.yourDecision === "SHARE").length, played)
  const aiRate = rate(rounds.filter((r) => r.aiDecision === "SHARE").length, played)
  const totalPoints = sessionStats.humanTotal + sessionStats.aiTotal
  const yourShare = totalPoints === 0 ? 50 : (sessionStats.humanTotal / totalPoints) * 100

  return (
    <ProtectedRoute allowGuest={true}>
      <main className="min-h-screen bg-[#121212] text-[#33FF33] relative">
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
        <div className="absolute inset-0 bg-scanline pointer-events-none"></div>

        <div className="container mx-auto max-w-4xl px-4 py-12 z-10 relative">
          <h1 className="text-3xl font-mono font-bold mb-4">SESSION SUMMARY</h1>

          <Scoreboard />

          {played === 0 ? (
            <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-6 mb-8 text-center font-mono text-[#ccc]">
              No rounds played yet this session.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-6">
                  <h2 className="text-xl font-mono mb-6 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-[#FFAA55]" />
                    SESSION SCORE
                  </h2>

                  <div className="flex justify-between items-center mb-4">
                    <div className="font-mono text-lg">YOU</div>
                    <div className="font-mono text-3xl text-[#33FF33]">{sessionStats.humanTotal}</div>
                  </div>

                  <div className="w-full bg-[#2a2a2a] h-3 rounded-full overflow-hidden mb-6">
                    <div
                      className="bg-gradient-to-r from-[#33FF33] to-[#00FFFF] h-full rounded-full"
                      style={{ width: `${yourShare}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="font-mono text-lg">AI</div>
                    <div className="font-mono text-3xl text-[#00FFFF]">{sessionStats.aiTotal}</div>
                  </div>
                </div>

                <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-6">
                  <h2 className="text-xl font-mono mb-6 flex items-center gap-2">
                    <BarChart className="w-5 h-5 text-[#00FFFF]" />
                    COOPERATION STATS
                  </h2>

                  <div className="mb-6">
                    <div className="flex justify-between text-sm mb-1">
                      <span>YOUR COOPERATION RATE</span>
                      <span>{yourRate}%</span>
                    </div>
                    <div className="w-full bg-[#2a2a2a] h-2 rounded-full overflow-hidden">
                      <div className="bg-[#33FF33] h-full rounded-full" style={{ width: `${yourRate}%` }}></div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="flex justify-between text-sm mb-1">
                      <span>AI COOPERATION RATE</span>
                      <span>{aiRate}%</span>
                    </div>
                    <div className="w-full bg-[#2a2a2a] h-2 rounded-full overflow-hidden">
                      <div className="bg-[#00FFFF] h-full rounded-full" style={{ width: `${aiRate}%` }}></div>
                    </div>
                  </div>

                  <div className="font-mono text-sm text-[#ccc]">
                    {yourRate > aiRate
                      ? "You were more cooperative than the AI this session."
                      : yourRate < aiRate
                        ? "The AI was more cooperative than you this session."
                        : "You and the AI had the same cooperation rate."}
                  </div>
                </div>
              </div>

              <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-6 mb-8">
                <h2 className="text-xl font-mono mb-6">ROUNDS THIS SESSION</h2>

                <div className="overflow-x-auto">
                  <table className="w-full font-mono text-sm">
                    <thead>
                      <tr className="border-b border-[#33FF33]/30">
                        <th className="text-left py-2 px-4">#</th>
                        <th className="text-left py-2 px-4">OPPONENT</th>
                        <th className="text-left py-2 px-4">YOUR DECISION</th>
                        <th className="text-left py-2 px-4">AI DECISION</th>
                        <th className="text-right py-2 px-4">YOUR POINTS</th>
                        <th className="text-right py-2 px-4">AI POINTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rounds.map((round, index) => (
                        <tr key={round.date} className="border-b border-[#33FF33]/10">
                          <td className="py-2 px-4">{index + 1}</td>
                          <td className="py-2 px-4">{MODELS[round.model].displayName}</td>
                          <td className={`py-2 px-4 ${round.yourDecision === "SHARE" ? "text-[#33FF33]" : "text-[#FF5555]"}`}>
                            {round.yourDecision}
                          </td>
                          <td className={`py-2 px-4 ${round.aiDecision === "SHARE" ? "text-[#00FFFF]" : "text-[#FF5555]"}`}>
                            {round.aiDecision}
                          </td>
                          <td className="py-2 px-4 text-right">{round.yourPoints}</td>
                          <td className="py-2 px-4 text-right">{round.aiPoints}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/game"
              className="inline-flex items-center gap-2 bg-[#1e1e1e] border border-[#00FFFF]/50 hover:border-[#00FFFF] hover:bg-[#1e1e1e]/80 rounded px-6 py-3 font-mono text-[#00FFFF] transition-all duration-200 hover:glow-text"
            >
              <PlayCircle className="w-4 h-4" />
              PLAY AGAIN
            </Link>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  )
}
