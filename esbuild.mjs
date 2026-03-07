import esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const watch = process.argv.includes("--watch");
const root = process.cwd();
const dist = path.join(root, "dist");
const publicDir = path.join(root, "public");
const buildTimeApiKey = process.env.MOZILLA_BYO_AI_GRAMMAR_API_KEY ?? "";

function prepareDist() {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  cpSync(publicDir, dist, { recursive: true });
}

const shared = {
  bundle: true,
  sourcemap: true,
  target: "firefox128",
  logLevel: "info",
  define: {
    __MOZILLA_BYO_AI_GRAMMAR_API_KEY__: JSON.stringify(buildTimeApiKey)
  }
};

const builds = [
  {
    entryPoints: ["src/background/index.ts"],
    outfile: "dist/background.js",
    format: "esm"
  },
  {
    entryPoints: ["src/options/index.ts"],
    outfile: "dist/options.js",
    format: "esm"
  },
  {
    entryPoints: ["src/compose/compose-script.ts"],
    outfile: "dist/compose-script.js",
    format: "iife"
  }
];

async function buildAll() {
  prepareDist();
  if (watch) {
    const contexts = [];
    for (const config of builds) {
      const context = await esbuild.context({ ...shared, ...config });
      await context.watch();
      contexts.push(context);
    }
    console.log("Watching for changes...");
    return contexts;
  }

  for (const config of builds) {
    await esbuild.build({ ...shared, ...config });
  }
}

buildAll().catch((error) => {
  console.error(error);
  process.exit(1);
});
