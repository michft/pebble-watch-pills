#include "time_words.h"

#include <stdio.h>
#include <string.h>

static bool write_number(int value, char *buffer, size_t buffer_size) {
  static const char *const small_numbers[] = {
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  };
  static const char *const tens[] = {
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
  };

  int written;
  if (value < 20) {
    written = snprintf(buffer, buffer_size, "%s", small_numbers[value]);
  } else if (value % 10 == 0) {
    written = snprintf(buffer, buffer_size, "%s", tens[value / 10]);
  } else {
    written = snprintf(
      buffer,
      buffer_size,
      "%s %s",
      tens[value / 10],
      small_numbers[value % 10]
    );
  }

  return written >= 0 && (size_t)written < buffer_size;
}

bool time_words_format(
  int hour,
  int minute,
  bool use_24_hour,
  char *buffer,
  size_t buffer_size
) {
  if (
    hour < 0
    || hour > 23
    || minute < 0
    || minute > 59
    || buffer == NULL
    || buffer_size == 0
  ) {
    return false;
  }

  buffer[0] = '\0';
  int display_hour = hour;
  if (!use_24_hour) {
    display_hour %= 12;
    if (display_hour == 0) {
      display_hour = 12;
    }
  }

  char hour_words[24];
  char minute_words[24];
  if (!write_number(display_hour, hour_words, sizeof(hour_words))) {
    return false;
  }

  int written;
  if (minute == 0) {
    written = snprintf(buffer, buffer_size, "%s", hour_words);
  } else {
    if (!write_number(minute, minute_words, sizeof(minute_words))) {
      return false;
    }
    if (minute < 10) {
      written = snprintf(
        buffer,
        buffer_size,
        "%s o' %s",
        hour_words,
        minute_words
      );
    } else {
      written = snprintf(
        buffer,
        buffer_size,
        "%s %s",
        hour_words,
        minute_words
      );
    }
  }

  if (written < 0 || (size_t)written >= buffer_size) {
    buffer[0] = '\0';
    return false;
  }
  return true;
}

static const char *split_teen_word(const char *word) {
  static const struct {
    const char *word;
    const char *split;
  } splits[] = {
    {"thirteen", "thir\n-teen"},
    {"fourteen", "four\n-teen"},
    {"fifteen", "fif\n-teen"},
    {"sixteen", "six\n-teen"},
    {"seventeen", "seven\n-teen"},
    {"eighteen", "eight\n-teen"},
    {"nineteen", "nine\n-teen"},
  };

  for (size_t index = 0; index < sizeof(splits) / sizeof(splits[0]); index++) {
    if (strcmp(word, splits[index].word) == 0) {
      return splits[index].split;
    }
  }
  return word;
}

bool time_words_format_lines(
  int hour,
  int minute,
  bool use_24_hour,
  char *buffer,
  size_t buffer_size
) {
  char phrase[64];
  if (!time_words_format(hour, minute, use_24_hour, phrase, sizeof(phrase))) {
    if (buffer != NULL && buffer_size > 0) buffer[0] = '\0';
    return false;
  }
  if (buffer == NULL || buffer_size == 0) return false;

  size_t word_count = 1;
  for (const char *cursor = phrase; *cursor; cursor++) {
    if (*cursor == ' ') word_count++;
  }

  buffer[0] = '\0';
  size_t used = 0;
  char *cursor = phrase;
  while (*cursor) {
    char *space = strchr(cursor, ' ');
    if (space) *space = '\0';
    const char *word = word_count <= 3 ? split_teen_word(cursor) : cursor;
    int written = snprintf(
      buffer + used,
      buffer_size - used,
      "%s%s",
      used ? "\n" : "",
      word
    );
    if (written < 0 || (size_t)written >= buffer_size - used) {
      buffer[0] = '\0';
      return false;
    }
    used += (size_t)written;
    if (!space) break;
    cursor = space + 1;
  }
  return true;
}
