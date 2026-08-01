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
 * For the large watchface font, "seventeen" is split at its spoken syllable
 * boundary because it exceeds the available line width.
 */
bool time_words_format_lines(
  int hour,
  int minute,
  bool use_24_hour,
  bool use_large_font,
  char *buffer,
  size_t buffer_size
);
