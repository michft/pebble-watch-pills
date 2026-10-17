const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const { buildReportPage } = require("../src/pkjs/report-page.js");
const { dateKeyAt } = require("../src/pkjs/timezone.js");
const { dayKeyFromOrdinal, dayOrdinal } = require("../src/pkjs/rules.js");

function zones() {
  return [
    { id: 0, enabled: true, timeZone: "Australia/Sydney", label: "SYDNEY", textColor: 5, backgroundColor: 1 },
    { id: 1, enabled: true, timeZone: "Europe/London", label: "LONDON", textColor: 1, backgroundColor: 4 },
    { id: 2, enabled: true, timeZone: "Asia/Tokyo", label: "TOKYO", textColor: 1, backgroundColor: 4 },
    { id: 3, enabled: false, timeZone: "America/New_York", label: "NEW YORK", textColor: 1, backgroundColor: 4 },
  ];
}

function timezonePageContext(configuredZones = zones()) {
  const html = buildReportPage({
    events: [], droppedEvents: 0, settings: { zones: configuredZones, slots: [] },
  });
  const elements = {};
  configuredZones.forEach((zone, index) => {
    elements[`zone-${index}-search`] = { value: "" };
    elements[`zone-${index}-matches`] = { textContent: "" };
    elements[`zone-${index}-label`] = { value: zone.label };
    elements[`zone-${index}-time-zone`] = {
      value: zone.timeZone, options: [],
      appendChild(option) { this.options.push(option); },
    };
    elements[`zone-${index}-scheme`] = {
      selectedIndex: 0, options: [{ getAttribute() { return "#000000"; } }],
    };
    elements[`zone-${index}-scheme-preview`] = { style: {} };
  });
  const context = {
    document: {
      getElementById(id) { return elements[id]; },
      createElement() { return {}; },
    },
  };
  vm.runInNewContext(html.match(/<script>([\s\S]+)<\/script>/)[1], context);
  return { html, context, elements };
}

test("timezone dropdown search ranks direct matches and supports fuzzy city fragments", () => {
  const { html, context } = timezonePageContext();
  assert.match(html, /id=zone-0-search type=text[^>]+oninput=filterTimeZones\(0\)/);
  assert.match(html, /id=zone-0-matches role=status aria-live=polite/);
  assert.match(html, /<select id=zone-0-time-zone onchange=selectTimeZone\(0\)>/);
  assert.doesNotMatch(html, /<datalist/);
  for (const query of ["SYD", "sydny", " australia / sydney "]) {
    assert.equal(context.timezoneMatches(context.timeZones, query)[0], "Australia/Sydney");
  }
  assert.equal(context.timezoneMatches(context.timeZones, "new york")[0], "America/New_York");
  assert.equal(context.timezoneMatches(context.timeZones, "UTC")[0], "UTC");
  assert.deepEqual(Array.from(context.timezoneMatches([
    "Europe/Sydny", "Australia/Sydney", "Asia/Sydney_City", "UTC",
  ], "sydney")), ["Australia/Sydney", "Asia/Sydney_City"]);
});

test("search keeps selection until dropdown choice fills full timezone and label", () => {
  const { context, elements } = timezonePageContext();
  const select = elements["zone-1-time-zone"];
  const search = elements["zone-1-search"];
  search.value = "sydny";
  context.filterTimeZones(1);
  assert.equal(select.value, "Europe/London");
  assert.equal(elements["zone-1-label"].value, "LONDON");
  assert.equal(select.options[0].textContent, "Current — Europe/London");
  assert.ok(select.options.some((option) => option.value === "Australia/Sydney"));
  const choiceCount = select.options.length;
  select.value = "Australia/Sydney";
  context.selectTimeZone(1);
  assert.equal(search.value, "Australia/Sydney");
  assert.equal(elements["zone-1-label"].value, "SYDNEY");
  assert.equal(elements["zone-0-label"].value, "SYDNEY");
  assert.equal(elements["zone-2-time-zone"].value, "Asia/Tokyo");
  assert.equal(select.options.length, choiceCount);
  assert.equal(select.options[0].textContent, "Europe/London");
  search.value = "zzzzzz";
  context.filterTimeZones(1);
  assert.equal(select.value, "Australia/Sydney");
  assert.equal(select.options.length, 1);
  assert.match(elements["zone-1-matches"].textContent, /No matches. Current timezone kept/);
  search.value = "";
  context.filterTimeZones(1);
  assert.equal(select.options.length, context.timeZones.length);
  assert.equal(select.value, "Australia/Sydney");
});

