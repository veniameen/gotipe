#!/usr/bin/env node
// GoTipe Atlas — build: src/ parts → atlas.html (one file, opens without a server).
// usage: node design/atlas/build.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { OUTPUT, assemble } from "./lib/assemble.mjs";

const html = assemble();
writeFileSync(OUTPUT, html);
const size = Math.round(Buffer.byteLength(html) / 1024);
console.log(`atlas: ${path.relative(process.cwd(), OUTPUT)} · ${size} KB`);
