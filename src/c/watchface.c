#include <pebble.h>

#include "watchface.h"

#include "app_types.h"
#include "display_settings.h"
#include "display_time.h"
#include "time_words.h"

#define WATCHFACE_TEXT_SIZE 80
#define NO_FONT_SIZE (-1)

static struct {
  Window *window;
  TextLayer *layer;
  GFont digit_font;
  int8_t digit_font_size;
  uint8_t active_timezone;
  AppTimer *feedback_timer;
  char text[WATCHFACE_TEXT_SIZE];
} s_face = {
  .digit_font_size = NO_FONT_SIZE,
};

GColor color_for_id(uint8_t color_id) {
  switch (color_id) {
    case 1: return GColorBlack;
    case 2: return GColorRed;
    case 3: return GColorOrange;
    case 4: return GColorYellow;
    case 5: return GColorGreen;
    case 6: return GColorCyan;
    case 7: return GColorBlue;
    case 8: return GColorVividViolet;
    case 9: return GColorMagenta;
    case 10: return GColorChromeYellow;
    case 11: return GColorBrightGreen;
    case 12: return GColorElectricBlue;
    case 13: return GColorVividCerulean;
    case 14: return GColorPictonBlue;
    case 15: return GColorIndigo;
    case 16: return GColorJazzberryJam;
    case 17: return GColorFolly;
    case 18: return GColorDarkCandyAppleRed;
    case 19: return GColorOxfordBlue;
    default: return GColorWhite;
  }
}

static GFont word_font(void) {
  switch (display_settings()->font_size) {
    case FONT_SMALL: return fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD);
    case FONT_MEDIUM: return fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD);
    default: return fonts_get_system_font(FONT_KEY_BITHAM_42_BOLD);
  }
}

static uint32_t digit_font_resource(uint8_t font_size) {
  switch (font_size) {
    case FONT_SMALL: return RESOURCE_ID_FONT_DIGITS_88;
    case FONT_MEDIUM: return RESOURCE_ID_FONT_DIGITS_96;
    default: return RESOURCE_ID_FONT_DIGITS_104;
  }
}

static void unload_digit_font(void) {
  if (s_face.digit_font_size == NO_FONT_SIZE) return;
  fonts_unload_custom_font(s_face.digit_font);
  s_face.digit_font_size = NO_FONT_SIZE;
}

/** Loads only the digit font for the current size, replacing any other size. */
static GFont digit_font(void) {
  uint8_t font_size = display_settings()->font_size;
  if (s_face.digit_font_size != (int8_t)font_size) {
    unload_digit_font();
    s_face.digit_font = fonts_load_custom_font(resource_get_handle(digit_font_resource(font_size)));
    s_face.digit_font_size = (int8_t)font_size;
  }
  return s_face.digit_font;
}

static GTextAlignment horizontal_alignment(void) {
  switch (display_settings()->horizontal_alignment) {
    case HORIZONTAL_LEFT: return GTextAlignmentLeft;
    case HORIZONTAL_RIGHT: return GTextAlignmentRight;
    default: return GTextAlignmentCenter;
  }
}

static const TimezoneSettings *active_zone(void) {
  DisplaySettings *settings = display_settings();
  if (
    s_face.active_timezone >= TIMEZONE_COUNT
    || !settings->zones[s_face.active_timezone].enabled
  ) s_face.active_timezone = HOME_TIMEZONE;
  return &settings->zones[s_face.active_timezone];
}

