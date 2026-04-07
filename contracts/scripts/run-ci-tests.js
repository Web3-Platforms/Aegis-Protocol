const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const TEST_DIR = path.join(__dirname, "..", "test");

function getHardhatCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function getCiTestFiles() {
  const testFiles = [];

  function walk(currentDir, relativeDir = "test") {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name);
      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(absolutePath, relativePath);
        continue;
      }

      if (entry.name.endsWith(".test.js") && !entry.name.endsWith(".gas.test.js")) {
        testFiles.push(relativePath);
      }
    }
  }

  walk(TEST_DIR);
  return testFiles.sort();
}

function main() {
  const testFiles = getCiTestFiles();

  if (testFiles.length === 0) {
    console.error("No non-gas contract test files were found under contracts/test.");
    process.exit(1);
  }

  const result = spawnSync(getHardhatCommand(), ["hardhat", "test", ...testFiles], {
    stdio: "inherit",
    env: {
      ...process.env,
      HARDHAT_DISABLE_TELEMETRY_PROMPT: "true",
    },
  });

  process.exit(result.status ?? 1);
}

main();
