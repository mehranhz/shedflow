import { Skeleton } from "@shedflow/ui/components";

export default function PublicOrgLoading() {
  return (
    <div className="min-h-svh bg-[#f4f5f7] px-4 py-16">
      <div className="mx-auto grid max-w-xl gap-3">
        <Skeleton className="mx-auto h-10 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}
