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
}
