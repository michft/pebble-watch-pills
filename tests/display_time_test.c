#include "display_time.h"

#include <assert.h>
#include <stddef.h>

/* The original minute-by-minute scan, kept as the behavioural reference. */
static bool reference_parts(
  time_t utc_time,
  int16_t offset,
  time_t transition_at,
  int16_t transition_offset,
  struct tm *parts
) {
  int16_t active = transition_at > 0 && utc_time >= transition_at ? transition_offset : offset;
  if (!display_time_offset_valid(active)) return false;
  time_t shifted = utc_time + (time_t)active * 60;
  struct tm *result = gmtime(&shifted);
  if (result == NULL) return false;
  *parts = *result;
  return true;
}

static bool reference_next(
  time_t now,
  int hour,
  int minute,
  int16_t offset,
  time_t transition_at,
  int16_t transition_offset,
  int32_t excluded_day_key,
  time_t *occurrence
) {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return false;
  time_t candidate = now - now % 60 + 60;
  for (int step = 0; step < 50 * 60; step++, candidate += 60) {
    struct tm previous;
    struct tm parts;
    if (
      !reference_parts(candidate - 60, offset, transition_at, transition_offset, &previous)
      || !reference_parts(candidate, offset, transition_at, transition_offset, &parts)
    ) return false;
    int32_t day_key = display_time_day_key(&parts);
    int32_t previous_day_key = display_time_day_key(&previous);
    int target = hour * 60 + minute;
    int previous_minutes = previous.tm_hour * 60 + previous.tm_min;
    int current_minutes = parts.tm_hour * 60 + parts.tm_min;
    bool same_day_skip = previous_day_key == day_key
      && previous_minutes < target && current_minutes > target;
    bool midnight_skip = day_key > previous_day_key
      && previous_minutes > current_minutes && target < current_minutes;
    if (
      ((parts.tm_hour == hour && parts.tm_min == minute) || same_day_skip || midnight_skip)
      && day_key != excluded_day_key
    ) {
      *occurrence = candidate;
      return true;
    }
  }
  return false;
}

static void expect_same(
  time_t now,
  int hour,
  int minute,
  int16_t offset,
  time_t transition_at,
  int16_t transition_offset,
  int32_t excluded_day_key
) {
  time_t expected = -1;
  time_t actual = -1;
  bool expected_found = reference_next(
    now, hour, minute, offset, transition_at, transition_offset, excluded_day_key, &expected
  );
  bool actual_found = display_time_next_named_occurrence(
    now, hour, minute, offset, transition_at, transition_offset, excluded_day_key, &actual
  );
  assert(actual_found == expected_found);
  if (expected_found) assert(actual == expected);
}

static int32_t day_key_at(time_t instant, int16_t offset) {
  int32_t key = 0;
  assert(display_time_named_day_key(instant, offset, 0, offset, &key));
  return key;
}

static void expect_dst_boundaries_match_reference(void) {
  // 2026-03-29 01:00 UTC (Europe forward) and 2026-10-25 01:00 UTC (back),
  // plus an unaligned transition, a midnight jump, and large offset swings.
  const time_t transitions[] = {
    1774746000, 1792890000, 1774746000 + 17, 1774742400 - 30 * 60, 60 * 60
  };
  const int16_t offset_pairs[][2] = {
    {0, 60}, {60, 0}, {60, 120}, {120, 60}, {600, 660}, {660, 600},
    {-300, -240}, {-240, -300}, {330, 345}, {780, 840}, {840, -720},
    {-720, 840}, {0, -60}, {0, 0}
  };
  const int targets[][2] = {
    {0, 0}, {0, 30}, {1, 0}, {1, 30}, {2, 0}, {2, 30}, {3, 0}, {23, 59}, {12, 0}
  };
  const time_t now_offsets[] = {
    -26 * 3600, -3 * 3600 - 7, -3601, -61, -60, -59, -1, 0, 1, 59, 60, 3599, 3 * 3600 + 11
  };
  for (size_t t = 0; t < sizeof(transitions) / sizeof(transitions[0]); t++) {
    for (size_t o = 0; o < sizeof(offset_pairs) / sizeof(offset_pairs[0]); o++) {
      int16_t before = offset_pairs[o][0];
      int16_t after = offset_pairs[o][1];
      for (size_t n = 0; n < sizeof(now_offsets) / sizeof(now_offsets[0]); n++) {
        time_t now = transitions[t] + now_offsets[n];
        if (now < 0) continue;
        for (size_t g = 0; g < sizeof(targets) / sizeof(targets[0]); g++) {
          int hour = targets[g][0];
          int minute = targets[g][1];
          expect_same(now, hour, minute, before, transitions[t], after, 0);
          expect_same(now, hour, minute, before, 0, after, 0);
          expect_same(now, hour, minute, before, transitions[t], after, day_key_at(now, before));
          expect_same(now, hour, minute, before, transitions[t], after, day_key_at(now, after));
          expect_same(
            now, hour, minute, before, transitions[t], after,
            day_key_at(now + 24 * 3600, after)
          );
        }
      }
    }
  }
}