test("differently cased full queries reuse existing timezone values", () => {
  const configuredZones = zones();
  configuredZones[3].timeZone = "US/Eastern";
  const { context, elements } = timezonePageContext(configuredZones);
  const select = elements["zone-1-time-zone"];
  for (const [query, expected] of [
    ["australia/sydney", "Australia/Sydney"],
    ["EuRoPe/LoNdOn", "Europe/London"],
    ["utc", "UTC"],
    ["us/eastern", "US/Eastern"],
  ]) {
    elements["zone-1-search"].value = query;
    context.filterTimeZones(1);
    const matchingOptions = select.options.filter((option) =>
      option.value.toLowerCase() === query.toLowerCase());
    assert.deepEqual(matchingOptions.map((option) => option.value), [expected]);
    select.value = expected;
    context.selectTimeZone(1);
    assert.equal(elements["zone-1-search"].value, expected);
  }
});

test("valid full IANA names outside a phone shortlist remain selectable", () => {
  const { context, elements } = timezonePageContext();
  context.timeZones = ["UTC", "Europe/London"];
  elements["zone-1-search"].value = " Pacific/Chatham ";
  context.filterTimeZones(1);
  const select = elements["zone-1-time-zone"];
  assert.ok(select.options.some((option) => option.value === "Pacific/Chatham"));
  select.value = "Pacific/Chatham";
  context.selectTimeZone(1);
  assert.equal(elements["zone-1-search"].value, "Pacific/Chatham");
  assert.equal(elements["zone-1-label"].value, "CHATHAM");
  elements["zone-1-search"].value = "Not/A_Zone";
  context.filterTimeZones(1);
  assert.equal(select.options.length, 1);
  assert.equal(select.value, "Pacific/Chatham");
  assert.match(elements["zone-1-matches"].textContent, /No matches/);
});

test("saved aliases remain selectable and timezone names are escaped in HTML and script", () => {
  const configuredZones = zones();
  configuredZones[0].timeZone = "US/Eastern";
  configuredZones[3].timeZone = "</script><img src=x onerror=alert(1)>";
  const { html, context, elements } = timezonePageContext(configuredZones);
  assert.match(html, /value='US\/Eastern' selected>US\/Eastern/);
  assert.doesNotMatch(html, /<img src=x/);
  elements["zone-0-search"].value = "us eastern";
  context.filterTimeZones(0);
  assert.equal(elements["zone-0-time-zone"].value, "US/Eastern");
  assert.equal(elements["zone-0-time-zone"].options[0].textContent, "US/Eastern");
});

