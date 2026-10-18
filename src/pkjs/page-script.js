/*
 * Functions that run inside the generated settings/report page.
 *
 * They are never called on the phone bridge: buildPageScript() serialises them
 * with Function#toString. Keep them ES5 and self-contained. Besides browser
 * globals they may only use the shared rules from rules.pageSource(), each
 * other, and the page data globals `historyEvents`, `timeZones`, and
 * `homeTodayKey`.
 */
/* global document, location, alert, confirm, Blob, URL, setTimeout,
   historyEvents, timeZones, homeTodayKey, TIMEZONE_COUNT, SLOT_COUNT,
   labelValid, enabledSlotsTooClose, labelForTimeZone, canonicalTimeZoneName,
   olderThanHomeDays */
var rules = require("./rules");

function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function timezoneMatches(timeZones, query) {
  query = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!query) return timeZones.slice();
  return timeZones.map(function (zone) {
    var name = zone.toLowerCase().replace(/[^a-z0-9]/g, "");
    var city = zone.split("/").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
    var score = name === query || city === query ? 0 : city.indexOf(query) === 0 ? 1
      : city.indexOf(query) !== -1 ? 2 : name.indexOf(query) !== -1 ? 3 : 4;
    var position = -1;
    for (var i = 0; i < query.length && score === 4; i += 1) {
      position = name.indexOf(query.charAt(i), position + 1);
      if (position === -1) return null;
    }
    return { zone: zone, score: score };
  }).filter(function (match) {
    return match !== null;
  }).sort(function (left, right) {
    return left.score - right.score || left.zone.localeCompare(right.zone);
  }).map(function (match) {
    return match.zone;
  });
}

function filterTimeZones(index) {
  var prefix = "zone-" + index;
  var select = document.getElementById(prefix + "-time-zone");
  var current = select.value;
  var query = document.getElementById(prefix + "-search").value.trim();
  var matches = timezoneMatches(timeZones, query);
  if (query && !matches.some(function (zone) {
    return zone.toLowerCase() === query.toLowerCase();
  })) {
    // Fragments are search terms; only valid full names become extra choices,
    // stored under their canonical spelling.
    var canonical = canonicalTimeZoneName(query);
    if (canonical) {
      var existing = matches.indexOf(canonical);
      if (existing !== -1) matches.splice(existing, 1);
      matches.unshift(canonical);
    }
  }
  var choices = matches.slice();
  if (choices.indexOf(current) === -1) choices.unshift(current);
  select.options.length = 0;
  choices.forEach(function (zone) {
    var option = document.createElement("option");
    option.value = zone;
    option.textContent = matches.indexOf(zone) === -1 ? "Current — " + zone : zone;
    select.appendChild(option);
  });
  select.value = current;
  document.getElementById(prefix + "-matches").textContent = matches.length
    ? matches.length + " matching timezones. Choose from the dropdown."
    : "No matches. Current timezone kept. Try another search.";
}

function selectTimeZone(index) {
  var prefix = "zone-" + index;
  var select = document.getElementById(prefix + "-time-zone");
  document.getElementById(prefix + "-search").value = select.value;
  updateZoneLabel(index);
  for (var i = 0; i < select.options.length; i += 1) {
    select.options[i].textContent = select.options[i].value;
  }
  document.getElementById(prefix + "-matches").textContent =
    "Selected " + select.value + ". Clear search to browse all timezones.";
}

function updateZoneLabel(index) {
  var value = document.getElementById("zone-" + index + "-time-zone").value;
  document.getElementById("zone-" + index + "-label").value = labelForTimeZone(value);
}

function closeWith(value) {
  location.href = "pebblejs://close#" + encodeURIComponent(JSON.stringify(value));
}

function applyAppearance(value) {
  document.documentElement.setAttribute("data-appearance", value);
}

function updateSchemePreview(index) {
  var select = document.getElementById("zone-" + index + "-scheme");
  var option = select.options[select.selectedIndex];
  var preview = document.getElementById("zone-" + index + "-scheme-preview");
  preview.style.color = option.getAttribute("data-text");
  preview.style.backgroundColor = option.getAttribute("data-background");
}

function hideUnchecked(kind, index) {
  var enabled = document.getElementById(kind + "-" + index + "-enabled");
  if (enabled && !enabled.checked) document.getElementById(kind + "-row-" + index).hidden = true;
}

function addRow(kind) {
  var start = kind === "zone" ? 1 : 0;
  var limit = kind === "zone" ? TIMEZONE_COUNT : SLOT_COUNT;
  for (var i = start; i < limit; i += 1) {
    var row = document.getElementById(kind + "-row-" + i);
    if (row.hidden) {
      row.hidden = false;
      document.getElementById(kind + "-" + i + "-enabled").checked = true;
      return;
    }
  }
  alert(kind === "zone" ? "Maximum four timezones including Home." : "Maximum four reminders.");
}

function parseTime(value) {
  var match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  var hour = parseInt(match[1], 10);
  var minute = parseInt(match[2], 10);
  return hour <= 23 && minute <= 59 ? { hour: hour, minute: minute } : null;
}

/**
 * Reads reminder rows. Disabled rows with invalid edits keep their saved time.
 * @return {{slots: Array<Object>}|{error: string}} The slots or an error message.
 */
function readSlots() {
  var slots = [];
  for (var i = 0; i < SLOT_COUNT; i += 1) {
    var enabled = document.getElementById("slot-" + i + "-enabled").checked;
    var input = document.getElementById("slot-" + i + "-time");
    var time = parseTime(input.value);
    if (!enabled && !time) time = parseTime(input.defaultValue);
    if (!time) return { error: "Set all reminder times." };
    slots.push({ id: i, hour: time.hour, minute: time.minute, enabled: enabled });
  }
  if (enabledSlotsTooClose(slots)) {
    return { error: "Enabled reminders need at least a two minute gap." };
  }
  return { slots: slots };
}

