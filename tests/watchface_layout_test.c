/* Watchface fonts and layout, using the real watchface module with UI fakes. */
#include "pebble_fake.h"

#include <assert.h>

#include "display_settings.h"
#include "watchface.h"

struct Layer { GRect frame; bool hidden; };
struct TextLayer { Layer layer; GFont font; const char *text; };
struct Window { Layer root; };

static Window window;
static TextLayer text_layer;
static int loaded_fonts, font_loads;
static AppTimerCallback timer_callback;

GFont fonts_get_system_font(const char *key) {
  if (strcmp(key, FONT_KEY_GOTHIC_18) == 0) return 18;
  if (strcmp(key, FONT_KEY_GOTHIC_24_BOLD) == 0) return 24;
  if (strcmp(key, FONT_KEY_GOTHIC_28_BOLD) == 0) return 28;
  assert(strcmp(key, FONT_KEY_BITHAM_42_BOLD) == 0);
  return 42;
}
ResHandle resource_get_handle(uint32_t id) { return id; }
GFont fonts_load_custom_font(ResHandle handle) { loaded_fonts++; font_loads++; return (GFont)handle; }
void fonts_unload_custom_font(GFont font) { (void)font; loaded_fonts--; }
Layer *window_get_root_layer(const Window *w) { return (Layer *)&w->root; }
void window_set_background_color(Window *w, GColor color) { (void)w; (void)color; }
GRect layer_get_bounds(const Layer *layer) { return GRect(0, 0, layer->frame.size.w, layer->frame.size.h); }
void layer_set_frame(Layer *layer, GRect frame) { layer->frame = frame; }
void layer_set_hidden(Layer *layer, bool hidden) { layer->hidden = hidden; }
bool layer_get_hidden(const Layer *layer) { return layer->hidden; }
void layer_add_child(Layer *parent, Layer *child) { (void)parent; (void)child; }
TextLayer *text_layer_create(GRect frame) { text_layer.layer.frame = frame; return &text_layer; }
void text_layer_destroy(TextLayer *layer) { (void)layer; }
Layer *text_layer_get_layer(TextLayer *layer) { return &layer->layer; }
void text_layer_set_text(TextLayer *layer, const char *text) { layer->text = text; }
void text_layer_set_font(TextLayer *layer, GFont font) { layer->font = font; }
void text_layer_set_text_alignment(TextLayer *layer, GTextAlignment alignment) { (void)layer; (void)alignment; }
void text_layer_set_text_color(TextLayer *layer, GColor color) { (void)layer; (void)color; }
void text_layer_set_background_color(TextLayer *layer, GColor color) { (void)layer; (void)color; }
GSize text_layer_get_content_size(TextLayer *layer) {
  int16_t lines = 1;
  for (const char *c = layer->text; *c; c++) if (*c == '\n') lines++;
  return (GSize){120, (int16_t)(lines * layer->font)};
}
AppTimer *app_timer_register(uint32_t timeout_ms, AppTimerCallback callback, void *data) {
  (void)timeout_ms;
  (void)data;
  timer_callback = callback;
  return (AppTimer *)&timer_callback;
}
void app_timer_cancel(AppTimer *timer) { (void)timer; timer_callback = NULL; }

static void fire_timer(void) {
  AppTimerCallback callback = timer_callback;
  assert(callback != NULL);
  timer_callback = NULL;
  callback(NULL);
}

int main(void) {
  window.root.frame = GRect(0, 0, 200, 228);
  fake_persist_clear();
  display_settings_load();
  DisplaySettings *settings = display_settings();
  memcpy(settings->zones[0].label, "SYD NUM", sizeof("SYD NUM"));
  watchface_create(&window);
  const GFont word_sizes[] = {24, 28, 42};
  const GFont digit_sizes[] = {88, 96, 104};

  for (uint8_t size = FONT_SMALL; size <= FONT_LARGE; size++) {
    settings->font_size = size;
    for (uint8_t alignment = VERTICAL_TOP; alignment <= VERTICAL_BOTTOM; alignment++) {
      settings->vertical_alignment = alignment;
      for (int hour = 0; hour < 24; hour++) for (int minute = 0; minute < 60; minute++) {
        display_settings_set_digits_mask(1);
        // A disabled zone falls back to Home.
        watchface_select_timezone(3);
        watchface_render(true, hour, minute);
        assert(text_layer.font == digit_sizes[size]);
        assert(text_layer.layer.frame.size.h == 2 * digit_sizes[size] + WATCHFACE_DESCENDER_PADDING);
        assert(text_layer.layer.frame.origin.y >= WATCHFACE_EDGE_MARGIN);
        assert(text_layer.layer.frame.origin.y + text_layer.layer.frame.size.h <= 228 - WATCHFACE_EDGE_MARGIN);
        assert(strchr(text_layer.text, '\n') != NULL);
      }
    }
    // Only the digit font for the current size stays loaded.
    assert(loaded_fonts == 1);
    watchface_render(true, 8, 6);
    assert(strcmp(text_layer.text, "8\n6") == 0);
    watchface_show_timezone_feedback();
    assert(watchface_feedback_active());
    assert(text_layer.font == word_sizes[size]);
    assert(strcmp(text_layer.text, "SYD NUM") == 0);
    fire_timer();
    assert(!watchface_feedback_active());
    assert(text_layer.font == digit_sizes[size]);
    assert(strchr(text_layer.text, '\n') != NULL);
    display_settings_set_digits_mask(0);
    watchface_render(true, 8, 6);
    assert(text_layer.font == word_sizes[size]);
    assert(strcmp(text_layer.text, "8\n6") != 0);
    display_settings_set_digits_mask(1);
    watchface_render(false, 8, 6);
    assert(text_layer.font == word_sizes[size]);
    assert(strcmp(text_layer.text, "Time unavailable") == 0);
    watchface_render(true, 24, 0);
    assert(text_layer.font == word_sizes[size]);
    assert(strcmp(text_layer.text, "Time unavailable") == 0);
  }
  assert(font_loads == FONT_SIZE_COUNT);
  watchface_destroy();
  assert(loaded_fonts == 0);
  puts("ok");
}
