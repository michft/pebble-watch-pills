/* Scheduling in the Home zone; run with TZ=UTC so watch-local time is UTC. */
#include "pebble_fake.h"

#include <assert.h>

#include "display_settings.h"
#include "persist_state.h"
#include "scheduler.h"

#define HOUR (60 * 60)
#define DAY (24 * HOUR)
/* 2026-01-01T00:00:00Z */
#define JAN_1 ((time_t)1767225600)

static void reset(bool watch_local) {
  fake_persist_clear();
  (void)persist_state_load();
  display_settings_load();
  TimezoneSettings *home = &display_settings()->zones[HOME_TIMEZONE];
  home->use_watch_local = watch_local;
  home->utc_offset_minutes = 0;
  home->transition_at = 0;
  home->transition_offset_minutes = 0;
}

/** A slot edited after today's dose must not alert again the same Home day. */
static void test_taken_day_is_skipped(bool watch_local) {
  reset(watch_local);
  ReminderSlot slot = {.hour = 8, .minute = 0, .enabled = true, .wakeup_id = -1};
  assert(scheduler_next_time(0, &slot, JAN_1 + 7 * HOUR) == JAN_1 + 8 * HOUR);
  uint32_t sequence = scheduler_add_event(0, JAN_1 + 8 * HOUR);
  assert(sequence != 0);
  assert(scheduler_record_outcome(sequence, OUTCOME_TAKEN, JAN_1 + 8 * HOUR + 30));
  slot.hour = 10;
  assert(scheduler_next_time(0, &slot, JAN_1 + 9 * HOUR) == JAN_1 + DAY + 10 * HOUR);
  // Other slots are unaffected.
  assert(scheduler_next_time(1, &slot, JAN_1 + 9 * HOUR) == JAN_1 + 10 * HOUR);
  // A same-day duplicate keeps the earlier event and its answer.
  assert(scheduler_add_event(0, JAN_1 + 10 * HOUR) == sequence);
  assert(app_state()->event_count == 1);
  assert(app_state()->events[0].answered_at == JAN_1 + 8 * HOUR + 30);
  assert(app_state()->events[0].outcome == OUTCOME_TAKEN);
  // Watch-local times less than a minute ahead roll to the next day; named
  // zones use the next whole minute.
  slot.hour = 12;
  assert(scheduler_next_time(2, &slot, JAN_1 + 12 * HOUR - 30)
    == (watch_local ? JAN_1 + DAY + 12 * HOUR : JAN_1 + 12 * HOUR));
}

static void test_named_home(void) {
  reset(false);
  TimezoneSettings *home = &display_settings()->zones[HOME_TIMEZONE];
  home->utc_offset_minutes = 600;
  home->transition_offset_minutes = 600;
  ReminderSlot slot = {.hour = 8, .minute = 0, .enabled = true, .wakeup_id = -1};
  // 08:00 at UTC+10 is 22:00Z the previous day.
  assert(scheduler_next_time(0, &slot, JAN_1) == JAN_1 + 22 * HOUR);
  int32_t day_key = 0;
  assert(scheduler_home_day_key(JAN_1 + 22 * HOUR, &day_key) && day_key == 20260102);
  int32_t offset = 0;
  assert(scheduler_home_offset_minutes(JAN_1, &offset) && offset == 600);
}

static void test_schedule_next(void) {
  reset(true);
  AppState *state = app_state();
  for (int i = 0; i < SLOT_COUNT; i++) state->slots[i].enabled = false;
  scheduler_schedule_next();
  assert(!scheduler_error() && fake_wakeup_cookie == -1);
  state->slots[2].enabled = true;
  state->slots[3].enabled = true;
  scheduler_schedule_next();
  assert(!scheduler_error());
  assert(fake_wakeup_cookie == 2 || fake_wakeup_cookie == 3);
  assert(state->slots[fake_wakeup_cookie].wakeup_id >= 0);
  fake_wakeup_fail = true;
  scheduler_schedule_next();
  assert(scheduler_error());
  fake_wakeup_fail = false;
}

static void test_times_too_close(void) {
  ReminderSlot slots[SLOT_COUNT] = {
    {.hour = 23, .minute = 59, .enabled = true},
    {.hour = 0, .minute = 0, .enabled = true},
    {.hour = 12, .minute = 0, .enabled = false},
    {.hour = 12, .minute = 0, .enabled = true},
  };
  assert(scheduler_times_too_close(slots));
  slots[1].minute = 1;
  assert(!scheduler_times_too_close(slots));
  slots[2].enabled = true;
  assert(scheduler_times_too_close(slots));
}

static void test_event_limit(void) {
  reset(true);
  AppState *state = app_state();
  state->dropped_events = 0;
  for (int i = 0; i < EVENT_LIMIT + 2; i++) {
    (void)scheduler_add_event((uint8_t)(i % SLOT_COUNT), JAN_1 + (time_t)i * DAY);
  }
  assert(state->event_count == EVENT_LIMIT && state->dropped_events == 2);
  assert(!scheduler_record_outcome(1, OUTCOME_TAKEN, JAN_1));
}

int main(void) {
  test_taken_day_is_skipped(true);
  test_taken_day_is_skipped(false);
  test_named_home();
  test_schedule_next();
  test_times_too_close();
  test_event_limit();
  puts("ok");
}
