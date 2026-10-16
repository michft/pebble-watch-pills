#include <pebble.h>

#include "app_types.h"
#include "display_settings.h"
#include "persist_state.h"
#include "phone_sync.h"
#include "scheduler.h"
#include "ui.h"

static void wakeup_handler(WakeupId id, int32_t cookie) {
  (void)id;
  if (cookie >= 0 && cookie < SLOT_COUNT) ui_handle_wakeup((uint8_t)cookie);
}

/**
 * Restores persisted data, creates the UI, registers AppMessage and wakeup
 * callbacks, and handles either the wakeup that launched the app or a normal start.
 */
static void init(void) {
  (void)persist_state_load();
  display_settings_load();

  WakeupId launch_wakeup_id = -1;
  int32_t launch_cookie = -1;
  bool launched_by_wakeup = wakeup_get_launch_event(&launch_wakeup_id, &launch_cookie);

  ui_init();
  app_message_register_inbox_received(phone_sync_inbox_received);
  app_message_register_outbox_sent(phone_sync_outbox_sent);
  app_message_register_outbox_failed(phone_sync_outbox_failed);
  app_message_open(APP_MESSAGE_BUFFER_SIZE, APP_MESSAGE_BUFFER_SIZE);
  wakeup_service_subscribe(wakeup_handler);

  if (launched_by_wakeup && launch_cookie >= 0 && launch_cookie < SLOT_COUNT) {
    scheduler_recover_events_except((int8_t)launch_cookie);
    ui_handle_wakeup((uint8_t)launch_cookie);
  } else {
    scheduler_recover_events_except(-1);
    scheduler_schedule_next();
    ui_show_watchface();
  }
  ui_push();
}

int main(void) {
  init();
  app_event_loop();
  ui_deinit();
}
