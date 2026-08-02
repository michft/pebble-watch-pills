#include <pebble.h>

#include "display_time.h"
#include "reminder_navigation.h"
#include "time_words.h"

extern uint32_t MESSAGE_KEY_TYPE;
extern uint32_t MESSAGE_KEY_PAYLOAD;
extern uint32_t MESSAGE_KEY_H_ALIGN;
extern uint32_t MESSAGE_KEY_V_ALIGN;
extern uint32_t MESSAGE_KEY_FONT_SIZE;
extern uint32_t MESSAGE_KEY_TEXT_COLOR;
extern uint32_t MESSAGE_KEY_BACKGROUND_COLOR;
extern uint32_t MESSAGE_KEY_USE_LOCAL_TIME;
extern uint32_t MESSAGE_KEY_UTC_OFFSET_MINUTES;
extern uint32_t MESSAGE_KEY_ALT_TEXT_COLOR;
extern uint32_t MESSAGE_KEY_ALT_BACKGROUND_COLOR;
extern uint32_t MESSAGE_KEY_ALT_TZ_LABEL;
extern uint32_t MESSAGE_KEY_ALT_UTC_OFFSET_MINUTES;
extern uint32_t MESSAGE_KEY_ALT_TRANSITION_AT;
extern uint32_t MESSAGE_KEY_ALT_TRANSITION_OFFSET_MINUTES;
extern uint32_t MESSAGE_KEY_TZ_0_ENABLED;
extern uint32_t MESSAGE_KEY_TZ_0_LABEL;
extern uint32_t MESSAGE_KEY_TZ_0_TEXT_COLOR;
extern uint32_t MESSAGE_KEY_TZ_0_BACKGROUND_COLOR;
extern uint32_t MESSAGE_KEY_TZ_0_UTC_OFFSET_MINUTES;
extern uint32_t MESSAGE_KEY_TZ_0_TRANSITION_AT;
extern uint32_t MESSAGE_KEY_TZ_0_TRANSITION_OFFSET_MINUTES;
extern uint32_t MESSAGE_KEY_TZ_1_ENABLED;
extern uint32_t MESSAGE_KEY_TZ_1_LABEL;
extern uint32_t MESSAGE_KEY_TZ_1_TEXT_COLOR;
extern uint32_t MESSAGE_KEY_TZ_1_BACKGROUND_COLOR;
extern uint32_t MESSAGE_KEY_TZ_1_UTC_OFFSET_MINUTES;
extern uint32_t MESSAGE_KEY_TZ_1_TRANSITION_AT;
extern uint32_t MESSAGE_KEY_TZ_1_TRANSITION_OFFSET_MINUTES;
extern uint32_t MESSAGE_KEY_TZ_2_ENABLED;
extern uint32_t MESSAGE_KEY_TZ_2_LABEL;
extern uint32_t MESSAGE_KEY_TZ_2_TEXT_COLOR;
extern uint32_t MESSAGE_KEY_TZ_2_BACKGROUND_COLOR;
extern uint32_t MESSAGE_KEY_TZ_2_UTC_OFFSET_MINUTES;
extern uint32_t MESSAGE_KEY_TZ_2_TRANSITION_AT;
extern uint32_t MESSAGE_KEY_TZ_2_TRANSITION_OFFSET_MINUTES;
extern uint32_t MESSAGE_KEY_TZ_3_ENABLED;
extern uint32_t MESSAGE_KEY_TZ_3_LABEL;
extern uint32_t MESSAGE_KEY_TZ_3_TEXT_COLOR;
extern uint32_t MESSAGE_KEY_TZ_3_BACKGROUND_COLOR;
extern uint32_t MESSAGE_KEY_TZ_3_UTC_OFFSET_MINUTES;
extern uint32_t MESSAGE_KEY_TZ_3_TRANSITION_AT;
extern uint32_t MESSAGE_KEY_TZ_3_TRANSITION_OFFSET_MINUTES;
extern uint32_t MESSAGE_KEY_SLOT_0_HOUR;
extern uint32_t MESSAGE_KEY_SLOT_0_MINUTE;
extern uint32_t MESSAGE_KEY_SLOT_0_ENABLED;
extern uint32_t MESSAGE_KEY_SLOT_1_HOUR;
extern uint32_t MESSAGE_KEY_SLOT_1_MINUTE;
extern uint32_t MESSAGE_KEY_SLOT_1_ENABLED;
extern uint32_t MESSAGE_KEY_SLOT_2_HOUR;
extern uint32_t MESSAGE_KEY_SLOT_2_MINUTE;
extern uint32_t MESSAGE_KEY_SLOT_2_ENABLED;
extern uint32_t MESSAGE_KEY_SLOT_3_HOUR;
extern uint32_t MESSAGE_KEY_SLOT_3_MINUTE;
extern uint32_t MESSAGE_KEY_SLOT_3_ENABLED;

#define SLOT_COUNT 4
#define TIMEZONE_COUNT 4
#define MAIN_VISIBLE_ROWS 3
#define MAIN_ADD_ITEM SLOT_COUNT
#define EVENT_LIMIT 128
#define STATE_VERSION 2
#define PERSIST_KEY_META 1
#define PERSIST_KEY_EVENTS_BASE 2
#define PERSIST_KEY_DISPLAY_SETTINGS 100
#define DISPLAY_SETTINGS_V1_VERSION 1
#define DISPLAY_SETTINGS_V2_VERSION 2
#define DISPLAY_SETTINGS_V3_VERSION 3
#define DISPLAY_SETTINGS_VERSION 4
#define WATCHFACE_DESCENDER_PADDING 6
#define TIMEZONE_LABEL_LENGTH 8
#define TIMEZONE_FEEDBACK_MS 1200
#define REMINDER_DURATION_SECONDS (5 * 60)
#define REMINDER_BUZZ_INTERVAL_MS (30 * 1000)

_Static_assert(
  SLOT_COUNT == REMINDER_NAVIGATION_SLOT_COUNT,
  "Reminder navigation slot count differs from app state"
);

typedef enum {
  SCREEN_WATCHFACE,
  SCREEN_HOME,
  SCREEN_MAIN,
  SCREEN_TIMEZONES,
  SCREEN_EDIT,
  SCREEN_ALERT,
  SCREEN_SYNC
} Screen;

typedef enum {
  OUTCOME_NO_RESPONSE,
  OUTCOME_TAKEN,
  OUTCOME_SKIPPED
} Outcome;

typedef enum {
  HORIZONTAL_LEFT,
  HORIZONTAL_CENTER,
  HORIZONTAL_RIGHT
} HorizontalAlignment;

typedef enum {
  VERTICAL_TOP,
  VERTICAL_MIDDLE,
  VERTICAL_BOTTOM
} VerticalAlignment;

typedef enum {
  FONT_SMALL,
  FONT_MEDIUM,
  FONT_LARGE
} FontSize;

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

typedef struct {
  uint8_t enabled;
  uint8_t use_watch_local;
  uint8_t text_color;
  uint8_t background_color;
  int16_t utc_offset_minutes;
  int32_t transition_at;
  int16_t transition_offset_minutes;
  char label[TIMEZONE_LABEL_LENGTH + 1];
} TimezoneSettings;

typedef struct {
  uint16_t version;
  uint8_t horizontal_alignment;
  uint8_t vertical_alignment;
  uint8_t font_size;
  uint8_t text_color;
  uint8_t background_color;
  TimezoneSettings zones[TIMEZONE_COUNT];
} DisplaySettings;

typedef struct {
  uint8_t hour;
  uint8_t minute;
  bool enabled;
  WakeupId wakeup_id;
  time_t scheduled_at;
} ReminderSlot;

typedef struct {
  uint32_t sequence;
  time_t scheduled_at;
  time_t answered_at;
  uint8_t slot_id;
  uint8_t outcome;
} ReminderEvent;

typedef struct {
  uint16_t version;
  uint32_t install_id;
  uint32_t next_sequence;
  uint32_t settings_revision;
  uint16_t event_count;
  uint16_t dropped_events;
  ReminderSlot slots[SLOT_COUNT];
  ReminderEvent events[EVENT_LIMIT];
} AppState;

typedef struct {
  uint16_t version;
  uint32_t install_id;
  uint32_t next_sequence;
  uint32_t settings_revision;
  uint16_t event_count;
  uint16_t dropped_events;
  ReminderSlot slots[SLOT_COUNT];
  uint32_t checksum;
} PersistMeta;

#define EVENTS_PER_CHUNK (PERSIST_DATA_MAX_LENGTH / sizeof(ReminderEvent))

_Static_assert(sizeof(PersistMeta) <= PERSIST_DATA_MAX_LENGTH, "PersistMeta exceeds Pebble value limit");
_Static_assert(EVENTS_PER_CHUNK > 0, "ReminderEvent exceeds Pebble value limit");

static Window *s_window;
static TextLayer *s_watchface;
static TextLayer *s_header;
static TextLayer *s_rows[SLOT_COUNT];
static TextLayer *s_footer;
static AppState s_state;
static DisplaySettings s_display_settings;
static Screen s_screen = SCREEN_WATCHFACE;
static uint8_t s_selected_slot;
static uint8_t s_edit_field;
static ReminderSlot s_edit_slot;
static uint8_t s_main_selection;
static uint8_t s_main_scroll_offset;
static uint8_t s_home_selection;
static uint8_t s_timezone_selection;
static uint8_t s_timezone_scroll_offset;
static uint32_t s_active_event_sequence;
static AppTimer *s_alert_timer;
static AppTimer *s_timezone_feedback_timer;
static time_t s_alert_ends_at;
static bool s_edit_value_mode;
static uint8_t s_active_timezone;
static bool s_syncing;
static bool s_sync_show_status;
static bool s_schedule_error;
static bool s_storage_error;
static uint16_t s_sync_index;
static char s_header_text[32];
static char s_footer_text[64];
static char s_header_buffers[2][32];
static char s_row_buffers[SLOT_COUNT][4][48];
static char s_footer_buffers[2][64];
static uint8_t s_header_buffer;
static uint8_t s_row_buffer[SLOT_COUNT];
static uint8_t s_footer_buffer;
static char s_watchface_text[80];

