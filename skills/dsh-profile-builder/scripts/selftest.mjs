#!/usr/bin/env node
// selftest.mjs — offline self-test suite for dsh-profile-builder.
//
// Everything here runs without the DSH app and without network: fixtures cover the
// authoritative dump shape, and temp profiles/profiles-homes cover the file workflows.
// The live L1 dump is exercised separately (references/30-verification.md).
//
// usage: node scripts/selftest.mjs [--keep] [--json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runStaticCheck } from './static-check.mjs';
import { cmdExtract, cmdEmit, cmdVerify, cmdRefresh, cmdReplay, applyOps } from './mode-base.mjs';
import { runExport } from './export.mjs';
import { runImport } from './import.mjs';
import { runDump } from './dump.mjs';
import { readBaselineYml, readJson, sha256, sha256File, writeFile } from './_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, '..', 'tests', 'fixtures');
const DUMP_FIXTURE = path.join(FIX, 'dump-web.txt');
const DUMP_MOVED = path.join(FIX, 'dump-ptc-moved.txt');
const FIXTURE_SHA = '0aff23a2d433509cd92c9b6c000f45f8585a2890a62a1e95a8ea209b36ab867c';
const FIXTURE_MOVED_SHA = '3170a1b1afc2632902f954d42d31ae056d4bb116ba85b1c6a4b641b955e32023';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dpb-selftest-'));

let passed = 0;
let failed = 0;
const failures = [];
const tests = [];

function test(name, fn) { tests.push({ name: name, fn: fn }); }
function runTests() {
  tests.forEach(function (t, i) {
    const label = String(i + 1) + '. ' + t.name;
    try {
      t.fn();
      passed++;
      console.log('  ok   ' + label);
    } catch (e) {
      failed++;
      failures.push({ name: t.name, error: String((e && e.message) || e) });
      console.log('  FAIL ' + label + ' — ' + String((e && e.message) || e));
    }
  });
}

let seq = 0;
function tmpDir(name) { const d = path.join(TMP, name + '-' + (++seq)); fs.mkdirSync(d, { recursive: true }); return d; }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}
function errIds(res) { return ((res && res.errors) || []).map(function (e) { return e.id; }); }
function assertOk(res, msg) {
  if (!res || res.ok !== true) {
    throw new Error((msg ? msg + ': ' : '') + 'expected ok, got [' + errIds(res).join(', ') + ']' + (res && res.errors && res.errors[0] && res.errors[0].detail ? ' (' + res.errors[0].detail + ')' : ''));
  }
}
function assertErr(res, id, msg) {
  if (!res || res.ok !== false) throw new Error((msg ? msg + ': ' : '') + 'expected failure ' + id + ', got ok');
  if (!errIds(res).includes(id)) throw new Error((msg ? msg + ': ' : '') + 'expected error ' + id + ', got [' + errIds(res).join(', ') + ']');
}
function hasCheck(res, id) { return ((res && res.checks) || []).some(function (c) { return c.id === id && c.ok; }); }

