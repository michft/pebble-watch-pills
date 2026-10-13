const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("watchface enlarges digits and restores text fonts for words, labels, and errors", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src/c/main.c"), "utf8");
  const handler = (name) => {
    const match = source.match(new RegExp(
      "^static [^\\n]+ " + name + "\\([^\\n]*\\) \\{[\\s\\S]*?^\\}", "m",
    ));
    assert.ok(match, `missing ${name}`);
    return match[0];
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "number-watch-layout-"));
  try {
    const harness = path.join(directory, "layout.c");
    const binary = path.join(directory, "layout");
    fs.writeFileSync(harness, `
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "time_words.h"
typedef int GFont;
typedef int GTextAlignment;
typedef struct { int16_t w, h; } GSize;
typedef struct { int16_t x, y; } GPoint;
typedef struct { GPoint origin; GSize size; } GRect;
#define GRect(x,y,w,h) ((GRect){{x,y},{w,h}})
typedef struct { GRect frame; GFont font; const char *text; } TextLayer;
typedef TextLayer Layer;
enum { FONT_SMALL, FONT_MEDIUM, FONT_LARGE };
enum { HORIZONTAL_LEFT, HORIZONTAL_CENTER, HORIZONTAL_RIGHT };
enum { VERTICAL_TOP, VERTICAL_MIDDLE, VERTICAL_BOTTOM };
enum { GTextAlignmentLeft, GTextAlignmentCenter, GTextAlignmentRight };
enum { FONT_KEY_GOTHIC_24_BOLD = 24, FONT_KEY_GOTHIC_28_BOLD = 28,
       FONT_KEY_BITHAM_42_BOLD = 42 };
#define WATCHFACE_DESCENDER_PADDING 6
#define TIMEZONE_FEEDBACK_MS 1200
#define SCREEN_WATCHFACE 0
static struct { uint8_t font_size, horizontal_alignment, vertical_alignment; }
  s_display_settings;
typedef struct { uint8_t text_color, background_color; char label[9]; } TimezoneSettings;
static TimezoneSettings zone = {0, 1, "SYD NUM"};
static TextLayer watchface;
static TextLayer *s_watchface = &watchface;
static GFont s_digit_fonts[3] = {88, 96, 104};
static void *s_window;
static char s_watchface_text[128];
static uint8_t s_active_timezone;
static int s_screen, hour, minute;
static bool available = true, digits;
static void *s_timezone_feedback_timer;
static bool current_display_time(int *h, int *m) {
  s_active_timezone = 0;
  *h = hour; *m = minute; return available;
}
static bool timezone_uses_digits(uint8_t index) { assert(index == 0); return digits; }
static bool clock_is_24h_style(void) { return true; }
static GFont fonts_get_system_font(int key) { return key; }
static int watchface_alignment(void) { return s_display_settings.horizontal_alignment; }
static int color_for_id(uint8_t id) { return id; }
static TimezoneSettings *active_timezone_settings(void) { return &zone; }
static Layer *window_get_root_layer(void *window) { (void)window; return &watchface; }
static GRect layer_get_bounds(Layer *layer) { (void)layer; return GRect(0,0,200,228); }
static Layer *text_layer_get_layer(TextLayer *layer) { return layer; }
static void text_layer_set_font(TextLayer *layer, GFont font) { layer->font = font; }
static void text_layer_set_text(TextLayer *layer, const char *text) { layer->text = text; }
static void text_layer_set_text_alignment(TextLayer *layer, int align) { (void)layer; (void)align; }
static void text_layer_set_text_color(TextLayer *layer, int color) { (void)layer; (void)color; }
static void window_set_background_color(void *window, int color) { (void)window; (void)color; }
static void layer_set_frame(Layer *layer, GRect frame) { layer->frame = frame; }
static GSize text_layer_get_content_size(TextLayer *layer) {
  int lines = 1;
  for (const char *c = layer->text; *c; c++) if (*c == '\\n') lines++;
  return (GSize){120, lines * layer->font};
}
static void app_timer_cancel(void *timer) { (void)timer; }
static void *app_timer_register(int ms, void (*callback)(void *), void *context) {
  (void)ms; (void)callback; (void)context; return &watchface;
}
${handler("watchface_font")}
${handler("watchface_digit_font")}
${handler("update_watchface")}
${handler("timezone_feedback_done")}
${handler("show_timezone_feedback")}
int main(void) {
  const int word_sizes[] = {24, 28, 42};
  for (int size = FONT_SMALL; size <= FONT_LARGE; size++) {
    s_display_settings.font_size = size;
    for (int alignment = VERTICAL_TOP; alignment <= VERTICAL_BOTTOM; alignment++) {
      s_display_settings.vertical_alignment = alignment;
      for (hour = 0; hour < 24; hour++) for (minute = 0; minute < 60; minute++) {
        digits = true;
        s_active_timezone = 3;
        update_watchface();
        assert(watchface.font == s_digit_fonts[size]);
        assert(watchface.frame.size.h == 2 * s_digit_fonts[size] + 6);
        assert(watchface.frame.origin.y >= 4);
        assert(watchface.frame.origin.y + watchface.frame.size.h <= 224);
        assert(strchr(watchface.text, '\\n') != NULL);
      }
    }
    hour = 8; minute = 6;
    update_watchface();
    assert(strcmp(watchface.text, "8\\n6") == 0);
    show_timezone_feedback();
    assert(watchface.font == word_sizes[size]);
    assert(strcmp(watchface.text, zone.label) == 0);
    timezone_feedback_done(NULL);
    assert(watchface.font == s_digit_fonts[size]);
    assert(strcmp(watchface.text, "8\\n6") == 0);
    digits = false;
    update_watchface();
    assert(watchface.font == word_sizes[size]);
    assert(strcmp(watchface.text, "8\\n6") != 0);
    digits = true; available = false;
    update_watchface();
    assert(watchface.font == word_sizes[size]);
    assert(strcmp(watchface.text, "Time unavailable") == 0);
    available = true; hour = 24;
    update_watchface();
    assert(watchface.font == word_sizes[size]);
    assert(strcmp(watchface.text, "Time unavailable") == 0);
  }
}
`);
    childProcess.execFileSync("cc", [
      "-std=c11", "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter",
      "-Isrc/c", "src/c/time_words.c", harness, "-o", binary,
    ], { cwd: root, stdio: "pipe" });
    assert.doesNotThrow(() => childProcess.execFileSync(binary));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
