#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <time.h>

#include "reminder_navigation.h"

#define SLOT_COUNT 4
#define TIMEZONE_COUNT 4
#define HOME_TIMEZONE 0
#define ALL_TIMEZONES_DIGITS_MASK ((1 << TIMEZONE_COUNT) - 1)
#define EVENT_LIMIT 128
#define TIMEZONE_LABEL_LENGTH 8

#define COLOR_ID_WHITE 0
#define COLOR_ID_BLACK 1
#define COLOR_ID_CHROME_YELLOW 10
#define COLOR_ID_MAX 19
/** Display settings V1-V3 only stored the first ten colour IDs. */
#define LEGACY_COLOR_ID_MAX 9

#define HOURS_PER_DAY (24)
#define MINUTES_PER_HOUR (60)
#define MINUTES_PER_DAY (HOURS_PER_DAY * MINUTES_PER_HOUR)
#define MIN_SLOT_GAP_MINUTES 2

_Static_assert(
  SLOT_COUNT == REMINDER_NAVIGATION_SLOT_COUNT,
  "Reminder navigation slot count differs from app state"
);

/** Phone message types; values must match `MessageType` in src/pkjs/index.js. */
typedef enum {
  MESSAGE_TYPE_EVENT_BATCH = 3,
  MESSAGE_TYPE_SETTINGS_SNAPSHOT = 5,
  MESSAGE_TYPE_SYNC_DONE = 6,
  MESSAGE_TYPE_REQUEST_SYNC = 7,
  MESSAGE_TYPE_SETTINGS_UPDATE = 8,
  MESSAGE_TYPE_TIMEZONE_UPDATE = 9
} MessageType;

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

#define FONT_SIZE_COUNT (FONT_LARGE + 1)

/* Persisted layouts below must not change without a version bump. */

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
  int32_t wakeup_id; /* Pebble WakeupId */
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
