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
  bool use_large_font,
  const char *expected
) {
  char value[64];
  assert(time_words_format_lines(
    hour,
    minute,
    use_24_hour,
    use_large_font,
    value,
    sizeof(value)
  ));
  assert(strcmp(value, expected) == 0);
}

static void expect_large_font_line_budget(void) {
  for (int hour = 0; hour < 24; hour++) {
    for (int minute = 0; minute < 60; minute++) {
      for (int use_24_hour = 0; use_24_hour <= 1; use_24_hour++) {
        char value[64];
        assert(time_words_format_lines(
          hour,
          minute,
          use_24_hour == 1,
          true,
          value,
          sizeof(value)
        ));

        int line_count = 1;
        for (const char *cursor = value; ; cursor++) {
          if (*cursor == '\n' || *cursor == '\0') {
            if (*cursor == '\0') break;
            line_count++;
          }
        }
        assert(line_count <= 4);
      }
    }
  }
}

int main(void) {
  expect_time(8, 17, false, "eight seventeen");
  expect_time(12, 30, false, "twelve thirty");
  expect_time(13, 6, false, "one o' six");
  expect_time(0, 0, false, "twelve");
  expect_time(0, 0, true, "zero");
  expect_time(13, 6, true, "thirteen o' six");
  expect_time(23, 59, true, "twenty three fifty nine");
  expect_time(22, 0, true, "twenty two");
  expect_time(20, 2, true, "twenty o' two");

  expect_lines(8, 17, false, true, "eight\nseven\n-teen");
  expect_lines(8, 17, false, false, "eight\nseventeen");
  expect_lines(8, 13, false, true, "eight\nthirteen");
  expect_lines(8, 14, false, true, "eight\nfourteen");
  expect_lines(8, 15, false, true, "eight\nfifteen");
  expect_lines(8, 16, false, true, "eight\nsixteen");
  expect_lines(8, 18, false, true, "eight\neighteen");
  expect_lines(8, 19, false, true, "eight\nnineteen");
  expect_lines(12, 27, false, true, "twelve\ntwenty\nseven");
  expect_lines(12, 30, false, true, "twelve\nthirty");
  expect_lines(13, 6, false, true, "one\no'\nsix");
  expect_lines(23, 59, true, true, "twenty\nthree\nfifty\nnine");
  expect_large_font_line_budget();

  char value[4] = "bad";
  assert(!time_words_format(24, 0, true, value, sizeof(value)));
  assert(!time_words_format(10, 60, true, value, sizeof(value)));
  assert(!time_words_format(10, 15, true, value, sizeof(value)));
}
