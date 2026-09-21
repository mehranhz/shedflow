import { Skeleton } from "@shedflow/ui/components";

export default function BookingLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-[#f4f5f7] px-4">
      <Skeleton className="h-64 w-full max-w-md rounded-xl" />
    </div>
  );
}
