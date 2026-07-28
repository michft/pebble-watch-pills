const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  extractReleaseNotes,
  readReleaseMetadata,
  writeGitHubOutput,
} = require("../scripts/release-metadata.js");

function withReleaseFixture(packageJson, changelog, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pebble-release-"));
  try {
    fs.writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify(packageJson),
    );
    fs.writeFileSync(path.join(directory, "CHANGELOG.md"), changelog);
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("current package version has release notes", () => {
  const metadata = readReleaseMetadata(__dirname + "/..");

  assert.equal(metadata.version, "0.2.1");
  assert.equal(metadata.tag, `v${metadata.version}`);
  assert.ok(metadata.notes.trim().length > 0);
});

test("extracts only the requested release notes", () => {
  const notes = extractReleaseNotes(
    "# Changelog\n\n## [0.2.0]\n\n- New\n\n## [0.1.0]\n\n- Old\n",
    "0.2.0",
  );

  assert.equal(notes, "- New");
});

test("rejects a non-semver package version", () => {
  withReleaseFixture(
    { version: "0.1" },
    "# Changelog\n\n## [0.1]\n\n- Invalid version\n",
    (directory) => {
      assert.throws(
        () => readReleaseMetadata(directory),
        /version must be x\.y\.z semver/,
      );
    },
  );
});

test("rejects a missing changelog heading", () => {
  assert.throws(
    () => extractReleaseNotes("# Changelog\n", "0.2.0"),
    /has no ## \[0\.2\.0\] entry/,
  );
});

test("rejects an empty changelog note body", () => {
  assert.throws(
    () =>
      extractReleaseNotes(
        "# Changelog\n\n## [0.2.0]\n\n## [0.1.0]\n\n- Old\n",
        "0.2.0",
      ),
    /## \[0\.2\.0\] has no release notes/,
  );
});

test("rejects GitHub output containing its heredoc delimiter", () => {
  assert.throws(
    () =>
      writeGitHubOutput("unused", {
        version: "0.2.0",
        tag: "v0.2.0",
        notes: "Contains PEBBLE_RELEASE_NOTES_EOF delimiter",
      }),
    /contain the GitHub output delimiter/,
  );
});