/**
 * Updates a checksum with the supplied byte data.
 *
 * @param checksum Initial checksum value.
 * @param data Data to incorporate into the checksum.
 * @param size Number of bytes to process.
 * @return The updated checksum.
 */
static uint32_t checksum_bytes(uint32_t checksum, const void *data, size_t size) {
  const uint8_t *bytes = data;
  for (size_t i = 0; i < size; i++) {
    checksum ^= bytes[i];
    checksum *= 16777619u;
  }
  return checksum;
}

/**
 * Calculates an integrity checksum for the persisted application state.
 *
 * @param state State whose metadata, reminder slots, and stored events are included.
 * @return Checksum representing the supplied state.
 */
static uint32_t state_checksum(const AppState *state) {
  uint32_t checksum = 2166136261u;
  checksum = checksum_bytes(checksum, &state->version, sizeof(state->version));
  checksum = checksum_bytes(checksum, &state->install_id, sizeof(state->install_id));
  checksum = checksum_bytes(checksum, &state->next_sequence, sizeof(state->next_sequence));
  checksum = checksum_bytes(checksum, &state->settings_revision, sizeof(state->settings_revision));
  checksum = checksum_bytes(checksum, &state->event_count, sizeof(state->event_count));
  checksum = checksum_bytes(checksum, &state->dropped_events, sizeof(state->dropped_events));
  checksum = checksum_bytes(checksum, state->slots, sizeof(state->slots));
  checksum = checksum_bytes(
    checksum,
    state->events,
    sizeof(ReminderEvent) * state->event_count
  );
  return checksum;
}

/**
 * Persists the current reminder settings and event history.
 *
 * @return `true` if all state data is saved successfully, `false` otherwise.
 */
static bool save_state(void) {
  for (uint16_t offset = 0, chunk = 0; offset < s_state.event_count; chunk++) {
    uint16_t remaining = s_state.event_count - offset;
    uint16_t event_count = remaining < EVENTS_PER_CHUNK ? remaining : EVENTS_PER_CHUNK;
    size_t size = sizeof(ReminderEvent) * event_count;
    int written = persist_write_data(
      PERSIST_KEY_EVENTS_BASE + chunk,
      &s_state.events[offset],
      size
    );
    if (written != (int)size) {
      APP_LOG(APP_LOG_LEVEL_ERROR, "Event persistence failed: %d", written);
      s_storage_error = true;
      return false;
    }
    offset += event_count;
  }

  PersistMeta meta = {
    .version = s_state.version,
    .install_id = s_state.install_id,
    .next_sequence = s_state.next_sequence,
    .settings_revision = s_state.settings_revision,
    .event_count = s_state.event_count,
    .dropped_events = s_state.dropped_events,
    .checksum = state_checksum(&s_state),
  };
  memcpy(meta.slots, s_state.slots, sizeof(meta.slots));
  int written = persist_write_data(PERSIST_KEY_META, &meta, sizeof(meta));
  if (written != (int)sizeof(meta)) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Metadata persistence failed: %d", written);
    s_storage_error = true;
    return false;
  }

  s_storage_error = false;
  return true;
}

/**
 * Resets the application state to the default reminder schedule and persists it.
 */
static void reset_state(void) {
  memset(&s_state, 0, sizeof(s_state));
  s_state.version = STATE_VERSION;
  s_state.install_id = (uint32_t)time(NULL) ^ (uint32_t)(uintptr_t)&s_state;
  s_state.next_sequence = 1;
  s_state.settings_revision = 1;
  const uint8_t hours[SLOT_COUNT] = {8, 12, 18, 22};
  for (uint8_t i = 0; i < SLOT_COUNT; i++) {
    s_state.slots[i].hour = hours[i];
    s_state.slots[i].enabled = true;
    s_state.slots[i].wakeup_id = -1;
  }
  (void)save_state();
}

/**
 * Restores the application state from persistent storage.
 *
 * Falls back to a newly initialised state when stored metadata, event data, or
 * the integrity checksum is invalid.
 */
static void load_state(void) {
  PersistMeta meta;
  bool restored = persist_get_size(PERSIST_KEY_META) == (int)sizeof(meta)
    && persist_read_data(PERSIST_KEY_META, &meta, sizeof(meta)) == (int)sizeof(meta)
    && meta.version == STATE_VERSION
    && meta.event_count <= EVENT_LIMIT;

  if (restored) {
    memset(&s_state, 0, sizeof(s_state));
    s_state.version = meta.version;
    s_state.install_id = meta.install_id;
    s_state.next_sequence = meta.next_sequence;
    s_state.settings_revision = meta.settings_revision;
    s_state.event_count = meta.event_count;
    s_state.dropped_events = meta.dropped_events;
    memcpy(s_state.slots, meta.slots, sizeof(s_state.slots));

    for (uint16_t offset = 0, chunk = 0; offset < s_state.event_count; chunk++) {
      uint16_t remaining = s_state.event_count - offset;
      uint16_t event_count = remaining < EVENTS_PER_CHUNK ? remaining : EVENTS_PER_CHUNK;
      size_t size = sizeof(ReminderEvent) * event_count;
      if (persist_read_data(
        PERSIST_KEY_EVENTS_BASE + chunk,
        &s_state.events[offset],
        size
      ) != (int)size) {
        restored = false;
        break;
      }
      offset += event_count;
    }
    restored = restored && meta.checksum == state_checksum(&s_state);
  }

  if (!restored) {
    reset_state();
  }
}

static bool timezone_label_valid(const char label[TIMEZONE_LABEL_LENGTH + 1]) {
  size_t length = 0;
  while (length <= TIMEZONE_LABEL_LENGTH && label[length] != '\0') length++;
  if (length == 0 || length > TIMEZONE_LABEL_LENGTH) return false;
  for (size_t index = 0; index < length; index++) {
    char character = label[index];
    if (
      !(character >= 'A' && character <= 'Z')
      && !(character >= '0' && character <= '9')
      && character != ' '
    ) return false;
  }
  return true;
}

static bool timezone_settings_valid(const TimezoneSettings *settings) {
  return settings->enabled <= 1
    && settings->use_watch_local <= 1
    && settings->text_color <= 9
    && settings->background_color <= 9
    && settings->utc_offset_minutes >= DISPLAY_TIME_MIN_OFFSET_MINUTES
    && settings->utc_offset_minutes <= DISPLAY_TIME_MAX_OFFSET_MINUTES
    && settings->utc_offset_minutes % DISPLAY_TIME_OFFSET_STEP_MINUTES == 0
    && settings->transition_at >= 0
    && settings->transition_offset_minutes >= DISPLAY_TIME_MIN_OFFSET_MINUTES
    && settings->transition_offset_minutes <= DISPLAY_TIME_MAX_OFFSET_MINUTES
    && settings->transition_offset_minutes % DISPLAY_TIME_OFFSET_STEP_MINUTES == 0
    && timezone_label_valid(settings->label);
}

static bool display_settings_valid(const DisplaySettings *settings) {
  if (
    settings->version != DISPLAY_SETTINGS_VERSION
    || settings->horizontal_alignment > HORIZONTAL_RIGHT
    || settings->vertical_alignment > VERTICAL_BOTTOM
    || settings->font_size > FONT_LARGE
    || settings->text_color > 9
    || settings->background_color > 9
    || !settings->zones[0].enabled
  ) return false;
  for (uint8_t index = 0; index < TIMEZONE_COUNT; index++) {
    if (!timezone_settings_valid(&settings->zones[index])) return false;
  }
  return true;
}

static bool display_settings_v1_valid(const DisplaySettingsV1 *settings) {
  return settings->version == DISPLAY_SETTINGS_V1_VERSION
    && settings->horizontal_alignment <= HORIZONTAL_RIGHT
    && settings->vertical_alignment <= VERTICAL_BOTTOM
    && settings->font_size <= FONT_LARGE
    && settings->text_color <= 9
    && settings->background_color <= 9;
}

static bool display_settings_v2_valid(const DisplaySettingsV2 *settings) {
  return settings->version == DISPLAY_SETTINGS_V2_VERSION
    && settings->horizontal_alignment <= HORIZONTAL_RIGHT
    && settings->vertical_alignment <= VERTICAL_BOTTOM
    && settings->font_size <= FONT_LARGE
    && settings->text_color <= 9
    && settings->background_color <= 9
    && settings->use_local_time <= 1
    && settings->utc_offset_minutes >= DISPLAY_TIME_MIN_OFFSET_MINUTES
    && settings->utc_offset_minutes <= DISPLAY_TIME_MAX_OFFSET_MINUTES
    && settings->utc_offset_minutes % DISPLAY_TIME_OFFSET_STEP_MINUTES == 0;
}

static DisplaySettings migrated_display_settings(
  uint8_t horizontal,
  uint8_t vertical,
  uint8_t font_size,
  uint8_t text_color,
  uint8_t background_color,
  int16_t alternate_offset
) {
  DisplaySettings settings = {
    .version = DISPLAY_SETTINGS_VERSION,
    .horizontal_alignment = horizontal,
    .vertical_alignment = vertical,
    .font_size = font_size,
    .text_color = text_color,
    .background_color = background_color,
  };
  for (uint8_t index = 0; index < TIMEZONE_COUNT; index++) {
    settings.zones[index].enabled = index < 2;
    settings.zones[index].text_color = index == 0 ? text_color : 1;
    settings.zones[index].background_color = index == 0 ? background_color : 4;
    settings.zones[index].utc_offset_minutes = index == 1 ? alternate_offset : 0;
    settings.zones[index].transition_offset_minutes = settings.zones[index].utc_offset_minutes;
    snprintf(
      settings.zones[index].label,
      sizeof(settings.zones[index].label),
      "%s",
      index == 0 ? "HOME" : "UTC"
    );
  }
  settings.zones[0].use_watch_local = 1;
  return settings;
}

