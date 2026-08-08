var timezone = require("./timezone");
var colorSchemes = require("./color-schemes");
var TIMEZONE_COUNT = timezone.TIMEZONE_COUNT;
var normaliseZones = timezone.normaliseZones;

/**
 * Escapes HTML special characters in a value converted to a string.
 * @param {*} value - The value to escape.
 * @return {string} The HTML-escaped string.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Formats a value with a leading zero when it is less than 10.
 * @param {number} value - The value to format.
 * @return {string} The value as a string, prefixed with `0` when less than 10.
 */
function pad2(value) {
  return value < 10 ? "0" + value : String(value);
}

/**
 * Formats a date as a local calendar date.
 * @param {Date} date - The date to format.
 * @return {string} The date in `YYYY-MM-DD` format.
 */
function localDay(date) {
  return date.getFullYear()
    + "-" + pad2(date.getMonth() + 1)
    + "-" + pad2(date.getDate());
}

function dayOrdinal(dayKey) {
  var parts = String(dayKey).split("-").map(Number);
  if (parts.length !== 3 || parts.some(function (part) { return !Number.isInteger(part); })) {
    return null;
  }
  return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / (24 * 60 * 60 * 1000));
}

/**
 * Formats a reminder slot time in 12-hour or 24-hour notation.
 * @param {Object} slot - The slot containing `hour` and `minute` values.
 * @param {boolean} hour12 - Whether to use 12-hour notation with an AM or PM suffix.
 * @return {string} The formatted slot time.
 */
function formatSlotTime(slot, hour12) {
  if (!hour12) {
    return pad2(slot.hour) + ":" + pad2(slot.minute);
  }
  var suffix = slot.hour >= 12 ? "PM" : "AM";
  var hour = slot.hour % 12 || 12;
  return hour + ":" + pad2(slot.minute) + " " + suffix;
}

function expectedEvents(events, homeTimeZone) {
  var byExpectedDose = {};
  events.forEach(function (event) {
    var eventHomeTimeZone = event.homeTimeZone || homeTimeZone;
    var homeDay = event.localDay
      || timezone.dateKeyAt(eventHomeTimeZone, event.scheduledAt)
      || timezone.dateKeyAt("UTC", event.scheduledAt);
    if (!homeDay) return;
    var key = homeDay + ":" + event.slotId;
    var previous = byExpectedDose[key];
    var candidate = Object.assign({}, event, {
      homeTimeZone: eventHomeTimeZone,
      localDay: homeDay,
      takenTimeZone: event.takenTimeZone || event.homeTimeZone || homeTimeZone,
    });
    if (!previous || previous.outcome !== "taken" && candidate.outcome === "taken") {
      byExpectedDose[key] = candidate;
    }
  });
  return Object.keys(byExpectedDose).map(function (key) {
    return byExpectedDose[key];
  }).sort(function (left, right) {
    return left.scheduledAt - right.scheduledAt;
  });
}

/**
 * Counts scheduled events by outcome.
 * @param {Array<Object>} events - The events to classify.
 * @return {{scheduled: number, taken: number, skipped: number, noResponse: number}} Counts for each outcome category.
 */
function countOutcomes(events) {
  var counts = { scheduled: events.length, taken: 0, skipped: 0, noResponse: 0 };
  events.forEach(function (event) {
    if (event.outcome === "taken") {
      counts.taken += 1;
    } else if (event.outcome === "skipped") {
      counts.skipped += 1;
    } else {
      counts.noResponse += 1;
    }
  });
  return counts;
}

/**
 * Renders an HTML card showing event outcome counts and the taken percentage.
 * @param {string} title - The card heading.
 * @param {Object} counts - Outcome counts used to calculate the percentage.
 * @returns {string} The HTML summary card.
 */
function summaryCard(title, counts) {
  var percentage = counts.scheduled === 0
    ? "—"
    : Math.round(counts.taken * 100 / counts.scheduled) + "%";
  return "<section class=card><h2>" + escapeHtml(title) + "</h2>"
    + "<div class=percentage>" + percentage + "</div>"
    + "<p><strong>" + counts.taken + "</strong> taken · "
    + "<strong>" + (counts.scheduled - counts.taken) + "</strong> not taken</p></section>";
}

/**
 * Converts an outcome value into its display label.
 * @param {*} outcome - The outcome value to label.
 * @return {string} The corresponding display label.
 */
