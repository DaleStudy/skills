#!/usr/bin/env node
// dump.mjs — L1 authoritative layer: run the official dsh --dump-config and inspect the
// composed plugin tree. This is the only check that proves the launcher can actually build
// the profile; never claim L1 without it.
// Usage:
//   node dump.mjs --profile <name> [--dsh-home <dir>] [--app <path>] [--raw-out <file>] [--json]
//                  [--required-rows a,b,c] [--mode <modeId>] [--baseline <baseline-ptc-x.yml>]
//                  [--profile-dir <dir>] [--expect-default <modeId>]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  entryConfig, entryId, parseArgs, pluginsCanonicalFromEntry,
  readBaselineYml, topLevelEntries,
} from './_lib.mjs';

const DEFAULT_REQUIRED_ROWS = ['agent-loop', 'modules', 'connection'];
const DEFAULT_REQUIRED_ROWS_WEB = ['webserver', 'web-runtime'];

function resolveApp(args) {
  const app = args.app || process.env.DSH_APP || '/Applications/DSH NEXT.app';
  let bin = app;
  let cli = args.cli || null;
  let asar = false;
  if (/\.app$/.test(app)) {
    bin = path.join(app, 'Contents', 'MacOS', 'DSH NEXT');
    if (!cli) {
      cli = path.join(app, 'Contents', 'Resources', 'app.asar', 'lib', 'desktop-cli.js');
      asar = true; // readable by Electron's asar layer, not by plain fs.existsSync
    }
  }
  return { app: app, bin: bin, cli: cli, asar: asar };
}

