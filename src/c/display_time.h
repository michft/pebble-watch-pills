#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <time.h>

#define DISPLAY_TIME_MIN_OFFSET_MINUTES (-12 * 60)
#define DISPLAY_TIME_MAX_OFFSET_MINUTES (14 * 60)
#define DISPLAY_TIME_OFFSET_STEP_MINUTES 15

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
