"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

/** Credits and the legal links. Left off the chat, which fills the screen. */
export default function SiteFooter() {
  const pathname = usePathname()
  if (pathname === "/game" || pathname === "/auth") return null

  return (
    <footer className="bg-[#121212] border-t border-[#33FF33]/20 px-4 py-5 text-center font-mono text-xs text-[#777]">
      <p>
        Made by a human, with help from AI. Part of{" "}
        <a href="https://humanversus.tech" className="hover:text-[#ccc] underline">
          Human Versus
        </a>
        .
      </p>
      <p className="mt-2 space-x-4">
        <Link href="/privacy" className="hover:text-[#ccc] underline">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-[#ccc] underline">
          Terms
        </Link>
      </p>
    </footer>
  )
}
