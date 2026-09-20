#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';

const ROOT = process.cwd();
const APP = join(ROOT, 'apps/web/src/app');
const CREATIVE = join(ROOT, 'apps/web/src/components/creative');

async function walk(dir, files = []) {
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) await walk(full, files);
    else if (/\.(tsx|ts)$/.test(name)) files.push(full);
  }
  return files;
}

const appFiles = await walk(APP);
const creativeFiles = await walk(CREATIVE);
const pageFiles = appFiles.filter((f) => f.endsWith('/page.tsx'));
const routes = new Set(pageFiles.map((f) => {
  const dir = relative(APP, dirname(f)).replaceAll('\\', '/');
  return dir ? `/${dir}` : '/';
}));

const filesToCheck = [
  ...creativeFiles,
  ...appFiles.filter((f) => /\/(page|layout)\.tsx$/.test(f) && !f.includes('/api/')),
];

const errors = [];
for (const file of filesToCheck) {
  const text = await readFile(file, 'utf8');
  const rel = relative(ROOT, file).replaceAll('\\', '/');

  for (const m of text.matchAll(/href\s*=\s*["']([^"']*)["']/g)) {
    const href = m[1].trim();
    if (!href || href === '#') {
      errors.push(`${rel}: dead href ${JSON.stringify(href)}`);
      continue;
    }
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    // API endpoints are server routes, not page.tsx routes. They are validated by API/integration tests.
    if (href.startsWith('/api/')) continue;
    const pathname = href.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
    if (!routes.has(pathname)) errors.push(`${rel}: href points to missing app route ${href}`);
  }

  for (const m of text.matchAll(/<button\b([^>]*)>/g)) {
    const attrs = m[1];
    const intentionallyDisabled = /\bdisabled(?:=|\s|$)/.test(attrs) || /aria-disabled=["']true["']/.test(attrs);
    const actionable = /\bonClick\s*=/.test(attrs) || /\btype=["']submit["']/.test(attrs);
    if (!intentionallyDisabled && !actionable) {
      if (rel.includes('/components/creative/') || /apps\/web\/src\/app\/(video|image|audio|edit|layers|cinema|presets|automation|marketing)\//.test(rel)) {
        errors.push(`${rel}: button has no onClick/submit/disabled state: ${m[0].slice(0, 140)}`);
      }
    }
  }
}

if (errors.length) {
  console.error('Creative navigation gate failed:');
  for (const err of errors) console.error(` - ${err}`);
  process.exit(1);
}
console.log(`creative-links OK: ${routes.size} app routes, ${filesToCheck.length} TS/TSX files scanned`);