/**
 * Reads timezone rows. Disabled rows with invalid labels keep their saved label.
 * @return {{zones: Array<Object>}|{error: string}} The zones or an error message.
 */
function readZones() {
  var zones = [];
  for (var z = 0; z < TIMEZONE_COUNT; z += 1) {
    var enabled = z === 0 || document.getElementById("zone-" + z + "-enabled").checked;
    var labelInput = document.getElementById("zone-" + z + "-label");
    var label = labelInput.value.trim().toUpperCase();
    if (!enabled && !labelValid(label)) label = String(labelInput.defaultValue).trim().toUpperCase();
    if (!labelValid(label)) return { error: "Timezone labels need 1-8 letters, numbers, or spaces." };
    var scheme = document.getElementById("zone-" + z + "-scheme").value.split(",");
    zones.push({
      id: z,
      enabled: enabled,
      timeZone: document.getElementById("zone-" + z + "-time-zone").value,
      useDigits: document.getElementById("zone-" + z + "-use-digits").value === "1",
      label: label,
      textColor: parseInt(scheme[0], 10),
      backgroundColor: parseInt(scheme[1], 10),
    });
  }
  return { zones: zones };
}

function saveSettings() {
  var slotResult = readSlots();
  if (slotResult.error) {
    alert(slotResult.error);
    return;
  }
  var zoneResult = readZones();
  if (zoneResult.error) {
    alert(zoneResult.error);
    return;
  }
  var home = zoneResult.zones[0];
  closeWith({
    action: "save_settings",
    appearance: document.getElementById("appearance").value,
    display: {
      useDigits: home.useDigits,
      horizontal: parseInt(document.getElementById("horizontal").value, 10),
      vertical: parseInt(document.getElementById("vertical").value, 10),
      fontSize: parseInt(document.getElementById("font-size").value, 10),
      textColor: home.textColor,
      backgroundColor: home.backgroundColor,
    },
    zones: zoneResult.zones,
    slots: slotResult.slots,
  });
}

/**
 * Selects the records the chosen retention would clear, by Home day.
 * @return {{days: number, events: Array<Object>}} Kept day count and records.
 */
function historySelection() {
  var value = document.getElementById("history-retention").value;
  var days = value === "all" ? 0 : parseInt(value, 10);
  if (days === 0) return { days: days, events: historyEvents.slice() };
  return {
    days: days,
    events: historyEvents.filter(function (event) {
      return olderThanHomeDays(event.localDay, homeTodayKey, days);
    }),
  };
}

function saveClearedRecords() {
  var selection = historySelection();
  if (selection.events.length === 0) {
    alert("No records in this range to save.");
    return;
  }
  var content = JSON.stringify({
    exportedAt: new Date().toISOString(),
    keptDays: selection.days,
    events: selection.events,
  }, null, 2);
  var link = document.createElement("a");
  link.download = "number-watch-history-" + new Date().toISOString().slice(0, 10) + ".json";
  if (typeof Blob === "function" && typeof URL !== "undefined" && URL.createObjectURL) {
    var objectUrl = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    link.href = objectUrl;
    setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
  } else {
    link.href = "data:application/json;charset=utf-8," + encodeURIComponent(content);
  }
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function clearHistory() {
  var selection = historySelection();
  var description = selection.days === 0
    ? "all phone report history"
    : "records older than the last " + selection.days + " Home days";
  if (confirm("Clear " + description + "? Save them first if needed.")) {
    closeWith({ action: "clear_history", retentionDays: selection.days });
  }
}

function closeReport() {
  closeWith({ action: "close" });
}

function saveTakenZones() {
  var nodes = document.querySelectorAll(".taken-zone");
  var events = [];
  for (var i = 0; i < nodes.length; i += 1) {
    if (nodes[i].value !== nodes[i].getAttribute("data-initial")) {
      events.push({ identity: nodes[i].getAttribute("data-identity"), timeZone: nodes[i].value });
    }
  }
  closeWith({ action: "update_taken_zones", events: events });
}

function initialisePage() {
  for (var index = 0; index < TIMEZONE_COUNT; index += 1) updateSchemePreview(index);
}

var PAGE_FUNCTIONS = [
  timezoneMatches,
  filterTimeZones,
  selectTimeZone,
  updateZoneLabel,
  closeWith,
  applyAppearance,
  updateSchemePreview,
  hideUnchecked,
  addRow,
  parseTime,
  readSlots,
  readZones,
  saveSettings,
  historySelection,
  saveClearedRecords,
  clearHistory,
  closeReport,
  saveTakenZones,
  initialisePage,
];

/**
 * Builds the page <script> body.
 * @param {Object} data - Page data.
 * @param {Array<Object>} data.historyEvents - Stored events for export.
 * @param {Array<string>} data.timeZones - Selectable timezone names.
 * @param {?string} data.homeTodayKey - Today's Home day key.
 * @return {string} Script source safe to embed in a <script> element.
 */
function buildPageScript(data) {
  return "var historyEvents=" + jsonForScript(data.historyEvents) + ";\n"
    + "var timeZones=" + jsonForScript(data.timeZones) + ";\n"
    + "var homeTodayKey=" + jsonForScript(data.homeTodayKey) + ";\n"
    + rules.pageSource() + "\n"
    + PAGE_FUNCTIONS.map(function (fn) { return fn.toString(); }).join("\n")
    + "\ninitialisePage();";
}

exports.buildPageScript = buildPageScript;
exports.jsonForScript = jsonForScript;
exports.timezoneMatches = timezoneMatches;
