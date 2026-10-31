#!/usr/bin/env node
// static-check.mjs — L0 offline checks for a DSH profile directory (no runtime, no network).
// Usage: node static-check.mjs --profile-dir <dir> [--migration] [--json]
// Exit: 0 = no hard errors, 1 = hard errors, 2 = usage/IO error.
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_SURFACES, MARKER_DIR, PRESET_PLUGIN, REQUIRED_BUNDLE, RESERVED_MODE_IDS,
  agentPresetItems, normText, parseArgs, patchIsTopLevelArray, readJson, sha256,
  topLevelEntries, entryId,
} from './_lib.mjs';
import { applyOps } from './mode-base.mjs';

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
];
const ABS_PATTERNS = [
  /(?:^|[\s'"=:([,])\/(?:Users|home|root)\/[^\s'"]+/,
  /(?:^|[\s'"=:([,])[A-Za-z]:\\[^\s'"]+/,
  /(?:^|[\s'"=:([,])\/private\/var\/folders\/[^\s'"]+/,
];
const SECRET_KEY = /^[ \t]*(apiKey|apikey|token|secret|password|accessKey|accessToken)[ \t]*:[ \t]*(.+)$/m;
const MIGRATION_ROOT_ALLOW = new Set([
  'package.json', 'cordis.patch.yml', 'compatibility.json', 'pnpm-lock.yaml',
  'pnpm-workspace.yaml', 'manifest.json', 'README.md', MARKER_DIR,
]);

function scanPurityFile(file, errors, warnings, checks) {
  var text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return; }
  for (var i = 0; i < SECRET_PATTERNS.length; i++) {
    if (SECRET_PATTERNS[i].test(text)) {
      errors.push({ id: 'PURITY-NO-SECRET', file: file, detail: 'secret-like value (' + SECRET_PATTERNS[i] + ')' });
      checks.push({ id: 'PURITY-NO-SECRET', ok: false, file: file });
      return;
    }
  }
  checks.push({ id: 'PURITY-NO-SECRET', ok: true, file: file });
  var lines = text.split('\n');
  for (var j = 0; j < lines.length; j++) {
    for (var k = 0; k < ABS_PATTERNS.length; k++) {
      if (ABS_PATTERNS[k].test(lines[j])) {
        errors.push({ id: 'PURITY-NO-MACHINE-PATH', file: file, line: j + 1, detail: lines[j].trim().slice(0, 160) });
        checks.push({ id: 'PURITY-NO-MACHINE-PATH', ok: false, file: file, line: j + 1 });
        break;
      }
    }
  }
  var sk = SECRET_KEY.exec(lines.join('\n'));
  if (sk) {
    var val = sk[2].trim();
    if (val && val !== '""' && val !== "''" && !/^\$\{/.test(val) && !/^<[^>]+>$/.test(val) && !/^env:/.test(val)) {
      warnings.push({ id: 'PURITY-PLAINTEXT-CREDENTIAL-KEY', file: file, detail: 'key "' + sk[1] + '" carries a literal value; prefer apiKeyEnv / env indirection' });
      checks.push({ id: 'PURITY-PLAINTEXT-CREDENTIAL-KEY', ok: false, file: file });
    }
  }
}

export function runStaticCheck(profileDir, opts) {
  opts = opts || {};
  var errors = [];
  var warnings = [];
  var checks = [];
  function check(id, ok, severity, detail, extra) {
    var row = Object.assign({ id: id, ok: ok }, extra || {});
    if (!ok) {
      if (severity === 'error') errors.push(Object.assign({ id: id, detail: detail }, extra || {}));
      else warnings.push(Object.assign({ id: id, detail: detail }, extra || {}));
    }
    checks.push(row);
    return ok;
  }
  var absDir = path.resolve(profileDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return { schemaVersion: 1, ok: false, profileDir: absDir, errors: [{ id: 'IO-PROFILE-DIR', detail: 'not a directory' }], warnings: [], checks: [], modes: [] };
  }

  // ---- package.json ----
  var pkgPath = path.join(absDir, 'package.json');
  var pkg = null;
  if (check('PKG-EXISTS', fs.existsSync(pkgPath), 'error', 'package.json missing')) {
    var pj = readJson(pkgPath);
    check('PKG-JSON', pj.ok, 'error', pj.ok ? '' : 'invalid JSON: ' + pj.error);
    if (pj.ok) {
      pkg = pj.value;
      var nameOk = pkg.name === 'dsh-profile-' + path.basename(absDir);
      check('PKG-NAME', nameOk, 'warn', 'expected "dsh-profile-' + path.basename(absDir) + '", found "' + pkg.name + '"');
      check('PKG-PRIVATE', pkg.private === true, 'warn', 'profile packages should set "private": true');
      var bundles = pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles;
      var bundlesOk = Array.isArray(bundles) && bundles.length > 0 && bundles.every(function (b) { return typeof b === 'string' && b.length > 0; });
      if (check('PKG-BUNDLES', bundlesOk, 'error', 'dsh.profile.bundles must be a non-empty string array')) {
        check('PKG-BUNDLES-BASE', bundles.indexOf(REQUIRED_BUNDLE) >= 0, 'error', 'bundle stack must include ' + REQUIRED_BUNDLE);
        var hasSurface = bundles.some(function (b) { return APP_SURFACES.indexOf(b) >= 0; });
        check('PKG-BUNDLES-SURFACE', hasSurface, 'warn', 'no known application surface bundle in dsh.profile.bundles');
        var seen = {};
        var dup = [];
        bundles.forEach(function (b) { if (seen[b]) dup.push(b); seen[b] = true; });
        check('PKG-BUNDLES-DUP', dup.length === 0, 'error', 'duplicate bundles: ' + dup.join(', '));
      }
      var engines = pkg.engines && pkg.engines.dsh;
      if (engines) check('PKG-ENGINES', /[0-9]/.test(String(engines)), 'warn', 'engines.dsh "' + engines + '" does not look like a version range');
      var peers = pkg.peerDependencies || {};
      var badPeer = Object.keys(peers).filter(function (k) { return /^@deepseek-ai\/dsh/.test(k) && !/[0-9]/.test(String(peers[k])); });
      check('PKG-PEER-RANGES', badPeer.length === 0, 'warn', 'unparsable @deepseek-ai/dsh peer ranges: ' + badPeer.join(', '));
    }
  }

  // ---- compatibility.json ----
  var compatPath = path.join(absDir, 'compatibility.json');
  if (fs.existsSync(compatPath)) {
    var cj = readJson(compatPath);
    var compatOk = cj.ok && cj.value && typeof cj.value === 'object' && !Array.isArray(cj.value);
    check('COMPAT-JSON', compatOk, 'warn', cj.ok ? 'compatibility.json must be a JSON object' : 'invalid JSON: ' + cj.error);
    if (compatOk) {
      var badVal = Object.keys(cj.value).filter(function (k) { return !Array.isArray(cj.value[k]) || cj.value[k].some(function (v) { return typeof v !== 'string'; }); });
      check('COMPAT-SHAPE', badVal.length === 0, 'warn', 'values must be arrays of exact DSH version strings: ' + badVal.join(', '));
    }
  }

  // ---- cordis.patch.yml ----
  var patchPath = path.join(absDir, 'cordis.patch.yml');
  var patchText = '';
  if (check('PATCH-EXISTS', fs.existsSync(patchPath), 'error', 'cordis.patch.yml missing')) {
    patchText = fs.readFileSync(patchPath, 'utf8');
    check('PATCH-TOP-ARRAY', patchIsTopLevelArray(patchText), 'error', 'cordis.patch.yml must be a non-empty top-level YAML array; comments-only/empty file is fatal');
    check('PATCH-NO-TAB-INDENT', !/^\t/m.test(patchText), 'error', 'tab characters in YAML indentation');
    var patchIds = {};
    var dups = [];
    topLevelEntries(patchText).forEach(function (e) {
      var id = entryId(e.text);
      if (!id) return;
      if (patchIds[id]) dups.push(id);
      patchIds[id] = true;
    });
    check('PATCH-DUP-ID', dups.length === 0, 'warn', 'duplicate top-level patch ids (whole-config replace makes these ambiguous): ' + dups.join(', '));
  }

  // ---- purity scan (declarative files only) ----
  var scanFiles = [path.join(absDir, 'package.json'), path.join(absDir, 'cordis.patch.yml'), path.join(absDir, 'compatibility.json')];
  var markerDir = path.join(absDir, MARKER_DIR);
  if (fs.existsSync(markerDir)) {
    (function walk(d) {
      fs.readdirSync(d).forEach(function (n) {
        var p = path.join(d, n);
        var st = fs.statSync(p);
        if (st.isDirectory()) walk(p);
        else if (/\.(json|ya?ml)$/.test(n)) scanFiles.push(p);
      });
    })(markerDir);
  }
  scanFiles.forEach(function (f) { if (fs.existsSync(f)) scanPurityFile(f, errors, warnings, checks); });

  // ---- generated artifacts / migration package ----
  var rootEntries = fs.readdirSync(absDir);
  var generated = rootEntries.filter(function (n) { return n === 'cordis.yml' || n === 'node_modules'; });
  if (opts.migration) {
    var extra = rootEntries.filter(function (n) { return !MIGRATION_ROOT_ALLOW.has(n); });
    check('MIGRATION-CLEAN', extra.length === 0, 'error', 'migration bundle contains non-portable entries: ' + extra.join(', '));
    if (generated.length) check('MIGRATION-NO-GENERATED', false, 'error', 'migration bundle must not contain: ' + generated.join(', '));
  } else if (generated.length) {
    checks.push({ id: 'PROFILE-GENERATED-PRESENT', ok: true, detail: 'generated artifacts present (expected on a live profile, never exported): ' + generated.join(', ') });
  }

  // ---- agent modes (5th-mode extension) ----
  var modes = [];
  if (patchText) {
    var items = agentPresetItems(patchText);
    var modesById = {};
    var orders = {};
    items.forEach(function (item) {
      var mode = { modeId: item.configId, insertId: item.id, order: item.configOrder, displayName: item.configName, description: item.configDescription, pluginsSha: item.pluginsSha, problems: [] };
      modes.push(mode);
      if (item.name !== PRESET_PLUGIN) mode.problems.push({ id: 'MODE-PLUGIN', detail: 'insert row name must be ' + PRESET_PLUGIN });
      if (!item.id || item.id !== 'preset-' + item.configId) mode.problems.push({ id: 'MODE-INSERT-ID', detail: 'insert id must be "preset-<configId>"' });
      if (!item.configId || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(item.configId)) mode.problems.push({ id: 'MODE-CONFIG-ID', detail: 'config.id must match ^[a-z0-9][a-z0-9-]{0,63}$' });
      if (item.configId && RESERVED_MODE_IDS.indexOf(item.configId) >= 0) mode.problems.push({ id: 'MODE-RESERVED-ID', detail: 'config.id "' + item.configId + '" collides with a built-in preset id' });
      if (item.configId && modesById[item.configId]) mode.problems.push({ id: 'MODE-DUP-ID', detail: 'duplicate config.id ' + item.configId });
      if (item.configId) modesById[item.configId] = true;
      var order = Number(item.configOrder);
      if (!Number.isInteger(order) || order < 5) mode.problems.push({ id: 'MODE-ORDER', detail: 'config.order must be an integer >= 5 (1-4 are the built-in presets)' });
      else {
        if (orders[order]) mode.problems.push({ id: 'MODE-ORDER-DUP', detail: 'duplicate config.order ' + order });
        orders[order] = true;
      }
      if (!item.configName) mode.problems.push({ id: 'MODE-NAME', detail: 'config.name is required' });
      if (!item.configDescription) mode.problems.push({ id: 'MODE-DESCRIPTION', detail: 'config.description is required' });
      mode.problems.forEach(function (p) { errors.push(Object.assign({ modeId: item.configId }, p)); checks.push({ id: p.id, ok: false }); });
      if (mode.problems.length === 0) checks.push({ id: 'MODE-SHAPE', ok: true });
    });

    // baseline bookkeeping pairs
    modes.forEach(function (mode) {
      if (!mode.modeId) return;
      var base = path.join(markerDir, 'baseline-' + mode.modeId + '.json');
      var baseYml = path.join(markerDir, 'baseline-ptc-' + mode.modeId + '.yml');
      var okJson = check('MODE-BASELINE-JSON', fs.existsSync(base), 'error', 'missing ' + path.relative(absDir, base), { modeId: mode.modeId });
      var okYml = check('MODE-BASELINE-YML', fs.existsSync(baseYml), 'error', 'missing ' + path.relative(absDir, baseYml), { modeId: mode.modeId });
      if (!okJson || !okYml) { mode.baselineOk = false; return; }
      var bj = readJson(base);
      var ymlText = fs.readFileSync(baseYml, 'utf8');
      var bjOk = check('MODE-BASELINE-JSON-SHAPE', bj.ok && bj.value && bj.value.schemaVersion === 1, 'error', bj.ok ? 'baseline json schemaVersion must be 1' : 'invalid baseline json: ' + bj.error, { modeId: mode.modeId });
      var presetHit = /^preset:[ \t]*(.+)$/m.exec(ymlText);
      var baselinePreset = presetHit ? presetHit[1].trim() : null;
      var baselineSha = null;
      var baselineCanonical = null;
      var ymlLines = normText(ymlText).split('\n');
      var pIdx = -1;
      for (var q = 0; q < ymlLines.length; q++) { if (/^plugins:[ \t]*$/.test(ymlLines[q])) { pIdx = q; break; } }
      if (pIdx >= 0) {
        var collected = [];
        for (var r = pIdx + 1; r < ymlLines.length; r++) {
          var line = ymlLines[r];
          if (line.trim() === '' || line.trim().startsWith('#')) { collected.push(line); continue; }
          var ind = /^[ \t]*/.exec(line)[0].length;
          if (ind === 0) break;
          collected.push(line);
        }
        var firstInd = -1;
        for (var s = 0; s < collected.length; s++) { if (collected[s].trim() !== '' && !collected[s].trim().startsWith('#')) { firstInd = /^[ \t]*/.exec(collected[s])[0].length; break; } }
        if (firstInd > 0) {
          var dedented = collected.map(function (l) { if (l.trim() === '') return ''; var k = 0; while (k < firstInd && (l[k] === ' ' || l[k] === '\t')) k++; return l.slice(k); });
          baselineCanonical = normText(dedented.join('\n'));
          baselineSha = sha256(baselineCanonical);
        }
      }
      check('MODE-BASELINE-PRESET', baselinePreset === 'ptc', 'error', 'baseline yml preset must be "ptc", found ' + baselinePreset, { modeId: mode.modeId });
      var expectedSha = baselineSha;
      var opsFile = path.join(markerDir, 'ops-' + mode.modeId + '.json');
      if (baselineCanonical !== null && fs.existsSync(opsFile)) {
        var opsRead = readJson(opsFile);
        var opsOk = check('MODE-OPS-READ', opsRead.ok && Array.isArray((opsRead.value || {}).ops), 'error', 'invalid ops ledger ' + path.relative(absDir, opsFile), { modeId: mode.modeId });
        if (opsOk) {
          var replayed = applyOps(baselineCanonical, opsRead.value.ops);
          if (check('MODE-OPS-REPLAY', replayed.ok, 'error', replayed.ok ? '' : JSON.stringify(replayed.errors), { modeId: mode.modeId })) expectedSha = sha256(replayed.canonical);
        }
      }
      if (bjOk) {
        check('MODE-BASELINE-MODE-ID', bj.value.modeId === mode.modeId, 'error', 'baseline json modeId mismatch: ' + bj.value.modeId, { modeId: mode.modeId });
        check('MODE-BASELINE-SHA-MATCH', bj.value.sha256 === expectedSha, 'error', 'baseline json sha256 != sha256(baseline + recorded ops)', { modeId: mode.modeId });
        check('MODE-BASELINE-SOURCE-SHA', !bj.value.baselineSha256 || bj.value.baselineSha256 === baselineSha, 'error', 'baseline json baselineSha256 != sha256(official baseline plugins)', { modeId: mode.modeId });
        check('MODE-BASELINE-FILE', bj.value.baselineFile === path.basename(baseYml), 'warn', 'baseline json baselineFile should be "' + path.basename(baseYml) + '"', { modeId: mode.modeId });
      }
      check('MODE-SYNC', expectedSha !== null && mode.pluginsSha === expectedSha, 'error', 'patch plugins differ from recorded baseline (hand edit or stale baseline: re-run the mode refresh workflow)', { modeId: mode.modeId });
      mode.baselineOk = true;
      checks.push({ id: 'MODE-BASELINE', ok: true, modeId: mode.modeId });
    });
  }

  return {
    schemaVersion: 1,
    profileDir: absDir,
    ok: errors.length === 0,
    errors: errors,
    warnings: warnings,
    checks: checks,
    modes: modes,
    summary: { errorCount: errors.length, warningCount: warnings.length, modeCount: modes.length },
  };
}

function main() {
  var args = parseArgs(process.argv.slice(2));
  if (!args['profile-dir']) {
    console.error('usage: node static-check.mjs --profile-dir <dir> [--migration] [--json]');
    process.exit(2);
  }
  var result = runStaticCheck(args['profile-dir'], { migration: !!args.migration });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('dsh-profile-builder static-check: ' + (result.ok ? 'OK' : 'FAIL') + ' (' + result.summary.errorCount + ' errors, ' + result.summary.warningCount + ' warnings, ' + result.summary.modeCount + ' custom modes)');
    result.errors.forEach(function (e) { console.log('  ERROR ' + e.id + ' ' + (e.modeId ? '[' + e.modeId + '] ' : '') + (e.file ? e.file + (e.line ? ':' + e.line : '') + ' — ' : '') + (e.detail || '')); });
    result.warnings.forEach(function (w) { console.log('  warn  ' + w.id + ' ' + (w.modeId ? '[' + w.modeId + '] ' : '') + (w.file ? w.file + ' — ' : '') + (w.detail || '')); });
    result.modes.forEach(function (m) { console.log('  mode  ' + (m.modeId || '?') + ' order=' + m.order + ' baseline=' + (m.baselineOk ? 'ok' : 'missing/stale') + ' pluginsSha=' + String(m.pluginsSha).slice(0, 12)); });
  }
  process.exit(result.ok ? 0 : 1);
}

var invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();
