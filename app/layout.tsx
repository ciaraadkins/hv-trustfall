import type React from "react"
import type { Metadata, Viewport } from "next"
import { Bungee, Space_Mono } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/contexts/auth-context"
import { GameProvider } from "@/contexts/game-context"
import NavbarWrapper from "@/components/navbar-wrapper"
import SiteFooter from "@/components/site-footer"

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
})

/** Human Versus's display font, for the TRUSTFALL title. */
const bungee = Bungee({ weight: "400", subsets: ["latin"], variable: "--font-display" })

export const viewport: Viewport = {
  themeColor: "#1a1a1a",
  colorScheme: "dark",
}

export const metadata: Metadata = {
  title: "TRUSTFALL - Humans vs. AI",
  description: "A modern console-inspired game of trust and strategy",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${spaceMono.variable} ${bungee.variable} font-mono min-h-dvh flex flex-col`}>
        <AuthProvider>
          <GameProvider>
            <NavbarWrapper />
            {children}
            <SiteFooter />
          </GameProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