export function runDump(opts) {
  const errors = [];
  const warnings = [];
  const checks = [];
  function check(id, ok, severity, detail, extra) {
    const row = Object.assign({ id: id, ok: ok }, extra || {});
    if (!ok) (severity === 'error' ? errors : warnings).push(Object.assign({ id: id, detail: detail }, extra || {}));
    checks.push(row);
    return ok;
  }
  const app = resolveApp(opts);
  if (!fs.existsSync(app.bin)) {
    return { schemaVersion: 1, ok: false, errors: [{ id: 'APP-NOT-FOUND', detail: 'dsh executable not found: ' + app.bin + ' (set --app or DSH_APP)' }], warnings: [], checks: [] };
  }
  if (!app.cli || (!app.asar && !fs.existsSync(app.cli))) {
    return { schemaVersion: 1, ok: false, errors: [{ id: 'APP-CLI-NOT-FOUND', detail: 'desktop-cli.js not found: ' + String(app.cli) }], warnings: [], checks: [] };
  }
  const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
  if (opts.dshHome) env.DSH_HOME = opts.dshHome;
  const res = spawnSync(app.bin, ['--expose-internals', app.cli, '--profile', opts.profile, '--dump-config'], {
    env: env,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  if (opts.rawOut) {
    fs.mkdirSync(path.dirname(path.resolve(opts.rawOut)), { recursive: true });
    fs.writeFileSync(opts.rawOut, stdout);
  }
  const exitOk = res.status === 0;
  if (!check('RUNTIME-DUMP-EXIT', exitOk, 'error', 'dsh --dump-config exited ' + res.status + (res.error ? ' (' + res.error.message + ')' : '') + '; stderr: ' + stderr.split('\n').filter(Boolean).slice(-3).join(' | '))) {
    return { schemaVersion: 1, ok: false, exitCode: res.status, stderr: stderr, lineCount: stdout.split('\n').length, errors: errors, warnings: warnings, checks: checks };
  }
  check('RUNTIME-STDERR', stderr.trim() === '', 'warn', 'dump wrote to stderr (inspect for skip/disable markers): ' + stderr.split('\n').filter(Boolean).slice(-5).join(' | '));
  const badMarkers = stderr.split('\n').filter(function (l) { return /skipping profile bundle|disabling profile plugin row|incompatible|does not exist/i.test(l); });
  badMarkers.forEach(function (l) { warnings.push({ id: 'RUNTIME-MARKER', detail: l.trim() }); });
  if (badMarkers.length) checks.push({ id: 'RUNTIME-MARKER', ok: false });

  const entries = topLevelEntries(stdout);
  const ids = [];
  entries.forEach(function (e) { const id = entryId(e.text); if (id) ids.push(id); });
  const required = (opts.requiredRows && opts.requiredRows.split(',').map(function (s) { return s.trim(); }).filter(Boolean)) || DEFAULT_REQUIRED_ROWS.concat(DEFAULT_REQUIRED_ROWS_WEB);
  required.forEach(function (id) {
    check('REQUIRED-ROW', ids.indexOf(id) >= 0, 'error', 'required composed row "' + id + '" missing from --dump-config output', { row: id });
  });
  const seen = {};
  const dups = [];
  ids.forEach(function (id) { if (seen[id]) dups.push(id); seen[id] = true; });
  check('DUMP-DUP-ROW', dups.length === 0, 'warn', 'duplicate composed rows: ' + dups.join(', '));

  // ---- optional: verify a custom agent mode against its recorded baseline ----
  if (opts.mode) {
    const presetRowId = 'preset-' + opts.mode;
    const found = entries.find(function (e) { return entryId(e.text) === presetRowId; });
    if (!check('MODE-ROW', !!found, 'error', 'composed tree has no "' + presetRowId + '" row; the mode insert did not land', { modeId: opts.mode })) {
      return finish();
    }
    const cfg = entryConfig(found.text);
    const modeId = cfg ? cfg.value('id') : null;
    check('MODE-ROW-CONFIG-ID', modeId === opts.mode, 'error', 'preset row config.id is "' + modeId + '", expected "' + opts.mode + '"', { modeId: opts.mode });
    const order = cfg ? cfg.value('order') : null;
    check('MODE-ROW-ORDER', Number.isInteger(Number(order)) && Number(order) >= 5, 'warn', 'preset row config.order "' + order + '" is not an integer >= 5', { modeId: opts.mode });
    const plugins = pluginsCanonicalFromEntry(found.text);
    let baseline = null;
    let basePath = opts.baseline || null;
    if (!basePath && opts.profileDir) basePath = path.join(opts.profileDir, '.profile-builder', 'baseline-ptc-' + opts.mode + '.yml');
    if (!check('MODE-BASELINE-FOUND', !!basePath, 'error', 'no baseline file for mode; pass --baseline or --profile-dir', { modeId: opts.mode })) return finish();
    baseline = readBaselineYml(basePath);
    if (!check('MODE-BASELINE-READ', baseline.ok, 'error', 'cannot read baseline: ' + (baseline.error || ''), { modeId: opts.mode })) return finish();
    const same = plugins && plugins.sha === baseline.sha;
    check('MODE-SHA', same, 'error', 'composed mode plugins differ from baseline (dump sha ' + String(plugins && plugins.sha).slice(0, 12) + ' vs baseline ' + String(baseline.sha).slice(0, 12) + ')', { modeId: opts.mode });
    if (same) checks.push({ id: 'MODE-PLUGINS', ok: true, modeId: opts.mode, sha: plugins.sha });
  }

  if (opts.expectDefault) {
    const reg = entries.find(function (e) { return entryId(e.text) === 'agent-preset-registry'; });
    if (check('REGISTRY-ROW', !!reg, 'error', 'composed tree has no agent-preset-registry row')) {
      const cfg = entryConfig(reg.text);
      const def = cfg ? cfg.value('default') : null;
      const sel = cfg ? cfg.value('selectedDefault') : null;
      check('REGISTRY-DEFAULT', def === opts.expectDefault, 'warn', 'agent-preset-registry default is "' + def + '", expected "' + opts.expectDefault + '"', {});
      void sel;
    }
  }

  function finish() {
    return {
      schemaVersion: 1,
      ok: errors.length === 0,
      exitCode: res.status,
      stderr: stderr,
      lineCount: stdout.split('\n').length,
      requiredRows: required,
      errors: errors,
      warnings: warnings,
      checks: checks,
    };
  }
  return finish();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.profile) {
    console.error('usage: node dump.mjs --profile <name> [--dsh-home <dir>] [--app <path>] [--raw-out <file>] [--json] [--mode <modeId>] [--baseline <yml>] [--profile-dir <dir>]');
    process.exit(2);
  }
  const result = runDump({
    profile: args.profile,
    dshHome: args['dsh-home'],
    app: args.app,
    cli: args.cli,
    rawOut: args['raw-out'],
    requiredRows: args['required-rows'],
    mode: args.mode,
    baseline: args.baseline,
    profileDir: args['profile-dir'],
    expectDefault: args['expect-default'],
  });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('dsh-profile-builder dump: ' + (result.ok ? 'OK' : 'FAIL') + ' (' + result.errors.length + ' errors, ' + result.warnings.length + ' warnings, ' + result.lineCount + ' lines)');
    result.errors.forEach(function (e) { console.log('  ERROR ' + e.id + ' ' + (e.detail || '')); });
    result.warnings.forEach(function (w) { console.log('  warn  ' + w.id + ' ' + (w.detail || '')); });
  }
  process.exit(result.ok ? 0 : 1);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();