test("renders checked-only settings and selectable taken timezone", () => {
  const now = Date.now();
  const html = buildReportPage({
    appearance: "dark",
    events: [
      {
        installId: "install",
        sequence: 1,
        slotId: 0,
        scheduledAt: now,
        localDay: dateKeyAt("Australia/Sydney", now),
        homeTimeZone: "Australia/Sydney",
        takenTimeZone: "Europe/London",
        outcome: "taken",
        answeredAt: now,
      },
    ],
    settings: {
      hour12: false,
      display: {
        horizontal: 2,
        vertical: 0,
        fontSize: 1,
        textColor: 5,
        backgroundColor: 1,
      },
      zones: zones(),
      slots: [
        { id: 0, hour: 8, minute: 0, enabled: true },
        { id: 1, hour: 12, minute: 0, enabled: true },
        { id: 2, hour: 18, minute: 0, enabled: true },
        { id: 3, hour: 22, minute: 0, enabled: false },
      ],
    },
    lastSyncAt: null,
    droppedEvents: 0,
    warning: "<unsafe>",
  });

  assert.match(html, /Taken means self-reported/);
  assert.match(html, /Report may be stale/);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.doesNotMatch(html, /<unsafe>/);
  assert.match(html, /Save settings/);
  assert.match(html, /data-appearance='dark'/);
  assert.match(html, /Phone appearance/);
  assert.match(html, /Light — black on white/);
  assert.match(html, /Dark — white on black/);
  assert.match(html, /id=appearance[^]*<option value=dark selected>/);
  assert.match(html, /id=zone-0-scheme[^]*Current colours<\/option>/);
  assert.match(html, /id=zone-0-scheme-preview/);
  assert.doesNotMatch(html, /id=zone-0-text-color/);
  assert.doesNotMatch(html, /id=zone-0-background-color/);
  assert.match(html, /Words and reminder times follow the watch's 12\/24-hour system setting/);
  assert.match(html, /id=zone-0-use-digits><option value=0 selected>Words/);
  assert.match(html, /id=slot-row-3 hidden/);
  assert.match(html, /\+ Add reminder/);
  assert.match(html, /id=zone-row-0><h3>Home — SYDNEY/);
  assert.match(html, /id=zone-row-1><h3>LONDON/);
  assert.match(html, /id=zone-row-2><h3>TOKYO/);
  assert.match(html, /id=zone-row-3 hidden/);
  assert.match(html, /\+ Add timezone/);
  assert.match(html, /id=zone-0-label type=text[^>]+value='SYDNEY'/);
  assert.match(html, /id=zone-1-label type=text[^>]+value='LONDON'/);
  assert.match(html, /id=zone-2-label type=text[^>]+value='TOKYO'/);
  assert.match(html, /Home is default. Up\/Down cycles only displayed timezone labels/);
  assert.match(html, /Phone refreshes daylight-saving data/);
  assert.match(html, /id=slot-0-time type=time required value='08:00'/);
  assert.match(html, /class=taken-zone/);
  assert.match(html, /data-initial='Europe\/London'/);
  assert.match(html, /value='Europe\/London' selected>LONDON —/);
  const takenSelect = html.match(/<select class=taken-zone[^]*?<\/select>/)[0];
  assert.doesNotMatch(takenSelect, /value='America\/New_York'/);
  assert.match(html, /Save taken timezones/);
  assert.match(html, /Report history/);
  assert.match(html, /id=history-retention/);
  assert.match(html, /value=7>Last 7 days/);
  assert.match(html, /value=30>Last 30 days/);
  assert.match(html, /Save records to file/);
});

function pageHarness(html, elements = {}) {
  const element = (id) => {
    if (!elements[id]) {
      elements[id] = {
        value: "", checked: false, hidden: false, style: {}, selectedIndex: 0,
        options: [{ getAttribute(name) { return `${id}:${name}`; } }],
      };
    }
    return elements[id];
  };
  const page = {
    alerts: [], confirms: [], closed: [], nodes: [],
  };
  const context = {
    document: {
      getElementById: element,
      querySelectorAll(selector) { return selector === ".taken-zone" ? page.nodes : []; },
      createElement() { return {}; },
      documentElement: { setAttribute(name, value) { page.appearance = value; } },
    },
    location: {
      set href(value) { page.closed.push(JSON.parse(decodeURIComponent(value.split("#")[1]))); },
    },
    alert(message) { page.alerts.push(message); },
    confirm(message) { page.confirms.push(message); return true; },
  };
  vm.runInNewContext(html.match(/<script>([\s\S]+)<\/script>/)[1], context);
  return { context, elements, page, element };
}

test("page script previews schemes, posts changed taken zones, and confirms clears", () => {
  const { context, page, elements } = pageHarness(buildReportPage({
    events: [], droppedEvents: 0, settings: { zones: zones(), slots: [] },
  }));
  for (let index = 0; index < 4; index += 1) {
    assert.deepEqual({ ...elements[`zone-${index}-scheme-preview`].style }, {
      color: `zone-${index}-scheme:data-text`,
      backgroundColor: `zone-${index}-scheme:data-background`,
    });
  }
  context.applyAppearance("dark");
  assert.equal(page.appearance, "dark");

  const select = (identity, initial, value) => ({
    value, getAttribute(name) { return name === "data-identity" ? identity : initial; },
  });
  page.nodes.push(select("watch:1", "UTC", "UTC"), select("watch:2", "UTC", "Asia/Tokyo"));
  context.saveTakenZones();
  assert.deepEqual(page.closed.pop(), {
    action: "update_taken_zones", events: [{ identity: "watch:2", timeZone: "Asia/Tokyo" }],
  });

  elements["history-retention"] = { value: "7" };
  context.clearHistory();
  assert.match(page.confirms.pop(), /last 7 Home days/);
  assert.deepEqual(page.closed.pop(), { action: "clear_history", retentionDays: 7 });
  elements["history-retention"].value = "all";
  context.clearHistory();
  assert.deepEqual(page.closed.pop(), { action: "clear_history", retentionDays: 0 });
});

test("page script enforces the shared reminder gap and label rules", () => {
  const { context, page, elements } = pageHarness(buildReportPage({
    events: [], droppedEvents: 0, settings: { zones: zones(), slots: [] },
  }));
  elements.appearance = { value: "auto" };
  ["horizontal", "vertical", "font-size"].forEach((id) => { elements[id] = { value: "1" }; });
  zones().forEach((zone, index) => {
    elements[`slot-${index}-time`] = { value: ["08:00", "08:01", "23:59", "00:00"][index] };
    elements[`slot-${index}-enabled`] = { checked: index < 2 };
    elements[`zone-${index}-enabled`] = { checked: zone.enabled };
    elements[`zone-${index}-label`] = { value: zone.label, defaultValue: zone.label };
    elements[`zone-${index}-time-zone`] = { value: zone.timeZone };
    elements[`zone-${index}-use-digits`] = { value: "0" };
    elements[`zone-${index}-scheme`].value = "0,1";
  });
  context.saveSettings();
  assert.deepEqual(page.alerts.splice(0), ["Enabled reminders need at least a two minute gap."]);
  elements["slot-1-enabled"].checked = false;
  elements["slot-2-enabled"].checked = true;
  elements["slot-3-enabled"].checked = true;
  context.saveSettings();
  assert.deepEqual(page.alerts.splice(0), ["Enabled reminders need at least a two minute gap."],
    "23:59 and 00:00 are one minute apart across midnight");
  elements["slot-3-time"].value = "00:01";
  elements["zone-1-label"].value = "too long label";
  context.saveSettings();
  assert.deepEqual(page.alerts.splice(0), ["Timezone labels need 1-8 letters, numbers, or spaces."]);
  elements["zone-1-label"].value = "london";
  context.saveSettings();
  assert.deepEqual(page.alerts, []);
  const saved = page.closed.pop();
  assert.equal(saved.zones[1].label, "LONDON");
  assert.deepEqual(saved.slots.map((slot) => [slot.hour, slot.minute, slot.enabled]),
    [[8, 0, true], [8, 1, false], [23, 59, true], [0, 1, true]]);
});

test("timezone choices use canonical names and Etc/GMT labels follow UTC sign", () => {
  const { context, elements, element } = pageHarness(buildReportPage({
    events: [], droppedEvents: 0, settings: { zones: zones(), slots: [] },
  }));
  context.timeZones = ["UTC", "Europe/London"];
  const select = element("zone-1-time-zone");
  select.value = "Europe/London";
  select.options = [];
  select.appendChild = (option) => select.options.push(option);
  elements["zone-1-search"] = { value: "us/eastern" };
  context.filterTimeZones(1);
  const canonical = new Intl.DateTimeFormat("en-US", { timeZone: "us/eastern" })
    .resolvedOptions().timeZone;
  assert.equal(select.options[1].value, canonical);
  assert.equal(select.options.some((option) => option.value === "us/eastern"), false);
  elements["zone-1-search"].value = "Etc/GMT+5";
  context.filterTimeZones(1);
  select.value = "Etc/GMT+5";
  context.selectTimeZone(1);
  assert.equal(elements["zone-1-label"].value, "UTC 5W");
});

test("escapes every interpolated value and hides malformed response times", () => {
  const now = Date.now();
  const html = buildReportPage({
    appearance: "dark",
    events: [{
      installId: "<i>", sequence: "'><b>", slotId: 0, scheduledAt: now,
      localDay: dateKeyAt("Australia/Sydney", now), homeTimeZone: "Australia/Sydney",
      outcome: "taken", answeredAt: "<script>",
    }],
    settings: {
      zones: zones().map((zone) => ({ ...zone, label: "<b>X</b>", textColor: 99 })),
      slots: [{ id: 0, hour: "8' onfocus='alert(1)", minute: 0, enabled: true }, 1, 2, 3],
    },
    lastSyncAt: null,
    droppedEvents: 2,
    warning: null,
  });
  const markup = html.replace(/<script>[\s\S]*<\/script>/, "");
  assert.doesNotMatch(markup, /<b>|<i>|onfocus=/);
  assert.match(markup, /Home — &lt;b&gt;X&lt;\/b&gt;/);
  assert.doesNotMatch(markup, /null null|class=taken-zone/);
  assert.match(markup, /id=slot-0-time type=time required value='08:00'/,
    "malformed slots fall back to defaults");
  assert.match(html, /"installId":"\\u003ci>"/, "script data is escaped");
});

test("saves and reopens Sydney words, Sydney digits, and UTC words", () => {
  const state = { events: [], settings: null, droppedEvents: 0 };
  const html = buildReportPage(state);
  const script = html.match(/<script>([\s\S]+)<\/script>/)[1];
  const elements = {
    appearance: { value: "dark" },
    horizontal: { value: "2" },
    vertical: { value: "0" },
    "font-size": { value: "1" },
  };
  const configuredZones = zones().map((zone, index) => ({
    ...zone,
    timeZone: index < 2 ? "Australia/Sydney" : "UTC",
    label: ["SYD TEXT", "SYD NUM", "UTC", "UNUSED"][index],
    useDigits: index === 1,
  }));
  configuredZones.forEach((zone, index) => {
    elements[`zone-${index}-use-digits`] = { value: zone.useDigits ? "1" : "0" };
    elements[`slot-${index}-time`] = { value: `${8 + index * 4}:00` };
    elements[`slot-${index}-enabled`] = { checked: index < 2 };
    elements[`zone-${index}-label`] = { value: zone.label };
    elements[`zone-${index}-time-zone`] = {
      value: zone.timeZone, options: [],
      appendChild(option) { this.options.push(option); },
    };
    elements[`zone-${index}-search`] = { value: "sydny" };
    elements[`zone-${index}-matches`] = { textContent: "" };
    elements[`zone-${index}-enabled`] = { checked: zone.enabled };
    elements[`zone-${index}-scheme`] = {
      value: `${zone.textColor},${zone.backgroundColor}`,
      selectedIndex: 0,
      options: [{ getAttribute() { return "#000000"; } }],
    };
    elements[`zone-${index}-scheme-preview`] = { style: {} };
  });
  const context = {
    document: {
      getElementById(id) { return elements[id]; },
      createElement() { return {}; },
    },
    location: { href: "" },
    alert(message) { throw new Error(message); },
  };
  vm.runInNewContext(script, context);
  context.filterTimeZones(1);
  elements["zone-1-time-zone"].value = "Australia/Sydney";
  context.selectTimeZone(1);
  elements["zone-1-label"].value = "SYD NUM";
  for (const useDigits of [true, false]) {
    elements["zone-1-use-digits"].value = useDigits ? "1" : "0";
    configuredZones[1].useDigits = useDigits;
    context.saveSettings();
    const saved = JSON.parse(decodeURIComponent(context.location.href.split("#")[1]));
    assert.equal(saved.action, "save_settings");
    assert.deepEqual(saved.display, {
      useDigits: false, horizontal: 2, vertical: 0, fontSize: 1, textColor: 5, backgroundColor: 1,
    });
    assert.deepEqual(saved.zones, configuredZones);
    assert.equal(saved.slots.length, 4);
    assert.equal(saved.slots[0].hour, 8);
    const reopened = buildReportPage({ ...state, settings: saved });
    assert.match(reopened, new RegExp(`id=zone-1-use-digits>[^<]*${useDigits ? "<option value=0>Words</option>" : ""}<option value=${useDigits ? 1 : 0} selected>${useDigits ? "Digits" : "Words"}`));
  }
});

test("disabled rows keep saved values when edits are invalid, while enabled rows still validate", () => {
  const html = buildReportPage({
    events: [], droppedEvents: 0,
    settings: {
      zones: zones(),
      slots: [8, 12, 18, 21].map((hour, id) => ({
        id, hour, minute: id === 3 ? 37 : 0, enabled: true,
      })),
    },
  });
  const script = html.match(/<script>([\s\S]+)<\/script>/)[1];
  const elements = {
    appearance: { value: "auto" },
    horizontal: { value: "2" },
    vertical: { value: "1" },
    "font-size": { value: "2" },
  };
  for (let index = 0; index < 4; index += 1) {
    for (const id of [`slot-${index}-time`, `zone-${index}-label`]) {
      const value = html.match(new RegExp(`id=${id} [^>]*value='([^']*)'`))[1];
      elements[id] = { value, defaultValue: value };
    }
    const timezoneSelect = html.match(new RegExp(`id=zone-${index}-time-zone[^]*?</select>`))[0];
    elements[`zone-${index}-time-zone`] = {
      value: timezoneSelect.match(/value='([^']*)' selected/)[1],
    };
    elements[`slot-${index}-enabled`] = { checked: true };
    elements[`zone-${index}-enabled`] = { checked: true };
    elements[`slot-row-${index}`] = { hidden: false };
    elements[`zone-row-${index}`] = { hidden: false };
    elements[`zone-${index}-use-digits`] = { value: "0" };
    elements[`zone-${index}-scheme`] = {
      value: "0,1", selectedIndex: 0, options: [{ getAttribute() { return "#000000"; } }],
    };
    elements[`zone-${index}-scheme-preview`] = { style: {} };
  }
  const alerts = [];
  const context = {
    document: { getElementById(id) { return elements[id]; } },
    location: { href: "" },
    alert(message) { alerts.push(message); },
  };
  vm.runInNewContext(script, context);
  elements["slot-3-time"].value = "";
  elements["slot-3-enabled"].checked = false;
  elements["zone-3-label"].value = "";
  elements["zone-3-enabled"].checked = false;
  context.hideUnchecked("slot", 3);
  context.hideUnchecked("zone", 3);
  assert.equal(elements["slot-row-3"].hidden, true);
  assert.equal(elements["zone-row-3"].hidden, true);
  context.saveSettings();
  assert.deepEqual(alerts, []);
  const saved = JSON.parse(decodeURIComponent(context.location.href.split("#")[1]));
  assert.deepEqual(saved.slots[3], { id: 3, hour: 21, minute: 37, enabled: false });
  assert.equal(saved.zones[3].enabled, false);
  assert.equal(saved.zones[3].label, "NEW YORK");
  assert.equal(saved.display.horizontal, 2);

  context.location.href = "";
  elements["slot-3-enabled"].checked = true;
  context.saveSettings();
  assert.equal(alerts.pop(), "Set all reminder times.");
  assert.equal(context.location.href, "");
  elements["slot-3-enabled"].checked = false;
  elements["zone-3-enabled"].checked = true;
  context.saveSettings();
  assert.equal(alerts.pop(), "Timezone labels need 1-8 letters, numbers, or spaces.");
  assert.equal(context.location.href, "");
});

