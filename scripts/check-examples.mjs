import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkStarterPage } from "./examples/browser.mjs";
import { registryProblems } from "./examples/registry.mjs";
import { rangeProblems } from "./examples/releases.mjs";

/**
 * The starters in examples/ as their users get them: each is copied out of the repository,
 * installed from npm, built, served (production and the dev server) and opened in Chromium.
 * The registry item is installed with the shadcn CLI into the Next.js starter stripped of
 * GoTipe, then built and opened the same way. The copies live in a temporary directory,
 * outside this workspace, so nothing resolves to the packages of this tree.
 */
const root = path.resolve(import.meta.dirname, "..");
/** The shadcn CLI of the install check, pinned so that a run is repeatable. */
const SHADCN = "shadcn@4.23.0";
const channel = process.env.GOTIPE_E2E_CHANNEL;
const STARTERS = [
  {
    name: "nextjs",
    component: "components/editor.tsx",
    production: ["next", "start"],
    development: ["next", "dev"],
  },
  {
    name: "vite-react",
    component: "src/editor.tsx",
    production: ["vite", "preview", "--strictPort"],
    development: ["vite", "--strictPort"],
  },
];

/** What a local run of a starter leaves behind; a copy starts without it, as a clone does. */
const LOCAL_OUTPUT = new Set(["node_modules", ".next", "dist", "next-env.d.ts"]);

const problems = [
  ...registryProblems(root),
  ...componentProblems(),
  ...(await rangeProblems(STARTERS.map(({ name }) => ({ name, manifest: manifestOf(name) })))),
];
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const run = mkdtempSync(path.join(tmpdir(), "gotipe-examples-"));
for (const starter of STARTERS) {
  const project = copyStarter(starter.name, path.join(run, starter.name));
  npm(["install"], project);
  npm(["run", "build"], project);
  await serveAndCheck(project, starter.production, `${starter.name}, production build`);
  await serveAndCheck(project, starter.development, `${starter.name}, dev server`);
}
await checkRegistryInstall(path.join(run, "shadcn"));
rmSync(run, { recursive: true, force: true });
console.log("The starters and the registry item build and work.");

/** The Vite starter's editor is the Next.js one, which the registry item ships, without "use client". */
function componentProblems() {
  const [nextjs, vite] = STARTERS.map(({ name, component }) =>
    readFileSync(path.join(root, "examples", name, component), "utf8"),
  );
  return nextjs === `"use client";\n\n${vite}`
    ? []
    : ['examples: vite-react/src/editor.tsx must be nextjs\'s editor without its "use client"'];
}

async function checkRegistryInstall(project) {
  copyStarter("nextjs", project);
  const manifest = manifestOf("nextjs");
  for (const name of Object.keys(manifest.dependencies)) {
    if (name.startsWith("@gotipe/")) delete manifest.dependencies[name];
  }
  writeJson(path.join(project, "package.json"), manifest);
  rmSync(path.join(project, "components/editor.tsx"));
  writeJson(path.join(project, "components.json"), {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "new-york",
    rsc: true,
    tsx: true,
    tailwind: { config: "", css: "app/globals.css", baseColor: "neutral", cssVariables: true },
    aliases: {
      components: "@/components",
      utils: "@/lib/utils",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
    },
  });
  npm(["install"], project);
  const items = path.join(project, "..", "registry");
  exec("npx", ["--yes", SHADCN, "build", "registry.json", "--output", items], root);
  exec("npx", ["--yes", SHADCN, "add", path.join(items, "block-editor.json"), "--yes"], project);
  const written = readFileSync(path.join(project, "components/editor.tsx"), "utf8");
  if (written !== readFileSync(path.join(root, "examples/nextjs/components/editor.tsx"), "utf8")) {
    throw new Error(
      "shadcn add wrote a components/editor.tsx that differs from the registry's file",
    );
  }
  npm(["run", "build"], project);
  await serveAndCheck(
    project,
    STARTERS[0].production,
    "registry item in Next.js, production build",
  );
}

async function serveAndCheck(project, [command, ...args], label) {
  const port = await freePort();
  const server = spawn(
    path.join(project, "node_modules/.bin", command),
    [...args, "--port", String(port)],
    { cwd: project, detached: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } },
  );
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    output += chunk;
  });
  try {
    const url = `http://localhost:${port}/`;
    await waitForPage(url, server);
    await checkStarterPage(url, { channel });
    console.log(`ok: ${label}`);
  } catch (error) {
    throw new Error(`${label} failed. Server output:\n${output}`, { cause: error });
  } finally {
    stop(server);
  }
}

async function waitForPage(url, server) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`the server exited with ${server.exitCode}`);
    const response = await fetch(url).catch(() => null);
    if (response?.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} did not answer within two minutes`);
}

function stop(server) {
  if (server.exitCode !== null) return;
  // The dev servers start workers of their own: end the whole process group.
  process.kill(-server.pid, "SIGTERM");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function copyStarter(name, target) {
  mkdirSync(target, { recursive: true });
  cpSync(path.join(root, "examples", name), target, {
    recursive: true,
    filter: (file) => !LOCAL_OUTPUT.has(path.basename(file)),
  });
  return target;
}

function npm(args, cwd) {
  exec("npm", [...args, "--no-audit", "--no-fund", "--loglevel=error"], cwd);
}

function exec(command, args, cwd) {
  try {
    execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    });
  } catch (error) {
    process.stderr.write(String(error.stdout ?? "") + String(error.stderr ?? error.message));
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}`, { cause: error });
  }
}

function manifestOf(name) {
  return JSON.parse(readFileSync(path.join(root, "examples", name, "package.json"), "utf8"));
}

function writeJson(filename, value) {
  writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}
