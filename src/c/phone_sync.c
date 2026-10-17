#include <pebble.h>

#include "phone_sync.h"

#include "display_settings.h"
#include "display_time.h"
#include "persist_state.h"
#include "scheduler.h"
#include "ui.h"

#include <string.h>

extern uint32_t MESSAGE_KEY_TYPE;
extern uint32_t MESSAGE_KEY_PAYLOAD;
extern uint32_t MESSAGE_KEY_H_ALIGN;
extern uint32_t MESSAGE_KEY_V_ALIGN;
extern uint32_t MESSAGE_KEY_FONT_SIZE;
extern uint32_t MESSAGE_KEY_USE_DIGITS;
extern uint32_t MESSAGE_KEY_TZ_DIGITS_MASK;
extern uint32_t MESSAGE_KEY_TEXT_COLOR;
extern uint32_t MESSAGE_KEY_BACKGROUND_COLOR;
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

#define DAY_KEY_YEAR 10000
#define DAY_KEY_MONTH 100
#define FINGERPRINT_PRIME 65599u

static struct {
  bool running;
  bool restart;
  bool show_status;
  uint16_t index;
  char payload[PHONE_SYNC_PAYLOAD_CAPACITY];
} s_sync;

/* ---- Tuple decoding ---------------------------------------------------- */

bool tuple_int(const Tuple *tuple, int32_t *value) {
  if (tuple == NULL || value == NULL) return false;
  if (tuple->type == TUPLE_INT) {
    switch (tuple->length) {
      case 1: *value = tuple->value->int8; return true;
      case 2: *value = tuple->value->int16; return true;
      case 4: *value = tuple->value->int32; return true;
      default: return false;
    }
  }
  if (tuple->type == TUPLE_UINT) {
    switch (tuple->length) {
      case 1: *value = tuple->value->uint8; return true;
      case 2: *value = tuple->value->uint16; return true;
      case 4:
        if (tuple->value->uint32 > (uint32_t)INT32_MAX) return false;
        *value = (int32_t)tuple->value->uint32;
        return true;
      default: return false;
    }
  }
  return false;
}

bool tuple_label(const Tuple *tuple, char label[TIMEZONE_LABEL_LENGTH + 1]) {
  if (
    tuple == NULL
    || tuple->type != TUPLE_CSTRING
    || tuple->length == 0
    || tuple->value->cstring[tuple->length - 1] != '\0'
  ) return false;
  return timezone_label_copy(label, tuple->value->cstring, tuple->length);
}

static bool find_int(
  const DictionaryIterator *iterator,
  uint32_t key,
  int32_t minimum,
  int32_t maximum,
  int32_t *value
) {
  int32_t found = 0;
  if (!tuple_int(dict_find(iterator, key), &found) || found < minimum || found > maximum) {
    return false;
  }
  *value = found;
  return true;
}

static bool find_offset(const DictionaryIterator *iterator, uint32_t key, int16_t *offset) {
  int32_t value = 0;
  if (!tuple_int(dict_find(iterator, key), &value) || !display_time_offset_valid(value)) {
    return false;
  }
  *offset = (int16_t)value;
  return true;
}