test("deduplicates one expected pill per Home day and slot", () => {
  const now = Date.now();
  const homeDay = dateKeyAt("Australia/Sydney", now);
  const state = {
    events: [
      { installId: "watch", sequence: 1, slotId: 0, scheduledAt: now, localDay: homeDay, homeTimeZone: "Australia/Sydney", outcome: "no_response", answeredAt: null },
      { installId: "watch", sequence: 2, slotId: 0, scheduledAt: now + 1, localDay: homeDay, homeTimeZone: "Australia/Sydney", outcome: "taken", answeredAt: now + 2 },
      { installId: "watch", sequence: 3, slotId: 1, scheduledAt: now + 3, localDay: homeDay, homeTimeZone: "Australia/Sydney", outcome: "no_response", answeredAt: null },
    ],
    settings: {
      zones: zones(),
      slots: [
        { id: 0, hour: 8, minute: 0, enabled: true },
        { id: 1, hour: 20, minute: 0, enabled: true },
        { id: 2, hour: 18, minute: 0, enabled: false },
        { id: 3, hour: 22, minute: 0, enabled: false },
      ],
    },
    lastSyncAt: now,
    droppedEvents: 0,
    warning: null,
  };
  const html = buildReportPage(state);
  const pillOneRows = html.match(/<th scope=row>Pill 1<\/th>/g) || [];
  const pillTwoRows = html.match(/<th scope=row>Pill 2<\/th>/g) || [];

  assert.equal(pillOneRows.length, 1);
  assert.equal(pillTwoRows.length, 1);
  assert.match(html, /1\/2 taken/);
});