static void expect_invalid_inputs_match_reference(void) {
  time_t transition = 1774746000;
  expect_same(transition - 7200, 1, 30, 7, transition, 60, 0);
  expect_same(transition - 7200, 1, 30, 0, transition, 7, 0);
  expect_same(transition + 7200, 1, 30, 7, transition, 60, 0);
  expect_same(transition - 7200, 1, 30, 0, transition + 49 * 3600, 7, 0);
  expect_same(transition, -1, 0, 0, transition, 60, 0);
  expect_same(transition, 1, 60, 0, transition, 60, 0);
  time_t occurrence = 0;
  assert(!display_time_next_named_occurrence(0, 1, 0, 0, 0, 0, 0, NULL));
  assert(!display_time_next_named_occurrence(0, 24, 0, 0, 0, 0, 0, &occurrence));
}

int main(void) {
  int hour;
  int minute;

  assert(display_time_offset_valid(DISPLAY_TIME_MIN_OFFSET_MINUTES));
  assert(display_time_offset_valid(DISPLAY_TIME_MAX_OFFSET_MINUTES));
  assert(!display_time_offset_valid(DISPLAY_TIME_MIN_OFFSET_MINUTES - 15));
  assert(!display_time_offset_valid(DISPLAY_TIME_MAX_OFFSET_MINUTES + 15));
  assert(!display_time_offset_valid(7));

  assert(display_time_fixed_parts(0, 345, &hour, &minute));
  assert(hour == 5);
  assert(minute == 45);

  assert(display_time_fixed_parts(0, -60, &hour, &minute));
  assert(hour == 23);
  assert(minute == 0);

  assert(display_time_fixed_parts(0, 840, &hour, &minute));
  assert(hour == 14);
  assert(minute == 0);

  assert(!display_time_fixed_parts(0, 7, &hour, &minute));

  time_t transition = 1000;
  assert(display_time_named_parts(999, 600, transition, 660, &hour, &minute));
  assert(hour == 10);
  assert(minute == 16);

  assert(display_time_named_parts(1000, 600, transition, 660, &hour, &minute));
  assert(hour == 11);
  assert(minute == 16);

  assert(display_time_active_offset(999, 600, transition, 660) == 600);
  assert(display_time_active_offset(1000, 600, transition, 660) == 660);
  assert(display_time_active_offset(1000, 600, 0, 660) == 600);

  int32_t day_key;
  assert(display_time_named_day_key(0, 600, 0, 600, &day_key));
  assert(day_key == 19700101);

  time_t occurrence;
  assert(display_time_next_named_occurrence(0, 10, 1, 600, 0, 600, 0, &occurrence));
  assert(occurrence == 60);

  assert(display_time_next_named_occurrence(0, 10, 1, 600, 0, 600, 19700101, &occurrence));
  assert(occurrence == 24 * 60 * 60 + 60);

  assert(display_time_next_named_occurrence(0, 1, 30, 0, 60 * 60, 60, 0, &occurrence));
  assert(occurrence == 60 * 60);

  assert(display_time_next_named_occurrence(0, 0, 30, 0, 60 * 60, -60, 19700101, &occurrence));
  assert(occurrence == 25 * 60 * 60 + 30 * 60);

  assert(display_time_next_named_occurrence(
    10 * 60 * 60, 0, 30, 13 * 60, 11 * 60 * 60, 14 * 60, 0, &occurrence
  ));
  assert(occurrence == 11 * 60 * 60);

  expect_dst_boundaries_match_reference();
  expect_invalid_inputs_match_reference();
}