static DisplaySettings migrated_display_settings_v3(const DisplaySettingsV3 *old) {
  DisplaySettings settings = migrated_display_settings(
    old->horizontal_alignment,
    old->vertical_alignment,
    old->font_size,
    old->text_color,
    old->background_color,
    old->alternate_utc_offset_minutes
  );
  settings.zones[1].text_color = old->alternate_text_color;
  settings.zones[1].background_color = old->alternate_background_color;
  settings.zones[1].transition_at = old->alternate_transition_at;
  settings.zones[1].transition_offset_minutes = old->alternate_transition_offset_minutes;
  snprintf(
    settings.zones[1].label,
    sizeof(settings.zones[1].label),
    "%s",
    old->alternate_label
  );
  return settings;
}

static void save_display_settings(void) {
  int written = persist_write_data(
    PERSIST_KEY_DISPLAY_SETTINGS,
    &s_display_settings,
    sizeof(s_display_settings)
  );
  if (written != (int)sizeof(s_display_settings)) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Display settings persistence failed: %d", written);
  }
}

static void load_display_settings(void) {
  int stored_size = persist_get_size(PERSIST_KEY_DISPLAY_SETTINGS);
  bool restored = stored_size == (int)sizeof(s_display_settings)
    && persist_read_data(
      PERSIST_KEY_DISPLAY_SETTINGS,
      &s_display_settings,
      sizeof(s_display_settings)
    ) == (int)sizeof(s_display_settings)
    && display_settings_valid(&s_display_settings);
  if (restored) return;

  DisplaySettingsV3 version_3;
  bool migrated_v3 = stored_size == (int)sizeof(version_3)
    && persist_read_data(
      PERSIST_KEY_DISPLAY_SETTINGS,
      &version_3,
      sizeof(version_3)
    ) == (int)sizeof(version_3)
    && version_3.version == DISPLAY_SETTINGS_V3_VERSION
    && version_3.horizontal_alignment <= HORIZONTAL_RIGHT
    && version_3.vertical_alignment <= VERTICAL_BOTTOM
    && version_3.font_size <= FONT_LARGE
    && version_3.text_color <= 9
    && version_3.background_color <= 9
    && version_3.alternate_text_color <= 9
    && version_3.alternate_background_color <= 9
    && version_3.alternate_utc_offset_minutes >= DISPLAY_TIME_MIN_OFFSET_MINUTES
    && version_3.alternate_utc_offset_minutes <= DISPLAY_TIME_MAX_OFFSET_MINUTES
    && version_3.alternate_utc_offset_minutes % DISPLAY_TIME_OFFSET_STEP_MINUTES == 0
    && version_3.alternate_transition_at >= 0
    && version_3.alternate_transition_offset_minutes >= DISPLAY_TIME_MIN_OFFSET_MINUTES
    && version_3.alternate_transition_offset_minutes <= DISPLAY_TIME_MAX_OFFSET_MINUTES
    && version_3.alternate_transition_offset_minutes % DISPLAY_TIME_OFFSET_STEP_MINUTES == 0
    && timezone_label_valid(version_3.alternate_label);
  if (migrated_v3) {
    s_display_settings = migrated_display_settings_v3(&version_3);
    save_display_settings();
    return;
  }

  DisplaySettingsV2 version_2;
  bool migrated_v2 = stored_size == (int)sizeof(version_2)
    && persist_read_data(
      PERSIST_KEY_DISPLAY_SETTINGS,
      &version_2,
      sizeof(version_2)
    ) == (int)sizeof(version_2)
    && display_settings_v2_valid(&version_2);
  if (migrated_v2) {
    s_display_settings = migrated_display_settings(
      version_2.horizontal_alignment,
      version_2.vertical_alignment,
      version_2.font_size,
      version_2.text_color,
      version_2.background_color,
      version_2.use_local_time ? 0 : version_2.utc_offset_minutes
    );
    save_display_settings();
    return;
  }

  DisplaySettingsV1 version_1;
  bool migrated_v1 = stored_size == (int)sizeof(version_1)
    && persist_read_data(
      PERSIST_KEY_DISPLAY_SETTINGS,
      &version_1,
      sizeof(version_1)
    ) == (int)sizeof(version_1)
    && display_settings_v1_valid(&version_1);
  if (migrated_v1) {
    s_display_settings = migrated_display_settings(
      version_1.horizontal_alignment,
      version_1.vertical_alignment,
      version_1.font_size,
      version_1.text_color,
      version_1.background_color,
      0
    );
    save_display_settings();
    return;
  }

  s_display_settings = migrated_display_settings(
    HORIZONTAL_CENTER,
    VERTICAL_MIDDLE,
    FONT_LARGE,
    0,
    1,
    0
  );
  save_display_settings();
}

static GColor color_for_id(uint8_t color_id) {
  switch (color_id) {
    case 1: return GColorBlack;
    case 2: return GColorRed;
    case 3: return GColorOrange;
    case 4: return GColorYellow;
    case 5: return GColorGreen;
    case 6: return GColorCyan;
    case 7: return GColorBlue;
    case 8: return GColorPurple;
    case 9: return GColorMagenta;
    default: return GColorWhite;
  }
}

static GFont watchface_font(void) {
  switch (s_display_settings.font_size) {
    case FONT_SMALL:
      return fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD);
    case FONT_MEDIUM:
      return fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD);
    default:
      return fonts_get_system_font(FONT_KEY_BITHAM_42_BOLD);
  }
}

static GTextAlignment watchface_alignment(void) {
  switch (s_display_settings.horizontal_alignment) {
    case HORIZONTAL_LEFT: return GTextAlignmentLeft;
    case HORIZONTAL_RIGHT: return GTextAlignmentRight;
    default: return GTextAlignmentCenter;
  }
}

static void set_reminder_layers_hidden(bool hidden) {
  layer_set_hidden(text_layer_get_layer(s_header), hidden);
  layer_set_hidden(text_layer_get_layer(s_footer), hidden);
  for (uint8_t index = 0; index < SLOT_COUNT; index++) {
    layer_set_hidden(text_layer_get_layer(s_rows[index]), hidden);
  }
}

static void show_reminder_layers(void) {
  layer_set_hidden(text_layer_get_layer(s_watchface), true);
  set_reminder_layers_hidden(false);
  window_set_background_color(s_window, GColorWhite);
}

static TimezoneSettings *active_timezone_settings(void) {
  if (
    s_active_timezone >= TIMEZONE_COUNT
    || !s_display_settings.zones[s_active_timezone].enabled
  ) s_active_timezone = 0;
  return &s_display_settings.zones[s_active_timezone];
}

static bool current_display_time(int *hour, int *minute) {
  time_t now = time(NULL);
  TimezoneSettings *zone = active_timezone_settings();
  if (zone->use_watch_local) {
    struct tm *local = localtime(&now);
    if (local == NULL) return false;
    *hour = local->tm_hour;
    *minute = local->tm_min;
    return true;
  }
  return display_time_named_parts(
    now,
    zone->utc_offset_minutes,
    (time_t)zone->transition_at,
    zone->transition_offset_minutes,
    hour,
    minute
  );
}

static void update_watchface(void) {
  if (!s_watchface) return;
  int hour;
  int minute;
  if (
    !current_display_time(&hour, &minute)
    || !time_words_format_lines(
    hour,
    minute,
    clock_is_24h_style(),
    s_display_settings.font_size == FONT_LARGE,
    s_watchface_text,
    sizeof(s_watchface_text)
  )) {
    snprintf(s_watchface_text, sizeof(s_watchface_text), "Time unavailable");
  }

  Layer *root = window_get_root_layer(s_window);
  GRect bounds = layer_get_bounds(root);
  GFont font = watchface_font();
  text_layer_set_font(s_watchface, font);
  text_layer_set_text_alignment(s_watchface, watchface_alignment());
  TimezoneSettings *zone = active_timezone_settings();
  text_layer_set_text_color(s_watchface, color_for_id(zone->text_color));
  text_layer_set_text(s_watchface, s_watchface_text);
  layer_set_frame(
    text_layer_get_layer(s_watchface),
    GRect(6, 0, bounds.size.w - 12, bounds.size.h)
  );
  GSize content = text_layer_get_content_size(s_watchface);
  int16_t padded_height = content.h + WATCHFACE_DESCENDER_PADDING;
  int16_t height = padded_height > bounds.size.h - 8
    ? bounds.size.h - 8
    : padded_height;
  int16_t y = 4;
  if (s_display_settings.vertical_alignment == VERTICAL_MIDDLE) {
    y = (bounds.size.h - height) / 2;
  } else if (s_display_settings.vertical_alignment == VERTICAL_BOTTOM) {
    y = bounds.size.h - height - 4;
  }
  layer_set_frame(
    text_layer_get_layer(s_watchface),
    GRect(6, y, bounds.size.w - 12, height)
  );
  window_set_background_color(s_window, color_for_id(zone->background_color));
}

static void timezone_feedback_done(void *context) {
  s_timezone_feedback_timer = NULL;
  if (s_screen == SCREEN_WATCHFACE) update_watchface();
}

static void show_timezone_feedback(void) {
  if (s_timezone_feedback_timer) {
    app_timer_cancel(s_timezone_feedback_timer);
    s_timezone_feedback_timer = NULL;
  }
  update_watchface();
  text_layer_set_text_alignment(s_watchface, GTextAlignmentCenter);
  text_layer_set_text(
    s_watchface,
    active_timezone_settings()->label
  );
  Layer *root = window_get_root_layer(s_window);
  GRect bounds = layer_get_bounds(root);
  layer_set_frame(
    text_layer_get_layer(s_watchface),
    GRect(6, 0, bounds.size.w - 12, bounds.size.h)
  );
  GSize content = text_layer_get_content_size(s_watchface);
  int16_t height = content.h + WATCHFACE_DESCENDER_PADDING;
  layer_set_frame(
    text_layer_get_layer(s_watchface),
    GRect(6, (bounds.size.h - height) / 2, bounds.size.w - 12, height)
  );
  s_timezone_feedback_timer = app_timer_register(
    TIMEZONE_FEEDBACK_MS,
    timezone_feedback_done,
    NULL
  );
}

