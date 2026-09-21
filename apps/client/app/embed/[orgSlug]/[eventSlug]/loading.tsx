import { Skeleton } from "@shedflow/ui/components";

export default function EmbedEventLoading() {
  return (
    <div className="min-h-svh bg-background p-2">
      <Skeleton className="mx-auto h-[520px] w-full max-w-4xl rounded-2xl" />
    </div>
  );
}
