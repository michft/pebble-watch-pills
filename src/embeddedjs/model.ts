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

/**
 * Determines whether a value identifies a valid reminder slot.
 *
 * @param value - The value to test
 * @returns `true` if the value is `0`, `1`, `2`, or `3`, `false` otherwise.
 */
export function isSlotId(value: unknown): value is SlotId {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

/**
 * Determines whether a value represents a reminder outcome.
 *
 * @param value - The value to check
 * @returns `true` if the value is `"no_response"`, `"taken"`, or `"skipped"`, `false` otherwise.
 */
export function isOutcome(value: unknown): value is Outcome {
  return value === "no_response" || value === "taken" || value === "skipped";
}

/**
 * Determines whether a value is a non-null, non-array object with string keys.
 *
 * @returns `true` if the value is a record, `false` otherwise.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks whether a value is an integer within the specified inclusive range.
 *
 * @param value - The value to check
 * @param minimum - The inclusive lower bound
 * @param maximum - The inclusive upper bound
 * @returns The value if it is an integer within the range, or `null` otherwise
 */
function integerInRange(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  return value >= minimum && value <= maximum ? value : null;
}

/**
 * Interprets an optional timestamp value.
 *
 * @param value - The value to interpret as a timestamp
 * @returns The valid timestamp, `null` when the value is explicitly `null`, or `undefined` when invalid
 */
function nullableTimestamp(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return undefined;
}

/**
 * Creates an initial application state with the default reminder slots and settings.
 *
 * @param now - Timestamp used to generate the installation identifier
 * @param randomValue - Value used to generate the random part of the installation identifier
 * @returns A new default application state
 */
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

/**
 * Decodes and validates a reminder slot with the expected identifier.
 *
 * @param value - The value to decode.
 * @param expectedId - The slot identifier the value must contain.
 * @returns A normalised reminder slot, or `null` if validation fails.
 */
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

/**
 * Decodes and validates a persisted reminder event.
 *
 * @param value - The value to decode.
 * @param installId - The installation identifier the event must belong to.
 * @returns The validated reminder event, or `null` if the value is invalid or belongs to another installation.
 */
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

/**
 * Decodes and validates persisted application state.
 *
 * Invalid slots or top-level fields cause the function to return `null`; invalid events are omitted.
 *
 * @param value - The value to validate and decode
 * @returns The decoded application state, or `null` when required state data is invalid
 */
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

/**
 * Formats a number with a leading zero when its value is less than 10.
 *
 * @param value - The number to format
 * @returns The formatted number as a string
 */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/**
 * Converts a timestamp to a local calendar date string.
 *
 * @param timestamp - The timestamp to convert
 * @returns The date formatted as `YYYY-MM-DD`
 */
export function localDayForTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Formats a reminder slot's time for display in 12-hour or 24-hour notation.
 *
 * @param hour12 - Whether to use 12-hour notation with an AM or PM suffix
 * @returns The formatted slot time
 */
export function formatSlotTime(slot: ReminderSlot, hour12: boolean): string {
  if (!hour12) {
    return `${pad2(slot.hour)}:${pad2(slot.minute)}`;
  }

  const suffix = slot.hour >= 12 ? "PM" : "AM";
  const hour = slot.hour % 12 || 12;
  return `${hour}:${pad2(slot.minute)} ${suffix}`;
}

/**
 * Calculates the next local occurrence of a specified time.
 *
 * @param hour - The hour of the occurrence.
 * @param minute - The minute of the occurrence.
 * @param now - The reference timestamp.
 * @param minimumLeadMs - The minimum required time until the occurrence.
 * @returns The occurrence timestamp in milliseconds.
 */
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

/**
 * Determines whether any enabled reminder slots are scheduled too close together.
 *
 * @param slots - The reminder slots to evaluate
 * @returns `true` if any enabled slots are fewer than two minutes apart, including across midnight, `false` otherwise.
 */
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

/**
 * Retrieves the event for a slot and scheduled time, creating it when necessary.
 *
 * @param state - The application state to search and update
 * @param scheduledAt - The event's scheduled timestamp
 * @returns The existing or newly created reminder event
 */
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

/**
 * Records a response outcome and the time it was answered for a reminder event.
 *
 * @param event - The reminder event to update
 * @param outcome - The response outcome
 * @param answeredAt - The timestamp when the reminder was answered
 */
export function updateReminderOutcome(
  event: ReminderEvent,
  outcome: Exclude<Outcome, "no_response">,
  answeredAt: number,
): void {
  event.outcome = outcome;
  event.answeredAt = answeredAt;
}

/**
 * Provides the reminder events ordered by sequence.
 *
 * @returns A new array containing the reminder events sorted in ascending sequence order.
 */
export function retainedEvents(state: AppState): ReminderEvent[] {
  return [...state.events].sort((left, right) => left.sequence - right.sequence);
}

/**
 * Prunes the event history to the configured limit and records the number of removed events.
 *
 * @param state - The application state to update
 */
export function pruneWatchHistory(state: AppState): void {
  while (state.events.length > WATCH_HISTORY_LIMIT) {
    state.events.shift();
    state.droppedEvents += 1;
  }
}

/**
 * Creates a copy of a reminder slot.
 *
 * @param slot - The reminder slot to copy
 * @returns A shallow copy of `slot`
 */
export function copySlot(slot: ReminderSlot): ReminderSlot {
  return { ...slot };
}
