"use client"

import Link from "next/link"
import { useState } from "react"
import { Terminal, Mail, Lock, LogIn, AlertTriangle, ChevronLeft, Monitor } from "lucide-react"
import { AUTH_ENABLED, useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const { signIn, signUp, signInWithGoogle, error, loading } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLogin) {
      await signIn(email, password)
    } else {
      await signUp(email, password)
    }
  }
  
  const handleGuestPlay = () => {
    router.push("/game")
  }

  if (!AUTH_ENABLED) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#121212] text-[#33FF33] p-6">
        <div className="max-w-md text-center font-mono">
          <h1 className="text-3xl font-bold mb-4">ACCOUNTS COMING SOON</h1>
          <p className="text-[#ccc] mb-8">Login is turned off for now. You can play as a guest; scores last for this session.</p>
          <button
            onClick={handleGuestPlay}
            className="inline-flex items-center justify-center px-8 py-3 bg-[#1a1a1a] border border-[#33FF33]/30 hover:border-[#33FF33] rounded-lg text-[#33FF33] transition-all duration-200"
          >
            <Monitor className="w-5 h-5 mr-2" />
            PLAY AS GUEST
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#121212] text-white relative overflow-hidden">
      {/* Subtle tech pattern overlay */}
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>

      {/* Scan lines effect */}
      <div className="absolute inset-0 bg-scanline pointer-events-none"></div>

      <div className="z-10 w-full max-w-md px-6">
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center gap-2">
            <Terminal className="w-8 h-8 text-[#33FF33]" />
            <span className="text-3xl font-mono font-bold text-[#33FF33]">TRUSTFALL</span>
          </Link>
        </div>

        <div className="flex gap-4 mb-4 justify-center">
          <button
            onClick={() => setIsLogin(true)}
            className={`px-4 py-2 font-mono ${isLogin
              ? "border-b-2 border-[#33FF33] text-[#33FF33]"
              : "text-[#33FF33]/50 hover:text-[#33FF33]/80"
            }`}
          >
            LOGIN
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`px-4 py-2 font-mono ${!isLogin
              ? "border-b-2 border-[#33FF33] text-[#33FF33]"
              : "text-[#33FF33]/50 hover:text-[#33FF33]/80"
            }`}
          >
            SIGNUP
          </button>
        </div>

        {error && (
          <div className="w-full bg-[#FF5555]/20 border border-[#FF5555] rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-[#FF5555] shrink-0 mt-0.5" />
            <p className="text-sm text-[#FF5555] font-mono">{error}</p>
          </div>
        )}

        <div className="bg-[#1a1a1a] border border-[#33FF33]/30 rounded-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#33FF33]/70">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full bg-[#2a2a2a] border border-[#33FF33]/30 rounded pl-10 pr-4 py-3 font-mono text-white focus:outline-none focus:border-[#33FF33] focus:ring-1 focus:ring-[#33FF33]"
              />
            </div>

            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#33FF33]/70">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full bg-[#2a2a2a] border border-[#33FF33]/30 rounded pl-10 pr-4 py-3 font-mono text-white focus:outline-none focus:border-[#33FF33] focus:ring-1 focus:ring-[#33FF33]"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-2 bg-[#33FF33] animate-blink"></div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1e1e1e] border border-[#33FF33]/50 hover:border-[#33FF33] hover:bg-[#1e1e1e]/80 rounded text-center py-3 font-mono text-[#33FF33] transition-all duration-200 hover:glow-text flex items-center justify-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              {loading ? "PROCESSING..." : isLogin ? "LOGIN_" : "SIGNUP_"}
            </button>

            <div className="relative flex items-center justify-center my-6">
              <div className="border-t border-[#33FF33]/30 absolute w-full"></div>
              <span className="bg-[#1a1a1a] px-4 relative text-[#33FF33]/70 text-sm">OR</span>
            </div>

            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={loading}
              className="w-full bg-[#1e1e1e] border border-[#00FFFF]/50 hover:border-[#00FFFF] hover:bg-[#1e1e1e]/80 rounded text-center py-3 font-mono text-[#00FFFF] transition-all duration-200 hover:glow-text flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" className="fill-current">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              CONTINUE WITH GOOGLE
            </button>
          </form>
        </div>
        
        {/* Play as Guest Button */}
        <div className="mt-6 text-center">
          <button
            onClick={handleGuestPlay}
            className="inline-flex items-center justify-center px-8 py-3 bg-[#1a1a1a] border border-[#33FF33]/30 hover:border-[#33FF33] rounded-lg text-[#33FF33] font-mono transition-all duration-200"
          >
            <Monitor className="w-5 h-5 mr-2" />
            PLAY AS GUEST
          </button>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="inline-flex items-center text-[#00FFFF] hover:text-[#00FFFF]/80 text-sm font-mono"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            BACK TO HOME
          </Link>
        </div>
      </div>
    </main>
  )
}
