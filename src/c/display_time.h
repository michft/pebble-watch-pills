#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <time.h>

#define DISPLAY_TIME_MIN_OFFSET_MINUTES (-12 * 60)
#define DISPLAY_TIME_MAX_OFFSET_MINUTES (14 * 60)
#define DISPLAY_TIME_OFFSET_STEP_MINUTES 15

/** Returns whether a UTC offset is in the real-world range on a 15-minute step. */
bool display_time_offset_valid(int32_t offset_minutes);

/** Returns the offset in force at `utc_time` for a zone with one known transition. */
int16_t display_time_active_offset(
  time_t utc_time,
  int16_t utc_offset_minutes,
  time_t transition_at,
  int16_t transition_offset_minutes
);

/** Returns a stable YYYYMMDD key for broken-down calendar parts. */
int32_t display_time_day_key(const struct tm *parts);

/**
 * Converts a UTC timestamp to hour and minute at a fixed UTC offset.
 *
 * Fixed offsets are restricted to the real-world UTC range in 15-minute
 * increments. They deliberately do not apply daylight-saving rules.
 */
bool display_time_fixed_parts(
  time_t utc_time,
  int16_t utc_offset_minutes,
  int *hour,
  int *minute
);

/**
 * Converts UTC using phone-resolved named-zone offsets and next transition.
 *
 * The phone supplies the current offset plus the next daylight-saving
 * transition so the watch remains correct while disconnected.
 */
bool display_time_named_parts(
  time_t utc_time,
  int16_t utc_offset_minutes,
  time_t transition_at,
  int16_t transition_offset_minutes,
  int *hour,
  int *minute
);

/** Returns a stable YYYYMMDD key for a named-zone calendar day. */
bool display_time_named_day_key(
  time_t utc_time,
  int16_t utc_offset_minutes,
  time_t transition_at,
  int16_t transition_offset_minutes,
  int32_t *day_key
);

/**
 * Finds the next real UTC instant (minute-aligned, at least one minute after
 * `now`, within 50 hours) matching a named-zone wall time. A wall time skipped
 * by a forward transition resolves to the first minute after the jump; the
 * calendar day `excluded_day_key` is skipped.
 */
bool display_time_next_named_occurrence(
  time_t now,
  int hour,
  int minute,
  int16_t utc_offset_minutes,
  time_t transition_at,
  int16_t transition_offset_minutes,
  int32_t excluded_day_key,
  time_t *occurrence
);
