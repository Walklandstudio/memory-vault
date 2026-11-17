import { Suspense } from 'react'
import { signIn } from './actions'

type SearchParams = Promise<{ error?: string }>

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-semibold tracking-tight">Memory Vault</h1>
        <p className="mt-2 text-sm opacity-70">
          Your memories belong to you. Sign in to continue.
        </p>

        <form action={signIn} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 w-full rounded-lg border border-current/20 bg-transparent px-3 py-2 outline-none focus:border-current/60"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-lg border border-current/20 bg-transparent px-3 py-2 outline-none focus:border-current/60"
            />
          </label>

          <Suspense fallback={null}>
            <LoginError searchParams={searchParams} />
          </Suspense>

          <button
            type="submit"
            className="w-full rounded-lg bg-foreground px-4 py-2 font-medium text-background hover:opacity-90"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  )
}

async function LoginError({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams
  if (!error) return null
  return (
    <p className="text-sm text-red-600" role="alert">
      That email and password didn’t match. Please try again.
    </p>
  )
}
