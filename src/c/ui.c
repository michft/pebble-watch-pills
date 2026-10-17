#include <pebble.h>

#include "ui.h"

#include "app_types.h"
#include "display_settings.h"
#include "persist_state.h"
#include "phone_sync.h"
#include "reminder_navigation.h"
#include "scheduler.h"
#include "watchface.h"

#include <string.h>

#define MAIN_VISIBLE_ROWS 3
#define MAIN_ADD_ITEM REMINDER_NAVIGATION_ADD_ITEM
#define HOME_ITEM_COUNT 3
#define LONG_PRESS_MS 700
#define EDIT_MINUTE_STEP 5
#define REMINDER_DURATION_SECONDS (5 * 60)
#define REMINDER_BUZZ_INTERVAL_MS (30 * 1000)

#define HEADER_HEIGHT 40
#define ROW_TOP 46
#define ROW_SIDE_INSET 4
#define MAIN_ROW_PITCH 50
#define MAIN_ROW_HEIGHT 44
#define DETAIL_ROW_PITCH 38
#define DETAIL_ROW_HEIGHT 36
#define FOOTER_TOP 196
#define FOOTER_HEIGHT 32

#define HEADER_TEXT_SIZE 32
#define ROW_TEXT_SIZE 48
#define FOOTER_TEXT_SIZE 64

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
  HOME_ITEM_REMINDERS,
  HOME_ITEM_TIMEZONES,
  HOME_ITEM_PHONE_REPORT
} HomeItem;

typedef enum {
  EDIT_FIELD_ENABLED,
  EDIT_FIELD_HOUR,
  EDIT_FIELD_MINUTE,
  EDIT_FIELD_SAVE,
  EDIT_FIELD_COUNT
} EditField;

/** The alert screen highlights its acknowledge row. */
#define ALERT_SELECTED_ROW 1

static struct {
  Window *window;
  TextLayer *header;
  TextLayer *rows[SLOT_COUNT];
  TextLayer *footer;
  Screen screen;
  uint8_t home_selection;
  uint8_t main_selection;
  uint8_t main_scroll_offset;
  uint8_t timezone_selection;
  uint8_t timezone_scroll_offset;
  uint8_t selected_slot;
  uint8_t edit_field;
  bool edit_value_mode;
  ReminderSlot edit_slot;
  uint32_t active_event_sequence;
  AppTimer *alert_timer;
  time_t alert_ends_at;
  char header_text[HEADER_TEXT_SIZE];
  char row_text[SLOT_COUNT][ROW_TEXT_SIZE];
  char footer_text[FOOTER_TEXT_SIZE];
} s_ui = {
  .screen = SCREEN_WATCHFACE,
};

static void show_main(const char *note);
static void show_home(void);
static void show_timezones(void);

/* ---- Text helpers ------------------------------------------------------ */

static void set_header(const char *text) {
  snprintf(s_ui.header_text, sizeof(s_ui.header_text), "%s", text);
  text_layer_set_text(s_ui.header, s_ui.header_text);
  layer_mark_dirty(text_layer_get_layer(s_ui.header));
}

static void set_footer(const char *text) {
  snprintf(s_ui.footer_text, sizeof(s_ui.footer_text), "%s", text);
  text_layer_set_text(s_ui.footer, s_ui.footer_text);
  layer_mark_dirty(text_layer_get_layer(s_ui.footer));
}

static void style_row(uint8_t index, bool selected) {
  text_layer_set_background_color(s_ui.rows[index], selected ? GColorOxfordBlue : GColorClear);
  text_layer_set_text_color(s_ui.rows[index], selected ? GColorWhite : GColorBlack);
  layer_mark_dirty(text_layer_get_layer(s_ui.rows[index]));
}

static void set_row(uint8_t index, bool selected, const char *label, const char *value) {
  snprintf(s_ui.row_text[index], sizeof(s_ui.row_text[index]), "%s     %s", label, value);
  text_layer_set_text(s_ui.rows[index], s_ui.row_text[index]);
  style_row(index, selected);
}

static void clear_row(uint8_t index) {
  s_ui.row_text[index][0] = '\0';
  text_layer_set_text(s_ui.rows[index], s_ui.row_text[index]);
  style_row(index, false);
}