function writeProfile(dir, opts) {
  opts = opts || {};
  fs.mkdirSync(dir, { recursive: true });
  const name = opts.name || path.basename(dir);
  const pkg = {
    name: 'dsh-profile-' + name,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), opts.patch || '[]\n');
  Object.keys(opts.extra || {}).forEach(function (rel) { writeFile(path.join(dir, rel), opts.extra[rel]); });
  return dir;
}
function modeProfile(dir) {
  writeProfile(dir, {});
  const base = extractBaseline('base-' + path.basename(dir));
  const r = emit(dir, base, {});
  assertOk(r, 'emit fixture mode');
  return dir;
}
function extractBaseline(name, dump) {
  const out = path.join(TMP, name + '.yml');
  const r = cmdExtract({ dump: dump || DUMP_FIXTURE, preset: 'ptc', out: out });
  assertOk(r, 'extract baseline ' + name);
  return out;
}
function emit(profileDir, baseline, opts) {
  opts = opts || {};
  const args = {
    baseline: baseline,
    'mode-id': opts.modeId || 'lab-a',
    'mode-name': opts.modeName || 'Lab A',
    description: opts.description || 'a custom lab mode for tests',
    order: String(opts.order || 5),
    'profile-dir': profileDir,
    write: true,
  };
  if (opts.ops) args.ops = opts.ops;
  if (opts.replace) args.replace = true;
  return cmdEmit(args);
}
function opsLedger(name, ops) {
  const file = path.join(TMP, name + '.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, modeId: 'lab-a', ops: ops }, null, 2) + '\n');
  return file;
}
function appendPluginToPatch(patchPath, id, name) {
  fs.appendFileSync(patchPath, '          - id: ' + id + '\n            name: \'' + (name || '@deepseek-ai/dsh-tool-fs') + '\'\n');
}
function makeFakeApp(dir, dumpPath, exitCode) {
  fs.mkdirSync(dir, { recursive: true });
  const cli = path.join(dir, 'cli.js');
  if (exitCode) fs.writeFileSync(cli, 'process.stderr.write(\'fake dump failure\\n\'); process.exit(' + exitCode + ');\n');
  else fs.writeFileSync(cli, 'process.stdout.write(require(\'node:fs\').readFileSync(' + JSON.stringify(dumpPath) + ', \'utf8\'));\n');
  const bin = path.join(dir, 'fakebin');
  fs.writeFileSync(bin, '#!/bin/sh\nexec node "' + cli + '" "$@"\n', { mode: 0o755 });
  return { bin: bin, cli: cli };
}

// ============================== L0 static-check ==============================

test('static-check: minimal valid profile passes', function () {
  const dir = writeProfile(tmpDir('valid'));
  const r = runStaticCheck(dir, {});
  assertOk(r);
  assertEq(r.summary.errorCount, 0, 'errorCount');
  assert(hasCheck(r, 'PKG-BUNDLES'), 'PKG-BUNDLES check missing');
});

test('static-check: comments-only cordis.patch.yml is fatal', function () {
  const r = runStaticCheck(path.join(FIX, 'profiles', 'bad-comment-only-patch'), {});
  assertErr(r, 'PATCH-TOP-ARRAY');
});

test('static-check: missing package.json is fatal', function () {
  const r = runStaticCheck(path.join(FIX, 'profiles', 'bad-missing-package'), {});
  assertErr(r, 'PKG-EXISTS');
});

test('static-check: secret-like value is a hard error', function () {
  const dir = writeProfile(tmpDir('secret'), {
    patch: '- id: tool-x\n  name: \'@deepseek-ai/dsh-tool-fs\'\n  config:\n    apiKey: sk-abcdefghijklmnopqrstuvwxyz\n',
  });
  const r = runStaticCheck(dir, {});
  assertErr(r, 'PURITY-NO-SECRET');
});

test('static-check: machine-bound absolute path is a hard error', function () {
  const dir = writeProfile(tmpDir('machine-path'), {
    patch: '- id: tool-x\n  name: \'@deepseek-ai/dsh-tool-fs\'\n  config:\n    path: /Users/example/dev/data\n',
  });
  const r = runStaticCheck(dir, {});
  assertErr(r, 'PURITY-NO-MACHINE-PATH');
});

test('static-check: literal credential value is a warning, not an error', function () {
  const dir = writeProfile(tmpDir('plain-cred'), {
    patch: '- id: tool-x\n  name: \'@deepseek-ai/dsh-tool-fs\'\n  config:\n    apiKey: hello\n',
  });
  const r = runStaticCheck(dir, {});
  assertOk(r);
  assert(r.warnings.some(function (w) { return w.id === 'PURITY-PLAINTEXT-CREDENTIAL-KEY'; }), 'expected purity warning');
});

test('static-check: migration mode rejects non-portable entries', function () {
  const dir = writeProfile(tmpDir('mig-extra'), { extra: { 'evil.txt': 'nope\n' } });
  const r = runStaticCheck(dir, { migration: true });
  assertErr(r, 'MIGRATION-CLEAN');
});

test('static-check: migration mode rejects generated artifacts', function () {
  const dir = writeProfile(tmpDir('mig-generated'), { extra: { 'cordis.yml': 'baseUrl: x\n' } });
  const r = runStaticCheck(dir, { migration: true });
  assertErr(r, 'MIGRATION-NO-GENERATED');
});

test('static-check: reserved mode id and bad order are errors', function () {
  const patch = [
    '- insert:',
    '    - id: preset-standard',
    "      name: '@deepseek-ai/dsh-agent-preset'",
    '      config:',
    '        id: standard',
    "        name: 'Shadow'",
    "        description: 'collides with a built-in'",
    '        order: 3',
    '        plugins:',
    '          - id: persona',
    "            name: '@deepseek-ai/dsh-persona'",
    '',
  ].join('\n');
  const dir = writeProfile(tmpDir('bad-mode'), { patch: patch });
  const r = runStaticCheck(dir, {});
  assertErr(r, 'MODE-RESERVED-ID');
  assertErr(r, 'MODE-ORDER');
});

// ============================== mode-base ==============================

test('mode-base: extract from fixture reproduces the official ptc baseline', function () {
  const yml = extractBaseline('extract-shape');
  const b = readBaselineYml(yml);
  assertOk(b);
  assertEq(b.sha, FIXTURE_SHA, 'baseline sha');
  assertEq(b.preset, 'ptc', 'preset');
  const base = cmdExtract({ dump: DUMP_FIXTURE, preset: 'ptc' });
  assertOk(base);
  assertEq(base.plugins, 154, 'plugin count');
});

test('mode-base: moved official baseline has a different sha', function () {
  const base = cmdExtract({ dump: DUMP_MOVED, preset: 'ptc' });
  assertOk(base);
  assertEq(base.sha256, FIXTURE_MOVED_SHA, 'moved baseline sha');
  assertEq(base.plugins, 156, 'moved plugin count');
});

test('mode-base: emit writes a verifiable mode insert and bookkeeping', function () {
  const dir = writeProfile(tmpDir('emit-ok'));
  const base = extractBaseline('emit-base');
  const r = emit(dir, base);
  assertOk(r, 'emit');
  assertEq(r.sha256, FIXTURE_SHA, 'emitted sha');
  assert(fs.existsSync(path.join(dir, '.profile-builder', 'baseline-lab-a.json')), 'baseline json missing');
  assert(fs.existsSync(path.join(dir, '.profile-builder', 'baseline-ptc-lab-a.yml')), 'baseline yml missing');
  const patch = fs.readFileSync(path.join(dir, 'cordis.patch.yml'), 'utf8');
  assert(patch.indexOf('- id: preset-lab-a') >= 0, 'insert row missing');
  assert(patch.indexOf("name: '@deepseek-ai/dsh-agent-preset'") >= 0, 'preset plugin name missing');
  const v = cmdVerify({ 'profile-dir': dir, 'mode-id': 'lab-a' });
  assertOk(v, 'verify');
  assertEq(v.opsApplied, 0, 'opsApplied');
  const sc = runStaticCheck(dir, {});
  assertOk(sc, 'static-check after emit');
  assertEq(sc.summary.modeCount, 1, 'modeCount');
});

test('mode-base: emit duplicate without --replace is refused', function () {
  const dir = modeProfile(tmpDir('emit-dup'));
  const base = extractBaseline('emit-dup-base');
  const r = emit(dir, base);
  assertErr(r, 'MODE-EXISTS');
});

test('mode-base: reserved id and order below 5 are refused', function () {
  const dir = writeProfile(tmpDir('emit-reserved'));
  const base = extractBaseline('emit-reserved-base');
  assertErr(emit(dir, base, { modeId: 'standard' }), 'MODE-RESERVED-ID');
  assertErr(emit(dir, base, { order: 4 }), 'MODE-ORDER');
});

test('mode-base: tampered baseline sha is refused', function () {
  const dir = writeProfile(tmpDir('emit-badbase'));
  const base = extractBaseline('emit-badbase-base');
  const text = fs.readFileSync(base, 'utf8').replace(/^sha256:.*$/m, 'sha256: ' + '0'.repeat(64));
  const bad = path.join(TMP, 'tampered-baseline.yml');
  fs.writeFileSync(bad, text);
  assertErr(emit(dir, bad), 'BASELINE-SHA');
});

test('mode-base: ops replay reproduces the emitted plugin list', function () {
  const base = extractBaseline('ops-base');
  const ops = opsLedger('ops-ledger', [
    { op: 'set-plugin-config', pluginId: 'agent-instructions', path: ['maxBytes'], from: 65536, value: 32768, reason: 'test' },
  ]);
  const replay = cmdReplay({ baseline: base, ops: ops });
  assertOk(replay, 'replay');
  assertEq(replay.applied.length, 1, 'applied count');
  const dir = writeProfile(tmpDir('emit-ops'));
  const r = emit(dir, base, { ops: ops });
  assertOk(r, 'emit with ops');
  assertEq(r.sha256, replay.sha256, 'emit sha equals replay sha');
  const v = cmdVerify({ 'profile-dir': dir, 'mode-id': 'lab-a' });
  assertOk(v, 'verify ops mode');
  assertEq(v.opsApplied, 1, 'opsApplied');
  assertOk(runStaticCheck(dir, {}), 'static-check ops mode');
  const again = emit(dir, base, { replace: true });
  assertErr(again, 'OPS-LEDGER-EXISTS');
});

test('mode-base: hand-edited plugins are caught by verify and static-check', function () {
  const dir = modeProfile(tmpDir('hand-edit'));
  appendPluginToPatch(path.join(dir, 'cordis.patch.yml'), 'tool-hand-edit');
  const v = cmdVerify({ 'profile-dir': dir, 'mode-id': 'lab-a' });
  assertErr(v, 'VERIFY-SHA');
  const sc = runStaticCheck(dir, {});
  assertErr(sc, 'MODE-SYNC');
});

test('mode-base: refresh follows a moved official baseline', function () {
  const dir = modeProfile(tmpDir('refresh'));
  const pre = fs.readFileSync(path.join(dir, 'cordis.patch.yml'), 'utf8');
  const preview = cmdRefresh({ 'profile-dir': dir, 'mode-id': 'lab-a', dump: DUMP_MOVED });
  assertOk(preview, 'refresh preview');
  assertEq(preview.officialChanged, true, 'officialChanged');
  assertEq(preview.changed, true, 'changed');
  assertEq(fs.readFileSync(path.join(dir, 'cordis.patch.yml'), 'utf8'), pre, 'preview must not write');
  const applied = cmdRefresh({ 'profile-dir': dir, 'mode-id': 'lab-a', dump: DUMP_MOVED, write: true });
  assertOk(applied, 'refresh write');
  assertEq(applied.freshSha, FIXTURE_MOVED_SHA, 'fresh sha');
  const v = cmdVerify({ 'profile-dir': dir, 'mode-id': 'lab-a' });
  assertOk(v, 'verify after refresh');
  const meta = readJson(path.join(dir, '.profile-builder', 'baseline-lab-a.json'));
  assertOk(meta);
  assertEq(meta.value.baselineSha256, FIXTURE_MOVED_SHA, 'baseline source sha');
  const idempotent = cmdRefresh({ 'profile-dir': dir, 'mode-id': 'lab-a', dump: DUMP_MOVED });
  assertOk(idempotent, 'refresh idempotent');
  assertEq(idempotent.changed, false, 'changed after idempotent refresh');
});

test('mode-base: refresh refuses unrecorded local edits (no ops ledger)', function () {
  const dir = modeProfile(tmpDir('refresh-unrecorded'));
  appendPluginToPatch(path.join(dir, 'cordis.patch.yml'), 'tool-unrecorded');
  const r = cmdRefresh({ 'profile-dir': dir, 'mode-id': 'lab-a', dump: DUMP_FIXTURE });
  assertErr(r, 'OPS-LEDGER-MISSING');
});

test('mode-base: refresh refuses patch drift that ops cannot reproduce', function () {
  const base = extractBaseline('refresh-mismatch-base');
  const ops = opsLedger('refresh-mismatch-ops', [
    { op: 'set-plugin-config', pluginId: 'agent-instructions', path: ['maxBytes'], from: 65536, value: 32768 },
  ]);
  const dir = writeProfile(tmpDir('refresh-mismatch'));
  assertOk(emit(dir, base, { ops: ops }), 'emit with ops');
  appendPluginToPatch(path.join(dir, 'cordis.patch.yml'), 'tool-unrecorded');
  const r = cmdRefresh({ 'profile-dir': dir, 'mode-id': 'lab-a', dump: DUMP_FIXTURE });
  assertErr(r, 'OPS-LEDGER-MISMATCH');
});

test('mode-base: applyOps reports conflicts and missing targets', function () {
  const base = readBaselineYml(extractBaseline('applyops-base'));
  assertOk(base);
  const conflict = applyOps(base.canonical, [{ op: 'set-plugin-config', pluginId: 'agent-instructions', path: ['maxBytes'], from: 1, value: 2 }]);
  assertErr(conflict, 'OP-CONFLICT');
  const missing = applyOps(base.canonical, [{ op: 'disable-plugin', pluginId: 'does-not-exist' }]);
  assertErr(missing, 'OP-TARGET-MISSING');
  const unknown = applyOps(base.canonical, [{ op: 'frobnicate' }]);
  assertErr(unknown, 'OP-UNKNOWN');
});

// ============================== export ==============================

test('export: portable declaration layer only, with a valid manifest', function () {
  const dir = writeProfile(tmpDir('export-src'), {
    extra: {
      'cordis.yml': 'baseUrl: http://127.0.0.1:1\n',
      'node_modules/dep/index.js': 'module.exports = 1;\n',
      'desktop-next.runtime.patch.json': '{}\n',
      '.plugin-manager/state.json': '{}\n',
      'cordis.patch.yml.bak-1': '# backup\n',
    },
  });
  const out = path.join(tmpDir('export-out'), 'pkg');
  const r = runExport(dir, out);
  assertOk(r, 'export');
  assert(r.files.indexOf('package.json') >= 0, 'package.json missing');
  assert(r.files.indexOf('cordis.patch.yml') >= 0, 'cordis.patch.yml missing');
  assert(!r.files.some(function (f) { return f.indexOf('node_modules') === 0; }), 'node_modules leaked');
  assert(!r.files.some(function (f) { return f.indexOf('cordis.yml') === 0 && f.indexOf('cordis.yml') === 0; }), 'generated cordis.yml leaked');
  const excludedPaths = r.excluded.map(function (e) { return e.path; });
  ['cordis.yml', 'node_modules/dep/index.js', 'desktop-next.runtime.patch.json', '.plugin-manager/state.json', 'cordis.patch.yml.bak-1'].forEach(function (p) {
    assert(excludedPaths.indexOf(p) >= 0, 'expected excluded: ' + p);
  });
  const manifest = readJson(path.join(out, 'manifest.json'));
  assertOk(manifest);
  assertEq(manifest.value.schemaVersion, 1, 'schemaVersion');
  assertEq(manifest.value.profile.bundles.length, 2, 'bundles in manifest');
  manifest.value.files.forEach(function (f) {
    const abs = path.join(out, f.path);
    assert(fs.existsSync(abs), 'manifest file missing: ' + f.path);
    assertEq(sha256File(abs), f.sha256, 'manifest sha ' + f.path);
  });
  const mig = runStaticCheck(out, { migration: true });
  assertOk(mig, 'migration check on package');
});

test('export: non-empty output directory requires --force', function () {
  const dir = writeProfile(tmpDir('export-nonempty-src'));
  const out = tmpDir('export-nonempty-out');
  fs.writeFileSync(path.join(out, 'keep.txt'), 'x\n');
  assertErr(runExport(dir, out), 'IO-OUT-EXISTS');
  assertOk(runExport(dir, out, { force: true }), 'export with force');
});

test('export: broken source profile is refused', function () {
  const dir = writeProfile(tmpDir('export-broken-src'), { patch: '# comments only\n' });
  const r = runExport(dir, path.join(TMP, 'export-broken-out'));
  assertErr(r, 'SRC-PATCH-TOP-ARRAY');
});

test('export: mode bookkeeping travels with the package', function () {
  const dir = modeProfile(tmpDir('export-mode-src'));
  const out = path.join(tmpDir('export-mode-out'), 'pkg');
  const r = runExport(dir, out);
  assertOk(r, 'export mode profile');
  assertEq(r.modes.length, 1, 'mode count');
  assertEq(r.modes[0].modeId, 'lab-a', 'mode id');
  assert(fs.existsSync(path.join(out, '.profile-builder', 'baseline-ptc-lab-a.yml')), 'baseline yml not exported');
  assert(fs.existsSync(path.join(out, '.profile-builder', 'baseline-lab-a.json')), 'baseline json not exported');
});

test('export: a stale manifest left in the profile is not re-packed', function () {
  const dir = writeProfile(tmpDir('export-stale-manifest'), { extra: { 'manifest.json': '{"old":true}\n' } });
  const out = path.join(tmpDir('export-stale-out'), 'pkg');
  const r = runExport(dir, out);
  assertOk(r, 'export with stale manifest');
  assert(!r.files.includes('manifest.json'), 'stale manifest was copied');
  assert(r.excluded.some(function (e) { return e.path === 'manifest.json'; }), 'stale manifest not reported excluded');
  const manifest = readJson(path.join(out, 'manifest.json'));
  assertOk(manifest);
  assert(!manifest.value.files.some(function (f) { return f.path === 'manifest.json'; }), 'manifest listed itself');
});

// ============================== import ==============================

test('import: package roundtrips into a fresh dsh home', function () {
  const dir = modeProfile(tmpDir('import-src'));
  const pkg = path.join(tmpDir('import-pkg'), 'pkg');
  assertOk(runExport(dir, pkg), 'export for import');
  const home = tmpDir('import-home');
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  const r = runImport(pkg, 'imported-a', { dshHome: home });
  assertOk(r, 'import');
  const target = path.join(home, 'profiles', 'imported-a');
  assert(fs.existsSync(target), 'target profile missing');
  const pj = readJson(path.join(target, 'package.json'));
  assertOk(pj);
  assertEq(pj.value.name, 'dsh-profile-imported-a', 'rewritten package name');
  assert(fs.existsSync(path.join(target, 'pnpm-workspace.yaml')), 'pnpm-workspace.yaml missing');
  const ws = fs.readFileSync(path.join(target, 'pnpm-workspace.yaml'), 'utf8');
  assert(ws.indexOf('nodeLinker: hoisted') >= 0, 'workspace yaml content');
  assertOk(runStaticCheck(target, {}), 'target static-check');
  const manifest = readJson(path.join(target, 'manifest.json'));
  assertOk(manifest);
  manifest.value.files.forEach(function (f) {
    assertEq(sha256File(path.join(target, f.path)), f.sha256, 'imported manifest sha ' + f.path);
  });
  assertEq(r.modes.length, 1, 'imported mode count');
});

test('import: existing target is refused', function () {
  const dir = writeProfile(tmpDir('import-dup-src'));
  const pkg = path.join(tmpDir('import-dup-pkg'), 'pkg');
  assertOk(runExport(dir, pkg), 'export');
  const home = tmpDir('import-dup-home');
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  assertOk(runImport(pkg, 'dup-profile', { dshHome: home }), 'first import');
  assertErr(runImport(pkg, 'dup-profile', { dshHome: home }), 'IO-TARGET-EXISTS');
});

test('import: checksum mismatch is refused', function () {
  const dir = writeProfile(tmpDir('import-sha-src'));
  const pkg = path.join(tmpDir('import-sha-pkg'), 'pkg');
  assertOk(runExport(dir, pkg), 'export');
  fs.appendFileSync(path.join(pkg, 'package.json'), '\n');
  const home = tmpDir('import-sha-home');
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  assertErr(runImport(pkg, 'sha-profile', { dshHome: home }), 'MANIFEST-SHA');
});

test('import: package without manifest falls back to directory scan', function () {
  const dir = writeProfile(tmpDir('import-nomanifest-src'));
  const pkg = path.join(tmpDir('import-nomanifest-pkg'), 'pkg');
  assertOk(runExport(dir, pkg), 'export');
  fs.rmSync(path.join(pkg, 'manifest.json'));
  const home = tmpDir('import-nomanifest-home');
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  const r = runImport(pkg, 'nomanifest-profile', { dshHome: home });
  assertOk(r, 'import without manifest');
  assert(r.warnings.some(function (w) { return w.id === 'MANIFEST-MISSING'; }), 'expected missing-manifest warning');
});

test('import: missing profiles directory is refused', function () {
  const dir = writeProfile(tmpDir('import-nohome-src'));
  const pkg = path.join(tmpDir('import-nohome-pkg'), 'pkg');
  assertOk(runExport(dir, pkg), 'export');
  const home = tmpDir('import-nohome-home');
  assertErr(runImport(pkg, 'x-profile', { dshHome: home }), 'IO-DSH-HOME');
});

test('import: invalid profile name and unsafe manifest paths are refused', function () {
  const dir = writeProfile(tmpDir('import-badname-src'));
  const pkg = path.join(tmpDir('import-badname-pkg'), 'pkg');
  assertOk(runExport(dir, pkg), 'export');
  const home = tmpDir('import-badname-home');
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  assertErr(runImport(pkg, 'Bad_Name', { dshHome: home }), 'PROFILE-NAME');
  const pkg2 = path.join(tmpDir('import-unsafe-pkg'), 'pkg');
  assertOk(runExport(dir, pkg2), 'export 2');
  const manifest = readJson(path.join(pkg2, 'manifest.json'));
  manifest.value.files[0].path = '../escape.yml';
  fs.writeFileSync(path.join(pkg2, 'manifest.json'), JSON.stringify(manifest.value, null, 2) + '\n');
  assertErr(runImport(pkg2, 'unsafe-profile', { dshHome: home }), 'MANIFEST-PATH');
});

test('import -> export roundtrip keeps the profile re-migratable', function () {
  const dir = modeProfile(tmpDir('roundtrip-src'));
  const pkg = path.join(tmpDir('roundtrip-pkg'), 'pkg');
  assertOk(runExport(dir, pkg), 'export 1');
  const home = tmpDir('roundtrip-home');
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  assertOk(runImport(pkg, 'round-a', { dshHome: home }), 'import 1');
  const target = path.join(home, 'profiles', 'round-a');
  const pkg2 = path.join(tmpDir('roundtrip-pkg2'), 'pkg');
  const r = runExport(target, pkg2);
  assertOk(r, 'export imported profile');
  assertEq(r.modes.length, 1, 'mode survived import');
  assertOk(runImport(pkg2, 'round-b', { dshHome: home }), 'import 2');
  const manifest = readJson(path.join(pkg2, 'manifest.json'));
  assertOk(manifest);
  assert(!manifest.value.files.some(function (f) { return f.path === 'manifest.json'; }), 'roundtrip manifest listed itself');
});

// ============================== dump (L1 harness, offline) ==============================

test('dump: composed-tree checks pass against the fixture dump', function () {
  const app = makeFakeApp(tmpDir('dump-app-ok'), DUMP_FIXTURE, 0);
  const base = extractBaseline('dump-base');
  const r = runDump({
    app: app.bin,
    cli: app.cli,
    profile: 'fake',
    requiredRows: 'agent-preset-registry,preset-ptc',
    mode: 'ptc',
    baseline: base,
    expectDefault: 'standard',
  });
  assertOk(r, 'dump fixture run');
  assert(hasCheck(r, 'REQUIRED-ROW'), 'required rows check missing');
  assert(hasCheck(r, 'MODE-SHA'), 'mode sha check missing');
  assert(hasCheck(r, 'REGISTRY-DEFAULT'), 'registry default check missing');
});

test('dump: a failing runtime dump is a hard error', function () {
  const app = makeFakeApp(tmpDir('dump-app-fail'), DUMP_FIXTURE, 3);
  const r = runDump({ app: app.bin, cli: app.cli, profile: 'fake' });
  assertErr(r, 'RUNTIME-DUMP-EXIT');
  assertEq(r.exitCode, 3, 'exit code');
});

test('dump: missing dsh executable is reported, not thrown', function () {
  const r = runDump({ app: path.join(TMP, 'no-such-dsh'), profile: 'fake' });
  assertErr(r, 'APP-NOT-FOUND');
});

// ============================== CLI smoke ==============================

test('cli: static-check.mjs runs standalone and emits JSON', function () {
  const dir = writeProfile(tmpDir('cli-valid'));
  const stdout = execFileSync(process.execPath, [path.join(HERE, 'static-check.mjs'), '--profile-dir', dir, '--json'], { encoding: 'utf8' });
  const data = JSON.parse(stdout);
  assertEq(data.ok, true, 'cli ok field');
  assertEq(data.schemaVersion, 1, 'cli schemaVersion');
});

test('cli: export.mjs + import.mjs roundtrip standalone', function () {
  const dir = writeProfile(tmpDir('cli-src'));
  const pkg = path.join(tmpDir('cli-pkg'), 'pkg');
  execFileSync(process.execPath, [path.join(HERE, 'export.mjs'), '--profile-dir', dir, '--out', pkg, '--json'], { encoding: 'utf8' });
  const home = tmpDir('cli-home');
  fs.mkdirSync(path.join(home, 'profiles'), { recursive: true });
  const stdout = execFileSync(process.execPath, [path.join(HERE, 'import.mjs'), '--from', pkg, '--profile-name', 'cli-profile', '--dsh-home', home, '--json'], { encoding: 'utf8' });
  const data = JSON.parse(stdout);
  assertEq(data.ok, true, 'cli import ok');
  assertEq(data.packageName, 'dsh-profile-cli-profile', 'cli package name');
});

// ============================== main ==============================

function main() {
  const args = process.argv.slice(2);
  const json = args.indexOf('--json') >= 0;
  const keep = args.indexOf('--keep') >= 0;
  if (!json) console.log('dsh-profile-builder selftest');
  runTests();
  if (!json) {
    console.log('');
    if (keep) console.log('work dir kept: ' + TMP);
    console.log('selftest: ' + passed + ' passed, ' + failed + ' failed');
  } else {
    console.log(JSON.stringify({ ok: failed === 0, total: passed + failed, passed: passed, failed: failed, failures: failures }, null, 2));
  }
  if (!keep) fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(failed === 0 ? 0 : 1);
}
main();
