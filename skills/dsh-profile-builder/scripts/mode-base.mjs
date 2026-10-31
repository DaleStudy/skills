#!/usr/bin/env node
// mode-base.mjs — the custom-agent-mode (5th mode) machinery.
//
// A custom mode is a profile-level insert row that clones one official preset's plugin
// declaration and re-emits it under a new id/name/order. This script owns the chain:
//   extract  -> turn an official --dump-config into a baseline file (plugins + sha256)
//   emit     -> render the insert row, optionally write it into the profile with bookkeeping
//   verify   -> prove patch plugins == recorded baseline (offline)
//   replay   -> re-apply recorded customization ops to a baseline (upgrade pre-flight)
//   refresh  -> official baseline moved: replay ops, rewrite insert + baseline (W4)
//
// Usage:
//   node mode-base.mjs extract --dump <file> [--preset ptc] [--out <file>] [--json]
//   node mode-base.mjs emit --baseline <file> --mode-id <id> --mode-name <name> --description <text>
//        --order <n> [--profile-dir <dir>] [--write] [--preset ptc] [--out <file>] [--json]
//   node mode-base.mjs verify --profile-dir <dir> --mode-id <id> [--json]
//   node mode-base.mjs replay --baseline <file> --ops <file> [--out <file>] [--json]
//   node mode-base.mjs refresh --profile-dir <dir> --mode-id <id> --dump <file> [--preset ptc] [--write] [--json]
import fs from 'node:fs';
import path from 'node:path';
import {
  MARKER_DIR, PRESET_PLUGIN, agentPresetItems, ensureDir, entryConfig, entryId,
  escapeRe, findInsertEntryTextById, isBlankOrComment, normText, nowIso, parseArgs,
  pluginsCanonicalFromEntry, readBaselineYml, readJson, renderBaselineYml, sha256,
  topLevelEntries, topLevelPluginEntries, unquote, writeFile, yamlStr,
} from './_lib.mjs';

const SCHEMA = 1;
const MODE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RESERVED = ['standard', 'ptc', 'minimal', 'cordis'];

function err(id, detail, extra) {
  return Object.assign({ id: id, detail: detail }, extra || {});
}

function findPresetEntry(dumpText, preset) {
  const entries = topLevelEntries(dumpText);
  for (const e of entries) if (entryId(e.text) === 'preset-' + preset) return e;
  return null;
}

function emitInsertText(modeId, displayName, description, order, canonical) {
  const lines = canonical.split('\n');
  const indented = lines.map(function (l) { return l === '' ? '' : '          ' + l; });
  return [
    '- insert:',
    '    - id: preset-' + modeId,
    "      name: '" + PRESET_PLUGIN + "'",
    '      config:',
    '        id: ' + modeId,
    '        name: ' + yamlStr(displayName),
    '        description: ' + yamlStr(description),
    '        order: ' + order,
    '        plugins:',
    indented.join('\n'),
    '',
  ].join('\n').replace(/\n+$/, '\n');
}

// ---------- ops replay ----------

function renderScalar(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v === null) return 'null';
  return yamlStr(String(v));
}

