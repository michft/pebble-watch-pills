#include "reminder_navigation.h"

#include <assert.h>
#include <stdbool.h>

static void expect_existing_reminder_opens_enabled_field(void) {
  const bool enabled[REMINDER_NAVIGATION_SLOT_COUNT] = {
    true, false, true, false
  };
  ReminderNavigation state = {
    .screen = REMINDER_NAVIGATION_MAIN,
    .main_selection = 1,
  };

  reminder_navigation_open(&state, enabled);

  assert(state.screen == REMINDER_NAVIGATION_EDIT);
  assert(state.selected_slot == 2);
  assert(state.edit_field == 0);
  assert(!state.enable_selected_slot);
}

static void expect_add_opens_first_disabled_reminder_time(void) {
  const bool enabled[REMINDER_NAVIGATION_SLOT_COUNT] = {
    true, false, true, false
  };
  ReminderNavigation state = {
    .screen = REMINDER_NAVIGATION_MAIN,
    .main_selection = 2,
  };

  reminder_navigation_open(&state, enabled);

  assert(state.screen == REMINDER_NAVIGATION_EDIT);
  assert(state.selected_slot == 1);
  assert(state.edit_field == 1);
  assert(state.enable_selected_slot);
}

static void expect_only_up_acknowledges_alert(void) {
  assert(
    reminder_navigation_alert_action(REMINDER_ALERT_BUTTON_UP)
    == REMINDER_ALERT_ACTION_TAKEN
  );
  assert(
    reminder_navigation_alert_action(REMINDER_ALERT_BUTTON_DOWN)
    == REMINDER_ALERT_ACTION_DISMISS
  );
}

static void expect_scroll_keeps_selection_visible(void) {
  assert(reminder_navigation_scroll_offset(3, 0, 3, 3) == 0);
  assert(reminder_navigation_scroll_offset(0, 2, 5, 3) == 0);
  assert(reminder_navigation_scroll_offset(3, 0, 5, 3) == 1);
  assert(reminder_navigation_scroll_offset(4, 0, 5, 3) == 2);
  assert(reminder_navigation_scroll_offset(2, 1, 5, 3) == 1);
  assert(reminder_navigation_scroll_offset(1, 2, 5, 3) == 1);
  assert(reminder_navigation_scroll_offset(1, 0, 5, 0) == 0);
}

int main(void) {
  expect_scroll_keeps_selection_visible();
  expect_existing_reminder_opens_enabled_field();
  expect_add_opens_first_disabled_reminder_time();
  expect_only_up_acknowledges_alert();
}