static void format_time(const ReminderSlot *slot, char *buffer, size_t size) {
  if (clock_is_24h_style()) {
    snprintf(buffer, size, "%02u:%02u", (unsigned)slot->hour, (unsigned)slot->minute);
    return;
  }
  unsigned hour = slot->hour % (HOURS_PER_DAY / 2);
  if (hour == 0) hour = HOURS_PER_DAY / 2;
  snprintf(
    buffer, size, "%u:%02u %s",
    hour, (unsigned)slot->minute, slot->hour >= HOURS_PER_DAY / 2 ? "PM" : "AM"
  );
}

/* ---- Layout ------------------------------------------------------------ */

static void set_reminder_layers_hidden(bool hidden) {
  layer_set_hidden(text_layer_get_layer(s_ui.header), hidden);
  layer_set_hidden(text_layer_get_layer(s_ui.footer), hidden);
  for (uint8_t index = 0; index < SLOT_COUNT; index++) {
    layer_set_hidden(text_layer_get_layer(s_ui.rows[index]), hidden);
  }
}

static void show_reminder_layers(Screen screen) {
  s_ui.screen = screen;
  watchface_set_hidden(true);
  set_reminder_layers_hidden(false);
  window_set_background_color(s_ui.window, GColorWhite);
}

static void layout_rows(uint8_t count, int16_t pitch, int16_t height) {
  for (uint8_t i = 0; i < SLOT_COUNT; i++) {
    Layer *layer = text_layer_get_layer(s_ui.rows[i]);
    GRect frame = layer_get_frame(layer);
    layer_set_frame(layer, GRect(frame.origin.x, ROW_TOP + i * pitch, frame.size.w, height));
    layer_set_hidden(layer, i >= count);
  }
}

/** Three tall scrolling rows for lists. */
static void layout_main_rows(void) {
  layout_rows(MAIN_VISIBLE_ROWS, MAIN_ROW_PITCH, MAIN_ROW_HEIGHT);
}

/** Four compact rows for edit, alert, and sync screens. */
static void layout_detail_rows(void) {
  layout_rows(SLOT_COUNT, DETAIL_ROW_PITCH, DETAIL_ROW_HEIGHT);
}

/* ---- Screens ----------------------------------------------------------- */

void ui_show_watchface(void) {
  s_ui.screen = SCREEN_WATCHFACE;
  set_reminder_layers_hidden(true);
  watchface_set_hidden(false);
  watchface_update();
}

static uint8_t build_main_items(uint8_t items[SLOT_COUNT + 1]) {
  bool enabled[SLOT_COUNT];
  for (uint8_t slot = 0; slot < SLOT_COUNT; slot++) {
    enabled[slot] = app_state()->slots[slot].enabled;
  }
  return reminder_navigation_build_items(enabled, items);
}

static void render_main_item(uint8_t row, uint8_t item, bool selected) {
  if (item == MAIN_ADD_ITEM) {
    set_row(row, selected, "+", "ADD REMINDER");
    return;
  }
  char time_buffer[16];
  char label[16];
  format_time(&app_state()->slots[item], time_buffer, sizeof(time_buffer));
  snprintf(label, sizeof(label), "Pill %u", (unsigned)(item + 1));
  set_row(row, selected, label, time_buffer);
}

static bool storage_failed(void) {
  return persist_state_storage_error() || display_settings_storage_error();
}

static void show_main(const char *note) {
  show_reminder_layers(SCREEN_MAIN);
  layout_main_rows();
  set_header("Pill Reminders");

  uint8_t items[SLOT_COUNT + 1];
  uint8_t item_count = build_main_items(items);
  if (s_ui.main_selection >= item_count) s_ui.main_selection = item_count - 1;
  s_ui.main_scroll_offset = reminder_navigation_scroll_offset(
    s_ui.main_selection, s_ui.main_scroll_offset, item_count, MAIN_VISIBLE_ROWS
  );

  for (uint8_t row = 0; row < MAIN_VISIBLE_ROWS; row++) clear_row(row);
  bool pin_add_to_bottom = item_count <= MAIN_VISIBLE_ROWS
    && items[item_count - 1] == MAIN_ADD_ITEM;
  uint8_t reminder_count = pin_add_to_bottom ? item_count - 1 : item_count;
  for (uint8_t row = 0; row < MAIN_VISIBLE_ROWS; row++) {
    uint8_t item_index = s_ui.main_scroll_offset + row;
    if (item_index >= reminder_count) break;
    render_main_item(row, items[item_index], item_index == s_ui.main_selection);
  }
  if (pin_add_to_bottom) {
    render_main_item(MAIN_VISIBLE_ROWS - 1, MAIN_ADD_ITEM, s_ui.main_selection == item_count - 1);
  }
  set_footer(
    storage_failed()
      ? "Storage save failed"
      : note ? note : scheduler_error() ? "Alarm schedule failed" : "Hold Down edit | Hold Up back"
  );
}

