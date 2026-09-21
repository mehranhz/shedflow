import type {
  AvailabilityRule,
  Booking,
  Customer,
  DateOverride,
  EventType,
  Organization,
  PublicEventType,
  PublicOrg,
  Question,
  Schedule,
} from "@/lib/types";
import { defaultWeeklyRules } from "@/lib/slots";
import { randomUUID } from "@/lib/uuid";

const STORAGE_KEY = "sf-preview-v1";

type OrgBundle = {
  org: Organization;
  eventTypes: EventType[];
  schedules: Schedule[];
  bookings: Booking[];
  customers: Customer[];
  invitations: Array<{
    id: string;
    organizationId: string;
    email: string;
    role: "ADMIN" | "MEMBER";
    expiresAt: string;
    createdAt: string;
  }>;
};

type Store = {
  orgs: Record<string, OrgBundle>;
  slugIndex: Record<string, string>;
};

function emptyStore(): Store {
  return { orgs: {}, slugIndex: {} };
}

function read(): Store {
  if (typeof window === "undefined") {
    return emptyStore();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyStore();
    }
    return JSON.parse(raw) as Store;
  } catch {
    return emptyStore();
  }
}

function write(store: Store): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function uid(length = 21): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function ensureBundle(org: Organization, hostUserId: string): OrgBundle {
  const store = read();
  const existing = store.orgs[org.id];
  if (existing) {
    existing.org = { ...existing.org, ...org };
    store.slugIndex[org.slug] = org.id;
    write(store);
    return existing;
  }
  const now = new Date().toISOString();
  const schedule: Schedule = {
    id: randomUUID(),
    organizationId: org.id,
    hostUserId,
    name: "Working hours",
    timezone: org.timezone,
    isDefault: true,
    rules: defaultWeeklyRules(),
    overrides: [],
    createdAt: now,
    updatedAt: now,
  };
  const bundle: OrgBundle = {
    org,
    eventTypes: [],
    schedules: [schedule],
    bookings: [],
    customers: [],
    invitations: [],
  };
  store.orgs[org.id] = bundle;
  store.slugIndex[org.slug] = org.id;
  write(store);
  return bundle;
}