function applyOne(text, op) {
  const blocks = topLevelPluginEntries(text);
  function blockIndex(pluginId) {
    for (let i = 0; i < blocks.length; i++) if (blocks[i].id === pluginId) return i;
    throw err('OP-TARGET-MISSING', 'plugin "' + pluginId + '" not present in baseline');
  }
  function rebuild(mutated) {
    const byId = {};
    mutated.forEach(function (b) { byId[b.id] = b; });
    const out = [];
    const seen = {};
    blocks.forEach(function (b) {
      if (byId[b.id]) {
        if (!seen[b.id]) { out.push(byId[b.id].text); seen[b.id] = true; }
        return;
      }
      out.push(b.text);
      seen[b.id] = true;
    });
    return normText(out.join('\n'));
  }
  if (op.op === 'disable-plugin' || op.op === 'enable-plugin') {
    const idx = blockIndex(op.pluginId);
    const lines = blocks[idx].text.split('\n');
    const want = op.op === 'disable-plugin' ? '  disabled: true' : '  disabled: false';
    let found = -1;
    for (let i = 0; i < lines.length; i++) if (/^  disabled:/.test(lines[i])) { found = i; break; }
    if (found >= 0) {
      const cur = lines[found].replace(/^  disabled:[ \t]*/, '').trim();
      const wantVal = op.op === 'disable-plugin' ? 'true' : 'false';
      if (cur !== wantVal) throw err('OP-CONFLICT', 'plugin "' + op.pluginId + '" disabled is "' + cur + '", expected "' + wantVal + '"');
      return text;
    }
    let insertAt = lines.length;
    for (let i = 0; i < lines.length; i++) if (/^  name:/.test(lines[i])) { insertAt = i + 1; break; }
    lines.splice(insertAt, 0, want);
    return rebuild(blocks.map(function (b, i) { return { id: b.id, text: i === idx ? lines.join('\n') : b.text }; }));
  }
  if (op.op === 'remove-plugin') {
    const idx = blockIndex(op.pluginId);
    return normText(blocks.filter(function (b, i) { return i !== idx; }).map(function (b) { return b.text; }).join('\n'));
  }
  if (op.op === 'add-plugin') {
    if (!op.pluginId || !MODE_ID_RE.test(op.pluginId)) throw err('OP-BAD-ARG', 'add-plugin needs a valid pluginId');
    if (!op.pluginName) throw err('OP-BAD-ARG', 'add-plugin needs pluginName');
    if (blocks.some(function (b) { return b.id === op.pluginId; })) throw err('OP-CONFLICT', 'plugin "' + op.pluginId + '" already present');
    let block = '- id: ' + op.pluginId + '\n  name: ' + yamlStr(op.pluginName);
    if (op.config && typeof op.config === 'object') {
      block += '\n  config:';
      Object.keys(op.config).forEach(function (k) {
        const v = op.config[k];
        if (v !== null && typeof v === 'object') throw err('OP-UNSUPPORTED', 'add-plugin config value for "' + k + '" is not scalar (ops support scalar config only)');
        block += '\n    ' + k + ': ' + renderScalar(v);
      });
    }
    return normText(text.replace(/\n+$/, '\n') + block + '\n');
  }
  if (op.op === 'set-plugin-config') {
    const idx = blockIndex(op.pluginId);
    if (!Array.isArray(op.path) || op.path.length !== 1) throw err('OP-UNSUPPORTED', 'set-plugin-config supports a single-level path only');
    const key = op.path[0];
    const lines = blocks[idx].text.split('\n');
    let cfgStart = -1;
    for (let i = 0; i < lines.length; i++) if (/^  config:[ \t]*$/.test(lines[i])) { cfgStart = i; break; }
    if (cfgStart < 0) {
      if (op.from !== undefined) throw err('OP-CONFLICT', 'plugin "' + op.pluginId + '" has no config block but op expects from=' + String(op.from));
      lines.push('  config:', '    ' + key + ': ' + renderScalar(op.value));
      return rebuild(blocks.map(function (b, i) { return { id: b.id, text: i === idx ? lines.join('\n') : b.text }; }));
    }
    let keyLine = -1;
    for (let i = cfgStart + 1; i < lines.length; i++) {
      if (/^  [A-Za-z0-9_.-]+:/.test(lines[i])) break;
      const m = new RegExp('^    ' + escapeRe(key) + ':[ \t]*(.*)$').exec(lines[i]);
      if (m) { keyLine = i; break; }
    }
    if (keyLine < 0) {
      if (op.from !== undefined) throw err('OP-CONFLICT', 'plugin "' + op.pluginId + '" has no config key "' + key + '" but op expects from=' + String(op.from));
      lines.splice(cfgStart + 1, 0, '    ' + key + ': ' + renderScalar(op.value));
    } else {
      const cur = unquote(lines[keyLine].replace(/^    [^:]+:[ \t]*/, '').trim());
      if (op.from !== undefined && String(op.from) !== cur) throw err('OP-CONFLICT', 'plugin "' + op.pluginId + '" config "' + key + '" is "' + cur + '", op expects from="' + op.from + '"');
      if (String(op.value) === cur) return text;
      lines[keyLine] = '    ' + key + ': ' + renderScalar(op.value);
    }
    return rebuild(blocks.map(function (b, i) { return { id: b.id, text: i === idx ? lines.join('\n') : b.text }; }));
  }
  throw err('OP-UNKNOWN', 'unknown op "' + String(op.op) + '"');
}

