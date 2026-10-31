#!/usr/bin/env node
/**
 * export.mjs — build a portable migration package from one DSH profile.
 *
 * Package = declaration layer only:
 *   package.json, cordis.patch.yml, compatibility.json (optional),
 *   pnpm-lock.yaml (optional), README.md (optional),
 *   .profile-builder/** (mode baseline bookkeeping)
 * plus manifest.json with sha256 checksums.
 *
 * Generated / machine-bound files are left out: cordis.yml, node_modules,
 * desktop-next.*.json, .plugin-manager/, .dsh-market/, *.bak-*, logs.
 *
 * usage: node scripts/export.mjs --profile-dir <dir> --out <dir> [--force] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  sha256File, readJson, writeFile, ensureDir, listFilesRecursive,
  parseArgs, nowIso, out, fail,
} from './_lib.mjs';
import { runStaticCheck } from './static-check.mjs';

export const PACKAGE_SCHEMA = 1;
export const PORTABLE_FILES = [
  'package.json',
  'cordis.patch.yml',
  'compatibility.json',
  'pnpm-lock.yaml',
  'README.md',
  'manifest.json',
  'pnpm-workspace.yaml',
];
export const PORTABLE_DIRS = ['.profile-builder'];

function exclusionReason(rel) {
  if (/^node_modules(\/|$)/.test(rel)) return 'generated: installed dependencies';
  if (/^cordis\.yml$/.test(rel)) return 'generated: rewritten on every start (baseUrl anchor)';
  if (/^desktop-next\./.test(rel)) return 'host-binding: desktop launcher overlay';
  if (/^\.plugin-manager(\/|$)/.test(rel)) return 'generated: plugin manager state';
  if (/^\.dsh-market(\/|$)/.test(rel)) return 'generated: market cache/state';
  if (/\.bak-/.test(rel)) return 'generated: backup file';
  return 'not part of the portable declaration layer';
}

function isPortable(rel) {
  if (PORTABLE_FILES.indexOf(rel) >= 0) return true;
  return PORTABLE_DIRS.some(function (d) { return rel === d || rel.indexOf(d + '/') === 0; });
}

export function collectPortable(profileDir) {
  const files = [];
  const excluded = [];
  const all = listFilesRecursive(profileDir);
  all.sort();
  all.forEach(function (rel) {
    if (rel === 'manifest.json') {
      // a manifest left in a profile by a previous import is package metadata, not a
      // declaration file: always regenerate it instead of copying a stale one.
      excluded.push({ path: rel, reason: 'generated: previous migration manifest' });
      return;
    }
    if (isPortable(rel)) files.push(rel);
    else excluded.push({ path: rel, reason: exclusionReason(rel) });
  });
  return { files: files, excluded: excluded };
}

export function runExport(profileDir, outDir, opts) {
  opts = opts || {};
  const errors = [];
  const warnings = [];
  const src = path.resolve(profileDir);
  const dest = path.resolve(outDir);

  const checks = runStaticCheck(src, {});
  checks.warnings.forEach(function (w) { warnings.push({ id: 'SRC-' + w.id, detail: w.detail, file: w.file }); });
  if (!checks.ok) {
    checks.errors.forEach(function (e) { errors.push({ id: 'SRC-' + e.id, detail: e.detail, file: e.file }); });
    return { ok: false, errors: errors, warnings: warnings };
  }
  if (dest === src || dest.indexOf(src + path.sep) === 0) {
    return { ok: false, errors: [{ id: 'IO-OUT-INSIDE-SOURCE', detail: 'output directory must be outside the profile directory' }], warnings: warnings };
  }
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
    if (!opts.force) return { ok: false, errors: [{ id: 'IO-OUT-EXISTS', detail: 'output directory is not empty: ' + dest + ' (pass --force to overwrite)' }], warnings: warnings };
    // --force owns the destination: start from a clean directory so the produced package
    // still passes the migration whitelist check.
    fs.rmSync(dest, { recursive: true, force: true });
  }

  const pkg = readJson(path.join(src, 'package.json'));
  if (!pkg.ok) return { ok: false, errors: [{ id: 'PKG-READ', detail: pkg.error }], warnings: warnings };
  const profileName = path.basename(src);
  const collected = collectPortable(src);
  if (collected.files.indexOf('package.json') < 0 || collected.files.indexOf('cordis.patch.yml') < 0) {
    return { ok: false, errors: [{ id: 'PACKAGE-INCOMPLETE', detail: 'package.json and cordis.patch.yml are required' }], warnings: warnings };
  }

  ensureDir(dest);
  const manifestFiles = [];
  collected.files.forEach(function (rel) {
    const from = path.join(src, rel);
    const to = path.join(dest, rel);
    const buf = fs.readFileSync(from);
    ensureDir(path.dirname(to));
    fs.writeFileSync(to, buf);
    manifestFiles.push({ path: rel, bytes: buf.length, sha256: sha256File(from) });
  });

  const manifest = {
    schemaVersion: PACKAGE_SCHEMA,
    kind: 'dsh-profile-migration-package',
    exporter: 'dsh-profile-builder/export.mjs',
    exportedAt: nowIso(),
    profile: {
      name: profileName,
      packageName: pkg.value.name,
      bundles: (pkg.value.dsh && pkg.value.dsh.profile && pkg.value.dsh.profile.bundles) || [],
      dshRuntimeVersion: opts.runtimeVersion || process.env.DSH_RUNTIME_VERSION || null,
    },
    modes: (checks.modes || []).map(function (m) { return { modeId: m.modeId, order: m.order, pluginsSha: m.pluginsSha }; }),
    files: manifestFiles,
    excluded: collected.excluded,
  };
  writeFile(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  // verify the produced package against the migration whitelist (L0 purity on the package itself)
  const migration = runStaticCheck(dest, { migration: true });
  migration.errors.forEach(function (e) { errors.push({ id: 'PKG-' + e.id, detail: e.detail, file: e.file }); });
  if (errors.length) return { ok: false, errors: errors, warnings: warnings, manifest: manifest };

  return {
    ok: true, errors: [], warnings: warnings,
    outDir: dest,
    manifestPath: path.join(dest, 'manifest.json'),
    files: manifestFiles.map(function (f) { return f.path; }),
    excluded: collected.excluded,
    modes: manifest.modes,
    manifest: manifest,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args['profile-dir'] || !args.out) {
    console.error('usage: node scripts/export.mjs --profile-dir <dir> --out <dir> [--force] [--json] [--runtime-version <v>]');
    process.exit(2);
  }
  let result;
  try {
    result = runExport(args['profile-dir'], args.out, { force: !!args.force, runtimeVersion: args['runtime-version'] });
  } catch (e) {
    result = { ok: false, errors: [{ id: 'UNEXPECTED', detail: String((e && e.message) || e) }], warnings: [] };
  }
  if (args.json) { console.log(JSON.stringify(result, null, 2)); process.exit(result.ok ? 0 : 1); }
  if (!result.ok) {
    console.log('export: FAIL');
    result.errors.forEach(function (e) { console.log('  ERROR ' + e.id + ' ' + (e.file ? e.file + ': ' : '') + (e.detail || '')); });
    process.exit(1);
  }
  console.log('export: OK');
  console.log('  outDir: ' + result.outDir);
  console.log('  files: ' + result.files.join(', '));
  console.log('  modes: ' + (result.modes.length ? result.modes.map(function (m) { return m.modeId; }).join(', ') : '(none)'));
  console.log('  excluded: ' + result.excluded.length + ' generated/host-bound entries');
  result.warnings.forEach(function (w) { console.log('  warn  ' + w.id + ' ' + (w.detail || '')); });
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();
