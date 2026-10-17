#include <pebble.h>

#include "display_settings.h"
#include "display_time.h"

#include <string.h>

/** Zones enabled by migrations and defaults: Home and one display zone. */
#define DEFAULT_ENABLED_ZONES 2
#define UTC_ZONE 1

typedef union {
  DisplaySettings current;
  DisplaySettingsV3 v3;
  DisplaySettingsV2 v2;
  DisplaySettingsV1 v1;
} DisplaySettingsBlob;

static struct {
  DisplaySettings settings;
  uint8_t digits_mask;
  bool storage_error;
} s_display;

DisplaySettings *display_settings(void) {
  return &s_display.settings;
}

uint8_t display_settings_digits_mask(void) {
  return s_display.digits_mask;
}

void display_settings_set_digits_mask(uint8_t mask) {
  s_display.digits_mask = mask & ALL_TIMEZONES_DIGITS_MASK;
}

bool display_settings_zone_uses_digits(uint8_t index) {
  return index < TIMEZONE_COUNT && (s_display.digits_mask & (1 << index)) != 0;
}

bool display_settings_storage_error(void) {
  return s_display.storage_error;
}

static bool label_character_valid(char character) {
  return (character >= 'A' && character <= 'Z')
    || (character >= '0' && character <= '9')
    || character == ' ';
}

/** Measures a label, requiring a NUL within `size` bytes and valid characters. */
static bool label_length(const char *source, size_t size, size_t *length) {
  size_t count = 0;
  while (count < size && source[count] != '\0') {
    if (!label_character_valid(source[count])) return false;
    count++;
  }
  if (count == size || count == 0 || count > TIMEZONE_LABEL_LENGTH) return false;
  *length = count;
  return true;
}

bool timezone_label_valid(const char label[TIMEZONE_LABEL_LENGTH + 1]) {
  size_t length = 0;
  return label != NULL && label_length(label, TIMEZONE_LABEL_LENGTH + 1, &length);
}

bool timezone_label_copy(
  char dest[TIMEZONE_LABEL_LENGTH + 1],
  const char *source,
  size_t source_size
) {
  size_t length = 0;
  if (dest == NULL || source == NULL || !label_length(source, source_size, &length)) {
    return false;
  }
  char copy[TIMEZONE_LABEL_LENGTH + 1];
  int written = snprintf(copy, sizeof(copy), "%.*s", TIMEZONE_LABEL_LENGTH, source);
  if (written != (int)length) return false;
  memcpy(dest, copy, sizeof(copy));
  return true;
}

static bool color_valid(uint8_t color, uint8_t maximum) {
  return color <= maximum;
}

static bool layout_valid(uint8_t horizontal, uint8_t vertical, uint8_t font_size) {
  return horizontal <= HORIZONTAL_RIGHT
    && vertical <= VERTICAL_BOTTOM
    && font_size <= FONT_LARGE;
}

bool timezone_settings_valid(const TimezoneSettings *settings) {
  return settings->enabled <= 1
    && settings->use_watch_local <= 1
    && color_valid(settings->text_color, COLOR_ID_MAX)
    && color_valid(settings->background_color, COLOR_ID_MAX)
    && display_time_offset_valid(settings->utc_offset_minutes)
    && settings->transition_at >= 0
    && display_time_offset_valid(settings->transition_offset_minutes)
    && timezone_label_valid(settings->label);
}

bool display_settings_valid(const DisplaySettings *settings) {
  if (
    settings->version != DISPLAY_SETTINGS_VERSION
    || !layout_valid(settings->horizontal_alignment, settings->vertical_alignment, settings->font_size)
    || !color_valid(settings->text_color, COLOR_ID_MAX)
    || !color_valid(settings->background_color, COLOR_ID_MAX)
    || !settings->zones[HOME_TIMEZONE].enabled
  ) return false;
  for (uint8_t index = 0; index < TIMEZONE_COUNT; index++) {
    if (!timezone_settings_valid(&settings->zones[index])) return false;
  }
  return true;
}

