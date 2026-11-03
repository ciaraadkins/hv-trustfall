"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"

/** Accounts are off in Stage 1; everyone plays as a local guest. */
export const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true"

export type AppUser = {
  uid: string
  email: string | null
  isGuest: boolean
}

const LOCAL_GUEST: AppUser = { uid: "local-guest", email: null, isGuest: true }

interface AuthContextType {
  user: AppUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  error: string | null
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  error: null,
})

export const useAuth = () => useContext(AuthContext)

async function loadFirebaseAuth() {
  const [{ getFirebaseAuth }, firebaseAuth] = await Promise.all([import("@/lib/firebase"), import("firebase/auth")])
  return { auth: getFirebaseAuth(), ...firebaseAuth }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(AUTH_ENABLED ? null : LOCAL_GUEST)
  const [loading, setLoading] = useState(AUTH_ENABLED)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!AUTH_ENABLED) return

    let unsubscribe: (() => void) | undefined
    loadFirebaseAuth()
      .then(({ auth, onAuthStateChanged }) => {
        unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
          setUser(firebaseUser ? { uid: firebaseUser.uid, email: firebaseUser.email, isGuest: false } : null)
          setLoading(false)
        })
      })
      .catch((err: Error) => {
        setError(err.message)
        setLoading(false)
      })

    return () => unsubscribe?.()
  }, [])

  const run = async (label: string, action: () => Promise<unknown>, redirectTo: string) => {
    if (!AUTH_ENABLED) return
    try {
      setError(null)
      await action()
      router.push(redirectTo)
    } catch (err) {
      setError(`${label} FAILED: ${(err as Error).message || "Unknown error"}`)
    }
  }

  const signIn = (email: string, password: string) =>
    run("LOGIN", async () => {
      const { auth, signInWithEmailAndPassword } = await loadFirebaseAuth()
      await signInWithEmailAndPassword(auth, email, password)
    }, "/game")

  const signUp = (email: string, password: string) =>
    run("SIGNUP", async () => {
      const { auth, createUserWithEmailAndPassword } = await loadFirebaseAuth()
      await createUserWithEmailAndPassword(auth, email, password)
    }, "/game")

  const signInWithGoogle = () =>
    run("GOOGLE LOGIN", async () => {
      const { auth, signInWithPopup, GoogleAuthProvider } = await loadFirebaseAuth()
      await signInWithPopup(auth, new GoogleAuthProvider())
    }, "/game")

  const signOut = () =>
    run("LOGOUT", async () => {
      const { auth, signOut: firebaseSignOut } = await loadFirebaseAuth()
      await firebaseSignOut(auth)
    }, "/")

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInWithGoogle, signOut, error }}>
      {children}
    </AuthContext.Provider>
  )
}
