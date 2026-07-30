#pragma once

#include <stdbool.h>
#include <stddef.h>

/**
 * Formats a local time as lowercase number words.
 *
 * Minutes from one through nine use spoken "o'", and an exact hour omits minutes.
 * Examples: 08:17 -> "eight seventeen", 01:06 -> "one o' six".
 */
bool time_words_format(
  int hour,
  int minute,
  bool use_24_hour,
  char *buffer,
  size_t buffer_size
);

/**
 * Formats time words for watch display, placing every word on its own line.
 * When the phrase has at most three words, long teen words are split at their
 * spoken syllable boundary (for example, "seventeen" -> "seven\n-teen").
 */
bool time_words_format_lines(
  int hour,
  int minute,
  bool use_24_hour,
  char *buffer,
  size_t buffer_size
);