static void show_home(void) {
  show_reminder_layers(SCREEN_HOME);
  layout_main_rows();
  set_header("Configuration");
  set_row(0, s_ui.home_selection == HOME_ITEM_REMINDERS, "1", "REMINDERS");
  set_row(1, s_ui.home_selection == HOME_ITEM_TIMEZONES, "2", "TIMEZONES");
  set_row(2, s_ui.home_selection == HOME_ITEM_PHONE_REPORT, "3", "PHONE REPORT");
  set_footer("Hold Down enter | Hold Up exit");
}

static uint8_t build_timezone_items(uint8_t items[TIMEZONE_COUNT]) {
  uint8_t count = 0;
  for (uint8_t index = 0; index < TIMEZONE_COUNT; index++) {
    if (display_settings()->zones[index].enabled) items[count++] = index;
  }
  return count;
}

static uint8_t selected_timezone_item(void) {
  uint8_t items[TIMEZONE_COUNT];
  uint8_t count = build_timezone_items(items);
  if (count == 0) return HOME_TIMEZONE;
  if (s_ui.timezone_selection >= count) s_ui.timezone_selection = count - 1;
  return items[s_ui.timezone_selection];
}

static void show_timezones(void) {
  show_reminder_layers(SCREEN_TIMEZONES);
  layout_main_rows();
  set_header("Timezones");
  uint8_t items[TIMEZONE_COUNT];
  uint8_t count = build_timezone_items(items);
  for (uint8_t row = 0; row < MAIN_VISIBLE_ROWS; row++) clear_row(row);
  if (count == 0) {
    s_ui.timezone_selection = 0;
    s_ui.timezone_scroll_offset = 0;
    set_footer("No timezones | Hold Up back");
    return;
  }
  if (s_ui.timezone_selection >= count) s_ui.timezone_selection = count - 1;
  s_ui.timezone_scroll_offset = reminder_navigation_scroll_offset(
    s_ui.timezone_selection, s_ui.timezone_scroll_offset, count, MAIN_VISIBLE_ROWS
  );
  for (uint8_t row = 0; row < MAIN_VISIBLE_ROWS; row++) {
    uint8_t item_index = s_ui.timezone_scroll_offset + row;
    if (item_index >= count) continue;
    uint8_t zone_index = items[item_index];
    set_row(
      row,
      item_index == s_ui.timezone_selection,
      display_settings()->zones[zone_index].label,
      zone_index == HOME_TIMEZONE ? "HOME" : "DISPLAY"
    );
  }
  set_footer("Hold Down show | Hold Up back");
}

static void show_edit(void) {
  show_reminder_layers(SCREEN_EDIT);
  layout_detail_rows();
  char text[HEADER_TEXT_SIZE];
  snprintf(text, sizeof(text), "Edit Pill %u", (unsigned)(s_ui.selected_slot + 1));
  set_header(text);
  char value[20];
  set_row(
    EDIT_FIELD_ENABLED, s_ui.edit_field == EDIT_FIELD_ENABLED,
    "Enabled", s_ui.edit_slot.enabled ? "ON" : "OFF"
  );
  snprintf(value, sizeof(value), "%02u", (unsigned)s_ui.edit_slot.hour);
  set_row(EDIT_FIELD_HOUR, s_ui.edit_field == EDIT_FIELD_HOUR, "Hour", value);
  snprintf(value, sizeof(value), "%02u", (unsigned)s_ui.edit_slot.minute);
  set_row(EDIT_FIELD_MINUTE, s_ui.edit_field == EDIT_FIELD_MINUTE, "Minute", value);
  set_row(EDIT_FIELD_SAVE, s_ui.edit_field == EDIT_FIELD_SAVE, "Save", "HOLD DOWN");
  set_footer(
    s_ui.edit_value_mode
      ? "Up/Down value | Hold Down done"
      : "Up/Down field | Hold Down choose"
  );
}

static void refresh_edit_selection(void) {
  for (uint8_t i = 0; i < EDIT_FIELD_COUNT; i++) style_row(i, i == s_ui.edit_field);
}