static bool display_settings_v1_valid(const DisplaySettingsV1 *settings) {
  return settings->version == DISPLAY_SETTINGS_V1_VERSION
    && layout_valid(settings->horizontal_alignment, settings->vertical_alignment, settings->font_size)
    && color_valid(settings->text_color, LEGACY_COLOR_ID_MAX)
    && color_valid(settings->background_color, LEGACY_COLOR_ID_MAX);
}

static bool display_settings_v2_valid(const DisplaySettingsV2 *settings) {
  return settings->version == DISPLAY_SETTINGS_V2_VERSION
    && layout_valid(settings->horizontal_alignment, settings->vertical_alignment, settings->font_size)
    && color_valid(settings->text_color, LEGACY_COLOR_ID_MAX)
    && color_valid(settings->background_color, LEGACY_COLOR_ID_MAX)
    && settings->use_local_time <= 1
    && display_time_offset_valid(settings->utc_offset_minutes);
}

static bool display_settings_v3_valid(const DisplaySettingsV3 *settings) {
  return settings->version == DISPLAY_SETTINGS_V3_VERSION
    && layout_valid(settings->horizontal_alignment, settings->vertical_alignment, settings->font_size)
    && color_valid(settings->text_color, LEGACY_COLOR_ID_MAX)
    && color_valid(settings->background_color, LEGACY_COLOR_ID_MAX)
    && color_valid(settings->alternate_text_color, LEGACY_COLOR_ID_MAX)
    && color_valid(settings->alternate_background_color, LEGACY_COLOR_ID_MAX)
    && display_time_offset_valid(settings->alternate_utc_offset_minutes)
    && settings->alternate_transition_at >= 0
    && display_time_offset_valid(settings->alternate_transition_offset_minutes)
    && timezone_label_valid(settings->alternate_label);
}

static DisplaySettings migrated_display_settings(
  uint8_t horizontal,
  uint8_t vertical,
  uint8_t font_size,
  uint8_t text_color,
  uint8_t background_color,
  int16_t alternate_offset
) {
  static const char HOME_LABEL[] = "HOME";
  static const char UTC_LABEL[] = "UTC";
  DisplaySettings settings;
  memset(&settings, 0, sizeof(settings));
  settings.version = DISPLAY_SETTINGS_VERSION;
  settings.horizontal_alignment = horizontal;
  settings.vertical_alignment = vertical;
  settings.font_size = font_size;
  settings.text_color = text_color;
  settings.background_color = background_color;
  for (uint8_t index = 0; index < TIMEZONE_COUNT; index++) {
    TimezoneSettings *zone = &settings.zones[index];
    bool home = index == HOME_TIMEZONE;
    zone->enabled = index < DEFAULT_ENABLED_ZONES;
    zone->text_color = home ? text_color : COLOR_ID_BLACK;
    zone->background_color = home ? background_color : COLOR_ID_CHROME_YELLOW;
    zone->utc_offset_minutes = index == UTC_ZONE ? alternate_offset : 0;
    zone->transition_offset_minutes = zone->utc_offset_minutes;
    (void)(home
      ? timezone_label_copy(zone->label, HOME_LABEL, sizeof(HOME_LABEL))
      : timezone_label_copy(zone->label, UTC_LABEL, sizeof(UTC_LABEL)));
  }
  settings.zones[HOME_TIMEZONE].use_watch_local = 1;
  return settings;
}

DisplaySettings display_settings_defaults(void) {
  return migrated_display_settings(
    HORIZONTAL_CENTER, VERTICAL_MIDDLE, FONT_LARGE, COLOR_ID_WHITE, COLOR_ID_BLACK, 0
  );
}