test("falls back to a UTC day when an event Home zone cannot be resolved", () => {
  const now = Date.now();
  const html = buildReportPage({
    events: [{
      installId: "watch",
      sequence: 4,
      slotId: 0,
      scheduledAt: now,
      localDay: null,
      homeTimeZone: "Not/A_Zone",
      outcome: "no_response",
      answeredAt: null,
    }],
    settings: {
      zones: zones(),
      slots: [
        { id: 0, hour: 8, minute: 0, enabled: true },
        { id: 1, hour: 12, minute: 0, enabled: false },
        { id: 2, hour: 18, minute: 0, enabled: false },
        { id: 3, hour: 22, minute: 0, enabled: false },
      ],
    },
    lastSyncAt: now,
    droppedEvents: 0,
    warning: null,
  });

  assert.match(html, /<th scope=row>Pill 1<\/th>/);
});

test("falls back to Home plus three hidden timezone slots and auto appearance", () => {
  const html = buildReportPage({
    events: [],
    settings: {
      display: {
        horizontal: 1,
        vertical: 1,
        fontSize: 2,
        textColor: 0,
        backgroundColor: 1,
      },
      slots: [],
    },
    lastSyncAt: null,
    droppedEvents: 0,
    warning: null,
  });

  assert.match(html, /id=zone-row-1 hidden/);
  assert.match(html, /id=zone-row-2 hidden/);
  assert.match(html, /id=zone-row-3 hidden/);
  assert.match(html, /id=zone-1-time-zone[^]*?<option value='UTC' selected>UTC<\/option>/);
  assert.match(html, /data-appearance='auto'/);
  assert.match(html, /id=appearance[^]*<option value=auto selected>/);
  assert.match(html, /id=zone-1-scheme[^]*value='1,10'[^>]+selected>Solar/);
  assert.match(html, /prefers-color-scheme:dark/);
});