static void show_alert(uint8_t slot_id) {
  show_reminder_layers(SCREEN_ALERT);
  layout_detail_rows();
  char time_buffer[16];
  char text[HEADER_TEXT_SIZE];
  format_time(&app_state()->slots[slot_id], time_buffer, sizeof(time_buffer));
  snprintf(text, sizeof(text), "TAKE PILL %u", (unsigned)(slot_id + 1));
  set_header(text);
  set_row(0, false, "Time", time_buffer);
  set_row(ALERT_SELECTED_ROW, true, "UP", "ACKNOWLEDGE");
  set_row(2, false, "DOWN", "DISMISS");
  clear_row(3);
  set_footer("Up Taken | Down dismiss");
}

void ui_sync_status_show(void) {
  show_reminder_layers(SCREEN_SYNC);
  layout_detail_rows();
  set_header("Pill Reminder");
  set_row(0, false, "Phone", "REPORT");
  set_row(1, false, "Status", "SENDING");
  set_row(2, false, "History", "RESEND ALL");
  set_row(3, false, "Exit", "HOLD UP");
  set_footer("Sending | Hold Up exit");
}

void ui_sync_status_failed(void) {
  if (s_ui.screen != SCREEN_SYNC) return;
  set_row(1, false, "Status", "FAILED");
  set_footer("Phone unavailable");
}

void ui_sync_status_done(void) {
  if (s_ui.screen == SCREEN_SYNC) show_home();
}

void ui_settings_changed(void) {
  watchface_select_timezone(HOME_TIMEZONE);
  if (s_ui.screen == SCREEN_WATCHFACE) watchface_update();
  else if (s_ui.screen == SCREEN_MAIN) show_main(NULL);
  else if (s_ui.screen == SCREEN_TIMEZONES) show_timezones();
}

void ui_timezones_changed(void) {
  if (s_ui.screen == SCREEN_WATCHFACE && !watchface_feedback_active()) watchface_update();
  else if (s_ui.screen == SCREEN_TIMEZONES) show_timezones();
}

/* ---- Alerts ------------------------------------------------------------ */

static void stop_alert_buzz(void) {
  if (s_ui.alert_timer) {
    app_timer_cancel(s_ui.alert_timer);
    s_ui.alert_timer = NULL;
  }
  s_ui.alert_ends_at = 0;
  vibes_cancel();
}

static void buzz_alert(void) {
  static const uint32_t segments[] = {250, 120, 250, 120, 700};
  VibePattern pattern = {.durations = segments, .num_segments = ARRAY_LENGTH(segments)};
  vibes_enqueue_custom_pattern(pattern);
}

/** Repeats the alert vibration until the five-minute reminder window ends. */
static void alert_timer_callback(void *context) {
  (void)context;
  s_ui.alert_timer = NULL;
  if (s_ui.screen != SCREEN_ALERT || !s_ui.active_event_sequence) {
    s_ui.alert_ends_at = 0;
    return;
  }
  if (time(NULL) >= s_ui.alert_ends_at) {
    s_ui.alert_ends_at = 0;
    s_ui.active_event_sequence = 0;
    ui_show_watchface();
    return;
  }
  buzz_alert();
  s_ui.alert_timer = app_timer_register(REMINDER_BUZZ_INTERVAL_MS, alert_timer_callback, NULL);
}

static void start_alert_buzz(void) {
  stop_alert_buzz();
  s_ui.alert_ends_at = time(NULL) + REMINDER_DURATION_SECONDS;
  buzz_alert();
  s_ui.alert_timer = app_timer_register(REMINDER_BUZZ_INTERVAL_MS, alert_timer_callback, NULL);
}

void ui_handle_wakeup(uint8_t slot_id) {
  if (slot_id >= SLOT_COUNT) return;
  stop_alert_buzz();
  s_ui.active_event_sequence = scheduler_handle_wakeup(slot_id);
  show_alert(slot_id);
  start_alert_buzz();
}

static void finish_alert(void) {
  stop_alert_buzz();
  s_ui.active_event_sequence = 0;
  ui_show_watchface();
}

static void handle_alert_button(ReminderAlertButton button) {
  ReminderAlertAction action = reminder_navigation_alert_action(button);
  if (action == REMINDER_ALERT_ACTION_TAKEN) {
    if (s_ui.active_event_sequence) {
      (void)scheduler_record_outcome(s_ui.active_event_sequence, OUTCOME_TAKEN, time(NULL));
    }
    finish_alert();
  } else if (action == REMINDER_ALERT_ACTION_DISMISS) {
    finish_alert();
  }
}

/* ---- Editing ----------------------------------------------------------- */

