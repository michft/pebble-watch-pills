import assert from "node:assert/strict";
import test from "node:test";
import type { ReminderSlot } from "../src/embeddedjs/model.ts";
import {
  createDefaultState,
  decodeAppState,
  enabledSlotsTooClose,
  ensureReminderEvent,
  nextOccurrenceMs,
  pruneWatchHistory,
  retainedEvents,
  updateReminderOutcome,
} from "../src/embeddedjs/model.ts";

test("creates four enabled default slots", () => {
  const state = createDefaultState(1_000, 0.5);

  assert.equal(state.slots.length, 4);
  assert.deepEqual(
    state.slots.map((slot) => [slot.hour, slot.minute, slot.enabled]),
    [[8, 0, true], [12, 0, true], [18, 0, true], [22, 0, true]],
  );
  assert.equal(state.nextSequence, 1);
});

test("schedules later today when enough lead time remains", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const now = new Date(2026, 2, 8, 0, 30, 0).getTime();
    const scheduled = new Date(nextOccurrenceMs(8, 30, now));

    assert.equal(scheduled.getDate(), 8);
    assert.equal(scheduled.getHours(), 8);
    assert.equal(scheduled.getMinutes(), 30);
    assert.equal(scheduled.getTime() - now, 7 * 60 * 60 * 1000);
  } finally {
    if (previousTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTimezone;
    }
  }
});

test("schedules next local calendar day after time passes", () => {
  const now = new Date(2026, 6, 19, 8, 29, 30).getTime();
  const scheduled = new Date(nextOccurrenceMs(8, 30, now));

  assert.equal(scheduled.getDate(), 20);
  assert.equal(scheduled.getHours(), 8);
  assert.equal(scheduled.getMinutes(), 30);
});

test("detects close enabled slots across midnight", () => {
  const slots: ReminderSlot[] = [
    { id: 0, hour: 23, minute: 59, enabled: true, wakeupId: null, scheduledAt: null },
    { id: 1, hour: 0, minute: 0, enabled: true, wakeupId: null, scheduledAt: null },
    { id: 2, hour: 12, minute: 0, enabled: false, wakeupId: null, scheduledAt: null },
    { id: 3, hour: 18, minute: 0, enabled: true, wakeupId: null, scheduledAt: null },
  ];

  assert.equal(enabledSlotsTooClose(slots), true);
  slots[1].minute = 1;
  assert.equal(enabledSlotsTooClose(slots), false);
});

test("deduplicates reminder event and updates explicit outcome", () => {
  const state = createDefaultState(1_000, 0.25);
  const scheduledAt = new Date(2026, 6, 19, 8, 0).getTime();
  const first = ensureReminderEvent(state, 0, scheduledAt);
  const duplicate = ensureReminderEvent(state, 0, scheduledAt);

  assert.equal(first, duplicate);
  assert.equal(state.events.length, 1);
  assert.equal(first.outcome, "no_response");

  updateReminderOutcome(first, "taken", scheduledAt + 60_000);
  assert.equal(first.outcome, "taken");
  assert.equal(first.answeredAt, scheduledAt + 60_000);
});

test("returns all retained events in sequence order for idempotent sync", () => {
  const state = createDefaultState(1_000, 0.25);
  ensureReminderEvent(state, 1, 20_000);
  ensureReminderEvent(state, 0, 10_000);

  state.events.reverse();
  assert.deepEqual(retainedEvents(state).map((event) => event.sequence), [1, 2]);
});

test("drops oldest retained event visibly when watch history exceeds limit", () => {
  const state = createDefaultState(1_000, 0.25);
  for (let index = 0; index < 130; index += 1) {
    ensureReminderEvent(state, (index % 4) as 0 | 1 | 2 | 3, 10_000 + index);
  }

  pruneWatchHistory(state);

  assert.equal(state.events.length, 128);
  assert.equal(state.droppedEvents, 2);
  assert.equal(state.events[0].sequence, 3);
});

test("rejects invalid stored slot data", () => {
  const state = createDefaultState(1_000, 0.25);
  const serialized = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  const slots = serialized.slots as Array<Record<string, unknown>>;
  slots[0].hour = 99;

  assert.equal(decodeAppState(serialized), null);
});

test("drops persisted events with inconsistent outcome timestamps", () => {
  const state = createDefaultState(1_000, 0.25);
  const event = ensureReminderEvent(state, 0, 10_000);
  event.outcome = "taken";
  event.answeredAt = 11_000;
  const decodedValid = decodeAppState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(decodedValid?.events, [event]);

  event.answeredAt = null;

  const decodedTaken = decodeAppState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(decodedTaken?.events, []);

  event.outcome = "no_response";
  event.answeredAt = 11_000;
  const decodedNoResponse = decodeAppState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(decodedNoResponse?.events, []);
});

test("rejects persisted history above the watch limit", () => {
  const state = createDefaultState(1_000, 0.25);
  const serialized = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  serialized.events = Array.from({ length: 129 }, () => ({}));

  assert.equal(decodeAppState(serialized), null);
});