bool display_settings_migrate(const void *data, size_t size, DisplaySettings *settings) {
  if (data == NULL || settings == NULL || size > sizeof(DisplaySettingsBlob)) return false;
  DisplaySettingsBlob blob;
  memset(&blob, 0, sizeof(blob));
  memcpy(&blob, data, size);

  if (size == sizeof(blob.current) && display_settings_valid(&blob.current)) {
    *settings = blob.current;
    return true;
  }
  if (size == sizeof(blob.v3) && display_settings_v3_valid(&blob.v3)) {
    const DisplaySettingsV3 *old = &blob.v3;
    DisplaySettings migrated = migrated_display_settings(
      old->horizontal_alignment, old->vertical_alignment, old->font_size,
      old->text_color, old->background_color, old->alternate_utc_offset_minutes
    );
    TimezoneSettings *zone = &migrated.zones[UTC_ZONE];
    zone->text_color = old->alternate_text_color;
    zone->background_color = old->alternate_background_color;
    zone->transition_at = old->alternate_transition_at;
    zone->transition_offset_minutes = old->alternate_transition_offset_minutes;
    if (!timezone_label_copy(zone->label, old->alternate_label, sizeof(old->alternate_label))) {
      return false;
    }
    *settings = migrated;
    return true;
  }
  if (size == sizeof(blob.v2) && display_settings_v2_valid(&blob.v2)) {
    const DisplaySettingsV2 *old = &blob.v2;
    *settings = migrated_display_settings(
      old->horizontal_alignment, old->vertical_alignment, old->font_size,
      old->text_color, old->background_color,
      old->use_local_time ? 0 : old->utc_offset_minutes
    );
    return true;
  }
  if (size == sizeof(blob.v1) && display_settings_v1_valid(&blob.v1)) {
    const DisplaySettingsV1 *old = &blob.v1;
    *settings = migrated_display_settings(
      old->horizontal_alignment, old->vertical_alignment, old->font_size,
      old->text_color, old->background_color, 0
    );
    return true;
  }
  return false;
}

uint8_t display_settings_load_digits_mask(void) {
  // Migrate the old shared mode to all four timezone slots on first load.
  if (!persist_exists(PERSIST_KEY_TZ_DIGITS_MASK)) {
    return persist_read_bool(PERSIST_KEY_USE_DIGITS) ? ALL_TIMEZONES_DIGITS_MASK : 0;
  }
  int32_t mask = persist_read_int(PERSIST_KEY_TZ_DIGITS_MASK);
  return mask >= 0 && mask <= ALL_TIMEZONES_DIGITS_MASK ? (uint8_t)mask : 0;
}

bool display_settings_save(void) {
  bool saved = true;
  int digit_status = persist_write_int(PERSIST_KEY_TZ_DIGITS_MASK, s_display.digits_mask);
  if (digit_status < 0) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Digit setting persistence failed: %d", digit_status);
    saved = false;
  }
  int written = persist_write_data(
    PERSIST_KEY_DISPLAY_SETTINGS,
    &s_display.settings,
    sizeof(s_display.settings)
  );
  if (written != (int)sizeof(s_display.settings)) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Display settings persistence failed: %d", written);
    saved = false;
  }
  s_display.storage_error = !saved;
  return saved;
}

void display_settings_load(void) {
  s_display.digits_mask = display_settings_load_digits_mask();
  int stored_size = persist_get_size(PERSIST_KEY_DISPLAY_SETTINGS);
  DisplaySettingsBlob blob;
  DisplaySettings restored;
  memset(&restored, 0, sizeof(restored));
  if (
    stored_size > 0
    && (size_t)stored_size <= sizeof(blob)
    && persist_read_data(PERSIST_KEY_DISPLAY_SETTINGS, &blob, (size_t)stored_size) == stored_size
    && display_settings_migrate(&blob, (size_t)stored_size, &restored)
  ) {
    s_display.settings = restored;
    // Rewrite older versions in the current layout.
    if (stored_size != (int)sizeof(DisplaySettings)) (void)display_settings_save();
    return;
  }
  s_display.settings = display_settings_defaults();
  (void)display_settings_save();
}