function outcomeLabel(outcome) {
  if (outcome === "taken") {
    return "Taken";
  }
  return "Not taken";
}

/**
 * Renders reminder outcomes grouped by local day as expandable HTML detail sections.
 * @param {Array} events - Reminder outcome events to include.
 * @param {Array<Object>} zones - Normalised zone objects; the first supplies Home context for local-day groups and enabled zones supply Taken-time choices.
 * @return {string} HTML containing daily outcome details, or an empty-state message when no events are provided.
 */
function dailyDetails(events, zones) {
  var homeZone = zones[0];
  var enabledZones = zones.filter(function (zone) { return zone.enabled; });
  var days = {};
  events.forEach(function (event) {
    days[event.localDay] = days[event.localDay] || [];
    days[event.localDay].push(event);
  });

  var dayKeys = Object.keys(days).sort().reverse();
  if (dayKeys.length === 0) {
    return "<p class=empty>No reminder outcomes synced yet.</p>";
  }

  return dayKeys.map(function (day) {
    var dayEvents = days[day].sort(function (left, right) {
      return left.slotId - right.slotId;
    });
    var counts = countOutcomes(dayEvents);
    var rows = dayEvents.map(function (event) {
      var eventHomeTimeZone = event.homeTimeZone || homeZone.timeZone;
      var time = timezone.timeLabelAt(eventHomeTimeZone, event.scheduledAt) || "—";
      var takenTime = "—";
      if (event.outcome === "taken" && event.answeredAt) {
        var selectedZone = event.takenTimeZone || homeZone.timeZone;
        if (!enabledZones.some(function (zone) { return zone.timeZone === selectedZone; })) {
          selectedZone = homeZone.timeZone;
        }
        var identity = event.installId + ":" + event.sequence;
        var zoneOptions = enabledZones.map(function (zone) {
          var zoneDay = timezone.dateKeyAt(zone.timeZone, event.answeredAt);
          var zoneTime = timezone.timeLabelAt(zone.timeZone, event.answeredAt);
          return "<option value='" + escapeHtml(zone.timeZone) + "'"
            + (zone.timeZone === selectedZone ? " selected" : "") + ">"
            + escapeHtml(zone.label + " — " + zoneDay + " " + zoneTime)
            + "</option>";
        }).join("");
        takenTime = "<select class=taken-zone data-identity='" + escapeHtml(identity)
          + "' data-initial='" + escapeHtml(selectedZone) + "'>"
          + zoneOptions + "</select>";
      }
      return "<tr><th scope=row>Pill " + (event.slotId + 1) + "</th><td>"
        + escapeHtml(time) + "</td><td>" + escapeHtml(outcomeLabel(event.outcome))
        + "</td><td>" + takenTime + "</td></tr>";
    }).join("");
    return "<details><summary><strong>" + escapeHtml(day) + "</strong> — "
      + counts.taken + "/" + counts.scheduled + " taken</summary>"
      + "<table><thead><tr><th>Pill</th><th>Home time</th><th>Status</th><th>Taken time</th></tr></thead>"
      + "<tbody>" + rows + "</tbody></table></details>";
  }).join("");
}

/**
 * Builds an HTML card displaying the current reminder settings.
 * @param {Object} settings - The settings snapshot containing reminder slots and hour-format preferences.
 * @param {string} appearance - The phone report appearance mode.
 * @return {string} The rendered settings card HTML.
 */