export function applyOps(canonical, ops) {
  const errors = [];
  const applied = [];
  let text = canonical.replace(/\n+$/, '\n');
  for (let index = 0; index < ops.length; index++) {
    const op = ops[index];
    try {
      text = applyOne(text, op);
      applied.push({ opIndex: index, op: op.op, pluginId: op.pluginId || null });
    } catch (e) {
      errors.push(err(e.id || 'OP-ERROR', e.message, { opIndex: index, op: op.op, pluginId: op.pluginId || null }));
      return { ok: false, errors: errors, applied: applied, canonical: null };
    }
  }
  return { ok: true, canonical: normText(text), applied: applied, errors: [] };
}

// ---------- subcommands ----------

export function cmdExtract(args) {
  if (!args.dump) return { ok: false, errors: [err('USAGE', 'extract requires --dump <file>')] };
  if (!fs.existsSync(args.dump)) return { ok: false, errors: [err('IO-DUMP', 'dump file not found: ' + args.dump)] };
  const preset = args.preset || 'ptc';
  const dumpText = fs.readFileSync(args.dump, 'utf8');
  const entry = findPresetEntry(dumpText, preset);
  if (!entry) return { ok: false, errors: [err('PRESET-ROW-MISSING', 'dump has no top-level row "preset-' + preset + '"')] };
  const plugins = pluginsCanonicalFromEntry(entry.text);
  if (!plugins || !plugins.canonical.trim()) return { ok: false, errors: [err('PRESET-PLUGINS-EMPTY', 'preset-' + preset + ' row has no plugins list')] };
  const yml = renderBaselineYml(preset, plugins.canonical);
  if (args.out) writeFile(args.out, yml);
  return { ok: true, preset: preset, sha256: plugins.sha, plugins: plugins.canonical.split('\n').filter(Boolean).length, out: args.out || null, yaml: args.out ? null : yml };
}

