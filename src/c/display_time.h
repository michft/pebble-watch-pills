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