static void show_watchface(void) {
  s_screen = SCREEN_WATCHFACE;
  set_reminder_layers_hidden(true);
  layer_set_hidden(text_layer_get_layer(s_watchface), false);
  update_watchface();
}

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  if (s_screen == SCREEN_WATCHFACE && !s_timezone_feedback_timer) update_watchface();
}

/**
 * Determines the next scheduled occurrence of a reminder slot.
 *
 * @param slot Reminder slot containing the target hour and minute.
 * @param now Current local time used to calculate the next occurrence.
 * @returns The next scheduled local date and time for the slot.
 */
static time_t next_local_time(ReminderSlot *slot, time_t now) {
  struct tm candidate = *localtime(&now);
  candidate.tm_hour = slot->hour;
  candidate.tm_min = slot->minute;
  candidate.tm_sec = 0;
  time_t result = mktime(&candidate);
  if (result - now < 60) {
    candidate.tm_mday += 1;
    result = mktime(&candidate);
  }
  return result;
}

static int32_t last_event_home_day(uint8_t slot_id, const TimezoneSettings *home) {
  for (uint16_t index = s_state.event_count; index > 0; index--) {
    ReminderEvent *event = &s_state.events[index - 1];
    if (event->slot_id != slot_id) continue;
    int32_t day_key = 0;
    if (display_time_named_day_key(
      event->scheduled_at,
      home->utc_offset_minutes,
      (time_t)home->transition_at,
      home->transition_offset_minutes,
      &day_key
    )) return day_key;
  }
  return 0;
}

static bool home_day_key(time_t instant, int32_t *day_key) {
  TimezoneSettings *home = &s_display_settings.zones[0];
  if (!home->use_watch_local) {
    return display_time_named_day_key(
      instant,
      home->utc_offset_minutes,
      (time_t)home->transition_at,
      home->transition_offset_minutes,
      day_key
    );
  }
  struct tm *local = localtime(&instant);
  if (local == NULL) return false;
  *day_key = (local->tm_year + 1900) * 10000
    + (local->tm_mon + 1) * 100
    + local->tm_mday;
  return true;
}

static time_t next_time(uint8_t slot_id, ReminderSlot *slot, time_t now) {
  TimezoneSettings *home = &s_display_settings.zones[0];
  if (home->use_watch_local) return next_local_time(slot, now);
  time_t occurrence = 0;
  if (!display_time_next_named_occurrence(
    now,
    slot->hour,
    slot->minute,
    home->utc_offset_minutes,
    (time_t)home->transition_at,
    home->transition_offset_minutes,
    last_event_home_day(slot_id, home),
    &occurrence
  )) return 0;
  return occurrence;
}

/**
 * Determines whether any enabled reminder slots are scheduled within two minutes of each other.
 *
 * @param proposed Reminder slot configuration to assess.
 * @returns `true` if any enabled slots are scheduled less than two minutes apart, `false` otherwise.
 */
static bool times_too_close(ReminderSlot proposed[SLOT_COUNT]) {
  for (uint8_t left = 0; left < SLOT_COUNT; left++) {
    if (!proposed[left].enabled) continue;
    int left_minutes = proposed[left].hour * 60 + proposed[left].minute;
    for (uint8_t right = left + 1; right < SLOT_COUNT; right++) {
      if (!proposed[right].enabled) continue;
      int right_minutes = proposed[right].hour * 60 + proposed[right].minute;
      int gap = abs(left_minutes - right_minutes);
      if (gap > 720) gap = 1440 - gap;
      if (gap < 2) return true;
    }
  }
  return false;
}

/**
 * Reschedules the next enabled reminder and updates its wakeup state.
 *
 * Cancels existing wakeups, recalculates each slot's next scheduled time, and
 * persists the updated scheduling state. Sets the scheduling error flag when
 * the next wakeup cannot be scheduled.
 */
static void schedule_next(void) {
  time_t now = time(NULL);
  int8_t earliest = -1;
  time_t earliest_time = 0;
  s_schedule_error = false;
  wakeup_cancel_all();
  for (uint8_t i = 0; i < SLOT_COUNT; i++) {
    ReminderSlot *slot = &s_state.slots[i];
    slot->wakeup_id = -1;
    slot->scheduled_at = slot->enabled ? next_time(i, slot, now) : 0;
    if (slot->enabled && !slot->scheduled_at) s_schedule_error = true;
    if (slot->enabled && (earliest < 0 || slot->scheduled_at < earliest_time)) {
      earliest = i;
      earliest_time = slot->scheduled_at;
    }
  }
  if (earliest >= 0) {
    WakeupId id = wakeup_schedule(earliest_time, earliest, true);
    if (id >= 0) {
      s_state.slots[earliest].wakeup_id = id;
    } else {
      s_schedule_error = true;
      APP_LOG(APP_LOG_LEVEL_ERROR, "Wakeup schedule failed: %ld", (long)id);
    }
  }
  (void)save_state();
}

/**
 * Records a reminder event unless an event with the same slot and scheduled time already exists.
 *
 * @param slot_id Identifier of the reminder slot.
 * @param scheduled_at Scheduled date and time of the reminder.
 * @returns The existing or newly assigned event sequence number.
 */
static uint32_t add_event(uint8_t slot_id, time_t scheduled_at) {
  int32_t scheduled_day = 0;
  bool scheduled_day_valid = home_day_key(scheduled_at, &scheduled_day);
  for (uint16_t i = 0; i < s_state.event_count; i++) {
    ReminderEvent *event = &s_state.events[i];
    if (event->slot_id != slot_id) continue;
    if (event->scheduled_at == scheduled_at) return event->sequence;
    int32_t event_day = 0;
    if (
      scheduled_day_valid
      && home_day_key(event->scheduled_at, &event_day)
      && event_day == scheduled_day
    ) return event->sequence;
  }
  if (s_state.event_count == EVENT_LIMIT) {
    memmove(
      &s_state.events[0],
      &s_state.events[1],
      sizeof(ReminderEvent) * (EVENT_LIMIT - 1)
    );
    s_state.event_count--;
    s_state.dropped_events++;
  }
  ReminderEvent *event = &s_state.events[s_state.event_count];
  memset(event, 0, sizeof(*event));
  event->sequence = s_state.next_sequence++;
  event->slot_id = slot_id;
  event->scheduled_at = scheduled_at;
  event->outcome = OUTCOME_NO_RESPONSE;
  s_state.event_count++;
  (void)save_state();
  return event->sequence;
}

/**
 * Formats a reminder slot's time according to the watch's clock preference.
 * @param slot Reminder slot containing the time to format.
 * @param buffer Buffer that receives the formatted time.
 * @param size Size of the output buffer in bytes.
 */
static void format_time(ReminderSlot *slot, char *buffer, size_t size) {
  if (clock_is_24h_style()) {
    snprintf(buffer, size, "%02u:%02u", slot->hour, slot->minute);
  } else {
    uint8_t hour = slot->hour % 12;
    if (hour == 0) hour = 12;
    snprintf(
      buffer,
      size,
      "%u:%02u %s",
      hour,
      slot->minute,
      slot->hour >= 12 ? "PM" : "AM"
    );
  }
}

/**
 * Updates the header layer with the current header text.
 */
static void set_header_text(void) {
  s_header_buffer ^= 1;
  snprintf(
    s_header_buffers[s_header_buffer],
    sizeof(s_header_buffers[s_header_buffer]),
    "%s",
    s_header_text
  );
  text_layer_set_text(s_header, s_header_buffers[s_header_buffer]);
}

/**
 * Applies the current footer text to the footer layer.
 */
static void set_footer_text(void) {
  s_footer_buffer ^= 1;
  snprintf(
    s_footer_buffers[s_footer_buffer],
    sizeof(s_footer_buffers[s_footer_buffer]),
    "%s",
    s_footer_text
  );
  text_layer_set_text(s_footer, s_footer_buffers[s_footer_buffer]);
}

/**
 * Updates a row's text and selection colours.
 *
 * @param index Row index to update.
 * @param selected Whether the row should use selected styling.
 * @param label Text displayed as the row label.
 * @param value Text displayed as the row value.
 */
static void set_row(uint8_t index, bool selected, const char *label, const char *value) {
  s_row_buffer[index] = (s_row_buffer[index] + 1) % 4;
  char *row = s_row_buffers[index][s_row_buffer[index]];
  snprintf(
    row,
    sizeof(s_row_buffers[index][s_row_buffer[index]]),
    "%s     %s",
    label,
    value
  );
  text_layer_set_text(s_rows[index], row);
  text_layer_set_background_color(s_rows[index], selected ? GColorOxfordBlue : GColorClear);
  text_layer_set_text_color(s_rows[index], selected ? GColorWhite : GColorBlack);
}

/**
 * Applies the three-row scrolling layout used by the reminder list.
 */
static void layout_main_rows(void) {
  for (uint8_t i = 0; i < MAIN_VISIBLE_ROWS; i++) {
    Layer *layer = text_layer_get_layer(s_rows[i]);
    GRect frame = layer_get_frame(layer);
    layer_set_frame(layer, GRect(frame.origin.x, 46 + i * 50, frame.size.w, 44));
    layer_set_hidden(layer, false);
  }
  layer_set_hidden(text_layer_get_layer(s_rows[3]), true);
}

/**
 * Restores the four-row layout used by edit, alert, and sync screens.
 */
static void layout_detail_rows(void) {
  for (uint8_t i = 0; i < SLOT_COUNT; i++) {
    Layer *layer = text_layer_get_layer(s_rows[i]);
    GRect frame = layer_get_frame(layer);
    layer_set_frame(layer, GRect(frame.origin.x, 46 + i * 38, frame.size.w, 36));
    layer_set_hidden(layer, false);
  }
}

/**
 * Clears a row and its selection styling.
 *
 * @param index Row index to clear.
 */
static void clear_row(uint8_t index) {
  text_layer_set_text(s_rows[index], "");
  text_layer_set_background_color(s_rows[index], GColorClear);
  text_layer_set_text_color(s_rows[index], GColorBlack);
}

/**
 * Builds the main-screen list from enabled reminders and an optional add item.
 *
 * @param items Buffer receiving slot identifiers or MAIN_ADD_ITEM.
 * @returns Number of items in the list.
 */
