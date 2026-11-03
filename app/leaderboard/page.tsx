"use client"

import { useState } from "react"
import Link from "next/link"
import { Trophy, Filter, Search, PlayCircle, Users } from "lucide-react"
import Scoreboard from "@/components/scoreboard"

type AIFilter = "all" | "claude" | "chatgpt"

export default function LeaderboardPage() {
  const [aiFilter, setAiFilter] = useState<AIFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Sample data until Stage 2 stores real players.
  const leaderboardData = [
    { rank: 1, username: "CooperativeAI", score: 1245, games: 78, aiModel: "claude", cooperationRate: 92 },
    { rank: 2, username: "GameTheory101", score: 1198, games: 65, aiModel: "chatgpt", cooperationRate: 85 },
    { rank: 3, username: "OptimalPlayer", score: 1087, games: 59, aiModel: "claude", cooperationRate: 78 },
    { rank: 4, username: "AIWhisperer", score: 1042, games: 71, aiModel: "chatgpt", cooperationRate: 82 },
    { rank: 5, username: "EquilibriumSeeker", score: 945, games: 62, aiModel: "claude", cooperationRate: 88 },
    { rank: 6, username: "CoopDefector", score: 912, games: 48, aiModel: "chatgpt", cooperationRate: 65 },
    { rank: 7, username: "TrustfallPro", score: 845, games: 44, aiModel: "claude", cooperationRate: 80 },
  ]

  // Filter the data based on user selections
  const filteredData = leaderboardData.filter((entry) => {
    const matchesAI = aiFilter === "all" || entry.aiModel === aiFilter
    const matchesSearch = entry.username.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesAI && matchesSearch
  })

  return (
      <main className="min-h-screen bg-[#121212] text-[#33FF33] relative">
        {/* Subtle tech pattern overlay */}
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>

        {/* Scan lines effect */}
        <div className="absolute inset-0 bg-scanline pointer-events-none"></div>

        <div className="container mx-auto max-w-4xl px-4 py-12 z-10 relative">
          {/* Hero Section with Play Button */}
          <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-6 mb-8 text-center">
            <h1 className="text-4xl font-mono font-bold mb-4 text-[#33FF33]">TRUSTFALL</h1>
            <p className="text-lg font-mono text-[#00FFFF] mb-6">HUMANS VS. AI</p>
            <p className="font-mono text-[#ccc] mb-6 max-w-2xl mx-auto">
              Can you outsmart AI in a game of trust and strategy? Make the right decisions, contribute to the global human score, and help us understand the dynamics of human-AI cooperation.
            </p>
            <Link
              href="/game"
              className="inline-flex items-center gap-2 bg-[#33FF33]/20 hover:bg-[#33FF33]/30 border-2 border-[#33FF33] rounded-lg px-8 py-4 font-mono text-[#33FF33] text-xl transition-all duration-200 hover:glow-text"
            >
              <PlayCircle className="w-6 h-6" />
              PLAY NOW
            </Link>
          </div>

          <Scoreboard className="mb-6" />

          <div className="flex items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-2">
              <Trophy className="w-6 h-6 text-[#FFAA55]" />
              <h2 className="text-2xl font-mono font-bold">LEADERBOARD</h2>
              <span className="text-xs font-mono text-[#FFAA55] border border-[#FFAA55]/50 rounded px-2 py-0.5">SAMPLE DATA</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00FFFF]" />
              <span className="text-sm font-mono text-[#00FFFF]">{leaderboardData.length} PLAYERS</span>
            </div>
          </div>

          <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-6 mb-8">
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Filter className="w-4 h-4 text-[#00FFFF]" />
                  <span className="font-mono text-sm">AI MODEL</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setAiFilter("all")}
                    className={`px-3 py-1 rounded text-sm font-mono ${
                      aiFilter === "all"
                        ? "bg-[#33FF33]/20 border border-[#33FF33]"
                        : "bg-[#2a2a2a] border border-[#33FF33]/30 hover:border-[#33FF33]/60"
                    }`}
                  >
                    ALL
                  </button>

                  <button
                    onClick={() => setAiFilter("claude")}
                    className={`px-3 py-1 rounded text-sm font-mono ${
                      aiFilter === "claude"
                        ? "bg-[#33FF33]/20 border border-[#33FF33]"
                        : "bg-[#2a2a2a] border border-[#33FF33]/30 hover:border-[#33FF33]/60"
                    }`}
                  >
                    CLAUDE
                  </button>

                  <button
                    onClick={() => setAiFilter("chatgpt")}
                    className={`px-3 py-1 rounded text-sm font-mono ${
                      aiFilter === "chatgpt"
                        ? "bg-[#33FF33]/20 border border-[#33FF33]"
                        : "bg-[#2a2a2a] border border-[#33FF33]/30 hover:border-[#33FF33]/60"
                    }`}
                  >
                    CHATGPT
                  </button>
                </div>
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4 text-[#00FFFF]" />
                  <span className="font-mono text-sm">SEARCH PLAYERS</span>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Enter username..."
                    className="w-full bg-[#2a2a2a] border border-[#33FF33]/30 rounded px-4 py-2 font-mono text-white focus:outline-none focus:border-[#33FF33] focus:ring-1 focus:ring-[#33FF33]"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full font-mono text-sm">
                <thead>
                  <tr className="border-b border-[#33FF33]/30">
                    <th className="text-left py-3 px-4">RANK</th>
                    <th className="text-left py-3 px-4">USERNAME</th>
                    <th className="text-left py-3 px-4">AI MODEL</th>
                    <th className="text-right py-3 px-4">SCORE</th>
                    <th className="text-right py-3 px-4">GAMES</th>
                    <th className="text-right py-3 px-4">COOP RATE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((entry) => (
                    <tr key={entry.rank} className="border-b border-[#33FF33]/10 hover:bg-[#33FF33]/5">
                      <td className="py-3 px-4">
                        {entry.rank <= 3 ? (
                          <span
                            className={`
                          inline-flex items-center justify-center w-6 h-6 rounded-full 
                          ${
                            entry.rank === 1
                              ? "bg-[#FFD700]/20 text-[#FFD700]"
                              : entry.rank === 2
                                ? "bg-[#C0C0C0]/20 text-[#C0C0C0]"
                                : "bg-[#CD7F32]/20 text-[#CD7F32]"
                          }
                        `}
                          >
                            {entry.rank}
                          </span>
                        ) : (
                          entry.rank
                        )}
                      </td>
                      <td className="py-3 px-4">{entry.username}</td>
                      <td className="py-3 px-4 capitalize">{entry.aiModel}</td>
                      <td className="py-3 px-4 text-right text-[#33FF33]">{entry.score}</td>
                      <td className="py-3 px-4 text-right">{entry.games}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span>{entry.cooperationRate}%</span>
                          <div className="w-16 bg-[#2a2a2a] h-1 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                entry.cooperationRate > 80
                                  ? "bg-[#33FF33]"
                                  : entry.cooperationRate > 60
                                    ? "bg-[#FFAA55]"
                                    : "bg-[#FF5555]"
                              }`}
                              style={{ width: `${entry.cooperationRate}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-center mt-8">
            <Link
              href="/game"
              className="inline-flex items-center gap-2 bg-[#1e1e1e] border border-[#33FF33]/50 hover:border-[#33FF33] hover:bg-[#1e1e1e]/80 rounded-lg px-6 py-3 font-mono text-[#33FF33] transition-all duration-200 hover:glow-text"
            >
              <PlayCircle className="w-5 h-5" />
              PLAY AGAIN
            </Link>
          </div>
        </div>
      </main>
  )
}

