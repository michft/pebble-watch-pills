#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "app_types.h"

#define PERSIST_KEY_DISPLAY_SETTINGS 100
#define PERSIST_KEY_USE_DIGITS 101
#define PERSIST_KEY_TZ_DIGITS_MASK 102
#define DISPLAY_SETTINGS_V1_VERSION 1
#define DISPLAY_SETTINGS_V2_VERSION 2
#define DISPLAY_SETTINGS_V3_VERSION 3
#define DISPLAY_SETTINGS_VERSION 4

/* Legacy persisted layouts, exposed for migration tests. */

typedef struct {
  uint16_t version;
  uint8_t horizontal_alignment;
  uint8_t vertical_alignment;
  uint8_t font_size;
  uint8_t text_color;
  uint8_t background_color;
} DisplaySettingsV1;

typedef struct {
  uint16_t version;
  uint8_t horizontal_alignment;
  uint8_t vertical_alignment;
  uint8_t font_size;
  uint8_t text_color;
  uint8_t background_color;
  uint8_t use_local_time;
  int16_t utc_offset_minutes;
} DisplaySettingsV2;

typedef struct {
  uint16_t version;
  uint8_t horizontal_alignment;
  uint8_t vertical_alignment;
  uint8_t font_size;
  uint8_t text_color;
  uint8_t background_color;
  uint8_t alternate_text_color;
  uint8_t alternate_background_color;
  int16_t alternate_utc_offset_minutes;
  int32_t alternate_transition_at;
  int16_t alternate_transition_offset_minutes;
  char alternate_label[TIMEZONE_LABEL_LENGTH + 1];
} DisplaySettingsV3;

/** Returns the in-memory display settings. */
DisplaySettings *display_settings(void);

uint8_t display_settings_digits_mask(void);
void display_settings_set_digits_mask(uint8_t mask);
bool display_settings_zone_uses_digits(uint8_t index);

/** Reads the persisted digits mask, migrating the old shared on/off setting. */
uint8_t display_settings_load_digits_mask(void);

/** Restores display settings, migrating V1-V3 or falling back to defaults. */
void display_settings_load(void);

/** Persists the digits mask and settings; returns `false` if either write failed. */
bool display_settings_save(void);

/** Returns whether the most recent display settings save failed. */
bool display_settings_storage_error(void);

/** Default settings: Home (watch local) plus a UTC display zone. */
DisplaySettings display_settings_defaults(void);

/**
 * Decodes a stored blob of any supported version into current settings.
 * Returns `false` for corrupt, unknown, or wrong-size data.
 */
bool display_settings_migrate(const void *data, size_t size, DisplaySettings *settings);

bool display_settings_valid(const DisplaySettings *settings);
bool timezone_settings_valid(const TimezoneSettings *settings);

/** Validates a NUL-terminated label of 1-8 characters from `[A-Z0-9 ]`. */
bool timezone_label_valid(const char label[TIMEZONE_LABEL_LENGTH + 1]);

/**
 * Validates `source` (at most `source_size` bytes, NUL required within them)
 * and copies it into `dest`. Oversized or invalid labels are rejected and leave
 * `dest` untouched; they are never truncated.
 */
bool timezone_label_copy(
  char dest[TIMEZONE_LABEL_LENGTH + 1],
  const char *source,
  size_t source_size
);