static bool read_timezone_settings(const DictionaryIterator *iterator, DisplaySettings *settings) {
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
    MESSAGE_KEY_TZ_0_TRANSITION_OFFSET_MINUTES, MESSAGE_KEY_TZ_1_TRANSITION_OFFSET_MINUTES,
    MESSAGE_KEY_TZ_2_TRANSITION_OFFSET_MINUTES, MESSAGE_KEY_TZ_3_TRANSITION_OFFSET_MINUTES,
  };

  for (uint8_t index = 0; index < TIMEZONE_COUNT; index++) {
    TimezoneSettings zone;
    memset(&zone, 0, sizeof(zone));
    int32_t enabled = 0;
    int32_t text_color = 0;
    int32_t background_color = 0;
    int32_t transition_at = 0;
    // Home is always enabled.
    int32_t minimum_enabled = index == HOME_TIMEZONE ? 1 : 0;
    if (
      !find_int(iterator, enabled_keys[index], minimum_enabled, 1, &enabled)
      || !tuple_label(dict_find(iterator, label_keys[index]), zone.label)
      || !find_int(iterator, text_color_keys[index], 0, COLOR_ID_MAX, &text_color)
      || !find_int(iterator, background_color_keys[index], 0, COLOR_ID_MAX, &background_color)
      || !find_offset(iterator, offset_keys[index], &zone.utc_offset_minutes)
      || !find_int(iterator, transition_at_keys[index], 0, INT32_MAX, &transition_at)
      || !find_offset(iterator, transition_offset_keys[index], &zone.transition_offset_minutes)
    ) return false;
    zone.enabled = (uint8_t)enabled;
    zone.use_watch_local = 0;
    zone.text_color = (uint8_t)text_color;
    zone.background_color = (uint8_t)background_color;
    zone.transition_at = transition_at;
    settings->zones[index] = zone;
  }
  settings->text_color = settings->zones[HOME_TIMEZONE].text_color;
  settings->background_color = settings->zones[HOME_TIMEZONE].background_color;
  return true;
}

/* ---- Inbox ------------------------------------------------------------- */

static void apply_timezone_update(const DictionaryIterator *iterator) {
  DisplaySettings proposed = *display_settings();
  if (!read_timezone_settings(iterator, &proposed)) return;
  *display_settings() = proposed;
  (void)display_settings_save();
  scheduler_schedule_next();
  ui_timezones_changed();
}

static bool read_slots(const DictionaryIterator *iterator, ReminderSlot proposed[SLOT_COUNT]) {
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
  for (uint8_t index = 0; index < SLOT_COUNT; index++) {
    int32_t hour = 0;
    int32_t minute = 0;
    int32_t enabled = 0;
    if (
      !find_int(iterator, hour_keys[index], 0, HOURS_PER_DAY - 1, &hour)
      || !find_int(iterator, minute_keys[index], 0, MINUTES_PER_HOUR - 1, &minute)
      || !find_int(iterator, enabled_keys[index], 0, 1, &enabled)
    ) return false;
    proposed[index].hour = (uint8_t)hour;
    proposed[index].minute = (uint8_t)minute;
    proposed[index].enabled = enabled == 1;
  }
  return !scheduler_times_too_close(proposed);
}

/** Reads the digits mask, falling back to the legacy all-or-nothing flag. */
static bool read_digits_mask(const DictionaryIterator *iterator, uint8_t *mask) {
  int32_t use_digits = 0;
  if (
    dict_find(iterator, MESSAGE_KEY_USE_DIGITS)
    && !find_int(iterator, MESSAGE_KEY_USE_DIGITS, 0, 1, &use_digits)
  ) return false;
  if (!dict_find(iterator, MESSAGE_KEY_TZ_DIGITS_MASK)) {
    *mask = use_digits == 1 ? ALL_TIMEZONES_DIGITS_MASK : 0;
    return true;
  }
  int32_t value = 0;
  if (!find_int(iterator, MESSAGE_KEY_TZ_DIGITS_MASK, 0, ALL_TIMEZONES_DIGITS_MASK, &value)) {
    return false;
  }
  *mask = (uint8_t)value;
  return true;
}