static uint8_t build_main_items(uint8_t items[SLOT_COUNT + 1]) {
  bool enabled[SLOT_COUNT];
  for (uint8_t slot = 0; slot < SLOT_COUNT; slot++) {
    enabled[slot] = s_state.slots[slot].enabled;
  }
  return reminder_navigation_build_items(enabled, items);
}

/**
 * Renders one reminder or add item in the main-screen viewport.
 *
 * @param row Visible row index.
 * @param item Slot identifier or MAIN_ADD_ITEM.
 * @param selected Whether the item is selected.
 */
static void render_main_item(uint8_t row, uint8_t item, bool selected) {
  if (item == MAIN_ADD_ITEM) {
    set_row(row, selected, "+", "ADD REMINDER");
    return;
  }

  char time_buffer[16];
  char label[16];
  format_time(&s_state.slots[item], time_buffer, sizeof(time_buffer));
  snprintf(label, sizeof(label), "Pill %u", item + 1);
  set_row(row, selected, label, time_buffer);
}

static void show_main(const char *note);
static void show_home(void);
static void show_timezones(void);

/**
 * Applies selection styling to the visible rows for the current screen.
 */
static void refresh_selection(void) {
  if (s_screen == SCREEN_MAIN) {
    show_main(NULL);
    return;
  }
  for (uint8_t i = 0; i < SLOT_COUNT; i++) {
    bool selected = false;
    if (s_screen == SCREEN_EDIT) selected = i == s_edit_field;
    else if (s_screen == SCREEN_ALERT) selected = i == 1;
    text_layer_set_background_color(s_rows[i], selected ? GColorOxfordBlue : GColorClear);
    text_layer_set_text_color(s_rows[i], selected ? GColorWhite : GColorBlack);
    layer_mark_dirty(text_layer_get_layer(s_rows[i]));
  }
}

/**
 * Displays the reminder slots and an appropriate status message on the main screen.
 *
 * @param note Optional status message to display when storage and scheduling are operating normally.
 */
static void show_main(const char *note) {
  s_screen = SCREEN_MAIN;
  show_reminder_layers();
  layout_main_rows();
  snprintf(s_header_text, sizeof(s_header_text), "Pill Reminders");
  set_header_text();

  uint8_t items[SLOT_COUNT + 1];
  uint8_t item_count = build_main_items(items);
  if (s_main_selection >= item_count) s_main_selection = item_count - 1;
  if (item_count <= MAIN_VISIBLE_ROWS) {
    s_main_scroll_offset = 0;
  } else if (s_main_selection < s_main_scroll_offset) {
    s_main_scroll_offset = s_main_selection;
  } else if (s_main_selection >= s_main_scroll_offset + MAIN_VISIBLE_ROWS) {
    s_main_scroll_offset = s_main_selection - MAIN_VISIBLE_ROWS + 1;
  }

  for (uint8_t row = 0; row < MAIN_VISIBLE_ROWS; row++) clear_row(row);
  bool pin_add_to_bottom = item_count <= MAIN_VISIBLE_ROWS
    && items[item_count - 1] == MAIN_ADD_ITEM;
  uint8_t reminder_count = pin_add_to_bottom ? item_count - 1 : item_count;
  for (uint8_t row = 0; row < MAIN_VISIBLE_ROWS; row++) {
    uint8_t item_index = s_main_scroll_offset + row;
    if (item_index >= reminder_count) break;
    render_main_item(row, items[item_index], item_index == s_main_selection);
  }
  if (pin_add_to_bottom) {
    render_main_item(
      MAIN_VISIBLE_ROWS - 1,
      MAIN_ADD_ITEM,
      s_main_selection == item_count - 1
    );
  }
  snprintf(
    s_footer_text,
    sizeof(s_footer_text),
    "%s",
    s_storage_error
      ? "Storage save failed"
      : note ? note : s_schedule_error ? "Alarm schedule failed" : "Hold Down edit | Hold Up back"
  );
  set_footer_text();
}

static void show_home(void) {
  s_screen = SCREEN_HOME;
  show_reminder_layers();
  layout_main_rows();
  snprintf(s_header_text, sizeof(s_header_text), "Configuration");
  set_header_text();
  set_row(0, s_home_selection == 0, "1", "REMINDERS");
  set_row(1, s_home_selection == 1, "2", "TIMEZONES");
  set_row(2, s_home_selection == 2, "3", "PHONE REPORT");
  snprintf(s_footer_text, sizeof(s_footer_text), "Hold Down enter | Hold Up exit");
  set_footer_text();
}

static uint8_t build_timezone_items(uint8_t items[TIMEZONE_COUNT]) {
  uint8_t count = 0;
  for (uint8_t index = 0; index < TIMEZONE_COUNT; index++) {
    if (s_display_settings.zones[index].enabled) items[count++] = index;
  }
  return count;
}

static uint8_t selected_timezone_item(void) {
  uint8_t items[TIMEZONE_COUNT];
  uint8_t count = build_timezone_items(items);
  if (s_timezone_selection >= count) s_timezone_selection = count - 1;
  return items[s_timezone_selection];
}

static void show_timezones(void) {
  s_screen = SCREEN_TIMEZONES;
  show_reminder_layers();
  layout_main_rows();
  snprintf(s_header_text, sizeof(s_header_text), "Timezones");
  set_header_text();
  uint8_t items[TIMEZONE_COUNT];
  uint8_t count = build_timezone_items(items);
  if (s_timezone_selection >= count) s_timezone_selection = count - 1;
  if (count <= MAIN_VISIBLE_ROWS) {
    s_timezone_scroll_offset = 0;
  } else if (s_timezone_selection < s_timezone_scroll_offset) {
    s_timezone_scroll_offset = s_timezone_selection;
  } else if (s_timezone_selection >= s_timezone_scroll_offset + MAIN_VISIBLE_ROWS) {
    s_timezone_scroll_offset = s_timezone_selection - MAIN_VISIBLE_ROWS + 1;
  }
  for (uint8_t row = 0; row < MAIN_VISIBLE_ROWS; row++) {
    clear_row(row);
    uint8_t item_index = s_timezone_scroll_offset + row;
    if (item_index >= count) continue;
    uint8_t zone_index = items[item_index];
    set_row(
      row,
      item_index == s_timezone_selection,
      s_display_settings.zones[zone_index].label,
      zone_index == 0 ? "HOME" : "DISPLAY"
    );
  }
  snprintf(s_footer_text, sizeof(s_footer_text), "Hold Down show | Hold Up back");
  set_footer_text();
}

/**
 * Displays the reminder slot editing screen.
 */
static void show_edit(void) {
  s_screen = SCREEN_EDIT;
  show_reminder_layers();
  layout_detail_rows();
  snprintf(s_header_text, sizeof(s_header_text), "Edit Pill %u", s_selected_slot + 1);
  set_header_text();
  char value[20];
  set_row(0, s_edit_field == 0, "Enabled", s_edit_slot.enabled ? "ON" : "OFF");
  snprintf(value, sizeof(value), "%02u", s_edit_slot.hour);
  set_row(1, s_edit_field == 1, "Hour", value);
  snprintf(value, sizeof(value), "%02u", s_edit_slot.minute);
  set_row(2, s_edit_field == 2, "Minute", value);
  set_row(3, s_edit_field == 3, "Save", "HOLD DOWN");
  snprintf(
    s_footer_text,
    sizeof(s_footer_text),
    "%s",
    s_edit_value_mode
      ? "Up/Down value | Hold Down done"
      : "Up/Down field | Hold Down choose"
  );
  set_footer_text();
}

/**
 * Displays the acknowledgement-only alert screen for a reminder slot.
 *
 * @param slot_id Index of the reminder slot to display.
 */
static void show_alert(uint8_t slot_id) {
  s_screen = SCREEN_ALERT;
  show_reminder_layers();
  layout_detail_rows();
  char time_buffer[16];
  format_time(&s_state.slots[slot_id], time_buffer, sizeof(time_buffer));
  snprintf(s_header_text, sizeof(s_header_text), "TAKE PILL %u", slot_id + 1);
  set_header_text();
  set_row(0, false, "Time", time_buffer);
  set_row(1, true, "UP", "ACKNOWLEDGE");
  set_row(2, false, "DOWN", "DISMISS");
  clear_row(3);
  snprintf(s_footer_text, sizeof(s_footer_text), "Up Taken | Down dismiss");
  set_footer_text();
}

/**
 * Stops the active reminder timer and any queued vibration.
 */
static void stop_alert_buzz(void) {
  if (s_alert_timer) {
    app_timer_cancel(s_alert_timer);
    s_alert_timer = NULL;
  }
  s_alert_ends_at = 0;
  vibes_cancel();
}

/**
 * Vibrates with the reminder alert pattern.
 */
static void buzz_alert(void) {
  static const uint32_t segments[] = {250, 120, 250, 120, 700};
  VibePattern pattern = {.durations = segments, .num_segments = ARRAY_LENGTH(segments)};
  vibes_enqueue_custom_pattern(pattern);
}

/**
 * Repeats the alert vibration until the five-minute reminder window ends.
 *
 * @param context Timer context, unused.
 */
static void alert_timer_callback(void *context) {
  s_alert_timer = NULL;
  if (s_screen != SCREEN_ALERT || !s_active_event_sequence) {
    s_alert_ends_at = 0;
    return;
  }
  if (time(NULL) >= s_alert_ends_at) {
    s_alert_ends_at = 0;
    s_active_event_sequence = 0;
    show_watchface();
    return;
  }
  buzz_alert();
  s_alert_timer = app_timer_register(
    REMINDER_BUZZ_INTERVAL_MS,
    alert_timer_callback,
    NULL
  );
}

/**
 * Starts an immediate vibration followed by repeats for five minutes.
 */
static void start_alert_buzz(void) {
  stop_alert_buzz();
  s_alert_ends_at = time(NULL) + REMINDER_DURATION_SECONDS;
  buzz_alert();
  s_alert_timer = app_timer_register(
    REMINDER_BUZZ_INTERVAL_MS,
    alert_timer_callback,
    NULL
  );
}

