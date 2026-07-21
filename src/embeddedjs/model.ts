export const APP_STATE_VERSION = 1;
export const SLOT_COUNT = 4;
export const WATCH_HISTORY_LIMIT = 128;
export const MINIMUM_SLOT_DISTANCE_MINUTES = 2;

export type SlotId = 0 | 1 | 2 | 3;
export type Outcome = "no_response" | "taken" | "skipped";

export interface ReminderSlot {
  id: SlotId;
  hour: number;
  minute: number;
  enabled: boolean;
  wakeupId: number | null;
  scheduledAt: number | null;
}

export interface ReminderEvent {
  installId: string;
  sequence: number;
  slotId: SlotId;
  scheduledAt: number;
  localDay: string;
  timezoneOffset: number;
  outcome: Outcome;
  answeredAt: number | null;
}

export interface AppState {
  version: number;
  installId: string;
  nextSequence: number;
  settingsRevision: number;
  slots: ReminderSlot[];
  events: ReminderEvent[];
  droppedEvents: number;
  lastSyncAt: number | null;
}

const DEFAULT_TIMES: ReadonlyArray<readonly [number, number]> = [
  [8, 0],
  [12, 0],
  [18, 0],
  [22, 0],
];

export function isSlotId(value: unknown): value is SlotId {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function isOutcome(value: unknown): value is Outcome {
  return value === "no_response" || value === "taken" || value === "skipped";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integerInRange(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  return value >= minimum && value <= maximum ? value : null;
}

function nullableTimestamp(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return undefined;
}

export function createDefaultState(
  now: number = Date.now(),
  randomValue: number = Math.random(),
): AppState {
  const randomPart = Math.floor(randomValue * 0x7fffffff).toString(36);
  return {
    version: APP_STATE_VERSION,
    installId: `${Math.floor(now).toString(36)}-${randomPart}`,
    nextSequence: 1,
    settingsRevision: 1,
    slots: DEFAULT_TIMES.map(([hour, minute], index) => ({
      id: index as SlotId,
      hour,
      minute,
      enabled: true,
      wakeupId: null,
      scheduledAt: null,
    })),
    events: [],
    droppedEvents: 0,
    lastSyncAt: null,
  };
}

function decodeSlot(value: unknown, expectedId: SlotId): ReminderSlot | null {
  if (!isRecord(value) || value.id !== expectedId) {
    return null;
  }

  const hour = integerInRange(value.hour, 0, 23);
  const minute = integerInRange(value.minute, 0, 59);
  const wakeupId = value.wakeupId === null
    ? null
    : integerInRange(value.wakeupId, 0, 0x7fffffff);
  const scheduledAt = nullableTimestamp(value.scheduledAt);

  if (
    hour === null
    || minute === null
    || typeof value.enabled !== "boolean"
    || wakeupId === null && value.wakeupId !== null
    || scheduledAt === undefined
  ) {
    return null;
  }

  return {
    id: expectedId,
    hour,
    minute,
    enabled: value.enabled,
    wakeupId,
    scheduledAt,
  };
}

function decodeEvent(value: unknown, installId: string): ReminderEvent | null {
  if (!isRecord(value) || value.installId !== installId || !isSlotId(value.slotId)) {
    return null;
  }

  const sequence = integerInRange(value.sequence, 1, Number.MAX_SAFE_INTEGER);
  const scheduledAt = nullableTimestamp(value.scheduledAt);
  const timezoneOffset = integerInRange(value.timezoneOffset, -24 * 60, 24 * 60);
  const answeredAt = nullableTimestamp(value.answeredAt);

  if (
    sequence === null
    || scheduledAt === null
    || scheduledAt === undefined
    || timezoneOffset === null
    || answeredAt === undefined
    || typeof value.localDay !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.localDay)
    || !isOutcome(value.outcome)
    || value.outcome === "no_response" && answeredAt !== null
    || value.outcome !== "no_response" && answeredAt === null
  ) {
    return null;
  }

  return {
    installId,
    sequence,
    slotId: value.slotId,
    scheduledAt,
    localDay: value.localDay,
    timezoneOffset,
    outcome: value.outcome,
    answeredAt,
  };
}

export function decodeAppState(value: unknown): AppState | null {
  if (
    !isRecord(value)
    || value.version !== APP_STATE_VERSION
    || typeof value.installId !== "string"
    || value.installId.length < 3
    || !Array.isArray(value.slots)
    || value.slots.length !== SLOT_COUNT
    || !Array.isArray(value.events)
    || value.events.length > WATCH_HISTORY_LIMIT
  ) {
    return null;
  }

  const slots: ReminderSlot[] = [];
  for (let index = 0; index < SLOT_COUNT; index += 1) {
    const slot = decodeSlot(value.slots[index], index as SlotId);
    if (!slot) {
      return null;
    }
    slots.push(slot);
  }

  const events: ReminderEvent[] = [];
  for (const rawEvent of value.events) {
    const event = decodeEvent(rawEvent, value.installId);
    if (event) {
      events.push(event);
    }
  }
  events.sort((left, right) => left.sequence - right.sequence);

  const nextSequence = integerInRange(value.nextSequence, 1, Number.MAX_SAFE_INTEGER);
  const settingsRevision = integerInRange(value.settingsRevision, 1, Number.MAX_SAFE_INTEGER);
  const droppedEvents = integerInRange(value.droppedEvents, 0, Number.MAX_SAFE_INTEGER);
  const lastSyncAt = nullableTimestamp(value.lastSyncAt);

  if (
    nextSequence === null
    || settingsRevision === null
    || droppedEvents === null
    || lastSyncAt === undefined
  ) {
    return null;
  }

  const highestSequence = events.reduce(
    (highest, event) => Math.max(highest, event.sequence),
    0,
  );

  return {
    version: APP_STATE_VERSION,
    installId: value.installId,
    nextSequence: Math.max(nextSequence, highestSequence + 1),
    settingsRevision,
    slots,
    events,
    droppedEvents,
    lastSyncAt,
  };
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

export function localDayForTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatSlotTime(slot: ReminderSlot, hour12: boolean): string {
  if (!hour12) {
    return `${pad2(slot.hour)}:${pad2(slot.minute)}`;
  }

  const suffix = slot.hour >= 12 ? "PM" : "AM";
  const hour = slot.hour % 12 || 12;
  return `${hour}:${pad2(slot.minute)} ${suffix}`;
}

export function nextOccurrenceMs(
  hour: number,
  minute: number,
  now: number,
  minimumLeadMs: number = 60_000,
): number {
  const candidate = new Date(now);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() - now < minimumLeadMs) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime();
}

export function enabledSlotsTooClose(slots: ReminderSlot[]): boolean {
  const enabledMinutes = slots
    .filter((slot) => slot.enabled)
    .map((slot) => slot.hour * 60 + slot.minute);

  for (let left = 0; left < enabledMinutes.length; left += 1) {
    for (let right = left + 1; right < enabledMinutes.length; right += 1) {
      const directDistance = Math.abs(enabledMinutes[left] - enabledMinutes[right]);
      const circularDistance = Math.min(directDistance, 24 * 60 - directDistance);
      if (circularDistance < MINIMUM_SLOT_DISTANCE_MINUTES) {
        return true;
      }
    }
  }
  return false;
}

export function ensureReminderEvent(
  state: AppState,
  slotId: SlotId,
  scheduledAt: number,
): ReminderEvent {
  const existing = state.events.find(
    (event) => event.slotId === slotId && event.scheduledAt === scheduledAt,
  );
  if (existing) {
    return existing;
  }

  const date = new Date(scheduledAt);
  const event: ReminderEvent = {
    installId: state.installId,
    sequence: state.nextSequence,
    slotId,
    scheduledAt,
    localDay: localDayForTimestamp(scheduledAt),
    timezoneOffset: date.getTimezoneOffset(),
    outcome: "no_response",
    answeredAt: null,
  };
  state.nextSequence += 1;
  state.events.push(event);
  return event;
}

export function updateReminderOutcome(
  event: ReminderEvent,
  outcome: Exclude<Outcome, "no_response">,
  answeredAt: number,
): void {
  event.outcome = outcome;
  event.answeredAt = answeredAt;
}

export function retainedEvents(state: AppState): ReminderEvent[] {
  return [...state.events].sort((left, right) => left.sequence - right.sequence);
}

export function pruneWatchHistory(state: AppState): void {
  while (state.events.length > WATCH_HISTORY_LIMIT) {
    state.events.shift();
    state.droppedEvents += 1;
  }
}

export function copySlot(slot: ReminderSlot): ReminderSlot {
  return { ...slot };
}
