const fs = require("node:fs");
const path = require("node:path");

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

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

function readReleaseMetadata(rootDirectory) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDirectory, "package.json"), "utf8"),
  );
  const version = packageJson.version;
  if (typeof version !== "string" || !SEMVER.test(version)) {
    throw new Error("package.json version must be x.y.z semver");
  }

  const changelog = fs.readFileSync(
    path.join(rootDirectory, "CHANGELOG.md"),
    "utf8",
  );
  return {
    version,
    tag: `v${version}`,
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
    `version=${metadata.version}\ntag=${metadata.tag}\nnotes<<${delimiter}\n${metadata.notes}\n${delimiter}\n`,
  );
}

if (require.main === module) {
  const metadata = readReleaseMetadata(path.resolve(__dirname, ".."));
  if (process.env.GITHUB_OUTPUT) {
    writeGitHubOutput(process.env.GITHUB_OUTPUT, metadata);
  }
  process.stdout.write(`${metadata.tag}\n${metadata.notes}\n`);
}

module.exports = {
  extractReleaseNotes,
  readReleaseMetadata,
  writeGitHubOutput,
};
