/* Minimal host stand-in for the Pebble SDK header, used by native test harnesses. */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* Match SDK time constants so macro collisions fail host compilation too. */
#define SECONDS_PER_MINUTE (60)
#define MINUTES_PER_HOUR (60)
#define HOURS_PER_DAY (24)
#define SECONDS_PER_DAY (MINUTES_PER_DAY * SECONDS_PER_MINUTE)
#define SECONDS_PER_HOUR (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)
#define MINUTES_PER_DAY (HOURS_PER_DAY * MINUTES_PER_HOUR)

#define ARRAY_LENGTH(array) (sizeof(array) / sizeof((array)[0]))

typedef enum {
  APP_LOG_LEVEL_ERROR = 1,
  APP_LOG_LEVEL_WARNING = 50,
  APP_LOG_LEVEL_INFO = 100,
  APP_LOG_LEVEL_DEBUG = 200
} AppLogLevel;

void host_app_log(AppLogLevel level, const char *format, ...)
  __attribute__((format(printf, 2, 3)));
#define APP_LOG(level, ...) host_app_log((level), __VA_ARGS__)

/* Storage */
#define PERSIST_DATA_MAX_LENGTH 256
typedef int32_t status_t;
#define S_SUCCESS 0
#define E_ERROR (-1)
#define E_DOES_NOT_EXIST (-9)
bool persist_exists(const uint32_t key);
int persist_get_size(const uint32_t key);
bool persist_read_bool(const uint32_t key);
int32_t persist_read_int(const uint32_t key);
int persist_read_data(const uint32_t key, void *buffer, const size_t buffer_size);
status_t persist_write_int(const uint32_t key, const int32_t value);
int persist_write_data(const uint32_t key, const void *data, const size_t size);

/* Wakeup */
typedef int32_t WakeupId;
WakeupId wakeup_schedule(time_t timestamp, int32_t cookie, bool notify_if_missed);
void wakeup_cancel_all(void);

/* Clock */
bool clock_is_24h_style(void);

/* AppMessage */
typedef enum {
  APP_MSG_OK = 0,
  APP_MSG_SEND_TIMEOUT = 2,
  APP_MSG_BUSY = 64,
  APP_MSG_BUFFER_OVERFLOW = 128
} AppMessageResult;

typedef enum {
  DICT_OK = 0,
  DICT_NOT_ENOUGH_STORAGE = 2
} DictionaryResult;

typedef enum {
  TUPLE_BYTE_ARRAY = 0,
  TUPLE_CSTRING = 1,
  TUPLE_UINT = 2,
  TUPLE_INT = 3
} TupleType;

#define HOST_TUPLE_DATA_SIZE 128
typedef union {
  char cstring[HOST_TUPLE_DATA_SIZE];
  uint8_t data[HOST_TUPLE_DATA_SIZE];
  uint8_t uint8;
  uint16_t uint16;
  uint32_t uint32;
  int8_t int8;
  int16_t int16;
  int32_t int32;
} TupleValue;

typedef struct {
  uint32_t key;
  TupleType type;
  uint16_t length;
  TupleValue value[1];
} Tuple;

typedef struct DictionaryIterator DictionaryIterator;
Tuple *dict_find(const DictionaryIterator *iter, const uint32_t key);
DictionaryResult dict_write_int32(DictionaryIterator *iter, const uint32_t key, const int32_t value);
DictionaryResult dict_write_cstring(DictionaryIterator *iter, const uint32_t key, const char *cstring);
AppMessageResult app_message_outbox_begin(DictionaryIterator **iterator);
AppMessageResult app_message_outbox_send(void);

/* Graphics and UI (implemented by the watchface harness only) */
typedef int GColor;
enum {
  GColorClear = -1, GColorWhite = 0, GColorBlack, GColorRed, GColorOrange, GColorYellow,
  GColorGreen, GColorCyan, GColorBlue, GColorVividViolet, GColorMagenta, GColorChromeYellow,
  GColorBrightGreen, GColorElectricBlue, GColorVividCerulean, GColorPictonBlue, GColorIndigo,
  GColorJazzberryJam, GColorFolly, GColorDarkCandyAppleRed, GColorOxfordBlue
};
typedef struct { int16_t x, y; } GPoint;
typedef struct { int16_t w, h; } GSize;
typedef struct { GPoint origin; GSize size; } GRect;
#define GRect(x, y, w, h) ((GRect){{(x), (y)}, {(w), (h)}})
typedef enum { GTextAlignmentLeft, GTextAlignmentCenter, GTextAlignmentRight } GTextAlignment;
typedef int GFont;
typedef uint32_t ResHandle;
#define FONT_KEY_GOTHIC_18 "RESOURCE_ID_GOTHIC_18"
#define FONT_KEY_GOTHIC_24_BOLD "RESOURCE_ID_GOTHIC_24_BOLD"
#define FONT_KEY_GOTHIC_28_BOLD "RESOURCE_ID_GOTHIC_28_BOLD"
#define FONT_KEY_BITHAM_42_BOLD "RESOURCE_ID_BITHAM_42_BOLD"
#define RESOURCE_ID_FONT_DIGITS_88 88
#define RESOURCE_ID_FONT_DIGITS_96 96
#define RESOURCE_ID_FONT_DIGITS_104 104