static void open_selected_reminder(void) {
  bool enabled[SLOT_COUNT];
  for (uint8_t slot = 0; slot < SLOT_COUNT; slot++) {
    enabled[slot] = app_state()->slots[slot].enabled;
  }
  ReminderNavigation navigation = {
    .screen = REMINDER_NAVIGATION_MAIN,
    .main_selection = s_ui.main_selection,
  };
  reminder_navigation_open(&navigation, enabled);
  s_ui.main_selection = navigation.main_selection;
  s_ui.selected_slot = navigation.selected_slot;
  s_ui.edit_field = navigation.edit_field;
  s_ui.edit_value_mode = false;
  s_ui.edit_slot = app_state()->slots[s_ui.selected_slot];
  if (navigation.enable_selected_slot) s_ui.edit_slot.enabled = true;
  show_edit();
}

static void change_edit_value(int8_t direction) {
  ReminderSlot *slot = &s_ui.edit_slot;
  if (s_ui.edit_field == EDIT_FIELD_ENABLED) {
    slot->enabled = !slot->enabled;
  } else if (s_ui.edit_field == EDIT_FIELD_HOUR) {
    slot->hour = (uint8_t)((slot->hour + HOURS_PER_DAY + direction) % HOURS_PER_DAY);
  } else if (s_ui.edit_field == EDIT_FIELD_MINUTE) {
    slot->minute = (uint8_t)(
      (slot->minute + MINUTES_PER_HOUR + direction * EDIT_MINUTE_STEP) % MINUTES_PER_HOUR
    );
  }
  show_edit();
}

static void save_edit(void) {
  AppState *state = app_state();
  ReminderSlot proposed[SLOT_COUNT];
  memcpy(proposed, state->slots, sizeof(proposed));
  proposed[s_ui.selected_slot] = s_ui.edit_slot;
  if (scheduler_times_too_close(proposed)) {
    set_footer("Need 2 minute gap");
    return;
  }
  state->slots[s_ui.selected_slot] = s_ui.edit_slot;
  state->settings_revision++;
  scheduler_schedule_next();
  show_main(scheduler_error() ? "Saved; alarm failed" : "Saved");
}

/* ---- Buttons ----------------------------------------------------------- */

static uint8_t step_selection(uint8_t selection, uint8_t count, int8_t direction) {
  return (uint8_t)((selection + count + direction) % count);
}

static void move_selection(int8_t direction) {
  if (s_ui.screen == SCREEN_HOME) {
    s_ui.home_selection = step_selection(s_ui.home_selection, HOME_ITEM_COUNT, direction);
    show_home();
  } else if (s_ui.screen == SCREEN_MAIN) {
    uint8_t items[SLOT_COUNT + 1];
    uint8_t item_count = build_main_items(items);
    s_ui.main_selection = step_selection(s_ui.main_selection, item_count, direction);
    show_main(NULL);
  } else if (s_ui.screen == SCREEN_EDIT) {
    if (s_ui.edit_value_mode) {
      // Up raises the value; Down lowers it.
      change_edit_value((int8_t)-direction);
    } else {
      s_ui.edit_field = step_selection(s_ui.edit_field, EDIT_FIELD_COUNT, direction);
      refresh_edit_selection();
    }
  } else if (s_ui.screen == SCREEN_TIMEZONES) {
    uint8_t items[TIMEZONE_COUNT];
    uint8_t item_count = build_timezone_items(items);
    if (item_count == 0) return;
    s_ui.timezone_selection = step_selection(s_ui.timezone_selection, item_count, direction);
    show_timezones();
  }
}

static void up_click(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer;
  (void)context;
  if (s_ui.screen == SCREEN_ALERT) {
    handle_alert_button(REMINDER_ALERT_BUTTON_UP);
  } else if (s_ui.screen == SCREEN_WATCHFACE) {
    watchface_cycle_timezone(-1);
  } else {
    move_selection(-1);
  }
}

static void down_click(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer;
  (void)context;
  if (s_ui.screen == SCREEN_ALERT) {
    handle_alert_button(REMINDER_ALERT_BUTTON_DOWN);
  } else if (s_ui.screen == SCREEN_WATCHFACE) {
    watchface_cycle_timezone(1);
  } else {
    move_selection(1);
  }
}

static void up_long_click(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer;
  (void)context;
  if (s_ui.screen == SCREEN_ALERT || s_ui.screen == SCREEN_WATCHFACE) return;
  if (s_ui.screen == SCREEN_EDIT) {
    s_ui.edit_value_mode = false;
    show_main("Edit cancelled");
  } else if (s_ui.screen == SCREEN_HOME) {
    ui_show_watchface();
  } else if (s_ui.screen == SCREEN_SYNC) {
    // Leave the screen; the transfer finishes in the background.
    phone_sync_hide_status();
    show_home();
  } else {
    show_home();
  }
}