export function cmdEmit(args) {
  const need = ['baseline', 'mode-id', 'mode-name', 'description', 'order'];
  for (const k of need) if (args[k] === undefined || args[k] === true) return { ok: false, errors: [err('USAGE', 'emit requires --' + k)] };
  if (!MODE_ID_RE.test(args['mode-id'])) return { ok: false, errors: [err('MODE-CONFIG-ID', 'mode-id must match ^[a-z0-9][a-z0-9-]{0,63}$')] };
  if (RESERVED.indexOf(args['mode-id']) >= 0) return { ok: false, errors: [err('MODE-RESERVED-ID', '"' + args['mode-id'] + '" collides with a built-in preset id')] };
  const order = Number(args.order);
  if (!Number.isInteger(order) || order < 5) return { ok: false, errors: [err('MODE-ORDER', '--order must be an integer >= 5')] };
  const baseline = readBaselineYml(args.baseline);
  if (!baseline.ok) return { ok: false, errors: [err('BASELINE-READ', baseline.error)] };
  const preset = args.preset || baseline.preset || 'ptc';
  if (preset !== 'ptc') return { ok: false, errors: [err('BASELINE-PRESET', 'only the ptc baseline is supported as the fork source (found "' + preset + '")')] };
  if (baseline.declaredSha && baseline.declaredSha !== baseline.sha) return { ok: false, errors: [err('BASELINE-SHA', 'baseline file sha256 does not match its plugins block')] };
  let expected = baseline.canonical;
  let opsJson = null;
  if (args.ops) {
    const opsRead = readJson(args.ops);
    if (!opsRead.ok || !Array.isArray((opsRead.value || {}).ops)) return { ok: false, errors: [err('OPS-READ', 'ops file must be JSON with an "ops" array')] };
    const replayed = applyOps(baseline.canonical, opsRead.value.ops);
    if (!replayed.ok) return { ok: false, errors: replayed.errors };
    expected = replayed.canonical;
    opsJson = opsRead.value;
  }
  const insert = emitInsertText(args['mode-id'], args['mode-name'], args.description, order, expected);
  const result = { ok: true, modeId: args['mode-id'], order: order, sha256: sha256(expected), baselineSha256: baseline.sha, insert: insert, wrote: [] };
  if (args['profile-dir']) {
    const profileDir = path.resolve(args['profile-dir']);
    const patchPath = path.join(profileDir, 'cordis.patch.yml');
    if (!fs.existsSync(patchPath)) return { ok: false, errors: [err('IO-PATCH', 'profile has no cordis.patch.yml: ' + patchPath)] };
    const patchText = fs.readFileSync(patchPath, 'utf8');
    const existsInPatch = !!findInsertEntryTextById(patchText, args['mode-id']);
    if (existsInPatch && !args.replace) return { ok: false, errors: [err('MODE-EXISTS', 'mode "' + args['mode-id'] + '" already exists in the profile patch (pass --replace to update it)')] };
    const existingOpsPath = path.join(profileDir, MARKER_DIR, 'ops-' + args['mode-id'] + '.json');
    if (existsInPatch && !opsJson && fs.existsSync(existingOpsPath)) return { ok: false, errors: [err('OPS-LEDGER-EXISTS', 'mode has a recorded ops ledger but no --ops was passed; refusing to silently drop customizations (pass --ops <file> or delete ' + existingOpsPath + ')')] };
    const markerDir = path.join(profileDir, MARKER_DIR);
    ensureDir(markerDir);
    const ymlName = 'baseline-ptc-' + args['mode-id'] + '.yml';
    const ymlPath = path.join(markerDir, ymlName);
    const jsonPath = path.join(markerDir, 'baseline-' + args['mode-id'] + '.json');
    writeFile(ymlPath, renderBaselineYml(preset, baseline.canonical));
    if (opsJson) writeFile(path.join(markerDir, 'ops-' + args['mode-id'] + '.json'), JSON.stringify(opsJson, null, 2) + '\n');
    writeFile(jsonPath, JSON.stringify({
      schemaVersion: SCHEMA,
      modeId: args['mode-id'],
      displayName: args['mode-name'],
      description: args.description,
      order: order,
      preset: preset,
      baselineFile: ymlName,
      sha256: sha256(expected),
      baselineSha256: baseline.sha,
      opsFile: opsJson ? 'ops-' + args['mode-id'] + '.json' : null,
      extractedAt: nowIso(),
      source: 'dsh --dump-config',
    }, null, 2) + '\n');
    const newPatch = existsInPatch ? replaceEntryInPatch(patchText, args['mode-id'], insert) : appendOrReplaceInsert(patchText, insert);
    result.replaced = existsInPatch;
    if (args.write) {
      const backup = patchPath + '.bak-' + Date.now();
      fs.copyFileSync(patchPath, backup);
      fs.writeFileSync(patchPath, newPatch);
      result.wrote.push(patchPath, ymlPath, jsonPath, backup);
    } else {
      result.wrote.push(ymlPath, jsonPath);
      result.patchPreview = newPatch;
    }
  }
  return result;
}

function appendOrReplaceInsert(patchText, insert) {
  const lines = patchText.split('\n');
  let emptyLine = -1;
  for (let i = 0; i < lines.length; i++) if (lines[i].trim() === '[]') { emptyLine = i; break; }
  if (emptyLine >= 0) {
    const out = lines.slice(0, emptyLine).concat(insert.replace(/\n+$/, '').split('\n')).concat(lines.slice(emptyLine + 1));
    return normText(out.join('\n'));
  }
  return normText(patchText.replace(/\n+$/, '\n') + '\n' + insert);
}

