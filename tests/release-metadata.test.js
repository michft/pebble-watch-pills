const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assertReleaseIncrement,
  assertWatchVersion,
  extractReleaseNotes,
  latestReleaseTag,
  readReleaseMetadata,
  writeGitHubOutput,
} = require("../scripts/release-metadata.js");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "release-metadata.js");
const SCREENSHOT = path.join("docs", "screenshots", "emery_screenshot.png");

function withReleaseFixture(version, callback, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pebble-release-"));
  try {
    fs.writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({ version }),
    );
    fs.writeFileSync(
      path.join(directory, "CHANGELOG.md"),
      options.changelog ?? `# Changelog\n\n## [${version}]\n\n- Notes\n`,
    );
    fs.mkdirSync(path.join(directory, "docs", "screenshots"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(directory, SCREENSHOT),
      options.screenshot ?? fs.readFileSync(path.join(ROOT, SCREENSHOT)),
    );
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function runCheck(args, env = {}) {
  const childEnv = { ...process.env };
  delete childEnv.GITHUB_OUTPUT;
  delete childEnv.RELEASE_PREVIOUS_VERSION;
  Object.assign(childEnv, env);
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: childEnv,
  });
}

function git(directory, ...args) {
  execFileSync("git", args, { cwd: directory, stdio: "ignore" });
}

test("current package version is a valid watch release with notes", () => {
  const { version } = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  const metadata = readReleaseMetadata(ROOT, { skipPreviousCheck: true });

  assert.equal(metadata.version, version);
  assert.equal(metadata.tag, `v${version}`);
  assert.equal(metadata.screenshot, SCREENSHOT);
  assert.ok(metadata.notes.trim().length > 0);
});

test("accepts a MINOR or MAJOR bump with PATCH 0", () => {
  assert.doesNotThrow(() => assertReleaseIncrement("0.3.0", "v0.2.18"));
  assert.doesNotThrow(() => assertReleaseIncrement("1.0.0", "0.9.0"));
  assert.doesNotThrow(() => assertWatchVersion("255.255.0"));
});

test("rejects a PATCH-only bump because watches see MAJOR.MINOR only", () => {
  assert.throws(
    () => assertReleaseIncrement("0.2.19", "v0.2.18"),
    /must increase MAJOR or MINOR above released v0\.2\.18/,
  );
  assert.throws(
    () => assertReleaseIncrement("0.3.0", "0.3.0"),
    /must increase MAJOR or MINOR/,
  );
  assert.throws(
    () => assertReleaseIncrement("0.9.0", "1.0.0"),
    /must increase MAJOR or MINOR/,
  );
});

test("rejects a non-zero PATCH", () => {
  assert.throws(() => assertWatchVersion("0.3.1"), /must have PATCH 0/);
});

test("rejects MAJOR or MINOR above 255", () => {
  assert.throws(() => assertWatchVersion("0.256.0"), /limit of 255/);
  assert.throws(() => assertWatchVersion("256.0.0"), /limit of 255/);
});

test("picks the highest released v* tag by semver", () => {
  assert.equal(
    latestReleaseTag(["v0.2.9", "v0.2.18", "v0.10.0-rc1", "other", "v0.2.10"]),
    "v0.2.18",
  );
  assert.equal(latestReleaseTag([]), undefined);
});

test("script accepts a minor bump and writes GitHub outputs", () => {
  withReleaseFixture("0.3.0", (directory) => {
    const outputPath = path.join(directory, "github-output");
    fs.writeFileSync(outputPath, "");
    const result = runCheck(
      ["--root", directory, "--previous", "v0.2.18", "--require-previous"],
      { GITHUB_OUTPUT: outputPath },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^v0\.3\.0 \(previous release: v0\.2\.18\)/);
    assert.equal(
      fs.readFileSync(outputPath, "utf8"),
      "version=0.3.0\ntag=v0.3.0\n" +
        `screenshot=${SCREENSHOT}\n` +
        "notes<<PEBBLE_RELEASE_NOTES_EOF\n- Notes\nPEBBLE_RELEASE_NOTES_EOF\n",
    );
  });
});

test("script rejects a patch-only bump from RELEASE_PREVIOUS_VERSION", () => {
  withReleaseFixture("0.2.19", (directory) => {
    const result = runCheck(["--root", directory], {
      RELEASE_PREVIOUS_VERSION: "0.2.18",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^release:check failed: version 0\.2\.19/);
  });
});

test("script compares against the latest git tag", () => {
  withReleaseFixture("0.3.0", (directory) => {
    git(directory, "init", "--quiet");
    git(
      directory,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "fixture",
    );
    git(directory, "tag", "v0.2.18");

    const accepted = runCheck(["--root", directory, "--require-previous"]);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /previous release: v0\.2\.18/);

    git(directory, "tag", "v0.3.0");
    const released = runCheck(["--root", directory, "--require-previous"]);
    assert.equal(released.status, 1);
    assert.match(released.stderr, /above released v0\.3\.0/);
  });
});

test("script requires a previous release when asked", () => {
  withReleaseFixture("0.3.0", (directory) => {
    const result = runCheck(["--root", directory, "--require-previous"]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /no released v\* tag found/);
  });
});

test("script rejects an incorrectly sized store screenshot", () => {
  const png = Buffer.from(fs.readFileSync(path.join(ROOT, SCREENSHOT)));
  png.writeUInt32BE(144, 16);
  withReleaseFixture(
    "0.3.0",
    (directory) => {
      const result = runCheck(["--root", directory, "--previous", "0.2.0"]);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /must be a 200x228 PNG/);
    },
    { screenshot: png },
  );
});

test("script rejects unknown arguments", () => {
  const result = runCheck(["--bogus"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown argument --bogus/);
});

test("extracts only the requested release notes", () => {
  const notes = extractReleaseNotes(
    "# Changelog\n\n## [0.2.0]\n\n- New\n\n## [0.1.0]\n\n- Old\n",
    "0.2.0",
  );

  assert.equal(notes, "- New");
});

test("rejects a non-semver package version", () => {
  withReleaseFixture("0.1", (directory) => {
    assert.throws(
      () => readReleaseMetadata(directory, { skipPreviousCheck: true }),
      /version must be x\.y\.z semver/,
    );
  });
});

test("rejects a missing changelog heading", () => {
  withReleaseFixture(
    "0.3.0",
    (directory) => {
      const result = runCheck(["--root", directory, "--previous", "0.2.0"]);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /has no ## \[0\.3\.0\] entry/);
    },
    { changelog: "# Changelog\n\n## [0.2.0]\n\n- Old\n" },
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
        screenshot: SCREENSHOT,
        notes: "Contains PEBBLE_RELEASE_NOTES_EOF delimiter",
      }),
    /contain the GitHub output delimiter/,
  );
});
