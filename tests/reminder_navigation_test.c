#include "reminder_navigation.h"

#include <assert.h>
#include <stdbool.h>

static void expect_time_display_opens_reminders(void) {
  const bool enabled[REMINDER_NAVIGATION_SLOT_COUNT] = {
    true, false, true, false
  };
  ReminderNavigation state = {
    .screen = REMINDER_NAVIGATION_TIME,
    .main_selection = 0,
  };

  reminder_navigation_select(&state, enabled);

  assert(state.screen == REMINDER_NAVIGATION_MAIN);
}

static void expect_existing_reminder_opens_enabled_field(void) {
  const bool enabled[REMINDER_NAVIGATION_SLOT_COUNT] = {
    true, false, true, false
  };
  ReminderNavigation state = {
    .screen = REMINDER_NAVIGATION_MAIN,
    .main_selection = 1,
  };

  reminder_navigation_select(&state, enabled);

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

  reminder_navigation_select(&state, enabled);

  assert(state.screen == REMINDER_NAVIGATION_EDIT);
  assert(state.selected_slot == 1);
  assert(state.edit_field == 1);
  assert(state.enable_selected_slot);
}

int main(void) {
  expect_time_display_opens_reminders();
  expect_existing_reminder_opens_enabled_field();
  expect_add_opens_first_disabled_reminder_time();
}
