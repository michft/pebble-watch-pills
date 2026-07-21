const assert = require("node:assert/strict");
const test = require("node:test");
const {
  extractReleaseNotes,
  readReleaseMetadata,
} = require("../scripts/release-metadata.js");

test("current package version has release notes", () => {
  const metadata = readReleaseMetadata(__dirname + "/..");

  assert.equal(metadata.version, "0.1.2");
  assert.equal(metadata.tag, "v0.1.2");
  assert.match(metadata.notes, /scrolling reminder list/);
});

test("extracts only the requested release notes", () => {
  const notes = extractReleaseNotes(
    "# Changelog\n\n## [0.2.0]\n\n- New\n\n## [0.1.0]\n\n- Old\n",
    "0.2.0",
  );

  assert.equal(notes, "- New");
});