function settingsSection(settings, appearance) {
  var fallbackSlots = [8, 12, 18, 22].map(function (hour, id) {
    return { id: id, hour: hour, minute: 0, enabled: true };
  });
  var slots = settings && Array.isArray(settings.slots)
    ? settings.slots
    : fallbackSlots;
  var display = settings && settings.display ? settings.display : {
    horizontal: 1,
    vertical: 1,
    fontSize: 2,
    textColor: 0,
    backgroundColor: 1,
  };
  var zones = normaliseZones(settings);
  var timeZones = timezone.supportedTimeZones();
  function options(values, selected) {
    return values.map(function (entry) {
      return "<option value=" + entry[0]
        + (entry[0] === selected ? " selected" : "") + ">"
        + escapeHtml(entry[1]) + "</option>";
    }).join("");
  }
  zones.forEach(function (zone) {
    if (timeZones.indexOf(zone.timeZone) === -1) timeZones.unshift(zone.timeZone);
  });
  var timeZoneDatalist = "<datalist id=timezone-options>" + timeZones.map(function (zone) {
    return "<option value='" + escapeHtml(zone) + "'>";
  }).join("") + "</datalist>";
  var reminderRows = slots.map(function (slot, index) {
    return "<div class='reminder configurable-row' id=slot-row-" + index
      + (slot.enabled ? "" : " hidden") + "><label for=slot-" + index + "-time>Pill "
      + (index + 1) + "</label><input id=slot-" + index
      + "-time type=time required value='" + pad2(slot.hour) + ":"
      + pad2(slot.minute) + "'><label class=toggle><input id=slot-" + index
      + "-enabled type=checkbox" + (slot.enabled ? " checked" : "")
      + " onchange=hideUnchecked('slot'," + index + ")> Enabled</label></div>";
  }).join("");
  function schemeOptions(zone) {
    var currentScheme = colorSchemes.findScheme(zone.textColor, zone.backgroundColor);
    var currentOption = "";
    if (!currentScheme) {
      var currentText = colorSchemes.colorForId(zone.textColor);
      var currentBackground = colorSchemes.colorForId(zone.backgroundColor);
      currentOption = "<option value='" + zone.textColor + "," + zone.backgroundColor
        + "' data-text='" + currentText.css + "' data-background='"
        + currentBackground.css + "' selected>Current colours</option>";
    }
    return currentOption + colorSchemes.SCHEMES.map(function (scheme) {
      var text = colorSchemes.colorForId(scheme.textColor);
      var background = colorSchemes.colorForId(scheme.backgroundColor);
      return "<option value='" + scheme.textColor + "," + scheme.backgroundColor
        + "' data-text='" + text.css + "' data-background='" + background.css + "'"
        + (currentScheme && scheme.id === currentScheme.id ? " selected" : "") + ">"
        + escapeHtml(scheme.name) + "</option>";
    }).join("");
  }
  var zoneRows = zones.map(function (zone, index) {
    var enabledControl = index === 0
      ? "<input id=zone-0-enabled type=hidden value=1>"
      : "<label class=toggle><input id=zone-" + index + "-enabled type=checkbox"
        + (zone.enabled ? " checked" : "") + " onchange=hideUnchecked('zone'," + index
        + ")> Displayed</label>";
    var heading = index === 0 ? "Home — " + zone.label : zone.label;
    return "<div class='timezone configurable-row' id=zone-row-" + index
      + (zone.enabled ? "" : " hidden") + "><h3>" + escapeHtml(heading)
      + "</h3>" + enabledControl + "<label for=zone-" + index + "-time-zone>Timezone</label>"
      + "<input id=zone-" + index + "-time-zone list=timezone-options value='"
      + escapeHtml(zone.timeZone) + "' onchange=updateZoneLabel(" + index
      + ")><label for=zone-" + index + "-label>Label</label>"
      + "<input id=zone-" + index + "-label type=text maxlength=8 pattern='[A-Za-z0-9 ]{1,8}' value='"
      + escapeHtml(zone.label) + "'><label for=zone-" + index + "-scheme>Colour scheme</label>"
      + "<select id=zone-" + index + "-scheme onchange=updateSchemePreview(" + index + ")>"
      + schemeOptions(zone) + "</select><div class=scheme-preview id=zone-" + index
      + "-scheme-preview aria-hidden=true>12:34</div></div>";
  }).join("");
  return "<section class=card><h2>Phone appearance</h2>"
    + "<p class=muted>This changes this phone page only, not the watch colours.</p>"
    + "<p class=muted>Use Save settings below to keep this choice.</p>"
    + "<label for=appearance>Mode</label><select id=appearance onchange=applyAppearance(this.value)>"
    + options([["auto", "Auto — follow phone"], ["light", "Light — black on white"], ["dark", "Dark — white on black"]], appearance)
    + "</select></section><section class=card><h2>Watch settings</h2>"
    + "<p class=muted>Saved settings transfer to watch, then refresh this report.</p>"
    + "<p class=muted>Time format follows the watch's 12/24-hour system setting.</p>"
    + "<fieldset><legend>Reminders</legend>" + reminderRows
    + "<button type=button onclick=addRow('slot')>+ Add reminder</button></fieldset>"
    + "<fieldset><legend>Timezones and colour schemes</legend>"
    + "<p class=muted>Home is default. Up/Down cycles only displayed timezone labels.</p>"
    + zoneRows + timeZoneDatalist + "<button type=button onclick=addRow('zone')>+ Add timezone</button>"
    + "<p class=muted>Phone refreshes daylight-saving data whenever bridge connects. "
    + "Watch stores next transitions for offline use.</p></fieldset>"
    + "<fieldset><legend>Text position</legend><label for=horizontal>Horizontal</label>"
    + "<select id=horizontal>" + options([[0, "Left"], [1, "Center"], [2, "Right"]], display.horizontal) + "</select>"
    + "<label for=vertical>Vertical</label><select id=vertical>"
    + options([[0, "Top"], [1, "Middle"], [2, "Bottom"]], display.vertical) + "</select></fieldset>"
    + "<fieldset><legend>Watchface</legend><label for=font-size>Font size</label>"
    + "<select id=font-size>" + options([[0, "Small"], [1, "Medium"], [2, "Large"]], display.fontSize) + "</select>"
    + "</fieldset>"
    + "<button class=save onclick=saveSettings()>Save settings</button></section>";
}

