import { cn } from "@shedflow/ui/lib/utils";

export function Logo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground",
          markClassName,
        )}
      >
        S
      </span>
      SchedFlow
    </span>
  );
}
