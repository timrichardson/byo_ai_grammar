import { createWriteStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yazl from "yazl";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const distDir = path.join(root, "dist");
const packageJsonPath = path.join(root, "package.json");

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));

  const distStats = await stat(distDir).catch(() => null);
  if (!distStats?.isDirectory()) {
    throw new Error("dist/ does not exist. Run the build first.");
  }

  const outputPath = path.join(root, `${packageJson.name}-${packageJson.version}.xpi`);
  const files = await listFiles(distDir);

  await new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const output = createWriteStream(outputPath);

    output.on("close", resolve);
    output.on("error", reject);
    zip.outputStream.on("error", reject).pipe(output);

    for (const file of files) {
      zip.addFile(file, path.relative(distDir, file));
    }

    zip.end();
  });

  process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