static void apply_settings_update(const DictionaryIterator *iterator) {
  DisplaySettings proposed_display = *display_settings();
  ReminderSlot proposed_slots[SLOT_COUNT];
  memcpy(proposed_slots, app_state()->slots, sizeof(proposed_slots));
  int32_t horizontal = 0;
  int32_t vertical = 0;
  int32_t font_size = 0;
  int32_t text_color = 0;
  int32_t background_color = 0;
  uint8_t digits_mask = 0;
  if (
    !read_timezone_settings(iterator, &proposed_display)
    || !find_int(iterator, MESSAGE_KEY_H_ALIGN, 0, HORIZONTAL_RIGHT, &horizontal)
    || !find_int(iterator, MESSAGE_KEY_V_ALIGN, 0, VERTICAL_BOTTOM, &vertical)
    || !find_int(iterator, MESSAGE_KEY_FONT_SIZE, 0, FONT_LARGE, &font_size)
    || !find_int(iterator, MESSAGE_KEY_TEXT_COLOR, 0, COLOR_ID_MAX, &text_color)
    || !find_int(iterator, MESSAGE_KEY_BACKGROUND_COLOR, 0, COLOR_ID_MAX, &background_color)
    || !read_digits_mask(iterator, &digits_mask)
    || !read_slots(iterator, proposed_slots)
  ) {
    // Rejected: report the unchanged watch settings back to the phone.
    phone_sync_start(false);
    return;
  }

  AppState *state = app_state();
  memcpy(state->slots, proposed_slots, sizeof(state->slots));
  proposed_display.horizontal_alignment = (uint8_t)horizontal;
  proposed_display.vertical_alignment = (uint8_t)vertical;
  proposed_display.font_size = (uint8_t)font_size;
  proposed_display.text_color = (uint8_t)text_color;
  proposed_display.background_color = (uint8_t)background_color;
  *display_settings() = proposed_display;
  display_settings_set_digits_mask(digits_mask);
  state->settings_revision++;
  if (!display_settings_save()) {
    // Keep the in-memory digit modes consistent with what survives a restart.
    display_settings_set_digits_mask(display_settings_load_digits_mask());
  }
  scheduler_schedule_next();
  ui_settings_changed();
  phone_sync_start(false);
}

void phone_sync_inbox_received(DictionaryIterator *iterator, void *context) {
  (void)context;
  int32_t type = 0;
  if (!tuple_int(dict_find(iterator, MESSAGE_KEY_TYPE), &type)) return;
  switch (type) {
    case MESSAGE_TYPE_REQUEST_SYNC:
      phone_sync_start(false);
      return;
    case MESSAGE_TYPE_TIMEZONE_UPDATE:
      apply_timezone_update(iterator);
      return;
    case MESSAGE_TYPE_SETTINGS_UPDATE:
      apply_settings_update(iterator);
      return;
    default:
      return;
  }
}

/* ---- JSON -------------------------------------------------------------- */

typedef struct {
  char *data;
  size_t size;
  size_t length;
  bool ok;
} JsonWriter;

static void json_init(JsonWriter *writer, char *buffer, size_t size) {
  writer->data = buffer;
  writer->size = size;
  writer->length = 0;
  writer->ok = buffer != NULL && size > 0;
  if (writer->ok) buffer[0] = '\0';
}

static char *json_tail(const JsonWriter *writer) {
  return writer->data + writer->length;
}

static size_t json_room(const JsonWriter *writer) {
  return writer->ok ? writer->size - writer->length : 0;
}

/** Accepts an snprintf result; any truncation fails the whole document. */
static void json_commit(JsonWriter *writer, int written) {
  if (!writer->ok) return;
  if (written < 0 || (size_t)written >= writer->size - writer->length) {
    writer->ok = false;
    writer->data[writer->length] = '\0';
    return;
  }
  writer->length += (size_t)written;
}

#define JSON_APPEND(writer, ...) \
  json_commit((writer), (writer)->ok \
    ? snprintf(json_tail(writer), json_room(writer), __VA_ARGS__) \
    : -1)

static const char *json_bool(bool value) {
  return value ? "true" : "false";
}

static uint32_t timezone_state_fingerprint(const TimezoneSettings *zone) {
  uint32_t fingerprint = (uint32_t)(zone->utc_offset_minutes - DISPLAY_TIME_MIN_OFFSET_MINUTES);
  fingerprint = fingerprint * FINGERPRINT_PRIME + (uint32_t)zone->transition_at;
  fingerprint = fingerprint * FINGERPRINT_PRIME
    + (uint32_t)(zone->transition_offset_minutes - DISPLAY_TIME_MIN_OFFSET_MINUTES);
  return fingerprint;
}