exports.buildReportPage = function buildReportPage(state) {
  var appearance = ["auto", "light", "dark"].indexOf(state.appearance) >= 0
    ? state.appearance
    : "auto";
  var now = Date.now();
  var zones = normaliseZones(state.settings);
  var reportEvents = expectedEvents(state.events, zones[0].timeZone);
  var todayKey = timezone.dateKeyAt(zones[0].timeZone, now) || localDay(new Date(now));
  var todayOrdinal = dayOrdinal(todayKey);
  function eventsWithinHomeDays(dayCount) {
    return reportEvents.filter(function (event) {
      var eventOrdinal = dayOrdinal(event.localDay);
      return eventOrdinal !== null
        && todayOrdinal !== null
        && eventOrdinal <= todayOrdinal
        && eventOrdinal > todayOrdinal - dayCount;
    });
  }
  var thirtyDayEvents = eventsWithinHomeDays(30);
  var sevenDayEvents = eventsWithinHomeDays(7);
  var todayEvents = reportEvents.filter(function (event) {
    return event.localDay === todayKey;
  });

  var lastSync = state.lastSyncAt
    ? new Date(state.lastSyncAt).toLocaleString()
    : "Never";
  var stale = !state.lastSyncAt || now - state.lastSyncAt > 24 * 60 * 60 * 1000;
  var warning = "";
  if (stale) {
    warning += "<p class=warning>Report may be stale. Open Number Watch on watch to sync.</p>";
  }
  if (state.droppedEvents > 0) {
    warning += "<p class=warning>Watch reports " + state.droppedEvents
      + " older event(s) dropped after watch history overflow.</p>";
  }
  if (state.warning) {
    warning += "<p class=warning>" + escapeHtml(state.warning) + "</p>";
  }

  return "<!doctype html><html lang=en data-appearance='" + appearance + "'><head><meta charset=utf-8>"
    + "<meta name=viewport content='width=device-width,initial-scale=1'>"
    + "<title>Pill Reminder report</title><style>"
    + ":root{color-scheme:light;--page:#fff;--text:#000;--muted:#4d5968;--sync:#34445a;--card:#fff;--border:#c9d2dd;--row:#dfe5ec;--field:#fff;--field-text:#000;--close:#dce8f4;--close-text:#172033}"
    + "html[data-appearance=dark]{color-scheme:dark;--page:#000;--text:#fff;--muted:#c4ccd6;--sync:#d4dbe4;--card:#111;--border:#4d5661;--row:#363d46;--field:#1c1c1e;--field-text:#fff;--close:#30363d;--close-text:#fff}"
    + "@media(prefers-color-scheme:dark){html[data-appearance=auto]{color-scheme:dark;--page:#000;--text:#fff;--muted:#c4ccd6;--sync:#d4dbe4;--card:#111;--border:#4d5661;--row:#363d46;--field:#1c1c1e;--field-text:#fff;--close:#30363d;--close-text:#fff}}"
    + "body{margin:0;background:var(--page);color:var(--text);font:16px -apple-system,BlinkMacSystemFont,sans-serif}"
    + "main{max-width:680px;margin:auto;padding:18px}h1{font-size:28px;margin:0 0 4px}"
    + "h2{font-size:19px;margin:0 0 10px}.muted{color:var(--muted)}.sync{margin-top:0;color:var(--sync)}"
    + ".card,details{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:15px;margin:12px 0}"
    + ".percentage{font-size:34px;font-weight:700;color:#1e6b91}.warning{background:#fff3cd;color:#3d3100;border-radius:8px;padding:10px}"
    + "table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 4px;border-bottom:1px solid var(--row);vertical-align:top}"
    + "summary{cursor:pointer}.empty{padding:15px;background:var(--card);border-radius:12px}"
    + "fieldset{border:0;padding:0;margin:18px 0}legend{font-weight:700;margin-bottom:8px}"
    + "label{display:block;font-weight:600;margin:10px 0 5px}select,input[type=time],input[type=text]{box-sizing:border-box;width:100%;font-size:17px;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--field);color:var(--field-text)}"
    + ".reminder{display:grid;grid-template-columns:1fr 1.2fr;gap:4px 12px;align-items:end;margin:10px 0}.reminder label{margin:0}.toggle{font-weight:400}input[type=checkbox]{width:auto}.timezone{border-top:1px solid var(--row);padding-top:10px;margin-top:12px}.timezone h3{margin:0}[hidden]{display:none!important}.taken-zone{min-width:180px}.scheme-preview{margin-top:8px;padding:14px;border:1px solid var(--border);border-radius:8px;text-align:center;font-size:26px;font-weight:700}"
    + "button{width:100%;padding:13px;margin:8px 0;border:0;border-radius:10px;font-size:17px;font-weight:600}"
    + ".save{background:#1e6b91;color:#fff}.danger{background:#b42318;color:#fff}.close{background:var(--close);color:var(--close-text)}"
    + "</style></head><body><main><h1>Pill Reminder</h1>"
    + "<p class=sync>Last synced: " + escapeHtml(lastSync) + "</p>"
    + warning
    + summaryCard("Today", countOutcomes(todayEvents))
    + summaryCard("Last 7 days", countOutcomes(sevenDayEvents))
    + summaryCard("Last 30 days", countOutcomes(thirtyDayEvents))
    + settingsSection(state.settings, appearance)
    + "<section><h2>Taken list</h2>" + dailyDetails(thirtyDayEvents, zones)
    + "<button type=button onclick=saveTakenZones()>Save taken timezones</button></section>"
    + "<p class=muted>Taken means self-reported. Not taken means no Taken response; it does not prove a missed dose. "
    + "This report is not a medical record.</p>"
    + "<section class=card><h2>Report history</h2>"
    + "<p class=muted>Choose how much recent history to keep. Save exports the records that will be removed.</p>"
    + "<label for=history-retention>Keep records</label><select id=history-retention>"
    + "<option value=7>Last 7 days</option><option value=30>Last 30 days</option>"
    + "<option value=all>Nothing — clear all</option></select>"
    + "<button type=button onclick=saveClearedRecords()>Save records to file</button>"
    + "<button class=danger onclick=clearHistory()>Clear older records</button></section>"
    + "<button class=close onclick=closeReport()>Close</button>"
    + "<script>var historyEvents=" + jsonForScript(state.events) + ";"
    + "function closeWith(v){location.href='pebblejs://close#'+encodeURIComponent(JSON.stringify(v))}"
    + "function applyAppearance(value){document.documentElement.setAttribute('data-appearance',value)}"
    + "function updateSchemePreview(index){var select=document.getElementById('zone-'+index+'-scheme');var option=select.options[select.selectedIndex];var preview=document.getElementById('zone-'+index+'-scheme-preview');preview.style.color=option.getAttribute('data-text');preview.style.backgroundColor=option.getAttribute('data-background')}"
    + "function hideUnchecked(kind,index){var enabled=document.getElementById(kind+'-'+index+'-enabled');if(enabled&&!enabled.checked)document.getElementById(kind+'-row-'+index).hidden=true}"
    + "function addRow(kind){var start=kind==='zone'?1:0;var limit=kind==='zone'?" + TIMEZONE_COUNT + ":4;for(var i=start;i<limit;i++){var row=document.getElementById(kind+'-row-'+i);if(row.hidden){row.hidden=false;document.getElementById(kind+'-'+i+'-enabled').checked=true;return}}alert(kind==='zone'?'Maximum four timezones including Home.':'Maximum four reminders.')}"
    + "function saveSettings(){var slots=[];for(var i=0;i<4;i++){var p=document.getElementById('slot-'+i+'-time').value.split(':');if(p.length!==2){alert('Set all reminder times.');return;}slots.push({id:i,hour:parseInt(p[0],10),minute:parseInt(p[1],10),enabled:document.getElementById('slot-'+i+'-enabled').checked});}for(var l=0;l<4;l++){if(!slots[l].enabled)continue;for(var r=l+1;r<4;r++){if(!slots[r].enabled)continue;var gap=Math.abs((slots[l].hour*60+slots[l].minute)-(slots[r].hour*60+slots[r].minute));gap=Math.min(gap,1440-gap);if(gap<2){alert('Enabled reminders need at least a two minute gap.');return;}}}var zones=[];for(var z=0;z<" + TIMEZONE_COUNT + ";z++){var label=document.getElementById('zone-'+z+'-label').value.trim().toUpperCase();if(!/^[A-Z0-9 ]{1,8}$/.test(label)){alert('Timezone labels need 1-8 letters, numbers, or spaces.');return;}var scheme=document.getElementById('zone-'+z+'-scheme').value.split(',');zones.push({id:z,enabled:z===0||document.getElementById('zone-'+z+'-enabled').checked,timeZone:document.getElementById('zone-'+z+'-time-zone').value,label:label,textColor:parseInt(scheme[0],10),backgroundColor:parseInt(scheme[1],10)});}closeWith({action:'save_settings',appearance:document.getElementById('appearance').value,display:{horizontal:parseInt(document.getElementById('horizontal').value,10),vertical:parseInt(document.getElementById('vertical').value,10),fontSize:parseInt(document.getElementById('font-size').value,10),textColor:zones[0].textColor,backgroundColor:zones[0].backgroundColor},zones:zones,slots:slots})}"
    + "function historySelection(){var value=document.getElementById('history-retention').value;var days=value==='all'?0:parseInt(value,10);var cutoff=days===0?Date.now():Date.now()-days*24*60*60*1000;return{days:days,events:historyEvents.filter(function(event){return event.scheduledAt<=cutoff})}}"
    + "function saveClearedRecords(){var selection=historySelection();if(selection.events.length===0){alert('No records in this range to save.');return;}var payload={exportedAt:new Date().toISOString(),keptDays:selection.days,events:selection.events};var content=JSON.stringify(payload,null,2);var link=document.createElement('a');link.download='number-watch-history-'+new Date().toISOString().slice(0,10)+'.json';if(typeof Blob==='function'&&typeof URL!=='undefined'&&URL.createObjectURL){var objectUrl=URL.createObjectURL(new Blob([content],{type:'application/json'}));link.href=objectUrl;setTimeout(function(){URL.revokeObjectURL(objectUrl)},1000)}else{link.href='data:application/json;charset=utf-8,'+encodeURIComponent(content)}document.body.appendChild(link);link.click();document.body.removeChild(link)}"
    + "function clearHistory(){var selection=historySelection();var description=selection.days===0?'all phone report history':'records older than '+selection.days+' days';if(confirm('Clear '+description+'? Save them first if needed.'))closeWith({action:'clear_history',retentionDays:selection.days})}"
    + "function closeReport(){closeWith({action:'close'})}"
    + "function updateZoneLabel(index){var value=document.getElementById('zone-'+index+'-time-zone').value;var p=value.split('/');document.getElementById('zone-'+index+'-label').value=p[p.length-1].replace(/_/g,' ').toUpperCase().replace(/[^A-Z0-9 ]/g,'').slice(0,8)}"
    + "function saveTakenZones(){var nodes=document.querySelectorAll('.taken-zone');var events=[];for(var i=0;i<nodes.length;i++){if(nodes[i].value!==nodes[i].getAttribute('data-initial'))events.push({identity:nodes[i].getAttribute('data-identity'),timeZone:nodes[i].value})}closeWith({action:'update_taken_zones',events:events})}"
    + "for(var p=0;p<" + TIMEZONE_COUNT + ";p++)updateSchemePreview(p)"
    + "</script>"
    + "</main></body></html>";
};
