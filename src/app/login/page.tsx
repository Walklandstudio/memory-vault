import { Suspense } from 'react'
import { signIn } from './actions'

type SearchParams = Promise<{ error?: string }>

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <h1 className="text-[48px] leading-[0.92] font-extrabold tracking-[-1.5px]">
          Memory
          <br />
          <span className="text-cobalt">Vault</span>
        </h1>
        <p className="mt-3 text-muted">Your memories belong to you. Sign in to open your archives.</p>

        <form action={signIn} className="mt-8 flex flex-col gap-4 rounded-[20px] bg-card p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="h-12 rounded-xl border-2 border-line bg-paper px-3 outline-none focus:border-cobalt"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-12 rounded-xl border-2 border-line bg-paper px-3 outline-none focus:border-cobalt"
            />
          </label>

          <Suspense fallback={null}>
            <LoginError searchParams={searchParams} />
          </Suspense>

          <button type="submit" className="h-12 rounded-2xl bg-cobalt font-semibold text-white">
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
    <p className="text-[15px] text-[#B3261E]" role="alert">
      That email and password don’t match. Check them and try again.
    </p>
  )
}