/**
 * Handles a reminder wakeup by recording the event, scheduling the next reminder,
 * vibrating the watch, and displaying the reminder alert.
 *
 * @param slot_id Index of the reminder slot that triggered the wakeup.
 */
static void handle_wakeup(uint8_t slot_id) {
  if (slot_id >= SLOT_COUNT) return;
  stop_alert_buzz();
  ReminderSlot *slot = &s_state.slots[slot_id];
  s_active_event_sequence = add_event(
    slot_id,
    slot->scheduled_at ? slot->scheduled_at : time(NULL)
  );
  slot->wakeup_id = -1;
  slot->scheduled_at = 0;
  schedule_next();
  show_alert(slot_id);
  start_alert_buzz();
}

/**
 * Processes a wakeup notification for the reminder slot identified by the cookie.
 *
 * @param id Wakeup identifier, which is ignored.
 * @param cookie Reminder slot index associated with the wakeup.
 */
static void wakeup_handler(WakeupId id, int32_t cookie) {
  handle_wakeup((uint8_t)cookie);
}

/**
 * Recovers reminder events that became overdue while the app was inactive.
 *
 * @param excluded_slot Slot index to exclude from recovery.
 */
static void recover_events_except(int8_t excluded_slot) {
  time_t now = time(NULL);
  for (uint8_t i = 0; i < SLOT_COUNT; i++) {
    if (i == excluded_slot) continue;
    ReminderSlot *slot = &s_state.slots[i];
    if (slot->enabled && slot->scheduled_at && slot->scheduled_at < now) {
      add_event(i, slot->scheduled_at);
    }
  }
}

static void send_sync_item(void);
static void send_settings_snapshot(void);

/**
 * Continues synchronisation after an outgoing message is sent.
 *
 * @param iterator Message iterator associated with the sent message.
 * @param context Callback context.
 */
static void outbox_sent(DictionaryIterator *iterator, void *context) {
  if (!s_syncing) return;
  s_sync_index++;
  send_sync_item();
}

/**
 * Handles a failed phone synchronisation attempt.
 *
 * @param iterator Message data associated with the failed attempt.
 * @param reason The reason the message failed.
 * @param context Callback context.
 */
static void outbox_failed(DictionaryIterator *iterator, AppMessageResult reason, void *context) {
  s_syncing = false;
  if (s_sync_show_status) {
    snprintf(s_footer_text, sizeof(s_footer_text), "Phone unavailable");
    set_footer_text();
  }
}

/**
 * Sends a typed payload to the phone.
 * @param type Message type identifier.
 * @param payload Message payload text.
 */
static void send_payload(int32_t type, const char *payload) {
  DictionaryIterator *iterator;
  if (app_message_outbox_begin(&iterator) != APP_MSG_OK) return;
  dict_write_int32(iterator, MESSAGE_KEY_TYPE, type);
  dict_write_cstring(iterator, MESSAGE_KEY_PAYLOAD, payload);
  app_message_outbox_send();
}

static void send_settings_snapshot(void) {
  static char payload[900];
  char install_id[16];
  snprintf(install_id, sizeof(install_id), "%08lx", (unsigned long)s_state.install_id);
  snprintf(
    payload,
    sizeof(payload),
    "{\"installId\":\"%s\",\"revision\":%lu,\"droppedEvents\":%u,\"hour12\":%s,"
    "\"display\":{\"horizontal\":%u,\"vertical\":%u,\"fontSize\":%u,"
    "\"textColor\":%u,\"backgroundColor\":%u},\"zones\":["
    "{\"id\":0,\"enabled\":%s,\"label\":\"%s\",\"textColor\":%u,\"backgroundColor\":%u},"
    "{\"id\":1,\"enabled\":%s,\"label\":\"%s\",\"textColor\":%u,\"backgroundColor\":%u},"
    "{\"id\":2,\"enabled\":%s,\"label\":\"%s\",\"textColor\":%u,\"backgroundColor\":%u},"
    "{\"id\":3,\"enabled\":%s,\"label\":\"%s\",\"textColor\":%u,\"backgroundColor\":%u}],\"slots\":["
    "{\"id\":0,\"hour\":%u,\"minute\":%u,\"enabled\":%s},"
    "{\"id\":1,\"hour\":%u,\"minute\":%u,\"enabled\":%s},"
    "{\"id\":2,\"hour\":%u,\"minute\":%u,\"enabled\":%s},"
    "{\"id\":3,\"hour\":%u,\"minute\":%u,\"enabled\":%s}]}",
    install_id,
    (unsigned long)s_state.settings_revision,
    s_state.dropped_events,
    clock_is_24h_style() ? "false" : "true",
    s_display_settings.horizontal_alignment,
    s_display_settings.vertical_alignment,
    s_display_settings.font_size,
    s_display_settings.text_color,
    s_display_settings.background_color,
    s_display_settings.zones[0].enabled ? "true" : "false",
    s_display_settings.zones[0].label,
    s_display_settings.zones[0].text_color,
    s_display_settings.zones[0].background_color,
    s_display_settings.zones[1].enabled ? "true" : "false",
    s_display_settings.zones[1].label,
    s_display_settings.zones[1].text_color,
    s_display_settings.zones[1].background_color,
    s_display_settings.zones[2].enabled ? "true" : "false",
    s_display_settings.zones[2].label,
    s_display_settings.zones[2].text_color,
    s_display_settings.zones[2].background_color,
    s_display_settings.zones[3].enabled ? "true" : "false",
    s_display_settings.zones[3].label,
    s_display_settings.zones[3].text_color,
    s_display_settings.zones[3].background_color,
    s_state.slots[0].hour, s_state.slots[0].minute, s_state.slots[0].enabled ? "true" : "false",
    s_state.slots[1].hour, s_state.slots[1].minute, s_state.slots[1].enabled ? "true" : "false",
    s_state.slots[2].hour, s_state.slots[2].minute, s_state.slots[2].enabled ? "true" : "false",
    s_state.slots[3].hour, s_state.slots[3].minute, s_state.slots[3].enabled ? "true" : "false"
  );
  send_payload(5, payload);
}

/**
 * Sends the next configuration, event, or completion payload for the active synchronisation.
 */
static void send_sync_item(void) {
  static char payload[500];
  char install_id[16];
  snprintf(install_id, sizeof(install_id), "%08lx", (unsigned long)s_state.install_id);
  if (s_sync_index == 0) {
    send_settings_snapshot();
    return;
  }
  uint16_t event_index = s_sync_index - 1;
  if (event_index < s_state.event_count) {
    ReminderEvent *event = &s_state.events[event_index];
    struct tm *day = localtime(&event->scheduled_at);
    char answered_at[24];
    if (event->answered_at) {
      snprintf(answered_at, sizeof(answered_at), "%lld000", (long long)event->answered_at);
    } else {
      snprintf(answered_at, sizeof(answered_at), "null");
    }
    snprintf(
      payload,
      sizeof(payload),
      "{\"installId\":\"%s\",\"droppedEvents\":%u,\"events\":[{"
      "\"installId\":\"%s\",\"sequence\":%lu,\"slotId\":%u,"
      "\"scheduledAt\":%lld000,\"localDay\":\"%04d-%02d-%02d\","
      "\"timezoneOffset\":0,\"outcome\":\"%s\",\"answeredAt\":%s}]}",
      install_id,
      s_state.dropped_events,
      install_id,
      (unsigned long)event->sequence,
      event->slot_id,
      (long long)event->scheduled_at,
      day->tm_year + 1900,
      day->tm_mon + 1,
      day->tm_mday,
      event->outcome == OUTCOME_TAKEN ? "taken" : event->outcome == OUTCOME_SKIPPED ? "skipped" : "no_response",
      answered_at
    );
    send_payload(3, payload);
    return;
  }
  if (event_index == s_state.event_count) {
    snprintf(
      payload,
      sizeof(payload),
      "{\"installId\":\"%s\",\"pendingCount\":0,\"syncedAt\":%lld000}",
      install_id,
      (long long)time(NULL)
    );
    send_payload(6, payload);
    return;
  }
  s_syncing = false;
  if (s_sync_show_status) show_home();
}

/**
 * Starts sending the reminder settings and event history to the phone.
 */
static void start_sync(bool show_status) {
  if (s_syncing) return;
  s_syncing = true;
  s_sync_show_status = show_status;
  s_sync_index = 0;
  if (!show_status) {
    send_sync_item();
    return;
  }
  s_screen = SCREEN_SYNC;
  show_reminder_layers();
  layout_detail_rows();
  snprintf(s_header_text, sizeof(s_header_text), "Pill Reminder");
  set_header_text();
  set_row(0, false, "Phone", "REPORT");
  set_row(1, false, "Status", "SENDING");
  set_row(2, false, "History", "RESEND ALL");
  set_row(3, false, "Exit", "HOLD UP");
  snprintf(s_footer_text, sizeof(s_footer_text), "Sending | Hold Up exit");
  set_footer_text();
  send_sync_item();
}

