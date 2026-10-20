const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const workflow = fs.readFileSync(
  path.join(__dirname, "../.github/workflows/release.yml"), "utf8",
);
const publishStep = workflow.split("      - name: Publish release to Pebble app store\n")[1];
assert.ok(publishStep, "store publication step exists");
const runBlock = publishStep.match(/        run: \|\n([\s\S]*?)(?=\n      - name:|$)/);
assert.ok(runBlock, "store publication shell script exists");
const publishScript = runBlock[1].replace(/^          /gm, "");

// Execute the real workflow shell with synthetic credentials and stand-in
// commands. No SDK build, token request, or store upload occurs.
function runPublish(script) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pebble-publish-env-"));
  try {
    fs.writeFileSync(path.join(directory, "curl"),
      "#!/bin/sh\nprintf '%s' '{\"id_token\":\"synthetic-id-token\"}'\n",
      { mode: 0o755 });
    fs.writeFileSync(path.join(directory, "pebble"), `#!/bin/sh
if [ "\${CC+x}" = x ]; then
  echo 'publish rebuild inherited host CC' >&2
  exit 1
fi
if [ "$PEBBLE_FIREBASE_ID_TOKEN" != 'synthetic-id-token' ]; then
  echo 'publish did not receive ID token' >&2
  exit 1
fi
if [ "\${PEBBLE_FIREBASE_REFRESH_TOKEN+x}" = x ] || [ "\${PEBBLE_FIREBASE_API_KEY+x}" = x ]; then
  echo 'publish inherited long-lived credentials' >&2
  exit 1
fi
printf '%s\\n' "$@"
`, { mode: 0o755 });
    return spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
      encoding: "utf8",
      env: {
        PATH: `${directory}:${path.dirname(process.execPath)}:${process.env.PATH}`,
        CC: "gcc",
        PEBBLE_FIREBASE_API_KEY: "synthetic-api-key",
        PEBBLE_FIREBASE_REFRESH_TOKEN: "synthetic-refresh-token",
        RELEASE_NOTES: "Synthetic release notes",
        RELEASE_SCREENSHOT: "synthetic.png",
        RELEASE_VERSION: "0.3.0",
      },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("store publish rebuild uses SDK compiler and short-lived credentials", () => {
  const result = runPublish(publishScript);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\npublish\n/);
  assert.match(result.stdout, /--version\n0\.3\.0\n/);
  assert.match(result.stdout, /--non-interactive\n/);
});

test("publish regression probe detects the failed main workflow", () => {
  const result = runPublish(publishScript.replace(/^unset CC\s*$/m, ""));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /publish rebuild inherited host CC/);
});