export const previewStore = {
  ensure(org: Organization, hostUserId: string): OrgBundle {
    return ensureBundle(org, hostUserId);
  },

  getById(orgId: string): OrgBundle | null {
    return read().orgs[orgId] ?? null;
  },

  getBySlug(slug: string): OrgBundle | null {
    const store = read();
    const id = store.slugIndex[slug];
    return id ? (store.orgs[id] ?? null) : null;
  },

  listEventTypes(orgId: string): EventType[] {
    return read().orgs[orgId]?.eventTypes ?? [];
  },

  saveEventType(orgId: string, eventType: EventType): EventType {
    const store = read();
    const bundle = store.orgs[orgId];
    if (!bundle) {
      throw new Error("Organization preview data not found");
    }
    const index = bundle.eventTypes.findIndex((item) => item.id === eventType.id);
    if (index >= 0) {
      bundle.eventTypes[index] = eventType;
    } else {
      bundle.eventTypes.push(eventType);
    }
    write(store);
    return eventType;
  },

  listSchedules(orgId: string): Schedule[] {
    return read().orgs[orgId]?.schedules ?? [];
  },

  saveSchedule(orgId: string, schedule: Schedule): Schedule {
    const store = read();
    const bundle = store.orgs[orgId];
    if (!bundle) {
      throw new Error("Organization preview data not found");
    }
    const index = bundle.schedules.findIndex((item) => item.id === schedule.id);
    if (index >= 0) {
      bundle.schedules[index] = schedule;
    } else {
      bundle.schedules.push(schedule);
    }
    write(store);
    return schedule;
  },

  replaceRules(orgId: string, scheduleId: string, rules: AvailabilityRule[]): Schedule {
    const store = read();
    const bundle = store.orgs[orgId];
    const schedule = bundle?.schedules.find((item) => item.id === scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }
    schedule.rules = rules;
    schedule.updatedAt = new Date().toISOString();
    write(store);
    return schedule;
  },

  upsertOverride(orgId: string, scheduleId: string, override: DateOverride): Schedule {
    const store = read();
    const bundle = store.orgs[orgId];
    const schedule = bundle?.schedules.find((item) => item.id === scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }
    schedule.overrides = [
      ...schedule.overrides.filter((item) => item.date !== override.date),
      override,
    ];
    schedule.updatedAt = new Date().toISOString();
    write(store);
    return schedule;
  },

  deleteOverride(orgId: string, scheduleId: string, date: string): Schedule {
    const store = read();
    const bundle = store.orgs[orgId];
    const schedule = bundle?.schedules.find((item) => item.id === scheduleId);
    if (!schedule) {
      throw new Error("Schedule not found");
    }
    schedule.overrides = schedule.overrides.filter((item) => item.date !== date);
    schedule.updatedAt = new Date().toISOString();
    write(store);
    return schedule;
  },

  listBookings(orgId: string): Booking[] {
    return read().orgs[orgId]?.bookings ?? [];
  },

  saveBooking(orgId: string, booking: Booking): Booking {
    const store = read();
    const bundle = store.orgs[orgId];
    if (!bundle) {
      throw new Error("Organization preview data not found");
    }
    const index = bundle.bookings.findIndex((item) => item.id === booking.id);
    if (index >= 0) {
      bundle.bookings[index] = booking;
    } else {
      bundle.bookings.push(booking);
    }
    write(store);
    return booking;
  },

  listCustomers(orgId: string): Customer[] {
    return read().orgs[orgId]?.customers ?? [];
  },

  upsertCustomer(orgId: string, customer: Customer): Customer {
    const store = read();
    const bundle = store.orgs[orgId];
    if (!bundle) {
      throw new Error("Organization preview data not found");
    }
    const index = bundle.customers.findIndex(
      (item) => item.email.toLowerCase() === customer.email.toLowerCase(),
    );
    if (index >= 0) {
      bundle.customers[index] = { ...bundle.customers[index], ...customer };
      write(store);
      return bundle.customers[index];
    }
    bundle.customers.push(customer);
    write(store);
    return customer;
  },

  addInvitation(orgId: string, invitation: OrgBundle["invitations"][number]): void {
    const store = read();
    const bundle = store.orgs[orgId];
    if (!bundle) {
      return;
    }
    bundle.invitations.push(invitation);
    write(store);
  },

  listInvitations(orgId: string): OrgBundle["invitations"] {
    return read().orgs[orgId]?.invitations ?? [];
  },

  revokeInvitation(orgId: string, invitationId: string): void {
    const store = read();
    const bundle = store.orgs[orgId];
    if (!bundle) {
      return;
    }
    bundle.invitations = bundle.invitations.filter((item) => item.id !== invitationId);
    write(store);
  },

  toPublicOrg(bundle: OrgBundle): PublicOrg {
    const branding = (bundle.org.settings as { branding?: { hideSchedflowBadge?: boolean } })
      .branding;
    return {
      name: bundle.org.name,
      slug: bundle.org.slug,
      logoUrl: bundle.org.logoUrl,
      brandColor: bundle.org.brandColor,
      locale: bundle.org.locale,
      timezone: bundle.org.timezone,
      hideSchedflowBadge: branding?.hideSchedflowBadge,
    };
  },

  toPublicEvent(eventType: EventType): PublicEventType {
    return {
      slug: eventType.slug,
      title: eventType.title,
      description: eventType.description,
      durationMinutes: eventType.durationMinutes,
      locationType: eventType.locationType,
      locationValue: eventType.locationValue,
      questions: eventType.questions,
      requiresConfirmation: eventType.requiresConfirmation,
      price: null,
    };
  },

  newUid: uid,
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "event";
}

export function defaultQuestions(): Question[] {
  return [
    {
      id: "please-share",
      type: "textarea",
      label: "Please share anything that will help prepare for our meeting.",
      required: false,
    },
  ];
}
