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
