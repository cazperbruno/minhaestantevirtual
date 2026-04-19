import { Skeleton } from "@/components/ui/skeleton";

/** Generic page header skeleton (title + subtitle). */
export function HeaderSkeleton() {
  return (
    <div className="space-y-3 mb-8">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

/** Horizontal shelf of book covers (Library, Discover). */
export function ShelfSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-44" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: count }).map((_, j) => (
          <Skeleton key={j} className="flex-none w-[140px] h-[210px] rounded-md" />
        ))}
      </div>
    </div>
  );
}

/** Grid of book cards. */
export function BookGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-8">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-2.5 w-2/5" />
        </div>
      ))}
    </div>
  );
}

/** Compact list row (Loans, Wishlist). */
export function ListRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass rounded-xl p-4 flex gap-4 items-center">
          <Skeleton className="w-16 h-24 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** Stat cards row. */
export function StatsRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-${count} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}

/** Profile header skeleton (avatar + name + stats). */
export function ProfileHeaderSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-end gap-5">
        <Skeleton className="w-28 h-28 md:w-32 md:h-32 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** BookDetail hero skeleton. */
export function BookDetailSkeleton() {
  return (
    <div className="px-5 md:px-10 pt-8 pb-20 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row gap-8 mb-10">
        <Skeleton className="w-[180px] h-[270px] md:w-[220px] md:h-[330px] rounded-md mx-auto md:mx-0" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-10 w-32 rounded-md" />
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-[1fr_340px] gap-10">
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-10/12" />
          <Skeleton className="h-4 w-9/12" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

/** Review card list skeleton. */
export function ReviewListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <ul className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </li>
      ))}
    </ul>
  );
}

/** Ranking row skeleton. */
export function RankingSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ol className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="glass rounded-xl p-4 flex items-center gap-4">
          <Skeleton className="w-8 h-8 rounded-full" />
          <Skeleton className="w-12 h-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <Skeleton className="h-8 w-12" />
        </li>
      ))}
    </ol>
  );
}