export function cmdVerify(args) {
  const errors = [];
  const checks = [];
  function check(id, ok, detail) {
    checks.push({ id: id, ok: ok });
    if (!ok) errors.push(err(id, detail || ''));
    return ok;
  }
  if (!args['profile-dir'] || !args['mode-id']) return { ok: false, errors: [err('USAGE', 'verify requires --profile-dir and --mode-id')] };
  const profileDir = path.resolve(args['profile-dir']);
  const patchPath = path.join(profileDir, 'cordis.patch.yml');
  if (!check('VERIFY-PATCH', fs.existsSync(patchPath), 'missing ' + patchPath)) return { ok: false, errors: errors, checks: checks };
  const patchText = fs.readFileSync(patchPath, 'utf8');
  const item = agentPresetItems(patchText).find(function (m) { return m.configId === args['mode-id']; });
  if (!check('VERIFY-MODE-ROW', !!item, 'profile patch has no mode insert with config.id "' + args['mode-id'] + '"')) return { ok: false, errors: errors, checks: checks };
  const ymlPath = path.join(profileDir, MARKER_DIR, 'baseline-ptc-' + args['mode-id'] + '.yml');
  const jsonPath = path.join(profileDir, MARKER_DIR, 'baseline-' + args['mode-id'] + '.json');
  check('VERIFY-BASELINE-YML', fs.existsSync(ymlPath), 'missing ' + ymlPath);
  check('VERIFY-BASELINE-JSON', fs.existsSync(jsonPath), 'missing ' + jsonPath);
  if (errors.length) return { ok: false, errors: errors, checks: checks };
  const baseline = readBaselineYml(ymlPath);
  if (!check('VERIFY-BASELINE-READ', baseline.ok, baseline.error)) return { ok: false, errors: errors, checks: checks };
  const bj = readJson(jsonPath);
  let expected = baseline.canonical;
  let opsApplied = 0;
  const opsPath = path.join(profileDir, MARKER_DIR, 'ops-' + args['mode-id'] + '.json');
  if (fs.existsSync(opsPath)) {
    const opsJson = readJson(opsPath);
    if (check('VERIFY-OPS-READ', opsJson.ok && Array.isArray((opsJson.value || {}).ops), 'invalid ops ledger: ' + opsPath)) {
      const replayed = applyOps(baseline.canonical, opsJson.value.ops);
      if (check('VERIFY-OPS-REPLAY', replayed.ok, replayed.ok ? '' : JSON.stringify(replayed.errors))) {
        expected = replayed.canonical;
        opsApplied = replayed.applied.length;
      }
    }
  }
  const expectedSha = sha256(expected);
  check('VERIFY-BASELINE-JSON-SHAPE', bj.ok && !!bj.value && bj.value.schemaVersion === SCHEMA && bj.value.modeId === args['mode-id'], 'baseline json invalid or modeId mismatch');
  check('VERIFY-BASELINE-SOURCE-SHA', !bj.value || !bj.value.baselineSha256 || bj.value.baselineSha256 === baseline.sha, 'baseline json baselineSha256 does not match the official baseline plugins block');
  check('VERIFY-SHA-DECLARED', !baseline.declaredSha || baseline.declaredSha === baseline.sha, 'baseline yml sha256 does not match its plugins block');
  check('VERIFY-SHA', item.pluginsSha === expectedSha, 'patch plugins sha ' + String(item.pluginsSha).slice(0, 12) + ' != expected sha ' + String(expectedSha).slice(0, 12) + ' (baseline + recorded ops)');
  check('VERIFY-TEXT', item.pluginsCanonical === expected, 'patch plugins text differs from the expected text (official baseline + recorded ops)');
  return { ok: errors.length === 0, modeId: args['mode-id'], sha256: expectedSha, opsApplied: opsApplied, checks: checks, errors: errors };
}

