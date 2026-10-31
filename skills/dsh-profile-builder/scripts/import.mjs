#!/usr/bin/env node
/**
 * import.mjs — install a migration package on the target machine.
 *
 * Copies the portable declaration layer of a package produced by export.mjs
 * into <dsh-home>/profiles/<profile-name>, rewrites package.json "name",
 * creates the standard pnpm-workspace.yaml when missing, verifies checksums,
 * then optionally runs pnpm install.
 *
 * usage: node scripts/import.mjs --from <package-dir> --profile-name <name>
 *        [--dsh-home <dir>] [--dry-run] [--install] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  sha256File, readJson, writeFile, ensureDir, listFilesRecursive,
  parseArgs, nowIso, out, fail,
} from './_lib.mjs';
import { runStaticCheck } from './static-check.mjs';
import { PACKAGE_SCHEMA, PORTABLE_FILES, PORTABLE_DIRS } from './export.mjs';

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const WORKSPACE_YAML = 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n';

function portableSet() {
  const set = {};
  PORTABLE_FILES.forEach(function (f) { if (f !== 'manifest.json') set[f] = true; });
  return set;
}

function isPortableFile(rel) {
  const set = portableSet();
  if (set[rel]) return true;
  return PORTABLE_DIRS.some(function (d) { return rel.indexOf(d + '/') === 0; });
}

function readManifest(packageDir) {
  const file = path.join(packageDir, 'manifest.json');
  if (!fs.existsSync(file)) return { ok: true, value: null, warning: 'manifest.json missing — falling back to directory scan (checksums unavailable)' };
  const r = readJson(file);
  if (!r.ok) return { ok: false, error: 'invalid manifest.json: ' + r.error };
  const m = r.value;
  if (!m || m.schemaVersion !== PACKAGE_SCHEMA) return { ok: false, error: 'unsupported manifest schemaVersion (expected ' + PACKAGE_SCHEMA + ')' };
  if (!Array.isArray(m.files) || m.files.length === 0) return { ok: false, error: 'manifest.files must be a non-empty array' };
  return { ok: true, value: m };
}

export function runImport(packageDir, profileName, opts) {
  opts = opts || {};
  const errors = [];
  const warnings = [];
  const pkgDir = path.resolve(packageDir);
  const name = String(profileName || '');
  if (!NAME_RE.test(name)) return { ok: false, errors: [{ id: 'PROFILE-NAME', detail: 'profile name must match ^[a-z0-9][a-z0-9-]{0,63}$' }], warnings: warnings };
  if (!fs.existsSync(pkgDir)) return { ok: false, errors: [{ id: 'IO-FROM', detail: 'package directory not found: ' + pkgDir }], warnings: warnings };

  const dshHome = path.resolve(opts.dshHome || process.env.DSH_HOME || path.join(os.homedir(), '.dsh'));
  const profilesDir = path.join(dshHome, 'profiles');
  if (!fs.existsSync(profilesDir) || !fs.statSync(profilesDir).isDirectory()) {
    return { ok: false, errors: [{ id: 'IO-DSH-HOME', detail: 'no profiles directory under ' + dshHome + ' — start DSH once on the target machine first' }], warnings: warnings };
  }
  const target = path.join(profilesDir, name);
  if (fs.existsSync(target)) {
    return { ok: false, errors: [{ id: 'IO-TARGET-EXISTS', detail: 'profile "' + name + '" already exists: ' + target + ' (pick another name or remove it manually)' }], warnings: warnings };
  }

  const manifestRes = readManifest(pkgDir);
  if (!manifestRes.ok) return { ok: false, errors: [{ id: 'MANIFEST-INVALID', detail: manifestRes.error }], warnings: warnings };
  const manifest = manifestRes.value;
  if (manifestRes.warning) warnings.push({ id: 'MANIFEST-MISSING', detail: manifestRes.warning });

  const migrate = runStaticCheck(pkgDir, { migration: true });
  migrate.warnings.forEach(function (w) { warnings.push({ id: 'PKG-' + w.id, detail: w.detail, file: w.file }); });
  if (!migrate.ok) {
    migrate.errors.forEach(function (e) { errors.push({ id: 'PKG-' + e.id, detail: e.detail, file: e.file }); });
    return { ok: false, errors: errors, warnings: warnings };
  }

  const copyList = [];
  if (manifest) {
    const listed = {};
    for (const f of manifest.files) {
      const rel = String(f.path || '');
      if (!rel || rel.indexOf('..') === 0 || path.isAbsolute(rel)) { errors.push({ id: 'MANIFEST-PATH', detail: 'unsafe path in manifest: ' + rel }); continue; }
      const abs = path.join(pkgDir, rel);
      if (!fs.existsSync(abs)) { errors.push({ id: 'MANIFEST-FILE-MISSING', detail: rel }); continue; }
      const sha = sha256File(abs);
      if (f.sha256 && sha !== f.sha256) { errors.push({ id: 'MANIFEST-SHA', detail: rel + ': expected ' + f.sha256 + ', got ' + sha }); continue; }
      listed[rel] = true;
      copyList.push(rel);
    }
    const present = listFilesRecursive(pkgDir).filter(function (rel) { return isPortableFile(rel); });
    present.forEach(function (rel) { if (!listed[rel]) warnings.push({ id: 'MANIFEST-UNLISTED', detail: rel + ' is in the package but not in manifest.files' }); });
  } else {
    listFilesRecursive(pkgDir).forEach(function (rel) { if (isPortableFile(rel)) copyList.push(rel); });
  }
  if (errors.length) return { ok: false, errors: errors, warnings: warnings };
  if (copyList.indexOf('package.json') < 0 || copyList.indexOf('cordis.patch.yml') < 0) {
    return { ok: false, errors: [{ id: 'PACKAGE-INCOMPLETE', detail: 'package must contain package.json and cordis.patch.yml' }], warnings: warnings };
  }

  const srcPkg = readJson(path.join(pkgDir, 'package.json'));
  if (!srcPkg.ok) return { ok: false, errors: [{ id: 'PKG-READ', detail: srcPkg.error }], warnings: warnings };
  const newPackageName = 'dsh-profile-' + name;
  const pkgText = fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8');
  const rewritten = pkgText.replace(/("name"[ \t]*:[ \t]*)"[^"]*"/, '$1' + JSON.stringify(newPackageName));
  if (!/"name"[ \t]*:[ \t]*"dsh-profile-/.test(rewritten)) {
    return { ok: false, errors: [{ id: 'PKG-NAME-REWRITE', detail: 'could not rewrite package.json "name"' }], warnings: warnings };
  }

  const plan = {
    ok: true,
    from: pkgDir,
    dshHome: dshHome,
    target: target,
    profileName: name,
    packageName: newPackageName,
    files: copyList.slice().sort(),
    workspaceFile: path.join(target, 'pnpm-workspace.yaml'),
    dryRun: !!opts.dryRun,
    errors: [], warnings: warnings,
  };
  if (opts.dryRun) return plan;

  ensureDir(target);
  copyList.forEach(function (rel) {
    const to = path.join(target, rel);
    ensureDir(path.dirname(to));
    fs.copyFileSync(path.join(pkgDir, rel), to);
  });
  fs.writeFileSync(path.join(target, 'package.json'), rewritten);
  if (!fs.existsSync(path.join(target, 'pnpm-workspace.yaml'))) fs.writeFileSync(path.join(target, 'pnpm-workspace.yaml'), WORKSPACE_YAML);

  // refresh manifest in the target so its checksums match the rewritten package.json
  if (manifest) {
    const next = JSON.parse(JSON.stringify(manifest));
    next.importedAt = nowIso();
    next.importedAs = name;
    next.packageName = newPackageName;
    next.files = next.files.map(function (f) {
      const abs = path.join(target, f.path);
      const buf = fs.statSync(abs).size;
      return Object.assign({}, f, { bytes: buf, sha256: sha256File(abs) });
    });
    fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(next, null, 2) + '\n');
  }

  const checks = runStaticCheck(target, {});
  checks.warnings.forEach(function (w) { warnings.push({ id: 'TARGET-' + w.id, detail: w.detail, file: w.file }); });
  if (!checks.ok) {
    checks.errors.forEach(function (e) { errors.push({ id: 'TARGET-' + e.id, detail: e.detail, file: e.file }); });
    plan.ok = false;
    plan.errors = errors;
    plan.warnings = warnings;
    plan.created = true;
    return plan;
  }

  plan.created = true;
  plan.modes = (checks.modes || []).map(function (m) { return m.modeId; });
  if (opts.install) {
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const r = spawnSync(pnpm, ['install'], { cwd: target, encoding: 'utf8', timeout: 300000, env: process.env });
    plan.install = {
      ran: true,
      exitCode: r.status,
      signal: r.signal || null,
      tail: ((r.stdout || '') + (r.stderr || '')).split('\n').slice(-15).join('\n'),
    };
    if (r.status !== 0) {
      plan.ok = false;
      plan.errors = [{ id: 'INSTALL-FAILED', detail: 'pnpm install exited ' + r.status + '; run it manually in ' + target }];
    }
  }
  return plan;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.from || !args['profile-name']) {
    console.error('usage: node scripts/import.mjs --from <package-dir> --profile-name <name> [--dsh-home <dir>] [--dry-run] [--install] [--json]');
    process.exit(2);
  }
  let result;
  try {
    result = runImport(args.from, args['profile-name'], { dshHome: args['dsh-home'], dryRun: !!args['dry-run'], install: !!args.install });
  } catch (e) {
    result = { ok: false, errors: [{ id: 'UNEXPECTED', detail: String((e && e.message) || e) }], warnings: [] };
  }
  if (args.json) { console.log(JSON.stringify(result, null, 2)); process.exit(result.ok ? 0 : 1); }
  if (!result.ok) {
    console.log('import: FAIL');
    (result.errors || []).forEach(function (e) { console.log('  ERROR ' + e.id + ' ' + (e.file ? e.file + ': ' : '') + (e.detail || '')); });
    (result.warnings || []).forEach(function (w) { console.log('  warn  ' + w.id + ' ' + (w.detail || '')); });
    process.exit(1);
  }
  console.log('import: OK');
  console.log('  target: ' + result.target);
  console.log('  packageName: ' + result.packageName);
  console.log('  files: ' + result.files.join(', '));
  console.log('  modes: ' + (result.modes && result.modes.length ? result.modes.join(', ') : '(none)'));
  if (result.install) console.log('  install: exit ' + result.install.exitCode);
  else console.log('  next: cd ' + result.target + ' && pnpm install');
  (result.warnings || []).forEach(function (w) { console.log('  warn  ' + w.id + ' ' + (w.detail || '')); });
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();
