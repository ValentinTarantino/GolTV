import FootballLoader from "@/components/ui/FootballLoader";

/**
 * Loading state for the home fixture. Mirrors the real layout (league section
 * + match cards) in the site's brutal style. The blocks use `.skeleton-block`
 * (globals.css) — a gradient the shimmer keyframe sweeps across; plain
 * transparent blocks would render invisible and the page would look frozen.
 */
export function MatchSkeleton({ label }: { label?: string }) {
  return (
    <div className="space-y-6 sm:space-y-10">
      {/* Loader + label so it is obvious the fixture is being fetched */}
      <div className="flex flex-col items-center gap-3 animate-fade-in">
        <FootballLoader size={56} />
        {label && (
          <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-white/70">
            {label}
          </p>
        )}
      </div>

      {[1, 2].map((group) => (
        <section
          key={group}
          className="border-4 border-white bg-bg-card p-3 sm:p-4 md:p-6 shadow-[6px_6px_0px_0px_var(--color-accent-secondary)]"
        >
          {/* League header skeleton: dark blocks pulsing over the yellow bar */}
          <div className="mb-4 sm:mb-6 flex items-center gap-3 sm:gap-4 bg-accent-primary border-4 border-black p-3 sm:p-4 shadow-brutal-white">
            <div className="h-10 w-10 sm:h-12 sm:w-12 border-2 border-black bg-black animate-pulse flex-shrink-0" />
            <div className="h-6 sm:h-7 w-40 sm:w-56 bg-black animate-pulse" />
          </div>

          {/* Match card skeletons */}
          <div className="grid gap-3 sm:gap-4 grid-cols-1">
            {[1, 2, 3].map((match) => (
              <div key={match} className="border-4 border-white bg-black p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2 sm:gap-4">
                  {/* Home team */}
                  <div className="flex flex-1 items-center gap-2 sm:gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full skeleton-block flex-shrink-0" />
                    <div className="h-4 w-20 sm:w-28 skeleton-block" />
                  </div>
                  {/* Center: status + time */}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="h-5 w-16 skeleton-block" />
                    <div className="h-4 w-12 skeleton-block" />
                  </div>
                  {/* Away team */}
                  <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3 min-w-0">
                    <div className="h-4 w-20 sm:w-28 skeleton-block" />
                    <div className="h-9 w-9 rounded-full skeleton-block flex-shrink-0" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function PlayerSkeleton() {
  return (
    <div className="relative w-full aspect-video bg-black overflow-hidden border-4 border-white shadow-brutal">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <FootballLoader size={64} />
      </div>
    </div>
  );
}