export function cmdReplay(args) {
  if (!args.baseline || !args.ops) return { ok: false, errors: [err('USAGE', 'replay requires --baseline and --ops')] };
  const baseline = readBaselineYml(args.baseline);
  if (!baseline.ok) return { ok: false, errors: [err('BASELINE-READ', baseline.error)] };
  const opsJson = readJson(args.ops);
  if (!opsJson.ok || !Array.isArray((opsJson.value || {}).ops)) return { ok: false, errors: [err('OPS-READ', 'ops file must be JSON with an "ops" array')] };
  const res = applyOps(baseline.canonical, opsJson.value.ops);
  if (!res.ok) return { ok: false, modeId: opsJson.value.modeId || null, errors: res.errors, applied: res.applied };
  const yml = renderBaselineYml(baseline.preset || 'ptc', res.canonical);
  if (args.out) writeFile(args.out, yml);
  return { ok: true, modeId: opsJson.value.modeId || null, applied: res.applied, sha256: sha256(res.canonical), out: args.out || null, yaml: args.out ? null : yml };
}

function replaceEntryInPatch(patchText, modeId, insertText) {
  const lines = patchText.split('\n');
  const entries = topLevelEntries(patchText);
  let target = null;
  for (const e of entries) {
    if (agentPresetItems(e.text).some(function (m) { return m.configId === modeId; })) { target = e; break; }
  }
  if (!target) throw err('MODE-ROW-MISSING', 'mode "' + modeId + '" not found');
  const start = target.startLine - 1;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^- /.test(lines[i])) { end = i; break; }
  const insertLines = insertText.replace(/\n+$/, '').split('\n');
  const out = lines.slice(0, start).concat(insertLines).concat(lines.slice(end));
  return normText(out.join('\n'));
}

export function cmdRefresh(args) {
  if (!args['profile-dir'] || !args['mode-id'] || !args.dump) return { ok: false, errors: [err('USAGE', 'refresh requires --profile-dir, --mode-id and --dump')] };
  const profileDir = path.resolve(args['profile-dir']);
  const modeId = args['mode-id'];
  const preset = args.preset || 'ptc';
  const patchPath = path.join(profileDir, 'cordis.patch.yml');
  const markerDir = path.join(profileDir, MARKER_DIR);
  const ymlPath = path.join(markerDir, 'baseline-ptc-' + modeId + '.yml');
  const jsonPath = path.join(markerDir, 'baseline-' + modeId + '.json');
  const opsPath = path.join(markerDir, 'ops-' + modeId + '.json');
  if (!fs.existsSync(patchPath)) return { ok: false, errors: [err('IO-PATCH', 'missing ' + patchPath)] };
  const oldBaseline = readBaselineYml(ymlPath);
  if (!oldBaseline.ok) return { ok: false, errors: [err('BASELINE-READ', oldBaseline.error)] };
  const oldJson = readJson(jsonPath);
  if (!oldJson.ok) return { ok: false, errors: [err('BASELINE-JSON', oldJson.error)] };
  if (!fs.existsSync(args.dump)) return { ok: false, errors: [err('IO-DUMP', 'dump file not found: ' + args.dump)] };
  const dumpText = fs.readFileSync(args.dump, 'utf8');
  const presetEntry = findPresetEntry(dumpText, preset);
  if (!presetEntry) return { ok: false, errors: [err('PRESET-ROW-MISSING', 'dump has no preset-' + preset + ' row')] };
  const fresh = pluginsCanonicalFromEntry(presetEntry.text);
  if (!fresh) return { ok: false, errors: [err('PRESET-PLUGINS-EMPTY', 'preset row has no plugins')] };
  const patchText = fs.readFileSync(patchPath, 'utf8');
  const currentItem = agentPresetItems(patchText).find(function (m) { return m.configId === modeId; });
  if (!currentItem) return { ok: false, errors: [err('MODE-ROW-MISSING', 'profile patch has no mode "' + modeId + '"')] };
  const opsExists = fs.existsSync(opsPath);
  let expected = fresh.canonical;
  let opsApplied = 0;
  const officialChanged = fresh.sha !== oldBaseline.sha;
  if (opsExists) {
    const opsJson = readJson(opsPath);
    if (!opsJson.ok || !Array.isArray((opsJson.value || {}).ops)) return { ok: false, errors: [err('OPS-READ', 'invalid ops ledger ' + opsPath)] };
    const onOld = applyOps(oldBaseline.canonical, opsJson.value.ops);
    if (!onOld.ok) return { ok: false, errors: onOld.errors.map(function (e) { return Object.assign({ phase: 'replay-on-old' }, e); }) };
    if (onOld.canonical !== currentItem.pluginsCanonical) {
      return { ok: false, errors: [err('OPS-LEDGER-MISMATCH', 'replaying ops on the old baseline does not reproduce the current patch (local edits are not recorded in ' + path.basename(opsPath) + ')')] };
    }
    const onNew = applyOps(fresh.canonical, opsJson.value.ops);
    if (!onNew.ok) return { ok: false, errors: onNew.errors.map(function (e) { return Object.assign({ phase: 'replay-on-new' }, e); }) };
    expected = onNew.canonical;
    opsApplied = onNew.applied.length;
  } else if (currentItem.pluginsSha !== oldBaseline.sha) {
    return { ok: false, errors: [err('OPS-LEDGER-MISSING', 'patch plugins differ from the old baseline but no ops ledger exists; record customizations as ' + path.basename(opsPath) + ' before upgrading')] };
  }
  const meta = oldJson.value;
  const insert = emitInsertText(modeId, meta.displayName || modeId, meta.description || '', Number(meta.order) || 5, expected);
  const expectedSha = sha256(expected);
  const noop = expectedSha === currentItem.pluginsSha;
  const result = { ok: true, modeId: modeId, officialChanged: officialChanged, changed: !noop, opsApplied: opsApplied, oldSha: oldBaseline.sha, freshSha: fresh.sha, expectedSha: expectedSha, wrote: [] };
  if (noop) return result;
  const newBaselineJson = Object.assign({}, meta, { sha256: expectedSha, baselineSha256: fresh.sha, opsFile: opsExists ? 'ops-' + modeId + '.json' : null, extractedAt: nowIso(), refreshedAt: nowIso() });
  if (!args.write) {
    result.patchPreview = replaceEntryInPatch(patchText, modeId, insert);
    return result;
  }
  const backup = patchPath + '.bak-' + Date.now();
  fs.copyFileSync(patchPath, backup);
  fs.writeFileSync(patchPath, replaceEntryInPatch(patchText, modeId, insert));
  writeFile(ymlPath, renderBaselineYml(preset, fresh.canonical));
  writeFile(jsonPath, JSON.stringify(newBaselineJson, null, 2) + '\n');
  result.wrote.push(patchPath, ymlPath, jsonPath, backup);
  return result;
}

