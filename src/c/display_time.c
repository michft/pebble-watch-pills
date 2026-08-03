#ifdef PBL_SDK_3
#include <pebble.h>
#endif

#include "display_time.h"

#include <stddef.h>

bool display_time_fixed_parts(
  time_t utc_time,
  int16_t utc_offset_minutes,
  int *hour,
  int *minute
) {
  if (
    hour == NULL
    || minute == NULL
    || utc_offset_minutes < DISPLAY_TIME_MIN_OFFSET_MINUTES
    || utc_offset_minutes > DISPLAY_TIME_MAX_OFFSET_MINUTES
    || utc_offset_minutes % DISPLAY_TIME_OFFSET_STEP_MINUTES != 0
  ) {
    return false;
  }

  time_t shifted = utc_time + (time_t)utc_offset_minutes * 60;
  struct tm *parts = gmtime(&shifted);
  if (parts == NULL) return false;

  *hour = parts->tm_hour;
  *minute = parts->tm_min;
  return true;
}

bool display_time_named_parts(
  time_t utc_time,
  int16_t utc_offset_minutes,
  time_t transition_at,
  int16_t transition_offset_minutes,
  int *hour,
  int *minute
) {
  int16_t active_offset = transition_at > 0 && utc_time >= transition_at
    ? transition_offset_minutes
    : utc_offset_minutes;
  return display_time_fixed_parts(utc_time, active_offset, hour, minute);
}

static bool named_parts(
  time_t utc_time,
  int16_t utc_offset_minutes,
  time_t transition_at,
  int16_t transition_offset_minutes,
  struct tm *parts
) {
  if (parts == NULL) return false;
  int16_t active_offset = transition_at > 0 && utc_time >= transition_at
    ? transition_offset_minutes
    : utc_offset_minutes;
  if (
    active_offset < DISPLAY_TIME_MIN_OFFSET_MINUTES
    || active_offset > DISPLAY_TIME_MAX_OFFSET_MINUTES
    || active_offset % DISPLAY_TIME_OFFSET_STEP_MINUTES != 0
  ) return false;
  time_t shifted = utc_time + (time_t)active_offset * 60;
  struct tm *result = gmtime(&shifted);
  if (result == NULL) return false;
  *parts = *result;
  return true;
}

bool display_time_named_day_key(
  time_t utc_time,
  int16_t utc_offset_minutes,
  time_t transition_at,
  int16_t transition_offset_minutes,
  int32_t *day_key
) {
  if (day_key == NULL) return false;
  struct tm parts;
  if (!named_parts(
    utc_time,
    utc_offset_minutes,
    transition_at,
    transition_offset_minutes,
    &parts
  )) return false;
  *day_key = (int32_t)(parts.tm_year + 1900) * 10000
    + (parts.tm_mon + 1) * 100
    + parts.tm_mday;
  return true;
}

bool display_time_next_named_occurrence(
  time_t now,
  int hour,
  int minute,
  int16_t utc_offset_minutes,
  time_t transition_at,
  int16_t transition_offset_minutes,
  int32_t excluded_day_key,
  time_t *occurrence
) {
  if (
    occurrence == NULL
    || hour < 0 || hour > 23
    || minute < 0 || minute > 59
  ) return false;
  time_t candidate = now - now % 60 + 60;
  for (int offset = 0; offset < 50 * 60; offset++, candidate += 60) {
    struct tm previous_parts;
    struct tm parts;
    if (
      !named_parts(
        candidate - 60,
        utc_offset_minutes,
        transition_at,
        transition_offset_minutes,
        &previous_parts
      )
      || !named_parts(
      candidate,
      utc_offset_minutes,
      transition_at,
      transition_offset_minutes,
      &parts
      )
    ) return false;
    int32_t day_key = (int32_t)(parts.tm_year + 1900) * 10000
      + (parts.tm_mon + 1) * 100
      + parts.tm_mday;
    int32_t previous_day_key = (int32_t)(previous_parts.tm_year + 1900) * 10000
      + (previous_parts.tm_mon + 1) * 100
      + previous_parts.tm_mday;
    int target_minutes = hour * 60 + minute;
    int previous_minutes = previous_parts.tm_hour * 60 + previous_parts.tm_min;
    int current_minutes = parts.tm_hour * 60 + parts.tm_min;
    bool same_day_skip = previous_day_key == day_key
      && previous_minutes < target_minutes
      && current_minutes > target_minutes;
    bool date_advanced = parts.tm_year > previous_parts.tm_year
      || (
        parts.tm_year == previous_parts.tm_year
        && (
          parts.tm_mon > previous_parts.tm_mon
          || (
            parts.tm_mon == previous_parts.tm_mon
            && parts.tm_mday > previous_parts.tm_mday
          )
        )
      );
    bool midnight_skip = date_advanced
      && previous_minutes > current_minutes
      && target_minutes < current_minutes;
    bool skipped_by_forward_transition = same_day_skip || midnight_skip;
    if (
      (
        (parts.tm_hour == hour && parts.tm_min == minute)
        || skipped_by_forward_transition
      )
      && day_key != excluded_day_key
    ) {
      *occurrence = candidate;
      return true;
    }
  }
  return false;
}
