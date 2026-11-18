import Link from 'next/link'

type Tab = 'home' | 'timeline' | 'search'

// Fixed to the bottom of the screen, within thumb reach on a phone.
export function BottomNav({ active, spaceId }: { active: Tab; spaceId?: string }) {
  const q = spaceId ? `?space=${spaceId}` : ''
  const tabs: { id: Tab; label: string; href: string; icon: React.ReactNode }[] = [
    {
      id: 'home',
      label: 'Home',
      href: '/',
      icon: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
    },
    {
      id: 'timeline',
      label: 'Timeline',
      href: `/timeline${q}`,
      icon: (
        <>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4" />
        </>
      ),
    },
    {
      id: 'search',
      label: 'Search',
      href: `/search${q}`,
      icon: (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </>
      ),
    },
  ]

  return (
    <>
      {/* Keeps page content clear of the fixed bar */}
      <div aria-hidden="true" className="h-24 shrink-0" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="mx-auto grid max-w-xl grid-cols-3">
          {tabs.map((tab) => {
            const current = tab.id === active
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={`flex h-[68px] flex-col items-center justify-center gap-1 text-[13px] ${
                  current ? 'font-extrabold text-cobalt' : 'text-muted'
                }`}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {tab.icon}
                </svg>
                {tab.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
