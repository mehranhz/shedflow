import { Skeleton } from "@shedflow/ui/components";

export default function PublicEventLoading() {
  return (
    <div className="min-h-svh bg-[#f4f5f7] px-4 py-16">
      <Skeleton className="mx-auto h-[520px] w-full max-w-4xl rounded-2xl" />
    </div>
  );
}
