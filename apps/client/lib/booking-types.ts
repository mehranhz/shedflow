import type { Booking } from "@/lib/types";
import type { BookingActionTokens } from "@/lib/booking-session";

export type PublicBookingResult = Booking & {
  actionTokens?: BookingActionTokens;
  orgSlug?: string;
};