static void down_long_click(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer;
  (void)context;
  if (s_ui.screen == SCREEN_ALERT) return;
  if (s_ui.screen == SCREEN_WATCHFACE) {
    show_home();
  } else if (s_ui.screen == SCREEN_HOME) {
    if (s_ui.home_selection == HOME_ITEM_REMINDERS) show_main(NULL);
    else if (s_ui.home_selection == HOME_ITEM_TIMEZONES) show_timezones();
    else phone_sync_start(true);
  } else if (s_ui.screen == SCREEN_MAIN) {
    open_selected_reminder();
  } else if (s_ui.screen == SCREEN_TIMEZONES) {
    watchface_select_timezone(selected_timezone_item());
    ui_show_watchface();
    watchface_show_timezone_feedback();
  } else if (s_ui.screen == SCREEN_EDIT) {
    if (s_ui.edit_value_mode) {
      s_ui.edit_value_mode = false;
      show_edit();
    } else if (s_ui.edit_field == EDIT_FIELD_SAVE) {
      save_edit();
    } else {
      s_ui.edit_value_mode = true;
      show_edit();
    }
  }
}

static void click_config_provider(void *context) {
  (void)context;
  window_single_click_subscribe(BUTTON_ID_UP, up_click);
  window_single_click_subscribe(BUTTON_ID_DOWN, down_click);
  window_long_click_subscribe(BUTTON_ID_UP, LONG_PRESS_MS, up_long_click, NULL);
  window_long_click_subscribe(BUTTON_ID_DOWN, LONG_PRESS_MS, down_long_click, NULL);
}

static void tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  (void)tick_time;
  (void)units_changed;
  if (s_ui.screen == SCREEN_WATCHFACE && !watchface_feedback_active()) watchface_update();
}

/* ---- Lifecycle --------------------------------------------------------- */

static TextLayer *make_text_layer(GRect frame, GFont font, GTextAlignment alignment) {
  TextLayer *layer = text_layer_create(frame);
  text_layer_set_background_color(layer, GColorClear);
  text_layer_set_text_color(layer, GColorBlack);
  text_layer_set_font(layer, font);
  text_layer_set_text_alignment(layer, alignment);
  return layer;
}

void ui_init(void) {
  s_ui.window = window_create();
  window_set_background_color(s_ui.window, GColorWhite);
  window_set_click_config_provider(s_ui.window, click_config_provider);
  Layer *root = window_get_root_layer(s_ui.window);
  GRect bounds = layer_get_bounds(root);

  watchface_create(s_ui.window);
  s_ui.header = make_text_layer(
    GRect(0, 0, bounds.size.w, HEADER_HEIGHT),
    fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD),
    GTextAlignmentCenter
  );
  text_layer_set_background_color(s_ui.header, GColorOxfordBlue);
  text_layer_set_text_color(s_ui.header, GColorWhite);
  layer_add_child(root, text_layer_get_layer(s_ui.header));
  for (uint8_t i = 0; i < SLOT_COUNT; i++) {
    s_ui.rows[i] = make_text_layer(
      GRect(
        ROW_SIDE_INSET,
        ROW_TOP + i * DETAIL_ROW_PITCH,
        bounds.size.w - 2 * ROW_SIDE_INSET,
        DETAIL_ROW_HEIGHT
      ),
      fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
      GTextAlignmentLeft
    );
    layer_add_child(root, text_layer_get_layer(s_ui.rows[i]));
  }
  s_ui.footer = make_text_layer(
    GRect(ROW_SIDE_INSET, FOOTER_TOP, bounds.size.w - 2 * ROW_SIDE_INSET, FOOTER_HEIGHT),
    fonts_get_system_font(FONT_KEY_GOTHIC_18),
    GTextAlignmentCenter
  );
  layer_add_child(root, text_layer_get_layer(s_ui.footer));
  tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);
}

void ui_push(void) {
  window_stack_push(s_ui.window, true);
}

void ui_deinit(void) {
  stop_alert_buzz();
  tick_timer_service_unsubscribe();
  for (uint8_t i = 0; i < SLOT_COUNT; i++) text_layer_destroy(s_ui.rows[i]);
  watchface_destroy();
  text_layer_destroy(s_ui.header);
  text_layer_destroy(s_ui.footer);
  window_destroy(s_ui.window);
}
