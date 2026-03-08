import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const packageJsonPath = path.join(root, "package.json");
const packageLockPath = path.join(root, "package-lock.json");
const manifestPath = path.join(root, "public", "manifest.json");

function runGit(args, options = {}) {
  const output = execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  });

  return typeof output === "string" ? output.trim() : "";
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (key === "help") {
      options.help = true;
      continue;
    }

    const value = argv[index + 1];
    if (typeof value === "undefined" || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

function printHelp() {
  console.log("Prepare a new local BYO AI Grammar release.");
  console.log("");
  console.log("This script:");
  console.log("  1. Verifies the git working tree is clean");
  console.log("  2. Bumps the package and manifest version");
  console.log("  3. Commits the version bump");
  console.log("  4. Builds a new .xpi package");
  console.log("  5. Removes all but the newest three .xpi files");
  console.log("  6. Creates a source .zip archive from the committed git tree");
  console.log("");
  console.log("Optional:");
  console.log("  --version <x.y.z>   Use an explicit version instead of auto-bumping PATCH");
}

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid version: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function bumpPatchVersion(version) {
  const parsed = parseVersion(version);
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

function compareSemver(left, right) {
  const leftParsed = parseVersion(left);
  const rightParsed = parseVersion(right);

  if (leftParsed.major !== rightParsed.major) {
    return leftParsed.major - rightParsed.major;
  }
  if (leftParsed.minor !== rightParsed.minor) {
    return leftParsed.minor - rightParsed.minor;
  }
  return leftParsed.patch - rightParsed.patch;
}

async function updateJsonVersion(filePath, nextVersion) {
  const json = JSON.parse(await readFile(filePath, "utf8"));
  json.version = nextVersion;

  if (filePath === packageLockPath && json.packages?.[""]) {
    json.packages[""].version = nextVersion;
  }

  await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
}

function assertCleanWorktree() {
  const status = runGit(["status", "--porcelain", "--untracked-files=all"]);
  if (status) {
    throw new Error("Git working tree is not clean. Commit or stash changes before preparing a release.");
  }
}

async function pruneOldXpis(packageName) {
  const entries = await readdir(root);
  const xpis = entries
    .map((name) => {
      const match = name.match(new RegExp(`^${packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\d+\.\d+\.\d+)\\.xpi$`));
      return match ? { name, version: match[1] } : null;
    })
    .filter((entry) => entry !== null)
    .sort((left, right) => compareSemver(left.version, right.version));

  const toDelete = xpis.slice(0, Math.max(0, xpis.length - 3));
  for (const entry of toDelete) {
    await rm(path.join(root, entry.name), { force: true });
  }
}

async function createSourceArchive(packageName, version) {
  const archiveName = `${packageName}-${version}-source.zip`;
  const outputPath = path.join(root, archiveName);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `${packageName}-release-`));
  const prefix = `${packageName}-${version}-source/`;

  try {
    execFileSync("git", ["archive", `--output=${path.join(tempDir, archiveName)}`, "--format=zip", `--prefix=${prefix}`, "HEAD"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    });

    await rm(outputPath, { force: true });
    const zipStats = await stat(path.join(tempDir, archiveName));
    if (!zipStats.isFile()) {
      throw new Error("Source archive was not created.");
    }

    const zipBuffer = await readFile(path.join(tempDir, archiveName));
    await writeFile(outputPath, zipBuffer);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  return outputPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  assertCleanWorktree();

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const currentVersion = packageJson.version;
  const nextVersion = args.version ? String(args.version).trim() : bumpPatchVersion(currentVersion);
  parseVersion(nextVersion);

  if (nextVersion === currentVersion) {
    throw new Error(`Version is already ${currentVersion}.`);
  }

  await updateJsonVersion(packageJsonPath, nextVersion);
  await updateJsonVersion(packageLockPath, nextVersion);
  await updateJsonVersion(manifestPath, nextVersion);

  runGit(["add", "package.json", "package-lock.json", "public/manifest.json"]);
  execFileSync("git", ["commit", "-m", `Bump release version to ${nextVersion}`], { cwd: root, stdio: "inherit" });

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npmCommand, ["run", "package"], { cwd: root, stdio: "inherit" });
  await pruneOldXpis(packageJson.name);
  const archivePath = await createSourceArchive(packageJson.name, nextVersion);

  console.log("");
  console.log(`Prepared release ${nextVersion}`);
  console.log(`XPI: ${path.join(root, `${packageJson.name}-${nextVersion}.xpi`)}`);
  console.log(`Source archive: ${archivePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
