"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@shedflow/ui/components";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { cn } from "@shedflow/ui/lib/utils";

import { formatTimeZoneLabel, listTimeZones } from "@/lib/timezones";

export function TimezoneCombobox({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const zones = useMemo(() => listTimeZones(), []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Globe className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{formatTimeZoneLabel(value)}</span>
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search time zones..." />
          <CommandList>
            <CommandEmpty>No time zone found.</CommandEmpty>
            <CommandGroup>
              {zones.map((zone) => (
                <CommandItem
                  key={zone}
                  value={`${zone} ${formatTimeZoneLabel(zone)}`}
                  onSelect={() => {
                    onChange(zone);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      zone === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{formatTimeZoneLabel(zone)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
