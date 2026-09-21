"use client";

import { addMinutes } from "date-fns";

import { apiBff, billingBff } from "@/lib/bff";
import type { PublicBookingResult } from "@/lib/booking-types";
import { readBookingSession } from "@/lib/booking-session";
import { ClientApiError, isMissingRoute } from "@/lib/http";
import { previewStore, slugify, defaultQuestions } from "@/lib/preview-store";
import { publicApi } from "@/lib/public-api";
import { isPublicApiUnavailable } from "@/lib/public-fetch";
import { generateSlots } from "@/lib/slots";
import { randomUUID } from "@/lib/uuid";
import type {
  AvailabilityRule,
  Booking,
  Customer,
  DataSource,
  DateOverride,
  EventType,
  Invitation,
  Member,
  Organization,
  Page,
  PublicEventType,
  PublicOrg,
  Schedule,
  SlotList,
} from "@/lib/types";

const ACTIVE_BOOKING = new Set(["PENDING_PAYMENT", "PENDING_CONFIRMATION", "CONFIRMED"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Result<T> = { data: T; source: DataSource };

async function tryApi<T>(run: () => Promise<T>): Promise<Result<T> | null> {
  try {
    return { data: await run(), source: "api" };
  } catch (error) {
    if (isMissingRoute(error)) {
      return null;
    }
    throw error;
  }
}

async function tryPublicApi<T>(run: () => Promise<T>): Promise<Result<T> | null> {
  try {
    return { data: await run(), source: "api" };
  } catch (error) {
    if (isPublicApiUnavailable(error)) {
      return null;
    }
    throw error;
  }
}

function pageOf<T>(items: T[]): Page<T> {
  return {
    items,
    total: items.length,
    page: 1,
    limit: Math.max(items.length, 25),
    pageCount: 1,
  };
}

export const orgsApi = {
  async list(): Promise<Organization[]> {
    return apiBff<Organization[]>("organizations");
  },
  async get(orgId: string): Promise<Organization> {
    return apiBff<Organization>(`organizations/${orgId}`);
  },
  async update(orgId: string, body: Partial<Organization>): Promise<Organization> {
    return apiBff<Organization>(`organizations/${orgId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async switchOrg(orgId: string): Promise<{ accessToken: string; organizationId: string; role: string }> {
    return apiBff(`organizations/${orgId}/switch`, { method: "POST" });
  },
  async members(orgId: string): Promise<Member[]> {
    return apiBff<Member[]>(`organizations/${orgId}/members`);
  },
  async invite(orgId: string, body: { email: string; role: "ADMIN" | "MEMBER" }): Promise<Invitation> {
    try {
      return await apiBff<Invitation>(`organizations/${orgId}/invitations`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (!isMissingRoute(error)) {
        throw error;
      }
      const invitation: Invitation = {
        id: randomUUID(),
        organizationId: orgId,
        email: body.email,
        role: body.role,
        createdAt: new Date().toISOString(),
        expiresAt: addMinutes(new Date(), 60 * 24 * 7).toISOString(),
      };
      previewStore.addInvitation(orgId, invitation);
      return invitation;
    }
  },
  async invitations(orgId: string): Promise<Invitation[]> {
    const api = await tryApi(() =>
      apiBff<Invitation[]>(`organizations/${orgId}/invitations`),
    );
    if (api) {
      return api.data;
    }
    return previewStore.listInvitations(orgId);
  },
  async updateMember(
    orgId: string,
    userId: string,
    body: { role?: "ADMIN" | "MEMBER"; status?: "ACTIVE" | "DISABLED" },
  ): Promise<Member> {
    return apiBff<Member>(`organizations/${orgId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async removeMember(orgId: string, userId: string): Promise<void> {
    return apiBff<void>(`organizations/${orgId}/members/${userId}`, {
      method: "DELETE",
    });
  },
  async revokeInvitation(orgId: string, invitationId: string): Promise<void> {
    try {
      await apiBff<void>(`organizations/${orgId}/invitations/${invitationId}`, {
        method: "DELETE",
      });
    } catch (error) {
      if (!isMissingRoute(error)) {
        throw error;
      }
      previewStore.revokeInvitation(orgId, invitationId);
    }
  },
  async acceptInvite(token: string): Promise<unknown> {
    return apiBff(`invitations/${token}/accept`, { method: "POST" });
  },
};

export const schedulingApi = {
  async listEventTypes(org: Organization, hostUserId: string): Promise<Result<EventType[]>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(() =>
      apiBff<Page<EventType> | EventType[]>(`organizations/${org.id}/event-types`),
    );
    if (api) {
      const items = Array.isArray(api.data) ? api.data : api.data.items;
      return { data: items, source: "api" };
    }
    return { data: previewStore.listEventTypes(org.id), source: "preview" };
  },

  async getEventType(org: Organization, id: string, hostUserId: string): Promise<Result<EventType>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(() =>
      apiBff<EventType>(`organizations/${org.id}/event-types/${id}`),
    );
    if (api) {
      return api;
    }
    const found = previewStore.listEventTypes(org.id).find((item) => item.id === id);
    if (!found) {
      throw new ClientApiError("Event type not found", 404, "NOT_FOUND");
    }
    return { data: found, source: "preview" };
  },

  async createEventType(
    org: Organization,
    hostUserId: string,
    input: Partial<EventType> & { title: string; durationMinutes: number },
  ): Promise<Result<EventType>> {
    previewStore.ensure(org, hostUserId);
    const existing = await this.listEventTypes(org, hostUserId);
    if (org.platformPlan === "FREE" && existing.data.filter((item) => item.isActive).length >= 3) {
      throw new ClientApiError(
        "Free workspaces can publish 3 event types. Upgrade to Pro for more.",
        403,
        "FEATURE_GATED",
      );
    }
    const schedules = await this.listSchedules(org, hostUserId);
    // Only forward a real API schedule UUID. Never send preview/local ids,
    // null, or "" — the API treats scheduleId as optional and will attach
    // (or create) the host's default schedule.
    const scheduleId = [input.scheduleId, schedules.source === "api" ? schedules.data[0]?.id : undefined]
      .find((value): value is string => typeof value === "string" && UUID_RE.test(value));
    const payload = {
      title: input.title,
      slug: input.slug || slugify(input.title),
      description: input.description ?? "",
      durationMinutes: input.durationMinutes,
      locationType: input.locationType ?? "GOOGLE_MEET",
      locationValue: input.locationValue ?? null,
      bufferBeforeMinutes: input.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: input.bufferAfterMinutes ?? 0,
      minNoticeMinutes: input.minNoticeMinutes ?? 60,
      maxDaysAhead: input.maxDaysAhead ?? 60,
      slotIntervalMinutes: input.slotIntervalMinutes ?? 0,
      dailyCap: input.dailyCap ?? null,
      requiresConfirmation: input.requiresConfirmation ?? false,
      cancellationNoticeHours: input.cancellationNoticeHours ?? 24,
      rescheduleNoticeHours: input.rescheduleNoticeHours ?? 24,
      questions: input.questions ?? defaultQuestions(),
      isActive: input.isActive ?? true,
      isHidden: input.isHidden ?? false,
      ...(scheduleId ? { scheduleId } : {}),
    };
    const api = await tryApi(() =>
      apiBff<EventType>(`organizations/${org.id}/event-types`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    if (api) {
      return api;
    }
    const now = new Date().toISOString();
    const previewScheduleId =
      ("scheduleId" in payload && payload.scheduleId) ||
      previewStore.listSchedules(org.id)[0]?.id ||
      randomUUID();
    const eventType: EventType = {
      id: randomUUID(),
      organizationId: org.id,
      hostUserId,
      priceId: null,
      subscriptionProductId: null,
      creditCost: 0,
      createdAt: now,
      updatedAt: now,
      ...payload,
      scheduleId: previewScheduleId,
    };
    return { data: previewStore.saveEventType(org.id, eventType), source: "preview" };
  },

  async updateEventType(
    org: Organization,
    hostUserId: string,
    id: string,
    patch: Partial<EventType>,
  ): Promise<Result<EventType>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(() =>
      apiBff<EventType>(`organizations/${org.id}/event-types/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    );
    if (api) {
      return api;
    }
    const current = previewStore.listEventTypes(org.id).find((item) => item.id === id);
    if (!current) {
      throw new ClientApiError("Event type not found", 404, "NOT_FOUND");
    }
    const updated = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return { data: previewStore.saveEventType(org.id, updated), source: "preview" };
  },

  async listSchedules(org: Organization, hostUserId: string): Promise<Result<Schedule[]>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(() =>
      apiBff<Page<Schedule> | Schedule[]>(`organizations/${org.id}/schedules`),
    );
    if (api) {
      const items = Array.isArray(api.data) ? api.data : api.data.items;
      return { data: items, source: "api" };
    }
    return { data: previewStore.listSchedules(org.id), source: "preview" };
  },

  async replaceRules(
    org: Organization,
    hostUserId: string,
    scheduleId: string,
    rules: AvailabilityRule[],
  ): Promise<Result<Schedule>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(() =>
      apiBff<Schedule>(`organizations/${org.id}/schedules/${scheduleId}/rules`, {
        method: "PUT",
        body: JSON.stringify({ rules }),
      }),
    );
    if (api) {
      return api;
    }
    return {
      data: previewStore.replaceRules(org.id, scheduleId, rules),
      source: "preview",
    };
  },

  async updateSchedule(
    org: Organization,
    hostUserId: string,
    scheduleId: string,
    patch: { name?: string; timezone?: string; isDefault?: boolean },
  ): Promise<Result<Schedule>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(() =>
      apiBff<Schedule>(`organizations/${org.id}/schedules/${scheduleId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    );
    if (api) {
      return api;
    }
    const current = previewStore.listSchedules(org.id).find((item) => item.id === scheduleId);
    if (!current) {
      throw new ClientApiError("Schedule not found", 404, "NOT_FOUND");
    }
    return {
      data: previewStore.saveSchedule(org.id, {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      }),
      source: "preview",
    };
  },

  async upsertOverride(
    org: Organization,
    hostUserId: string,
    scheduleId: string,
    date: string,
    override: Omit<DateOverride, "date">,
  ): Promise<Result<Schedule>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(() =>
      apiBff<Schedule>(`organizations/${org.id}/schedules/${scheduleId}/overrides/${date}`, {
        method: "PUT",
        body: JSON.stringify(override),
      }),
    );
    if (api) {
      return api;
    }
    return {
      data: previewStore.upsertOverride(org.id, scheduleId, { date, ...override }),
      source: "preview",
    };
  },

  async deleteOverride(
    org: Organization,
    hostUserId: string,
    scheduleId: string,
    date: string,
  ): Promise<Result<Schedule>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(async () => {
      await apiBff<void>(
        `organizations/${org.id}/schedules/${scheduleId}/overrides/${date}`,
        { method: "DELETE" },
      );
      return true;
    });
    if (api) {
      const refreshed = await this.listSchedules(org, hostUserId);
      const schedule = refreshed.data.find((item) => item.id === scheduleId);
      if (!schedule) {
        throw new ClientApiError("Schedule not found", 404, "NOT_FOUND");
      }
      return { data: schedule, source: "api" };
    }
    return {
      data: previewStore.deleteOverride(org.id, scheduleId, date),
      source: "preview",
    };
  },

  async listBookings(
    org: Organization,
    hostUserId: string,
    query?: {
      status?: string;
      eventTypeId?: string;
      from?: string;
      to?: string;
    },
  ): Promise<Result<Page<Booking>>> {
    previewStore.ensure(org, hostUserId);
    const params = new URLSearchParams();
    if (query?.status) params.set("status", query.status);
    if (query?.eventTypeId) params.set("eventTypeId", query.eventTypeId);
    if (query?.from) params.set("from", query.from);
    if (query?.to) params.set("to", query.to);
    const search = params.toString() ? `?${params.toString()}` : "";
    const api = await tryApi(() =>
      apiBff<Page<Booking>>(`organizations/${org.id}/bookings${search}`),
    );
    if (api) {
      return api;
    }
    let items = previewStore.listBookings(org.id);
    if (query?.status) {
      items = items.filter((item) => item.status === query.status);
    }
    if (query?.eventTypeId) {
      items = items.filter((item) => item.eventTypeId === query.eventTypeId);
    }
    if (query?.from) {
      const from = new Date(query.from).getTime();
      items = items.filter((item) => new Date(item.startAt).getTime() >= from);
    }
    if (query?.to) {
      const to = new Date(query.to).getTime();
      items = items.filter((item) => new Date(item.startAt).getTime() <= to);
    }
    const events = previewStore.listEventTypes(org.id);
    const customers = previewStore.listCustomers(org.id);
    items = items
      .map((booking) => ({
        ...booking,
        eventType: events.find((event) => event.id === booking.eventTypeId),
        customer: customers.find((customer) => customer.id === booking.customerId),
      }))
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    return { data: pageOf(items), source: "preview" };
  },

  async createHostBooking(
    org: Organization,
    hostUserId: string,
    input: {
      eventTypeId: string;
      startAt: string;
      timezone: string;
      invitee: { name: string; email: string; phone?: string };
      answers?: Record<string, string | boolean>;
    },
  ): Promise<Result<Booking>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(() =>
      apiBff<Booking>(`organizations/${org.id}/bookings`, {
        method: "POST",
        body: JSON.stringify(input),
        idempotencyKey: randomUUID(),
      }),
    );
    if (api) {
      return api;
    }
    const eventType = previewStore
      .listEventTypes(org.id)
      .find((item) => item.id === input.eventTypeId && item.isActive);
    if (!eventType) {
      throw new ClientApiError("Event type not found", 404, "NOT_FOUND");
    }
    const now = new Date().toISOString();
    const customer = previewStore.upsertCustomer(org.id, {
      id: randomUUID(),
      organizationId: org.id,
      email: input.invitee.email,
      name: input.invitee.name,
      phone: input.invitee.phone ?? null,
      timezone: input.timezone,
      notes: "",
      createdAt: now,
      updatedAt: now,
    });
    const start = new Date(input.startAt);
    const booking: Booking = {
      id: randomUUID(),
      uid: previewStore.newUid(),
      organizationId: org.id,
      eventTypeId: eventType.id,
      hostUserId: eventType.hostUserId,
      customerId: customer.id,
      startAt: start.toISOString(),
      endAt: addMinutes(start, eventType.durationMinutes).toISOString(),
      timezone: input.timezone,
      status: eventType.requiresConfirmation ? "PENDING_CONFIRMATION" : "CONFIRMED",
      source: "DASHBOARD",
      locationType: eventType.locationType,
      locationValue: eventType.locationValue,
      answers: input.answers ?? {},
      cancellationReason: null,
      rescheduledFromId: null,
      createdAt: now,
      updatedAt: now,
      eventType: {
        id: eventType.id,
        title: eventType.title,
        slug: eventType.slug,
        durationMinutes: eventType.durationMinutes,
      },
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
    };
    return { data: previewStore.saveBooking(org.id, booking), source: "preview" };
  },

  async rescheduleBooking(
    org: Organization,
    hostUserId: string,
    bookingId: string,
    startAt: string,
    timezone: string,
  ): Promise<Result<Booking>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(() =>
      apiBff<Booking>(`organizations/${org.id}/bookings/${bookingId}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ startAt, timezone }),
      }),
    );
    if (api) {
      return api;
    }
    const booking = previewStore.listBookings(org.id).find((item) => item.id === bookingId);
    if (!booking) {
      throw new ClientApiError("Booking not found", 404, "NOT_FOUND");
    }
    const start = new Date(startAt);
    const duration =
      new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime();
    const updated: Booking = {
      ...booking,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + duration).toISOString(),
      timezone,
      updatedAt: new Date().toISOString(),
    };
    return { data: previewStore.saveBooking(org.id, updated), source: "preview" };
  },

  async cancelBooking(
    org: Organization,
    hostUserId: string,
    bookingId: string,
    reason?: string,
  ): Promise<Result<Booking>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(() =>
      apiBff<Booking>(`organizations/${org.id}/bookings/${bookingId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    );
    if (api) {
      return api;
    }
    const booking = previewStore.listBookings(org.id).find((item) => item.id === bookingId);
    if (!booking) {
      throw new ClientApiError("Booking not found", 404, "NOT_FOUND");
    }
    const updated = {
      ...booking,
      status: "CANCELLED" as const,
      cancellationReason: reason ?? null,
      updatedAt: new Date().toISOString(),
    };
    return { data: previewStore.saveBooking(org.id, updated), source: "preview" };
  },

  async confirmBooking(org: Organization, hostUserId: string, bookingId: string): Promise<Result<Booking>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(() =>
      apiBff<Booking>(`organizations/${org.id}/bookings/${bookingId}/confirm`, {
        method: "POST",
      }),
    );
    if (api) {
      return api;
    }
    const booking = previewStore.listBookings(org.id).find((item) => item.id === bookingId);
    if (!booking) {
      throw new ClientApiError("Booking not found", 404, "NOT_FOUND");
    }
    const updated = {
      ...booking,
      status: "CONFIRMED" as const,
      updatedAt: new Date().toISOString(),
    };
    return { data: previewStore.saveBooking(org.id, updated), source: "preview" };
  },

  async markNoShow(org: Organization, hostUserId: string, bookingId: string): Promise<Result<Booking>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(() =>
      apiBff<Booking>(`organizations/${org.id}/bookings/${bookingId}/no-show`, {
        method: "POST",
      }),
    );
    if (api) {
      return api;
    }
    const booking = previewStore.listBookings(org.id).find((item) => item.id === bookingId);
    if (!booking) {
      throw new ClientApiError("Booking not found", 404, "NOT_FOUND");
    }
    const updated = {
      ...booking,
      status: "NO_SHOW" as const,
      updatedAt: new Date().toISOString(),
    };
    return { data: previewStore.saveBooking(org.id, updated), source: "preview" };
  },

  async listCustomers(org: Organization, hostUserId: string): Promise<Result<Page<Customer>>> {
    previewStore.ensure(org, hostUserId);
    const api = await tryApi(() =>
      apiBff<Page<Customer>>(`organizations/${org.id}/customers`),
    );
    if (api) {
      return api;
    }
    return { data: pageOf(previewStore.listCustomers(org.id)), source: "preview" };
  },
};

export const publicScheduling = {
  async org(slug: string): Promise<Result<PublicOrg>> {
    const api = await tryPublicApi(() => publicApi<PublicOrg>(`/v1/public/orgs/${slug}`));
    if (api) {
      return api;
    }
    const bundle = previewStore.getBySlug(slug);
    if (!bundle) {
      throw new ClientApiError("Organization not found", 404, "NOT_FOUND");
    }
    return { data: previewStore.toPublicOrg(bundle), source: "preview" };
  },

  async eventTypes(slug: string): Promise<Result<PublicEventType[]>> {
    const api = await tryPublicApi(() =>
      publicApi<PublicEventType[] | Page<PublicEventType>>(`/v1/public/orgs/${slug}/event-types`),
    );
    if (api) {
      const items = Array.isArray(api.data) ? api.data : api.data.items;
      return { data: items, source: "api" };
    }
    const bundle = previewStore.getBySlug(slug);
    if (!bundle) {
      throw new ClientApiError("Organization not found", 404, "NOT_FOUND");
    }
    return {
      data: bundle.eventTypes
        .filter((item) => item.isActive && !item.isHidden)
        .map((item) => previewStore.toPublicEvent(item)),
      source: "preview",
    };
  },

  async eventType(slug: string, eventSlug: string): Promise<Result<PublicEventType & { organization: PublicOrg }>> {
    const api = await tryPublicApi(() =>
      publicApi<PublicEventType & { organization?: PublicOrg }>(
        `/v1/public/orgs/${slug}/event-types/${eventSlug}`,
      ),
    );
    if (api) {
      const org = api.data.organization ?? (await this.org(slug)).data;
      return { data: { ...api.data, organization: org }, source: "api" };
    }
    const bundle = previewStore.getBySlug(slug);
    const eventType = bundle?.eventTypes.find(
      (item) => item.slug === eventSlug && item.isActive,
    );
    if (!bundle || !eventType) {
      throw new ClientApiError("Event type not found", 404, "NOT_FOUND");
    }
    return {
      data: {
        ...previewStore.toPublicEvent(eventType),
        organization: previewStore.toPublicOrg(bundle),
      },
      source: "preview",
    };
  },

  async slots(
    slug: string,
    eventSlug: string,
    rangeStart: Date,
    rangeEnd: Date,
    timeZone: string,
  ): Promise<Result<SlotList>> {
    const params = new URLSearchParams({
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
      tz: timeZone,
    });
    const api = await tryPublicApi(() =>
      publicApi<SlotList>(
        `/v1/public/orgs/${slug}/event-types/${eventSlug}/slots?${params.toString()}`,
      ),
    );
    if (api) {
      return api;
    }
    const bundle = previewStore.getBySlug(slug);
    const eventType = bundle?.eventTypes.find((item) => item.slug === eventSlug);
    const schedule = bundle?.schedules.find((item) => item.id === eventType?.scheduleId)
      ?? bundle?.schedules[0];
    if (!bundle || !eventType || !schedule) {
      throw new ClientApiError("Event type not found", 404, "NOT_FOUND");
    }
    const busy = bundle.bookings
      .filter((booking) => ACTIVE_BOOKING.has(booking.status))
      .map((booking) => ({ startAt: booking.startAt, endAt: booking.endAt }));
    return {
      data: generateSlots({
        schedule,
        durationMinutes: eventType.durationMinutes,
        slotIntervalMinutes: eventType.slotIntervalMinutes,
        minNoticeMinutes: eventType.minNoticeMinutes,
        maxDaysAhead: eventType.maxDaysAhead,
        rangeStart,
        rangeEnd,
        inviteeTimeZone: timeZone,
        busy,
      }),
      source: "preview",
    };
  },

  async book(
    body: {
      eventTypeSlug: string;
      orgSlug: string;
      startAt: string;
      timezone: string;
      invitee: { name: string; email: string; phone?: string };
      answers: Record<string, string | boolean>;
      metadata?: Record<string, unknown>;
      source: "HOSTED" | "EMBED";
    },
    idempotencyKey: string,
  ): Promise<Result<PublicBookingResult>> {
    const api = await tryPublicApi(() =>
      publicApi<PublicBookingResult>("/v1/public/bookings", {
        method: "POST",
        body: JSON.stringify({
          orgSlug: body.orgSlug,
          eventTypeSlug: body.eventTypeSlug,
          startAt: body.startAt,
          timezone: body.timezone,
          invitee: body.invitee,
          answers: body.answers,
          metadata: body.metadata,
          source: body.source,
        }),
        idempotencyKey,
      }),
    );
    if (api) {
      return api;
    }
    const bundle = previewStore.getBySlug(body.orgSlug);
    const eventType = bundle?.eventTypes.find((item) => item.slug === body.eventTypeSlug);
    if (!bundle || !eventType) {
      throw new ClientApiError("Event type not found", 404, "NOT_FOUND");
    }
    const conflict = bundle.bookings.some(
      (booking) =>
        ACTIVE_BOOKING.has(booking.status) && booking.startAt === body.startAt,
    );
    if (conflict) {
      throw new ClientApiError("That time is no longer available.", 409, "SLOT_UNAVAILABLE");
    }
    const now = new Date().toISOString();
    const customer = previewStore.upsertCustomer(bundle.org.id, {
      id: randomUUID(),
      organizationId: bundle.org.id,
      email: body.invitee.email,
      name: body.invitee.name,
      phone: body.invitee.phone ?? null,
      timezone: body.timezone,
      notes: "",
      createdAt: now,
      updatedAt: now,
    });
    const start = new Date(body.startAt);
    const paid = Boolean(eventType.priceId);
    const status = paid
      ? "PENDING_PAYMENT"
      : eventType.requiresConfirmation
        ? "PENDING_CONFIRMATION"
        : "CONFIRMED";
    const booking: PublicBookingResult = {
      id: randomUUID(),
      uid: previewStore.newUid(),
      organizationId: bundle.org.id,
      eventTypeId: eventType.id,
      hostUserId: eventType.hostUserId,
      customerId: customer.id,
      startAt: start.toISOString(),
      endAt: addMinutes(start, eventType.durationMinutes).toISOString(),
      timezone: body.timezone,
      status,
      source: body.source,
      locationType: eventType.locationType,
      locationValue: eventType.locationValue,
      answers: body.answers,
      cancellationReason: null,
      rescheduledFromId: null,
      createdAt: now,
      updatedAt: now,
      orgSlug: bundle.org.slug,
      // Stub until billing Checkout (T-021) is wired for public bookings.
      checkoutUrl: paid ? null : undefined,
      eventType: {
        id: eventType.id,
        title: eventType.title,
        slug: eventType.slug,
        durationMinutes: eventType.durationMinutes,
      },
      customer,
      actionTokens: {
        manage: "preview",
        cancel: "preview",
        reschedule: "preview",
      },
      ...(body.metadata ? { metadata: body.metadata } : {}),
    };
    return { data: previewStore.saveBooking(bundle.org.id, booking), source: "preview" };
  },

  async retryCheckout(uid: string): Promise<Result<{ checkoutUrl: string | null }>> {
    const api = await tryPublicApi(() =>
      publicApi<{ checkoutUrl?: string | null }>(`/v1/public/bookings/${uid}/checkout`, {
        method: "POST",
      }),
    );
    if (api) {
      return { data: { checkoutUrl: api.data.checkoutUrl ?? null }, source: "api" };
    }
    return { data: { checkoutUrl: null }, source: "preview" };
  },

  async getBooking(uid: string): Promise<Result<PublicBookingResult>> {
    const api = await tryPublicApi(() =>
      publicApi<PublicBookingResult>(`/v1/public/bookings/${uid}`),
    );
    const session = typeof window === "undefined" ? null : readBookingSession(uid);
    if (api) {
      return {
        data: {
          ...api.data,
          orgSlug: api.data.orgSlug ?? session?.orgSlug,
        },
        source: "api",
      };
    }
    if (typeof window === "undefined") {
      throw new ClientApiError("Booking not found", 404, "NOT_FOUND");
    }
    for (const orgId of Object.keys(
      JSON.parse(window.localStorage.getItem("sf-preview-v1") ?? '{"orgs":{}}').orgs ?? {},
    )) {
      const bundle = previewStore.getById(orgId);
      const booking = bundle?.bookings.find((item) => item.uid === uid);
      if (booking && bundle) {
        const eventType = bundle.eventTypes.find((item) => item.id === booking.eventTypeId);
        return {
          data: {
            ...booking,
            orgSlug: bundle.org.slug,
            eventType: eventType
              ? {
                  id: eventType.id,
                  title: eventType.title,
                  slug: eventType.slug,
                  durationMinutes: eventType.durationMinutes,
                }
              : booking.eventType,
          },
          source: "preview",
        };
      }
    }
    throw new ClientApiError("Booking not found", 404, "NOT_FOUND");
  },

  async cancel(uid: string, token: string, reason?: string): Promise<Result<Booking>> {
    const api = await tryPublicApi(() =>
      publicApi<Booking>(`/v1/public/bookings/${uid}/cancel`, {
        method: "POST",
        body: JSON.stringify({ token, reason }),
      }),
    );
    if (api) {
      return api;
    }
    const current = await this.getBooking(uid);
    const updated = {
      ...current.data,
      status: "CANCELLED" as const,
      cancellationReason: reason ?? null,
      updatedAt: new Date().toISOString(),
    };
    previewStore.saveBooking(updated.organizationId, updated);
    return { data: updated, source: "preview" };
  },

  async reschedule(uid: string, token: string, startAt: string, timezone: string): Promise<Result<Booking>> {
    const api = await tryPublicApi(() =>
      publicApi<Booking>(`/v1/public/bookings/${uid}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ token, startAt, timezone }),
      }),
    );
    if (api) {
      return api;
    }
    const current = await this.getBooking(uid);
    const start = new Date(startAt);
    const duration =
      new Date(current.data.endAt).getTime() - new Date(current.data.startAt).getTime();
    const updated = {
      ...current.data,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + duration).toISOString(),
      timezone,
      updatedAt: new Date().toISOString(),
    };
    previewStore.saveBooking(updated.organizationId, updated);
    return { data: updated, source: "preview" };
  },
};

export const billingApi = {
  async connectStatus(orgId: string): Promise<{
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
  } | null> {
    try {
      return await billingBff(`organizations/${orgId}/connect/status`);
    } catch (error) {
      if (isMissingRoute(error) || (error instanceof ClientApiError && error.status >= 500)) {
        return null;
      }
      throw error;
    }
  },
  async onboard(orgId: string, country = "US"): Promise<{ url: string }> {
    return billingBff(`organizations/${orgId}/connect/onboard`, {
      method: "POST",
      body: JSON.stringify({ country }),
    });
  },
  async dashboardLink(orgId: string): Promise<{ url: string }> {
    return billingBff(`organizations/${orgId}/connect/dashboard-link`, {
      method: "POST",
    });
  },
  async upgrade(
    orgId: string,
    interval: "month" | "year" = "month",
  ): Promise<{ url: string }> {
    try {
      return await billingBff(`organizations/${orgId}/platform/checkout`, {
        method: "POST",
        body: JSON.stringify({ interval }),
      });
    } catch (error) {
      if (isMissingRoute(error)) {
        return { url: "https://checkout.stripe.com/c/pay/preview" };
      }
      throw error;
    }
  },
  async portal(orgId: string): Promise<{ url: string } | null> {
    try {
      return await billingBff(`organizations/${orgId}/platform/portal`, {
        method: "POST",
      });
    } catch (error) {
      if (isMissingRoute(error) || (error instanceof ClientApiError && error.status === 404)) {
        return null;
      }
      throw error;
    }
  },
  async refundPayment(
    orgId: string,
    paymentId: string,
    input?: { amountMinor?: number; reason?: string },
  ): Promise<{
    refund: { id: string; amountMinor: number };
    payment: { id: string; status: string };
  }> {
    return billingBff(`organizations/${orgId}/payments/${paymentId}/refunds`, {
      method: "POST",
      body: JSON.stringify(input ?? {}),
    });
  },
  async listProducts(orgId: string): Promise<
    Array<{
      id: string;
      name: string;
      type: "ONE_TIME" | "RECURRING";
      isActive: boolean;
      creditGrantPerPeriod: number;
      prices?: Array<{
        id: string;
        amountMinor: number;
        currency: string;
        interval: "month" | "year" | null;
      }>;
    }> | null
  > {
    try {
      return await billingBff(`organizations/${orgId}/products`);
    } catch (error) {
      if (
        isMissingRoute(error) ||
        (error instanceof ClientApiError && (error.status === 404 || error.status === 403))
      ) {
        return null;
      }
      throw error;
    }
  },
  async createProduct(
    orgId: string,
    body: {
      name: string;
      type: "ONE_TIME" | "RECURRING";
      creditGrantPerPeriod?: number;
    },
  ): Promise<{ id: string; name: string }> {
    return billingBff(`organizations/${orgId}/products`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async createPrice(
    orgId: string,
    productId: string,
    body: {
      amountMinor: number;
      currency: string;
      interval?: "month" | "year";
    },
  ): Promise<{ id: string }> {
    return billingBff(`organizations/${orgId}/products/${productId}/prices`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};

export type ApiKeyRow = {
  id: string;
  organizationId: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type WebhookEndpointRow = {
  id: string;
  organizationId: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDeliveryRow = {
  id: string;
  endpointId: string;
  eventId: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  attempt: number;
  nextRetryAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export const developerApi = {
  listKeys(orgId: string): Promise<ApiKeyRow[]> {
    return apiBff(`organizations/${orgId}/api-keys`);
  },
  createKey(
    orgId: string,
    body: { name: string; scopes: string[] },
  ): Promise<ApiKeyRow & { secret: string }> {
    return apiBff(`organizations/${orgId}/api-keys`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  revokeKey(orgId: string, id: string): Promise<void> {
    return apiBff(`organizations/${orgId}/api-keys/${id}`, {
      method: "DELETE",
    });
  },
  listEndpoints(orgId: string): Promise<WebhookEndpointRow[]> {
    return apiBff(`organizations/${orgId}/webhook-endpoints`);
  },
  createEndpoint(
    orgId: string,
    body: { url: string; events: string[] },
  ): Promise<WebhookEndpointRow & { secret: string }> {
    return apiBff(`organizations/${orgId}/webhook-endpoints`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  deleteEndpoint(orgId: string, id: string): Promise<void> {
    return apiBff(`organizations/${orgId}/webhook-endpoints/${id}`, {
      method: "DELETE",
    });
  },
  listDeliveries(
    orgId: string,
    endpointId: string,
  ): Promise<WebhookDeliveryRow[]> {
    return apiBff(
      `organizations/${orgId}/webhook-endpoints/${endpointId}/deliveries`,
    );
  },
  redeliver(
    orgId: string,
    endpointId: string,
    deliveryId: string,
  ): Promise<{ id: string; status: string; nextRetryAt: string | null }> {
    return apiBff(
      `organizations/${orgId}/webhook-endpoints/${endpointId}/deliveries/${deliveryId}/redeliver`,
      { method: "POST" },
    );
  },
};
