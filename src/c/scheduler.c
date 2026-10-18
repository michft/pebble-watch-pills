#include <pebble.h>

#include "scheduler.h"

#include "display_settings.h"
#include "display_time.h"
#include "persist_state.h"

#include <stdlib.h>
#include <string.h>

#define NO_WAKEUP (-1)
#define NO_DAY_KEY 0
/** Today, tomorrow, and one more day in case the next day is excluded. */
#define LOCAL_SEARCH_DAYS 3

static struct {
  bool error;
} s_scheduler;

bool scheduler_error(void) {
  return s_scheduler.error;
}

static const TimezoneSettings *home_zone(void) {
  return &display_settings()->zones[HOME_TIMEZONE];
}

bool scheduler_home_day_key(time_t instant, int32_t *day_key) {
  const TimezoneSettings *home = home_zone();
  if (day_key == NULL) return false;
  if (!home->use_watch_local) {
    return display_time_named_day_key(
      instant,
      home->utc_offset_minutes,
      (time_t)home->transition_at,
      home->transition_offset_minutes,
      day_key
    );
  }
  struct tm *local = localtime(&instant);
  if (local == NULL) return false;
  *day_key = display_time_day_key(local);
  return true;
}

/** Days since 1970-01-01 for a proleptic Gregorian date (month 1-12). */
static int32_t days_from_civil(int32_t year, int32_t month, int32_t day) {
  year -= month <= 2;
  int32_t era = (year >= 0 ? year : year - 399) / 400;
  int32_t year_of_era = year - era * 400;
  int32_t day_of_year = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
  int32_t day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
  return era * 146097 + day_of_era - 719468;
}

static int32_t tm_minutes(const struct tm *parts) {
  return days_from_civil(parts->tm_year + 1900, parts->tm_mon + 1, parts->tm_mday) * MINUTES_PER_DAY
    + parts->tm_hour * MINUTES_PER_HOUR
    + parts->tm_min;
}

bool scheduler_home_offset_minutes(time_t instant, int32_t *offset_minutes) {
  const TimezoneSettings *home = home_zone();
  if (offset_minutes == NULL) return false;
  if (!home->use_watch_local) {
    *offset_minutes = display_time_active_offset(
      instant,
      home->utc_offset_minutes,
      (time_t)home->transition_at,
      home->transition_offset_minutes
    );
    return true;
  }
  // localtime and gmtime may share a static buffer; copy before the next call.
  struct tm *result = localtime(&instant);
  if (result == NULL) return false;
  struct tm local = *result;
  result = gmtime(&instant);
  if (result == NULL) return false;
  *offset_minutes = tm_minutes(&local) - tm_minutes(result);
  return true;
}

static int32_t last_event_home_day(uint8_t slot_id) {
  const AppState *state = app_state();
  for (uint16_t index = state->event_count; index > 0; index--) {
    const ReminderEvent *event = &state->events[index - 1];
    if (event->slot_id != slot_id) continue;
    int32_t day_key = NO_DAY_KEY;
    if (scheduler_home_day_key(event->scheduled_at, &day_key)) return day_key;
  }
  return NO_DAY_KEY;
}

static time_t next_local_time(const ReminderSlot *slot, time_t now, int32_t excluded_day_key) {
  struct tm *local = localtime(&now);
  if (local == NULL) return 0;
  struct tm today = *local;
  for (int day = 0; day < LOCAL_SEARCH_DAYS; day++) {
    struct tm candidate = today;
    candidate.tm_mday += day;
    candidate.tm_hour = slot->hour;
    candidate.tm_min = slot->minute;
    candidate.tm_sec = 0;
    time_t result = mktime(&candidate);
    if (result == (time_t)-1) return 0;
    if (result - now < SECONDS_PER_MINUTE) continue;
    int32_t day_key = NO_DAY_KEY;
    if (scheduler_home_day_key(result, &day_key) && day_key == excluded_day_key) continue;
    return result;
  }
  return 0;
}

time_t scheduler_next_time(uint8_t slot_id, const ReminderSlot *slot, time_t now) {
  const TimezoneSettings *home = home_zone();
  int32_t excluded_day_key = last_event_home_day(slot_id);
  if (home->use_watch_local) return next_local_time(slot, now, excluded_day_key);
  time_t occurrence = 0;
  if (!display_time_next_named_occurrence(
    now,
    slot->hour,
    slot->minute,
    home->utc_offset_minutes,
    (time_t)home->transition_at,
    home->transition_offset_minutes,
    excluded_day_key,
    &occurrence
  )) return 0;
  return occurrence;
}