test("exports only history older than the kept Home days", () => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const homeDay = (offsetDays) => dayKeyFromOrdinal(dayOrdinal(dateKeyAt("Australia/Sydney", now)) + offsetDays);
  const html = buildReportPage({
    events: [
      { installId: "watch", sequence: 1, slotId: 0, scheduledAt: now - 7 * day, localDay: homeDay(-7), outcome: "no_response", answeredAt: null },
      { installId: "watch", sequence: 2, slotId: 0, scheduledAt: now - 6 * day, localDay: homeDay(-6), outcome: "taken", answeredAt: now - 6 * day + 1 },
      { installId: "watch", sequence: 3, slotId: 0, scheduledAt: now + day, localDay: homeDay(1), outcome: "no_response", answeredAt: null },
    ],
    settings: { zones: zones(), slots: [] },
    lastSyncAt: now,
    droppedEvents: 0,
    warning: null,
  });
  const script = html.match(/<script>([\s\S]+)<\/script>/)[1];
  const elements = { "history-retention": { value: "7" } };
  for (let index = 0; index < 4; index += 1) {
    elements[`zone-${index}-scheme`] = {
      selectedIndex: 0,
      options: [{ getAttribute() { return "#000000"; } }],
    };
    elements[`zone-${index}-scheme-preview`] = { style: {} };
  }
  let fileContent = null;
  let clicked = false;
  const link = { click() { clicked = true; } };
  const context = {
    Blob: function Blob(parts) { fileContent = parts.join(""); },
    Date,
    JSON,
    URL: { createObjectURL() { return "blob:history"; }, revokeObjectURL() {} },
    alert(message) { throw new Error(message); },
    document: {
      body: { appendChild() {}, removeChild() {} },
      createElement() { return link; },
      documentElement: { setAttribute() {} },
      getElementById(id) { return elements[id]; },
      querySelectorAll() { return []; },
    },
    encodeURIComponent,
    location: { href: "" },
    parseInt,
    setTimeout() {},
  };

  vm.runInNewContext(script, context);
  context.saveClearedRecords();

  const exported = JSON.parse(fileContent);
  assert.equal(clicked, true);
  assert.equal(link.download.startsWith("number-watch-history-"), true);
  assert.deepEqual(exported.events.map((event) => event.sequence), [1]);
  assert.equal(exported.keptDays, 7);

  elements["history-retention"].value = "all";
  fileContent = null;
  context.saveClearedRecords();

  const allExported = JSON.parse(fileContent);
  assert.deepEqual(allExported.events.map((event) => event.sequence), [1, 2, 3]);
  assert.equal(allExported.keptDays, 0);
});