static bool read_timezone_settings(
  DictionaryIterator *iterator,
  DisplaySettings *settings
) {
  const uint32_t enabled_keys[TIMEZONE_COUNT] = {
    MESSAGE_KEY_TZ_0_ENABLED, MESSAGE_KEY_TZ_1_ENABLED,
    MESSAGE_KEY_TZ_2_ENABLED, MESSAGE_KEY_TZ_3_ENABLED,
  };
  const uint32_t label_keys[TIMEZONE_COUNT] = {
    MESSAGE_KEY_TZ_0_LABEL, MESSAGE_KEY_TZ_1_LABEL,
    MESSAGE_KEY_TZ_2_LABEL, MESSAGE_KEY_TZ_3_LABEL,
  };
  const uint32_t text_color_keys[TIMEZONE_COUNT] = {
    MESSAGE_KEY_TZ_0_TEXT_COLOR, MESSAGE_KEY_TZ_1_TEXT_COLOR,
    MESSAGE_KEY_TZ_2_TEXT_COLOR, MESSAGE_KEY_TZ_3_TEXT_COLOR,
  };
  const uint32_t background_color_keys[TIMEZONE_COUNT] = {
    MESSAGE_KEY_TZ_0_BACKGROUND_COLOR, MESSAGE_KEY_TZ_1_BACKGROUND_COLOR,
    MESSAGE_KEY_TZ_2_BACKGROUND_COLOR, MESSAGE_KEY_TZ_3_BACKGROUND_COLOR,
  };
  const uint32_t offset_keys[TIMEZONE_COUNT] = {
    MESSAGE_KEY_TZ_0_UTC_OFFSET_MINUTES, MESSAGE_KEY_TZ_1_UTC_OFFSET_MINUTES,
    MESSAGE_KEY_TZ_2_UTC_OFFSET_MINUTES, MESSAGE_KEY_TZ_3_UTC_OFFSET_MINUTES,
  };
  const uint32_t transition_at_keys[TIMEZONE_COUNT] = {
    MESSAGE_KEY_TZ_0_TRANSITION_AT, MESSAGE_KEY_TZ_1_TRANSITION_AT,
    MESSAGE_KEY_TZ_2_TRANSITION_AT, MESSAGE_KEY_TZ_3_TRANSITION_AT,
  };
  const uint32_t transition_offset_keys[TIMEZONE_COUNT] = {
    MESSAGE_KEY_TZ_0_TRANSITION_OFFSET_MINUTES,
    MESSAGE_KEY_TZ_1_TRANSITION_OFFSET_MINUTES,
    MESSAGE_KEY_TZ_2_TRANSITION_OFFSET_MINUTES,
    MESSAGE_KEY_TZ_3_TRANSITION_OFFSET_MINUTES,
  };

  for (uint8_t index = 0; index < TIMEZONE_COUNT; index++) {
    Tuple *enabled = dict_find(iterator, enabled_keys[index]);
    Tuple *label = dict_find(iterator, label_keys[index]);
    Tuple *text_color = dict_find(iterator, text_color_keys[index]);
    Tuple *background_color = dict_find(iterator, background_color_keys[index]);
    Tuple *offset = dict_find(iterator, offset_keys[index]);
    Tuple *transition_at = dict_find(iterator, transition_at_keys[index]);
    Tuple *transition_offset = dict_find(iterator, transition_offset_keys[index]);
    if (
      !enabled || enabled->value->int32 < 0 || enabled->value->int32 > 1
      || (index == 0 && enabled->value->int32 != 1)
      || !label || label->type != TUPLE_CSTRING
      || strlen(label->value->cstring) > TIMEZONE_LABEL_LENGTH
      || !text_color || text_color->value->int32 < 0 || text_color->value->int32 > 9
      || !background_color || background_color->value->int32 < 0
      || background_color->value->int32 > 9
      || !offset || offset->value->int32 < DISPLAY_TIME_MIN_OFFSET_MINUTES
      || offset->value->int32 > DISPLAY_TIME_MAX_OFFSET_MINUTES
      || offset->value->int32 % DISPLAY_TIME_OFFSET_STEP_MINUTES != 0
      || !transition_at || transition_at->value->int32 < 0
      || !transition_offset
      || transition_offset->value->int32 < DISPLAY_TIME_MIN_OFFSET_MINUTES
      || transition_offset->value->int32 > DISPLAY_TIME_MAX_OFFSET_MINUTES
      || transition_offset->value->int32 % DISPLAY_TIME_OFFSET_STEP_MINUTES != 0
    ) return false;
    char proposed_label[TIMEZONE_LABEL_LENGTH + 1];
    snprintf(proposed_label, sizeof(proposed_label), "%s", label->value->cstring);
    if (!timezone_label_valid(proposed_label)) return false;
    TimezoneSettings *zone = &settings->zones[index];
    zone->enabled = (uint8_t)enabled->value->int32;
    zone->use_watch_local = 0;
    zone->text_color = (uint8_t)text_color->value->int32;
    zone->background_color = (uint8_t)background_color->value->int32;
    zone->utc_offset_minutes = (int16_t)offset->value->int32;
    zone->transition_at = transition_at->value->int32;
    zone->transition_offset_minutes = (int16_t)transition_offset->value->int32;
    snprintf(zone->label, sizeof(zone->label), "%s", proposed_label);
  }
  settings->text_color = settings->zones[0].text_color;
  settings->background_color = settings->zones[0].background_color;
  return true;
}

/**
 * Handles incoming phone messages that request synchronisation.
 * @param iterator Dictionary containing the received message.
 * @param context Callback context, unused.
 */
static void inbox_received(DictionaryIterator *iterator, void *context) {
  Tuple *type = dict_find(iterator, MESSAGE_KEY_TYPE);
  if (!type) return;
  if (type->value->int32 == 7) {
    start_sync(false);
    return;
  }
  if (type->value->int32 == 9) {
    DisplaySettings proposed_display = s_display_settings;
    if (!read_timezone_settings(iterator, &proposed_display)) return;
    s_display_settings = proposed_display;
    save_display_settings();
    if (s_screen == SCREEN_WATCHFACE && !s_timezone_feedback_timer) {
      update_watchface();
    }
    return;
  }
  if (type->value->int32 != 8) return;

  DisplaySettings proposed_display = s_display_settings;
  if (!read_timezone_settings(iterator, &proposed_display)) {
    send_settings_snapshot();
    return;
  }

  const uint32_t display_keys[] = {
    MESSAGE_KEY_H_ALIGN,
    MESSAGE_KEY_V_ALIGN,
    MESSAGE_KEY_FONT_SIZE,
    MESSAGE_KEY_TEXT_COLOR,
    MESSAGE_KEY_BACKGROUND_COLOR,
  };
  const int32_t display_maximums[] = {2, 2, 2, 9, 9};
  int32_t display_values[ARRAY_LENGTH(display_keys)];
  for (uint8_t index = 0; index < ARRAY_LENGTH(display_keys); index++) {
    Tuple *value = dict_find(iterator, display_keys[index]);
    if (!value || value->value->int32 < 0 || value->value->int32 > display_maximums[index]) {
      send_settings_snapshot();
      return;
    }
    display_values[index] = value->value->int32;
  }
  const uint32_t hour_keys[SLOT_COUNT] = {
    MESSAGE_KEY_SLOT_0_HOUR, MESSAGE_KEY_SLOT_1_HOUR,
    MESSAGE_KEY_SLOT_2_HOUR, MESSAGE_KEY_SLOT_3_HOUR,
  };
  const uint32_t minute_keys[SLOT_COUNT] = {
    MESSAGE_KEY_SLOT_0_MINUTE, MESSAGE_KEY_SLOT_1_MINUTE,
    MESSAGE_KEY_SLOT_2_MINUTE, MESSAGE_KEY_SLOT_3_MINUTE,
  };
  const uint32_t enabled_keys[SLOT_COUNT] = {
    MESSAGE_KEY_SLOT_0_ENABLED, MESSAGE_KEY_SLOT_1_ENABLED,
    MESSAGE_KEY_SLOT_2_ENABLED, MESSAGE_KEY_SLOT_3_ENABLED,
  };
  ReminderSlot proposed[SLOT_COUNT];
  memcpy(proposed, s_state.slots, sizeof(proposed));
  for (uint8_t index = 0; index < SLOT_COUNT; index++) {
    Tuple *hour = dict_find(iterator, hour_keys[index]);
    Tuple *minute = dict_find(iterator, minute_keys[index]);
    Tuple *enabled = dict_find(iterator, enabled_keys[index]);
    if (
      !hour || !minute || !enabled
      || hour->value->int32 < 0 || hour->value->int32 > 23
      || minute->value->int32 < 0 || minute->value->int32 > 59
      || enabled->value->int32 < 0 || enabled->value->int32 > 1
    ) {
      send_settings_snapshot();
      return;
    }
    proposed[index].hour = (uint8_t)hour->value->int32;
    proposed[index].minute = (uint8_t)minute->value->int32;
    proposed[index].enabled = enabled->value->int32 == 1;
  }
  if (times_too_close(proposed)) {
    send_settings_snapshot();
    return;
  }

  memcpy(s_state.slots, proposed, sizeof(s_state.slots));
  proposed_display.horizontal_alignment = (uint8_t)display_values[0];
  proposed_display.vertical_alignment = (uint8_t)display_values[1];
  proposed_display.font_size = (uint8_t)display_values[2];
  proposed_display.text_color = (uint8_t)display_values[3];
  proposed_display.background_color = (uint8_t)display_values[4];
  s_display_settings = proposed_display;
  s_active_timezone = 0;
  s_state.settings_revision++;
  save_display_settings();
  schedule_next();
  if (s_screen == SCREEN_WATCHFACE) update_watchface();
  send_settings_snapshot();
}

/**
 * Records the selected outcome for the active reminder event.
 *
 * @param outcome Outcome reported for the active reminder.
 */
static void record_outcome(Outcome outcome) {
  if (!s_active_event_sequence) return;
  stop_alert_buzz();
  ReminderEvent *active_event = NULL;
  for (uint16_t i = 0; i < s_state.event_count; i++) {
    if (s_state.events[i].sequence == s_active_event_sequence) {
      active_event = &s_state.events[i];
      break;
    }
  }
  if (!active_event) {
    s_active_event_sequence = 0;
    show_watchface();
    return;
  }
  active_event->outcome = outcome;
  active_event->answered_at = time(NULL);
  (void)save_state();
  s_active_event_sequence = 0;
  show_watchface();
}

static void handle_alert_button(ReminderAlertButton button) {
  ReminderAlertAction action = reminder_navigation_alert_action(button);
  if (action == REMINDER_ALERT_ACTION_TAKEN) {
    record_outcome(OUTCOME_TAKEN);
  } else if (action == REMINDER_ALERT_ACTION_DISMISS) {
    stop_alert_buzz();
    s_active_event_sequence = 0;
    show_watchface();
  }
}

