#include "display_time.h"

#include <assert.h>

int main(void) {
  int hour;
  int minute;

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

  int32_t day_key;
  assert(display_time_named_day_key(0, 600, 0, 600, &day_key));
  assert(day_key == 19700101);

  time_t occurrence;
  assert(display_time_next_named_occurrence(
    0,
    10,
    1,
    600,
    0,
    600,
    0,
    &occurrence
  ));
  assert(occurrence == 60);

  assert(display_time_next_named_occurrence(
    0,
    10,
    1,
    600,
    0,
    600,
    19700101,
    &occurrence
  ));
  assert(occurrence == 24 * 60 * 60 + 60);

  assert(display_time_next_named_occurrence(
    0,
    1,
    30,
    0,
    60 * 60,
    60,
    0,
    &occurrence
  ));
  assert(occurrence == 60 * 60);

  assert(display_time_next_named_occurrence(
    0,
    0,
    30,
    0,
    60 * 60,
    -60,
    19700101,
    &occurrence
  ));
  assert(occurrence == 25 * 60 * 60 + 30 * 60);

  assert(display_time_next_named_occurrence(
    10 * 60 * 60,
    0,
    30,
    13 * 60,
    11 * 60 * 60,
    14 * 60,
    0,
    &occurrence
  ));
  assert(occurrence == 11 * 60 * 60);
}
