#include "time_words.h"

#include <assert.h>
#include <stdbool.h>
#include <string.h>

static void expect_time(
  int hour,
  int minute,
  bool use_24_hour,
  const char *expected
) {
  char value[64];
  assert(time_words_format(hour, minute, use_24_hour, value, sizeof(value)));
  assert(strcmp(value, expected) == 0);
}

static void expect_lines(
  int hour,
  int minute,
  bool use_24_hour,
  const char *expected
) {
  char value[64];
  assert(time_words_format_lines(hour, minute, use_24_hour, value, sizeof(value)));
  assert(strcmp(value, expected) == 0);
}

int main(void) {
  expect_time(8, 17, false, "eight seventeen");
  expect_time(12, 30, false, "twelve thirty");
  expect_time(13, 6, false, "one six");
  expect_time(0, 0, false, "twelve");
  expect_time(0, 0, true, "zero");
  expect_time(13, 6, true, "thirteen six");
  expect_time(23, 59, true, "twenty three fifty nine");

  expect_lines(8, 17, false, "eight\nseven\n-teen");
  expect_lines(12, 27, false, "twelve\ntwenty\nseven");
  expect_lines(12, 30, false, "twelve\nthirty");
  expect_lines(13, 6, false, "one\nsix");
  expect_lines(23, 59, true, "twenty\nthree\nfifty\nnine");

  char value[4] = "bad";
  assert(!time_words_format(24, 0, true, value, sizeof(value)));
  assert(!time_words_format(10, 60, true, value, sizeof(value)));
  assert(!time_words_format(10, 15, true, value, sizeof(value)));
}
