#ifdef PBL_SDK_3
#include <pebble.h>
#endif

#include "display_time.h"

#include <stddef.h>

#ifndef PBL_SDK_3
#define SECONDS_PER_MINUTE (60)
#define MINUTES_PER_HOUR (60)
#define SECONDS_PER_DAY (24 * 60 * 60)
#endif
#define NEXT_OCCURRENCE_SEARCH_MINUTES (50 * 60)

typedef enum {
  MATCH_NONE,
  MATCH_FOUND,
  MATCH_ERROR
} MatchResult;

bool display_time_offset_valid(int32_t offset_minutes) {
  return offset_minutes >= DISPLAY_TIME_MIN_OFFSET_MINUTES
    && offset_minutes <= DISPLAY_TIME_MAX_OFFSET_MINUTES
    && offset_minutes % DISPLAY_TIME_OFFSET_STEP_MINUTES == 0;
}

int16_t display_time_active_offset(
  time_t utc_time,
  int16_t utc_offset_minutes,
  time_t transition_at,
  int16_t transition_offset_minutes
) {
  return transition_at > 0 && utc_time >= transition_at
    ? transition_offset_minutes
    : utc_offset_minutes;
}

int32_t display_time_day_key(const struct tm *parts) {
  return (int32_t)(parts->tm_year + 1900) * 10000
    + (parts->tm_mon + 1) * 100
    + parts->tm_mday;
}

static bool fixed_tm(time_t utc_time, int16_t offset_minutes, struct tm *parts) {
  if (!display_time_offset_valid(offset_minutes)) return false;
  time_t shifted = utc_time + (time_t)offset_minutes * SECONDS_PER_MINUTE;
  struct tm *result = gmtime(&shifted);
  if (result == NULL) return false;
  *parts = *result;
  return true;
}

bool display_time_fixed_parts(
  time_t utc_time,
  int16_t utc_offset_minutes,
  int *hour,
  int *minute
) {
  if (hour == NULL || minute == NULL) return false;
  struct tm parts;
  if (!fixed_tm(utc_time, utc_offset_minutes, &parts)) return false;
  *hour = parts.tm_hour;
  *minute = parts.tm_min;
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
  return display_time_fixed_parts(
    utc_time,
    display_time_active_offset(
      utc_time,
      utc_offset_minutes,
      transition_at,
      transition_offset_minutes
    ),
    hour,
    minute
  );
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
  if (!fixed_tm(
    utc_time,
    display_time_active_offset(
      utc_time,
      utc_offset_minutes,
      transition_at,
      transition_offset_minutes
    ),
    &parts
  )) return false;
  *day_key = display_time_day_key(&parts);
  return true;
}

static time_t floor_div(time_t value, time_t divisor) {
  time_t quotient = value / divisor;
  if (value % divisor != 0 && value < 0) quotient--;
  return quotient;
}

/**
 * Finds the first instant in [from, limit) whose wall time at a fixed offset is
 * `target_minutes` past midnight, skipping the excluded calendar day.
 */
static MatchResult first_fixed_match(
  time_t from,
  time_t limit,
  int16_t offset_minutes,
  int target_minutes,
  int32_t excluded_day_key,
  time_t *occurrence
) {
  time_t offset_seconds = (time_t)offset_minutes * SECONDS_PER_MINUTE;
  time_t day = floor_div(from + offset_seconds, SECONDS_PER_DAY);
  time_t candidate = day * SECONDS_PER_DAY
    + (time_t)target_minutes * SECONDS_PER_MINUTE
    - offset_seconds;
  if (candidate < from) candidate += SECONDS_PER_DAY;
  for (; candidate < limit; candidate += SECONDS_PER_DAY) {
    struct tm parts;
    if (!fixed_tm(candidate, offset_minutes, &parts)) return MATCH_ERROR;
    if (display_time_day_key(&parts) != excluded_day_key) {
      *occurrence = candidate;
      return MATCH_FOUND;
    }
  }
  return MATCH_NONE;
}

/**
 * Checks the first minute at or after a transition. Matches the exact wall
 * time, or a target wall time that the forward jump skipped.
 */
static MatchResult boundary_match(
  time_t boundary,
  int hour,
  int minute,
  int16_t before_offset,
  int16_t after_offset,
  int32_t excluded_day_key
) {
  struct tm previous;
  struct tm current;
  if (
    !fixed_tm(boundary - SECONDS_PER_MINUTE, before_offset, &previous)
    || !fixed_tm(boundary, after_offset, &current)
  ) return MATCH_ERROR;
  int32_t previous_day_key = display_time_day_key(&previous);
  int32_t day_key = display_time_day_key(&current);
  int target_minutes = hour * MINUTES_PER_HOUR + minute;
  int previous_minutes = previous.tm_hour * MINUTES_PER_HOUR + previous.tm_min;
  int current_minutes = current.tm_hour * MINUTES_PER_HOUR + current.tm_min;
  bool same_day_skip = previous_day_key == day_key
    && previous_minutes < target_minutes
    && current_minutes > target_minutes;
  bool midnight_skip = day_key > previous_day_key
    && previous_minutes > current_minutes
    && target_minutes < current_minutes;
  bool exact = current.tm_hour == hour && current.tm_min == minute;
  return (exact || same_day_skip || midnight_skip) && day_key != excluded_day_key
    ? MATCH_FOUND
    : MATCH_NONE;
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
  int target_minutes = hour * MINUTES_PER_HOUR + minute;
  // Candidates are whole minutes in [start, limit).
  time_t start = now - now % SECONDS_PER_MINUTE + SECONDS_PER_MINUTE;
  time_t limit = start + (time_t)NEXT_OCCURRENCE_SEARCH_MINUTES * SECONDS_PER_MINUTE;
  bool has_transition = transition_at > 0;
  // First whole minute at or after the transition; the minute before it still
  // uses the earlier offset, so a forward jump can only skip wall time there.
  time_t boundary = has_transition
    ? -floor_div(-transition_at, SECONDS_PER_MINUTE) * SECONDS_PER_MINUTE
    : limit;
  time_t before_end = boundary < start ? start : boundary > limit ? limit : boundary;
  MatchResult result = MATCH_NONE;

  if (before_end > start) {
    if (!display_time_offset_valid(utc_offset_minutes)) return false;
    result = first_fixed_match(
      start,
      before_end,
      utc_offset_minutes,
      target_minutes,
      excluded_day_key,
      occurrence
    );
    if (result != MATCH_NONE) return result == MATCH_FOUND;
  }
  if (!has_transition) return false;

  time_t after_start = start;
  if (boundary >= start && boundary < limit) {
    result = boundary_match(
      boundary,
      hour,
      minute,
      utc_offset_minutes,
      transition_offset_minutes,
      excluded_day_key
    );
    if (result == MATCH_FOUND) *occurrence = boundary;
    if (result != MATCH_NONE) return result == MATCH_FOUND;
    after_start = boundary + SECONDS_PER_MINUTE;
  }
  if (after_start >= limit) return false;
  if (!display_time_offset_valid(transition_offset_minutes)) return false;
  return first_fixed_match(
    after_start,
    limit,
    transition_offset_minutes,
    target_minutes,
    excluded_day_key,
    occurrence
  ) == MATCH_FOUND;
}
