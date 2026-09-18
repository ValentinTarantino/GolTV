export function MatchSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((group) => (
        <div key={group}>
          {/* League header skeleton */}
          <div className="mb-3 flex items-center gap-2.5 px-1">
            <div className="h-6 w-6 rounded-full animate-shimmer" />
            <div className="h-4 w-32 rounded animate-shimmer" />
          </div>

          {/* Match card skeletons */}
          <div className="space-y-2">
            {[1, 2].map((match) => (
              <div
                key={match}
                className="rounded-xl border border-border-subtle bg-bg-card p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-1 items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full animate-shimmer" />
                    <div className="h-4 w-24 rounded animate-shimmer" />
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-5 w-16 rounded animate-shimmer" />
                    <div className="h-4 w-12 rounded-full animate-shimmer" />
                  </div>
                  <div className="flex flex-1 items-center justify-end gap-2.5">
                    <div className="h-4 w-24 rounded animate-shimmer" />
                    <div className="h-9 w-9 rounded-full animate-shimmer" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlayerSkeleton() {
  return (
    <div className="relative w-full aspect-video bg-black overflow-hidden border-4 border-white shadow-brutal animate-shimmer">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-16 w-16 rounded-full animate-shimmer" />
      </div>
    </div>
  );
}

export function StandingsSkeleton() {
  return (
    <div className="bg-bg-card border-4 border-white shadow-brutal-sm overflow-hidden">
      <div className="border-b border-border-subtle px-6 py-3">
        <div className="h-5 w-48 rounded animate-shimmer" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-6 rounded animate-shimmer" />
            <div className="h-6 w-6 rounded-full animate-shimmer" />
            <div className="h-4 w-28 rounded animate-shimmer flex-1" />
            <div className="h-4 w-8 rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
