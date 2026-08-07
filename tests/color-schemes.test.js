const assert = require("node:assert/strict");
const test = require("node:test");
const {
  COLORS,
  SCHEMES,
  colorForId,
  colorIdValid,
  findScheme,
} = require("../src/pkjs/color-schemes.js");

test("offers twenty unique recommended watch colour schemes", () => {
  assert.equal(SCHEMES.length, 20);
  assert.equal(new Set(SCHEMES.map((scheme) => scheme.id)).size, 20);
  assert.equal(
    new Set(SCHEMES.map((scheme) => `${scheme.textColor},${scheme.backgroundColor}`)).size,
    20,
  );
  SCHEMES.forEach((scheme) => {
    assert.equal(colorIdValid(scheme.textColor), true);
    assert.equal(colorIdValid(scheme.backgroundColor), true);
    assert.ok(colorForId(scheme.textColor).css);
    assert.ok(colorForId(scheme.backgroundColor).css);
  });
});

test("supports the extended vivid Pebble colour range", () => {
  assert.equal(COLORS.length, 20);
  assert.equal(colorIdValid(19), true);
  assert.equal(colorIdValid(20), false);
  assert.equal(findScheme(12, 19).name, "Aqua night");
  assert.equal(findScheme(5, 1), null);
});
