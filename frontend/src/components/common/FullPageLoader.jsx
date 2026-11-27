import { Skeleton } from "@/components/ui/skeleton";

/*
 * Skeleton shown while the session is checked at start-up (GET /me), before any layout exists.
 * It has the shape of the page that follows, so the switch doesn't jump. index.html draws the
 * same shapes in plain HTML before the JavaScript has loaded.
 *   variant "app":  header + sidebar + a page of cards and rows
 *   variant "auth": logo + sign-in card (login, forgot / reset password)
 */
export default function FullPageLoader({ variant = "app" }) {
  return (
    <div className="min-h-dvh" role="status" aria-busy="true" aria-label="Loading">
      {variant === "auth" ? <AuthSkeleton /> : <AppSkeleton />}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function AppSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex h-[4.25rem] items-center gap-3 border-b border-border/70 bg-card/85 px-4 md:px-6">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-5 w-16 lg:w-56" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="h-10 w-10 rounded-full sm:w-44" />
          <Skeleton className="size-10 rounded-xl lg:w-28" />
        </div>
      </div>
      <div className="flex flex-1">
        <div className="hidden w-64 shrink-0 flex-col gap-2 border-r border-border/70 bg-card/60 px-3 pt-5 lg:flex">
          <Skeleton className="mb-2 ml-2 h-3 w-12" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
        <div className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-4 py-6 md:px-6">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64 max-w-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthSkeleton() {
  return (
    <div className="flex min-h-dvh items-start justify-center px-4 pt-20 sm:items-center sm:pt-0">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-5 w-56" />
        </div>
        <div className="space-y-6 rounded-[1.25rem] border border-border bg-card p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-28" />
            </div>
          </div>
          <Skeleton className="h-4 w-3/4" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