bool phone_sync_build_snapshot(char *buffer, size_t size) {
  const AppState *state = app_state();
  const DisplaySettings *display = display_settings();
  JsonWriter writer;
  json_init(&writer, buffer, size);
  JSON_APPEND(
    &writer,
    "{\"installId\":\"%08lx\",\"revision\":%lu,\"droppedEvents\":%u,\"hour12\":%s,"
    "\"display\":{\"horizontal\":%u,\"vertical\":%u,\"fontSize\":%u,\"useDigits\":%s,"
    "\"textColor\":%u,\"backgroundColor\":%u},\"zones\":[",
    (unsigned long)state->install_id,
    (unsigned long)state->settings_revision,
    (unsigned)state->dropped_events,
    json_bool(!clock_is_24h_style()),
    (unsigned)display->horizontal_alignment,
    (unsigned)display->vertical_alignment,
    (unsigned)display->font_size,
    json_bool(display_settings_zone_uses_digits(HOME_TIMEZONE)),
    (unsigned)display->text_color,
    (unsigned)display->background_color
  );
  for (uint8_t index = 0; index < TIMEZONE_COUNT; index++) {
    const TimezoneSettings *zone = &display->zones[index];
    JSON_APPEND(
      &writer,
      "%s{\"id\":%u,\"enabled\":%s,\"useDigits\":%s,\"label\":\"%.*s\","
      "\"textColor\":%u,\"backgroundColor\":%u,\"timezoneFingerprint\":%lu}",
      index == 0 ? "" : ",",
      (unsigned)index,
      json_bool(zone->enabled),
      json_bool(display_settings_zone_uses_digits(index)),
      TIMEZONE_LABEL_LENGTH,
      zone->label,
      (unsigned)zone->text_color,
      (unsigned)zone->background_color,
      (unsigned long)timezone_state_fingerprint(zone)
    );
  }
  JSON_APPEND(&writer, "],\"slots\":[");
  for (uint8_t index = 0; index < SLOT_COUNT; index++) {
    const ReminderSlot *slot = &state->slots[index];
    JSON_APPEND(
      &writer,
      "%s{\"id\":%u,\"hour\":%u,\"minute\":%u,\"enabled\":%s}",
      index == 0 ? "" : ",",
      (unsigned)index,
      (unsigned)slot->hour,
      (unsigned)slot->minute,
      json_bool(slot->enabled)
    );
  }
  JSON_APPEND(&writer, "]}");
  return writer.ok;
}

static const char *outcome_name(uint8_t outcome) {
  switch (outcome) {
    case OUTCOME_TAKEN: return "taken";
    case OUTCOME_SKIPPED: return "skipped";
    default: return "no_response";
  }
}

bool phone_sync_build_event(const ReminderEvent *event, char *buffer, size_t size) {
  const AppState *state = app_state();
  int32_t day_key = 0;
  int32_t offset_minutes = 0;
  // Group by the Home day used for scheduling and deduplication; fall back to UTC.
  if (
    !scheduler_home_day_key(event->scheduled_at, &day_key)
    || !scheduler_home_offset_minutes(event->scheduled_at, &offset_minutes)
  ) {
    offset_minutes = 0;
    if (!display_time_named_day_key(event->scheduled_at, 0, 0, 0, &day_key)) return false;
  }
  JsonWriter writer;
  json_init(&writer, buffer, size);
  JSON_APPEND(
    &writer,
    "{\"installId\":\"%08lx\",\"droppedEvents\":%u,\"events\":[{"
    "\"installId\":\"%08lx\",\"sequence\":%lu,\"slotId\":%u,"
    "\"scheduledAt\":%lld000,\"localDay\":\"%04ld-%02ld-%02ld\","
    "\"timezoneOffset\":%ld,\"outcome\":\"%s\",\"answeredAt\":",
    (unsigned long)state->install_id,
    (unsigned)state->dropped_events,
    (unsigned long)state->install_id,
    (unsigned long)event->sequence,
    (unsigned)event->slot_id,
    (long long)event->scheduled_at,
    (long)(day_key / DAY_KEY_YEAR),
    (long)(day_key / DAY_KEY_MONTH % DAY_KEY_MONTH),
    (long)(day_key % DAY_KEY_MONTH),
    (long)offset_minutes,
    outcome_name(event->outcome)
  );
  if (event->answered_at) {
    JSON_APPEND(&writer, "%lld000}]}", (long long)event->answered_at);
  } else {
    JSON_APPEND(&writer, "null}]}");
  }
  return writer.ok;
}