// ---------- CLI ----------

function renderHuman(sub, result) {
  if (!result.ok) {
    console.log('mode-base ' + sub + ': FAIL');
    (result.errors || []).forEach(function (e) { console.log('  ERROR ' + e.id + ' ' + (e.detail || '')); });
    return;
  }
  console.log('mode-base ' + sub + ': OK');
  Object.keys(result).forEach(function (k) {
    if (['ok', 'insert', 'yaml', 'patchPreview', 'checks', 'applied'].indexOf(k) >= 0) return;
    const v = result[k];
    console.log('  ' + k + ': ' + (Array.isArray(v) ? v.join(', ') : String(v)));
  });
  if (result.checks) result.checks.forEach(function (c) { if (!c.ok) console.log('  FAIL ' + c.id); });
  if (result.insert) console.log('\n' + result.insert);
  if (result.patchPreview && !result.wrote) console.log('\n--- patch preview (not written; pass --write) ---\n' + result.patchPreview);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sub = args._[0];
  const handlers = { extract: cmdExtract, emit: cmdEmit, verify: cmdVerify, replay: cmdReplay, refresh: cmdRefresh };
  if (!handlers[sub]) {
    console.error('usage: node mode-base.mjs <extract|emit|verify|replay|refresh> [options]  (see references/60-agent-modes.md)');
    process.exit(2);
  }
  let result;
  try {
    result = handlers[sub](args);
  } catch (e) {
    result = { ok: false, errors: [err('UNEXPECTED', String((e && e.message) || e))] };
  }
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else renderHuman(sub, result);
  process.exit(result.ok ? 0 : 1);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();