bool scheduler_times_too_close(const ReminderSlot proposed[SLOT_COUNT]) {
  for (uint8_t left = 0; left < SLOT_COUNT; left++) {
    if (!proposed[left].enabled) continue;
    int left_minutes = proposed[left].hour * MINUTES_PER_HOUR + proposed[left].minute;
    for (uint8_t right = left + 1; right < SLOT_COUNT; right++) {
      if (!proposed[right].enabled) continue;
      int right_minutes = proposed[right].hour * MINUTES_PER_HOUR + proposed[right].minute;
      int gap = abs(left_minutes - right_minutes);
      if (gap > MINUTES_PER_DAY / 2) gap = MINUTES_PER_DAY - gap;
      if (gap < MIN_SLOT_GAP_MINUTES) return true;
    }
  }
  return false;
}

void scheduler_schedule_next(void) {
  AppState *state = app_state();
  time_t now = time(NULL);
  int8_t earliest = -1;
  time_t earliest_time = 0;
  s_scheduler.error = false;
  wakeup_cancel_all();
  for (uint8_t i = 0; i < SLOT_COUNT; i++) {
    ReminderSlot *slot = &state->slots[i];
    slot->wakeup_id = NO_WAKEUP;
    slot->scheduled_at = slot->enabled ? scheduler_next_time(i, slot, now) : 0;
    if (slot->enabled && !slot->scheduled_at) s_scheduler.error = true;
    if (
      slot->enabled
      && slot->scheduled_at
      && (earliest < 0 || slot->scheduled_at < earliest_time)
    ) {
      earliest = (int8_t)i;
      earliest_time = slot->scheduled_at;
    }
  }
  if (earliest >= 0) {
    WakeupId id = wakeup_schedule(earliest_time, earliest, true);
    if (id >= 0) {
      state->slots[earliest].wakeup_id = id;
    } else {
      s_scheduler.error = true;
      APP_LOG(APP_LOG_LEVEL_ERROR, "Wakeup schedule failed: %ld", (long)id);
    }
  }
  (void)persist_state_save();
}

uint32_t scheduler_add_event(uint8_t slot_id, time_t scheduled_at) {
  AppState *state = app_state();
  int32_t scheduled_day = NO_DAY_KEY;
  bool scheduled_day_valid = scheduler_home_day_key(scheduled_at, &scheduled_day);
  for (uint16_t i = 0; i < state->event_count; i++) {
    const ReminderEvent *event = &state->events[i];
    if (event->slot_id != slot_id) continue;
    if (event->scheduled_at == scheduled_at) return event->sequence;
    int32_t event_day = NO_DAY_KEY;
    if (
      scheduled_day_valid
      && scheduler_home_day_key(event->scheduled_at, &event_day)
      && event_day == scheduled_day
    ) return event->sequence;
  }
  if (state->event_count == EVENT_LIMIT) {
    memmove(&state->events[0], &state->events[1], sizeof(ReminderEvent) * (EVENT_LIMIT - 1));
    state->event_count--;
    if (state->dropped_events < UINT16_MAX) state->dropped_events++;
  }
  ReminderEvent *event = &state->events[state->event_count];
  memset(event, 0, sizeof(*event));
  event->sequence = state->next_sequence++;
  event->slot_id = slot_id;
  event->scheduled_at = scheduled_at;
  event->outcome = OUTCOME_NO_RESPONSE;
  state->event_count++;
  (void)persist_state_save();
  return event->sequence;
}

void scheduler_recover_events_except(int8_t excluded_slot) {
  AppState *state = app_state();
  time_t now = time(NULL);
  for (uint8_t i = 0; i < SLOT_COUNT; i++) {
    if ((int8_t)i == excluded_slot) continue;
    const ReminderSlot *slot = &state->slots[i];
    if (slot->enabled && slot->scheduled_at && slot->scheduled_at < now) {
      (void)scheduler_add_event(i, slot->scheduled_at);
    }
  }
}

uint32_t scheduler_handle_wakeup(uint8_t slot_id) {
  if (slot_id >= SLOT_COUNT) return 0;
  ReminderSlot *slot = &app_state()->slots[slot_id];
  uint32_t sequence = scheduler_add_event(
    slot_id,
    slot->scheduled_at ? slot->scheduled_at : time(NULL)
  );
  slot->wakeup_id = NO_WAKEUP;
  slot->scheduled_at = 0;
  scheduler_schedule_next();
  return sequence;
}

bool scheduler_record_outcome(uint32_t sequence, Outcome outcome, time_t answered_at) {
  AppState *state = app_state();
  for (uint16_t i = 0; i < state->event_count; i++) {
    ReminderEvent *event = &state->events[i];
    if (event->sequence != sequence) continue;
    event->outcome = (uint8_t)outcome;
    event->answered_at = answered_at;
    (void)persist_state_save();
    return true;
  }
  return false;
}