static void cycle_active_timezone(int8_t direction) {
  for (uint8_t step = 0; step < TIMEZONE_COUNT; step++) {
    s_active_timezone = (s_active_timezone + TIMEZONE_COUNT + direction) % TIMEZONE_COUNT;
    if (s_display_settings.zones[s_active_timezone].enabled) {
      show_timezone_feedback();
      return;
    }
  }
}

static void open_selected_reminder(void) {
  bool enabled[SLOT_COUNT];
  for (uint8_t slot = 0; slot < SLOT_COUNT; slot++) {
    enabled[slot] = s_state.slots[slot].enabled;
  }
  ReminderNavigation navigation = {
    .screen = REMINDER_NAVIGATION_MAIN,
    .main_selection = s_main_selection,
  };
  reminder_navigation_open(&navigation, enabled);
  s_main_selection = navigation.main_selection;
  s_selected_slot = navigation.selected_slot;
  s_edit_field = navigation.edit_field;
  s_edit_value_mode = false;
  s_edit_slot = s_state.slots[s_selected_slot];
  if (navigation.enable_selected_slot) s_edit_slot.enabled = true;
  show_edit();
}

static void change_edit_value(int8_t direction) {
  if (s_edit_field == 0) {
    s_edit_slot.enabled = !s_edit_slot.enabled;
  } else if (s_edit_field == 1) {
    s_edit_slot.hour = (s_edit_slot.hour + 24 + direction) % 24;
  } else if (s_edit_field == 2) {
    s_edit_slot.minute = (s_edit_slot.minute + 60 + direction * 5) % 60;
  }
  show_edit();
}

static void save_edit(void) {
  ReminderSlot proposed[SLOT_COUNT];
  memcpy(proposed, s_state.slots, sizeof(proposed));
  proposed[s_selected_slot] = s_edit_slot;
  if (times_too_close(proposed)) {
    snprintf(s_footer_text, sizeof(s_footer_text), "Need 2 minute gap");
    set_footer_text();
    return;
  }
  s_state.slots[s_selected_slot] = s_edit_slot;
  s_state.settings_revision++;
  schedule_next();
  show_main(s_schedule_error ? "Saved; alarm failed" : "Saved");
}

/**
 * Moves the current selection to the previous slot or edit field.
 */
static void up_click(ClickRecognizerRef recognizer, void *context) {
  if (s_screen == SCREEN_ALERT) {
    handle_alert_button(REMINDER_ALERT_BUTTON_UP);
  } else if (s_screen == SCREEN_WATCHFACE) {
    cycle_active_timezone(-1);
  } else if (s_screen == SCREEN_HOME) {
    s_home_selection = (s_home_selection + 2) % 3;
    show_home();
  } else if (s_screen == SCREEN_MAIN) {
    uint8_t items[SLOT_COUNT + 1];
    uint8_t item_count = build_main_items(items);
    s_main_selection = (s_main_selection + item_count - 1) % item_count;
    refresh_selection();
  } else if (s_screen == SCREEN_EDIT) {
    if (s_edit_value_mode) change_edit_value(1);
    else {
      s_edit_field = (s_edit_field + 3) % 4;
      refresh_selection();
    }
  } else if (s_screen == SCREEN_TIMEZONES) {
    uint8_t items[TIMEZONE_COUNT];
    uint8_t item_count = build_timezone_items(items);
    s_timezone_selection = (s_timezone_selection + item_count - 1) % item_count;
    show_timezones();
  }
}

/**
 * Handles a DOWN button press for the active screen.
 *
 * @param recognizer Button press recogniser.
 * @param context Callback context.
 */
static void down_click(ClickRecognizerRef recognizer, void *context) {
  if (s_screen == SCREEN_ALERT) {
    handle_alert_button(REMINDER_ALERT_BUTTON_DOWN);
  } else if (s_screen == SCREEN_WATCHFACE) {
    cycle_active_timezone(1);
  } else if (s_screen == SCREEN_HOME) {
    s_home_selection = (s_home_selection + 1) % 3;
    show_home();
  } else if (s_screen == SCREEN_MAIN) {
    uint8_t items[SLOT_COUNT + 1];
    uint8_t item_count = build_main_items(items);
    s_main_selection = (s_main_selection + 1) % item_count;
    refresh_selection();
  } else if (s_screen == SCREEN_EDIT) {
    if (s_edit_value_mode) change_edit_value(-1);
    else {
      s_edit_field = (s_edit_field + 1) % 4;
      refresh_selection();
    }
  } else if (s_screen == SCREEN_TIMEZONES) {
    uint8_t items[TIMEZONE_COUNT];
    uint8_t item_count = build_timezone_items(items);
    s_timezone_selection = (s_timezone_selection + 1) % item_count;
    show_timezones();
  }
}

static void up_long_click(ClickRecognizerRef recognizer, void *context) {
  if (s_screen == SCREEN_ALERT || s_screen == SCREEN_WATCHFACE) return;
  if (s_screen == SCREEN_EDIT) {
    s_edit_value_mode = false;
    show_main("Edit cancelled");
  } else if (s_screen == SCREEN_HOME) {
    show_watchface();
  } else if (s_screen == SCREEN_SYNC) {
    s_syncing = false;
    show_home();
  } else {
    show_home();
  }
}

static void down_long_click(ClickRecognizerRef recognizer, void *context) {
  if (s_screen == SCREEN_ALERT) return;
  if (s_screen == SCREEN_WATCHFACE) {
    show_home();
  } else if (s_screen == SCREEN_HOME) {
    if (s_home_selection == 0) show_main(NULL);
    else if (s_home_selection == 1) show_timezones();
    else start_sync(true);
  } else if (s_screen == SCREEN_MAIN) {
    open_selected_reminder();
  } else if (s_screen == SCREEN_TIMEZONES) {
    s_active_timezone = selected_timezone_item();
    show_watchface();
    show_timezone_feedback();
  } else if (s_screen == SCREEN_EDIT) {
    if (s_edit_value_mode) {
      s_edit_value_mode = false;
      show_edit();
    } else if (s_edit_field == 3) {
      save_edit();
    } else {
      s_edit_value_mode = true;
      show_edit();
    }
  }
}

/**
 * Registers button handlers for single- and long-press interactions.
 */
static void click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_UP, up_click);
  window_single_click_subscribe(BUTTON_ID_DOWN, down_click);
  window_long_click_subscribe(BUTTON_ID_UP, 700, up_long_click, NULL);
  window_long_click_subscribe(BUTTON_ID_DOWN, 700, down_long_click, NULL);
}

/**
 * Creates a text layer with the specified frame, font, alignment, and default colours.
 * @param frame The layer's frame.
 * @param font The font used to render text.
 * @param alignment The text alignment.
 * @returns The configured text layer.
 */
static TextLayer *make_text_layer(GRect frame, GFont font, GTextAlignment alignment) {
  TextLayer *layer = text_layer_create(frame);
  text_layer_set_background_color(layer, GColorClear);
  text_layer_set_text_color(layer, GColorBlack);
  text_layer_set_font(layer, font);
  text_layer_set_text_alignment(layer, alignment);
  return layer;
}

/**
 * Initialises application state, UI layers, event handlers, and wakeup processing.
 *
 * Restores persisted data, creates the main window, registers AppMessage and wakeup
 * callbacks, and handles either the wakeup that launched the app or normal startup.
 */
static void init(void) {
  load_state();
  load_display_settings();

  WakeupId launch_wakeup_id;
  int32_t launch_cookie;
  bool launched_by_wakeup = wakeup_get_launch_event(&launch_wakeup_id, &launch_cookie);

  s_window = window_create();
  window_set_background_color(s_window, GColorWhite);
  window_set_click_config_provider(s_window, click_config_provider);
  Layer *root = window_get_root_layer(s_window);
  GRect bounds = layer_get_bounds(root);

  s_watchface = make_text_layer(
    GRect(6, 0, bounds.size.w - 12, bounds.size.h),
    watchface_font(),
    watchface_alignment()
  );
  layer_add_child(root, text_layer_get_layer(s_watchface));
  s_header = make_text_layer(GRect(0, 0, bounds.size.w, 40), fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD), GTextAlignmentCenter);
  text_layer_set_background_color(s_header, GColorOxfordBlue);
  text_layer_set_text_color(s_header, GColorWhite);
  layer_add_child(root, text_layer_get_layer(s_header));
  for (uint8_t i = 0; i < SLOT_COUNT; i++) {
    s_rows[i] = make_text_layer(GRect(4, 46 + i * 38, bounds.size.w - 8, 36), fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD), GTextAlignmentLeft);
    layer_add_child(root, text_layer_get_layer(s_rows[i]));
  }
  s_footer = make_text_layer(GRect(4, 196, bounds.size.w - 8, 32), fonts_get_system_font(FONT_KEY_GOTHIC_18), GTextAlignmentCenter);
  layer_add_child(root, text_layer_get_layer(s_footer));

  app_message_register_inbox_received(inbox_received);
  app_message_register_outbox_sent(outbox_sent);
  app_message_register_outbox_failed(outbox_failed);
  app_message_open(1024, 1024);
  wakeup_service_subscribe(wakeup_handler);
  tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);

  if (launched_by_wakeup && launch_cookie >= 0 && launch_cookie < SLOT_COUNT) {
    recover_events_except((int8_t)launch_cookie);
    handle_wakeup((uint8_t)launch_cookie);
  } else {
    recover_events_except(-1);
    schedule_next();
    show_watchface();
  }
  window_stack_push(s_window, true);
}

/**
 * Releases the window and text layers used by the application.
 */
static void deinit(void) {
  stop_alert_buzz();
  if (s_timezone_feedback_timer) {
    app_timer_cancel(s_timezone_feedback_timer);
    s_timezone_feedback_timer = NULL;
  }
  tick_timer_service_unsubscribe();
  for (uint8_t i = 0; i < SLOT_COUNT; i++) text_layer_destroy(s_rows[i]);
  text_layer_destroy(s_watchface);
  text_layer_destroy(s_header);
  text_layer_destroy(s_footer);
  window_destroy(s_window);
}

/**
 * Starts the application, runs its event loop, and releases resources when the loop exits.
 */
int main(void) {
  init();
  app_event_loop();
  deinit();
}