static bool current_display_time(int *hour, int *minute) {
  time_t now = time(NULL);
  const TimezoneSettings *zone = active_zone();
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

static GRect content_frame(GRect bounds, int16_t y, int16_t height) {
  return GRect(WATCHFACE_SIDE_INSET, y, bounds.size.w - 2 * WATCHFACE_SIDE_INSET, height);
}

/** Measures the layer's text using the full screen height. */
static int16_t padded_text_height(GRect bounds) {
  layer_set_frame(text_layer_get_layer(s_face.layer), content_frame(bounds, 0, bounds.size.h));
  GSize content = text_layer_get_content_size(s_face.layer);
  return content.h + WATCHFACE_DESCENDER_PADDING;
}

void watchface_render(bool time_available, int hour, int minute) {
  if (!s_face.layer) return;
  const DisplaySettings *settings = display_settings();
  const TimezoneSettings *zone = active_zone();
  bool use_digits = time_available && display_settings_zone_uses_digits(s_face.active_timezone);
  bool formatted = time_available && (use_digits
    ? time_digits_format_lines(hour, minute, s_face.text, sizeof(s_face.text))
    : time_words_format_lines(
      hour,
      minute,
      clock_is_24h_style(),
      settings->font_size == FONT_LARGE,
      s_face.text,
      sizeof(s_face.text)
    ));
  if (!formatted) {
    snprintf(s_face.text, sizeof(s_face.text), "Time unavailable");
    use_digits = false;
  }

  GRect bounds = layer_get_bounds(window_get_root_layer(s_face.window));
  text_layer_set_font(s_face.layer, use_digits ? digit_font() : word_font());
  text_layer_set_text_alignment(s_face.layer, horizontal_alignment());
  text_layer_set_text_color(s_face.layer, color_for_id(zone->text_color));
  text_layer_set_text(s_face.layer, s_face.text);
  int16_t max_height = bounds.size.h - 2 * WATCHFACE_EDGE_MARGIN;
  int16_t height = padded_text_height(bounds);
  if (height > max_height) height = max_height;
  int16_t y = WATCHFACE_EDGE_MARGIN;
  if (settings->vertical_alignment == VERTICAL_MIDDLE) {
    y = (bounds.size.h - height) / 2;
  } else if (settings->vertical_alignment == VERTICAL_BOTTOM) {
    y = bounds.size.h - height - WATCHFACE_EDGE_MARGIN;
  }
  layer_set_frame(text_layer_get_layer(s_face.layer), content_frame(bounds, y, height));
  window_set_background_color(s_face.window, color_for_id(zone->background_color));
}

void watchface_update(void) {
  int hour = 0;
  int minute = 0;
  bool available = current_display_time(&hour, &minute);
  watchface_render(available, hour, minute);
}

static void feedback_done(void *context) {
  (void)context;
  s_face.feedback_timer = NULL;
  if (!layer_get_hidden(text_layer_get_layer(s_face.layer))) watchface_update();
}

bool watchface_feedback_active(void) {
  return s_face.feedback_timer != NULL;
}

void watchface_cancel_feedback(void) {
  if (s_face.feedback_timer) {
    app_timer_cancel(s_face.feedback_timer);
    s_face.feedback_timer = NULL;
  }
}

void watchface_show_timezone_feedback(void) {
  watchface_cancel_feedback();
  watchface_update();
  text_layer_set_font(s_face.layer, word_font());
  text_layer_set_text_alignment(s_face.layer, GTextAlignmentCenter);
  text_layer_set_text(s_face.layer, active_zone()->label);
  GRect bounds = layer_get_bounds(window_get_root_layer(s_face.window));
  int16_t height = padded_text_height(bounds);
  layer_set_frame(
    text_layer_get_layer(s_face.layer),
    content_frame(bounds, (bounds.size.h - height) / 2, height)
  );
  s_face.feedback_timer = app_timer_register(TIMEZONE_FEEDBACK_MS, feedback_done, NULL);
}

void watchface_cycle_timezone(int8_t direction) {
  const DisplaySettings *settings = display_settings();
  for (uint8_t step = 0; step < TIMEZONE_COUNT; step++) {
    s_face.active_timezone = (uint8_t)(
      (s_face.active_timezone + TIMEZONE_COUNT + direction) % TIMEZONE_COUNT
    );
    if (settings->zones[s_face.active_timezone].enabled) {
      watchface_show_timezone_feedback();
      return;
    }
  }
}

void watchface_select_timezone(uint8_t index) {
  s_face.active_timezone = index < TIMEZONE_COUNT ? index : HOME_TIMEZONE;
}

void watchface_set_hidden(bool hidden) {
  layer_set_hidden(text_layer_get_layer(s_face.layer), hidden);
}

void watchface_create(Window *window) {
  s_face.window = window;
  GRect bounds = layer_get_bounds(window_get_root_layer(window));
  s_face.layer = text_layer_create(content_frame(bounds, 0, bounds.size.h));
  text_layer_set_background_color(s_face.layer, GColorClear);
  text_layer_set_text_color(s_face.layer, GColorBlack);
  text_layer_set_font(s_face.layer, word_font());
  text_layer_set_text_alignment(s_face.layer, horizontal_alignment());
  layer_add_child(window_get_root_layer(window), text_layer_get_layer(s_face.layer));
}

void watchface_destroy(void) {
  watchface_cancel_feedback();
  text_layer_destroy(s_face.layer);
  s_face.layer = NULL;
  unload_digit_font();
}