typedef struct Layer Layer;
typedef struct TextLayer TextLayer;
typedef struct Window Window;
typedef struct AppTimer AppTimer;
typedef void (*AppTimerCallback)(void *data);

GFont fonts_get_system_font(const char *font_key);
GFont fonts_load_custom_font(ResHandle handle);
void fonts_unload_custom_font(GFont font);
ResHandle resource_get_handle(uint32_t resource_id);
Layer *window_get_root_layer(const Window *window);
void window_set_background_color(Window *window, GColor color);
GRect layer_get_bounds(const Layer *layer);
void layer_set_frame(Layer *layer, GRect frame);
void layer_set_hidden(Layer *layer, bool hidden);
bool layer_get_hidden(const Layer *layer);
void layer_add_child(Layer *parent, Layer *child);
TextLayer *text_layer_create(GRect frame);
void text_layer_destroy(TextLayer *text_layer);
Layer *text_layer_get_layer(TextLayer *text_layer);
void text_layer_set_text(TextLayer *text_layer, const char *text);
void text_layer_set_font(TextLayer *text_layer, GFont font);
void text_layer_set_text_alignment(TextLayer *text_layer, GTextAlignment alignment);
void text_layer_set_text_color(TextLayer *text_layer, GColor color);
void text_layer_set_background_color(TextLayer *text_layer, GColor color);
GSize text_layer_get_content_size(TextLayer *text_layer);
AppTimer *app_timer_register(uint32_t timeout_ms, AppTimerCallback callback, void *callback_data);
void app_timer_cancel(AppTimer *timer);

/* Declarations below let ui.c and main.c compile on the host; they are not linked. */
typedef enum { BUTTON_ID_BACK, BUTTON_ID_UP, BUTTON_ID_SELECT, BUTTON_ID_DOWN } ButtonId;
typedef void *ClickRecognizerRef;
typedef void (*ClickHandler)(ClickRecognizerRef recognizer, void *context);
typedef void (*ClickConfigProvider)(void *context);
typedef enum { SECOND_UNIT = 1, MINUTE_UNIT = 2 } TimeUnits;
typedef void (*TickHandler)(struct tm *tick_time, TimeUnits units_changed);
typedef void (*WakeupHandler)(WakeupId wakeup_id, int32_t cookie);
typedef void (*AppMessageInboxReceived)(DictionaryIterator *iterator, void *context);
typedef void (*AppMessageOutboxSent)(DictionaryIterator *iterator, void *context);
typedef void (*AppMessageOutboxFailed)(DictionaryIterator *iterator, AppMessageResult reason, void *context);
typedef struct { const uint32_t *durations; uint32_t num_segments; } VibePattern;

Window *window_create(void);
void window_destroy(Window *window);
void window_set_click_config_provider(Window *window, ClickConfigProvider provider);
void window_stack_push(Window *window, bool animated);
void window_single_click_subscribe(ButtonId button_id, ClickHandler handler);
void window_long_click_subscribe(ButtonId button_id, uint16_t delay_ms, ClickHandler down, ClickHandler up);
GRect layer_get_frame(const Layer *layer);
void layer_mark_dirty(Layer *layer);
void vibes_cancel(void);
void vibes_enqueue_custom_pattern(VibePattern pattern);
void tick_timer_service_subscribe(TimeUnits tick_units, TickHandler handler);
void tick_timer_service_unsubscribe(void);
bool wakeup_get_launch_event(WakeupId *wakeup_id, int32_t *cookie);
void wakeup_service_subscribe(WakeupHandler handler);
AppMessageInboxReceived app_message_register_inbox_received(AppMessageInboxReceived callback);
AppMessageOutboxSent app_message_register_outbox_sent(AppMessageOutboxSent callback);
AppMessageOutboxFailed app_message_register_outbox_failed(AppMessageOutboxFailed callback);
AppMessageResult app_message_open(const uint32_t size_inbound, const uint32_t size_outbound);
void app_event_loop(void);