static bool build_done(char *buffer, size_t size) {
  JsonWriter writer;
  json_init(&writer, buffer, size);
  JSON_APPEND(
    &writer,
    "{\"installId\":\"%08lx\",\"pendingCount\":0,\"syncedAt\":%lld000}",
    (unsigned long)app_state()->install_id,
    (long long)time(NULL)
  );
  return writer.ok;
}

/* ---- Outbox state machine ---------------------------------------------- */

static void sync_failed(void) {
  s_sync.running = false;
  s_sync.restart = false;
  if (s_sync.show_status) ui_sync_status_failed();
}

void phone_sync_outbox_failed(DictionaryIterator *iterator, AppMessageResult reason, void *context) {
  (void)iterator;
  (void)context;
  APP_LOG(APP_LOG_LEVEL_WARNING, "Phone sync failed: %d", (int)reason);
  sync_failed();
}

static void send_payload(MessageType type, bool built) {
  if (!built) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Sync payload too large: type %d", (int)type);
    sync_failed();
    return;
  }
  DictionaryIterator *iterator = NULL;
  AppMessageResult result = app_message_outbox_begin(&iterator);
  if (result != APP_MSG_OK || iterator == NULL) {
    phone_sync_outbox_failed(NULL, result, NULL);
    return;
  }
  if (
    dict_write_int32(iterator, MESSAGE_KEY_TYPE, (int32_t)type) != DICT_OK
    || dict_write_cstring(iterator, MESSAGE_KEY_PAYLOAD, s_sync.payload) != DICT_OK
  ) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Sync dictionary write failed: type %d", (int)type);
    sync_failed();
    return;
  }
  result = app_message_outbox_send();
  if (result != APP_MSG_OK) phone_sync_outbox_failed(NULL, result, NULL);
}

/** Sends the snapshot, then one message per retained event, then completion. */
static void send_sync_item(void) {
  if (s_sync.restart) {
    s_sync.restart = false;
    s_sync.index = 0;
  }
  const AppState *state = app_state();
  if (s_sync.index == 0) {
    send_payload(
      MESSAGE_TYPE_SETTINGS_SNAPSHOT,
      phone_sync_build_snapshot(s_sync.payload, sizeof(s_sync.payload))
    );
    return;
  }
  uint16_t event_index = s_sync.index - 1;
  if (event_index < state->event_count) {
    send_payload(
      MESSAGE_TYPE_EVENT_BATCH,
      phone_sync_build_event(&state->events[event_index], s_sync.payload, sizeof(s_sync.payload))
    );
    return;
  }
  if (event_index == state->event_count) {
    send_payload(MESSAGE_TYPE_SYNC_DONE, build_done(s_sync.payload, sizeof(s_sync.payload)));
    return;
  }
  s_sync.running = false;
  if (s_sync.show_status) {
    s_sync.show_status = false;
    ui_sync_status_done();
  }
}

void phone_sync_outbox_sent(DictionaryIterator *iterator, void *context) {
  (void)iterator;
  (void)context;
  if (!s_sync.running) return;
  s_sync.index++;
  send_sync_item();
}

void phone_sync_start(bool show_status) {
  if (s_sync.running) {
    // Send the latest snapshot as soon as the current outbox message finishes.
    s_sync.restart = true;
    if (show_status) {
      s_sync.show_status = true;
      ui_sync_status_show();
    }
    return;
  }
  s_sync.running = true;
  s_sync.restart = false;
  s_sync.show_status = show_status;
  s_sync.index = 0;
  if (show_status) ui_sync_status_show();
  send_sync_item();
}

void phone_sync_hide_status(void) {
  s_sync.show_status = false;
}

bool phone_sync_running(void) {
  return s_sync.running;
}
