const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
// The Pebble SDK stores only MAJOR.MINOR in the watch binary, each 0-255.
const MAX_WATCH_VERSION_PART = 255;
const STORE_SCREENSHOT = "docs/screenshots/emery_screenshot.png";
const STORE_SCREENSHOT_SIZE = { width: 200, height: 228 };

function parseVersion(value) {
  const match = SEMVER.exec(value.replace(/^v/, ""));
  if (!match) {
    throw new Error(`${value} is not x.y.z semver`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(left, right) {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

function assertWatchVersion(version) {
  const { major, minor, patch } = parseVersion(version);
  if (major > MAX_WATCH_VERSION_PART || minor > MAX_WATCH_VERSION_PART) {
    throw new Error(
      `version ${version} exceeds the Pebble limit of ${MAX_WATCH_VERSION_PART} for MAJOR or MINOR`,
    );
  }
  if (patch !== 0) {
    throw new Error(
      `version ${version} must have PATCH 0: watches only see MAJOR.MINOR, so bump MINOR instead`,
    );
  }
}

function assertReleaseIncrement(version, previousVersion) {
  const current = parseVersion(version);
  const previous = parseVersion(previousVersion);
  if (
    current.major < previous.major ||
    (current.major === previous.major && current.minor <= previous.minor)
  ) {
    throw new Error(
      `version ${version} must increase MAJOR or MINOR above released ${previousVersion}; ` +
        "PATCH-only updates share the same watch binary version",
    );
  }
}

function latestReleaseTag(tags) {
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => RELEASE_TAG.test(tag))
    .sort((left, right) =>
      compareVersions(parseVersion(right), parseVersion(left)),
    )[0];
}

function readGitTags(rootDirectory) {
  try {
    return execFileSync("git", ["tag", "--list", "v*"], {
      cwd: rootDirectory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractReleaseNotes(changelog, version) {
  const heading = `## [${version}]`;
  const start = changelog.indexOf(heading);
  if (start === -1) {
    throw new Error(`CHANGELOG.md has no ${heading} entry`);
  }

  const bodyStart = changelog.indexOf("\n", start);
  const nextHeading = changelog.indexOf("\n## ", bodyStart + 1);
  const notes = changelog
    .slice(bodyStart + 1, nextHeading === -1 ? undefined : nextHeading)
    .trim();

  if (!notes) {
    throw new Error(`${heading} has no release notes`);
  }
  return notes;
}

function assertStoreScreenshot(rootDirectory) {
  const screenshot = fs.readFileSync(path.join(rootDirectory, STORE_SCREENSHOT));
  const { width, height } = STORE_SCREENSHOT_SIZE;
  if (
    screenshot.subarray(1, 4).toString() !== "PNG" ||
    screenshot.readUInt32BE(16) !== width ||
    screenshot.readUInt32BE(20) !== height
  ) {
    throw new Error(`${STORE_SCREENSHOT} must be a ${width}x${height} PNG`);
  }
}

function readReleaseMetadata(rootDirectory, options = {}) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDirectory, "package.json"), "utf8"),
  );
  const version = packageJson.version;
  if (typeof version !== "string" || !SEMVER.test(version)) {
    throw new Error("package.json version must be x.y.z semver");
  }
  assertWatchVersion(version);

  const previousTag = options.skipPreviousCheck
    ? undefined
    : (options.previous ?? latestReleaseTag(readGitTags(rootDirectory)));
  if (previousTag) {
    assertReleaseIncrement(version, previousTag);
  } else if (options.requirePrevious && !options.skipPreviousCheck) {
    throw new Error(
      "no released v* tag found; fetch tags or pass --previous <version>",
    );
  }

  assertStoreScreenshot(rootDirectory);

  const changelog = fs.readFileSync(
    path.join(rootDirectory, "CHANGELOG.md"),
    "utf8",
  );
  return {
    version,
    tag: `v${version}`,
    previousTag: previousTag ?? "",
    screenshot: STORE_SCREENSHOT,
    notes: extractReleaseNotes(changelog, version),
  };
}

function writeGitHubOutput(outputPath, metadata) {
  const delimiter = "PEBBLE_RELEASE_NOTES_EOF";
  if (metadata.notes.includes(delimiter)) {
    throw new Error("Release notes contain the GitHub output delimiter");
  }
  fs.appendFileSync(
    outputPath,
    `version=${metadata.version}\ntag=${metadata.tag}\nscreenshot=${metadata.screenshot}\nnotes<<${delimiter}\n${metadata.notes}\n${delimiter}\n`,
  );
}

function parseArguments(argv) {
  const options = {
    root: path.resolve(__dirname, ".."),
    previous: process.env.RELEASE_PREVIOUS_VERSION || undefined,
    requirePrevious: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--require-previous") {
      options.requirePrevious = true;
    } else if (argument === "--previous" || argument === "--root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} needs a value`);
      }
      options[argument.slice(2)] =
        argument === "--root" ? path.resolve(value) : value;
      index += 1;
    } else {
      throw new Error(`unknown argument ${argument}`);
    }
  }
  return options;
}

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const metadata = readReleaseMetadata(options.root, options);
    if (process.env.GITHUB_OUTPUT) {
      writeGitHubOutput(process.env.GITHUB_OUTPUT, metadata);
    }
    process.stdout.write(
      `${metadata.tag} (previous release: ${metadata.previousTag || "none found"})\n${metadata.notes}\n`,
    );
  } catch (error) {
    process.stderr.write(`release:check failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  assertReleaseIncrement,
  assertWatchVersion,
  extractReleaseNotes,
  latestReleaseTag,
  readReleaseMetadata,
  writeGitHubOutput,
};
