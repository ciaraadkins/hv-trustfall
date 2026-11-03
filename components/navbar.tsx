"use client"

import Link from "next/link"
import Image from "next/image"
import logo from "@/public/human-versus-logo-white.png"
import { usePathname } from "next/navigation"
import { Brain, LogOut, Table, User, type LucideIcon } from "lucide-react"
import { AUTH_ENABLED, useAuth } from "@/contexts/auth-context"
import { useGame } from "@/contexts/game-context"
import { LOCAL_PAGES } from "@/lib/site"

/** Pages for looking over the game's data: local and desktop only. PLAY NOW on the home page starts a round. */
const TABS: { href: string; label: string; Icon: LucideIcon }[] = LOCAL_PAGES
  ? [
      { href: "/data", label: "DATA", Icon: Table },
      { href: "/memory", label: "MEMORY", Icon: Brain },
    ]
  : []

const Navbar = () => {
  const { user, signOut } = useAuth()
  const pathname = usePathname()

  return (
    <div className="bg-[#1a1a1a] border-b border-[#33FF33]/30 p-3 sticky top-0 z-50">
      {/* Logo left, title centered (desktop only), the local-only tabs (desktop) and the score right. */}
      <div className="container mx-auto max-w-6xl grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <a href="https://humanversus.tech" className="justify-self-start" aria-label="Human Versus">
          <Image src={logo} alt="Human Versus" width={75} height={30} priority />
        </a>

        <Link href="/" className="hidden sm:block font-display text-xl tracking-wide text-[#33FF33]">
          TRUSTFALL
        </Link>
        <span className="sm:hidden" />

        <div className="flex items-center justify-end gap-4 md:gap-6">
          {TABS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`hidden sm:flex items-center gap-1 font-mono text-sm ${
                pathname === href ? "text-[#33FF33]" : "text-[#33FF33]/70 hover:text-[#33FF33]"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </Link>
          ))}

          {/* User Section (hidden while accounts are disabled) */}
          {AUTH_ENABLED &&
            (user && !user.isGuest ? (
              <button
                onClick={() => signOut()}
                className="flex items-center gap-1 text-[#FF5555]/80 hover:text-[#FF5555] text-sm font-mono"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">{user.email?.split("@")[0]}</span>
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <Link href="/auth" className="flex items-center gap-1 text-[#00FFFF] hover:text-[#00FFFF]/80 text-sm font-mono">
                <LogOut className="w-4 h-4" />
                <span>LOGIN</span>
              </Link>
            ))}

          <ScoreCard />
        </div>
      </div>
    </div>
  )
}

/** The all-time score as a small scorecard: each side's label over its number, both halves the same width. */
function ScoreCard() {
  const { stats } = useGame()
  return (
    <div
      className="grid grid-cols-[1fr_1px_1fr] font-mono border border-[#33FF33]/50 rounded-md bg-[#121212] shadow-[0_0_10px_rgba(51,255,51,0.3)]"
      aria-label={`All-time score: humans ${stats.humanTotal}, AI ${stats.aiTotal}`}
    >
      <div className="flex flex-col items-center justify-center px-3 py-1">
        <span className="text-[10px] leading-none text-[#33FF33]/80 tracking-wider">HUMANS</span>
        <span className="text-lg leading-tight font-bold text-[#33FF33]">{stats.humanTotal.toLocaleString()}</span>
      </div>
      <div className="w-px bg-[#33FF33]/40" />
      <div className="flex flex-col items-center justify-center px-3 py-1">
        <span className="text-[10px] leading-none text-[#FF5555]/80 tracking-wider">AI</span>
        <span className="text-lg leading-tight font-bold text-[#FF5555]">{stats.aiTotal.toLocaleString()}</span>
      </div>
    </div>
  )
}

export default Navbar