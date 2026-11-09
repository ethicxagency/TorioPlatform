import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div
      className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 pb-8 pt-5 sm:px-6"
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[120px] rounded-card" />
        ))}
      </div>
      <Skeleton className="h-[320px] rounded-card" />
    </div>
  );
}
