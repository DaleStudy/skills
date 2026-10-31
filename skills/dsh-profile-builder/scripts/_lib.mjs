// _lib.mjs — shared zero-dependency helpers for dsh-profile-builder scripts.
// Reader for the YAML subset that DSH profile patches and --dump-config use.
// Not a general YAML parser: only what the checks and mode tooling need.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MARKER_DIR = '.profile-builder';
export const RESERVED_MODE_IDS = ['standard', 'ptc', 'minimal', 'cordis'];
export const REQUIRED_BUNDLE = '@deepseek-ai/dsh-base';
export const APP_SURFACES = [
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-headless',
  '@deepseek-ai/dsh-acp-app',
  '@deepseek-ai/dsh-sdk-app',
  '@deepseek-ai/dsh-sdk-minimal',
];
export const PRESET_PLUGIN = '@deepseek-ai/dsh-agent-preset';
export const INSERT_SCHEMA = 1;

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
export function sha256File(file) {
  return sha256(fs.readFileSync(file));
}
export function readJson(file) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
export function normText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n*$/, '\n');
}
export function indentOf(line) {
  const m = /^[ \t]*/.exec(line);
  return m[0].length;
}
export function isBlankOrComment(line) {
  const t = line.trim();
  return t === '' || t.startsWith('#');
}
export function dedent(lines, n) {
  return lines.map((l) => {
    if (l.trim() === '') return '';
    let k = 0;
    while (k < n && (l[k] === ' ' || l[k] === '\t')) k++;
    return l.slice(k);
  });
}
export function unquote(v) {
  let s = String(v).trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    s = s.slice(1, -1);
  }
  return s;
}
export function yamlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}
const RE_SPECIAL = [46, 42, 43, 63, 94, 36, 123, 125, 40, 41, 124, 91, 93, 92]
  .map((c) => String.fromCharCode(c))
  .join('');
export function escapeRe(s) {
  let r = '';
  for (const c of String(s)) r += RE_SPECIAL.includes(c) ? '\\' + c : c;
  return r;
}

// ---------- patch scanning ----------

/** True when the patch file is a non-empty top-level YAML array ("- ..." items). */
export function patchIsTopLevelArray(text) {
  for (const line of text.split('\n')) {
    if (isBlankOrComment(line)) continue;
    const t = line.trim();
    if (t === '[]') return true;
    return /^-[ \t]/.test(line);
  }
  return false;
}

/** Top-level "- item" blocks of a patch file or dump file. */
export function topLevelEntries(text) {
  const lines = text.split('\n');
  const entries = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^-[ \t]/.test(line)) {
      if (cur) entries.push(cur);
      cur = { startLine: i + 1, lines: [line] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) entries.push(cur);
  return entries.map((e) => ({ startLine: e.startLine, text: normText(e.lines.join('\n')) }));
}

/** Top-level entry id ("- id: x" first id line). */
export function entryId(entryText) {
  for (const line of entryText.split('\n')) {
    const m = /^-[ \t]+id:[ \t]*(.+)$/.exec(line);
    if (m) return unquote(m[1]);
  }
  return null;
}

/** Config block (the value under "config:") of one top-level entry. */
export function entryConfig(entryText) {
  const lines = entryText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^([ \t]*)config:[ \t]*$/.exec(lines[i]);
    if (!m) continue;
    const base = m[1].length;
    const block = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (isBlankOrComment(line)) {
        block.push(line);
        continue;
      }
      if (indentOf(line) <= base) break;
      block.push(line);
    }
    const blockText = block.join('\n');
    return {
      indent: base,
      text: blockText,
      value(key) {
        const re = new RegExp('^[ \\t]+' + escapeRe(key) + ':[ \\t]*(.+)$', 'm');
        const hit = re.exec(blockText);
        return hit ? unquote(hit[1]) : null;
      },
    };
  }
  return null;
}

function firstMatch(blockText, re) {
  const hit = re.exec(blockText);
  return hit ? unquote(hit[1]) : null;
}

/**
 * Parse insert items of a top-level patch/dump entry.
 * Returns [{ id, name, configId, configName, configDescription, configOrder,
 *            pluginsCanonical, pluginsSha }]
 */
export function insertItems(entryText) {
  const lines = entryText.split('\n');
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^([ \t]*)-[ \t]+insert:[ \t]*$/.exec(lines[i]);
    if (!m) continue;
    const insertIndent = m[1].length;
    let j = i + 1;
    while (j < lines.length && isBlankOrComment(lines[j])) j++;
    if (j >= lines.length) continue;
    const itemIndent = indentOf(lines[j]);
    if (itemIndent <= insertIndent) continue;
    let blockStart = j;
    let k = j;
    const push = (end) => {
      const itemText = lines.slice(blockStart, end).join('\n');
      const cfg = entryConfig(itemText);
      let pluginsCanonical = null;
      let pluginsSha = null;
      if (cfg) {
        const cfgLines = cfg.text.split('\n');
        let p = -1;
        for (let x = 0; x < cfgLines.length; x++) {
          if (/^[ \t]+plugins:[ \t]*$/.test(cfgLines[x])) { p = x; break; }
        }
        if (p >= 0) {
          const pluginsIndent = indentOf(cfgLines[p]);
          let q = p + 1;
          while (q < cfgLines.length && isBlankOrComment(cfgLines[q])) q++;
          const entriesIndent = q < cfgLines.length ? indentOf(cfgLines[q]) : pluginsIndent + 2;
          const collected = [];
          for (let x = p + 1; x < cfgLines.length; x++) {
            const line = cfgLines[x];
            if (isBlankOrComment(line)) { collected.push(line); continue; }
            if (indentOf(line) <= pluginsIndent) break;
            collected.push(line);
          }
          pluginsCanonical = normText(dedent(collected, entriesIndent).join('\n'));
          pluginsSha = sha256(pluginsCanonical);
        }
      }
      items.push({
        id: firstMatch(itemText, /^[ \t]*-[ \t]+id:[ \t]*(.+)$/m),
        name: firstMatch(itemText, /^[ \t]+name:[ \t]*(.+)$/m),
        configId: cfg ? cfg.value('id') : null,
        configName: cfg ? cfg.value('name') : null,
        configDescription: cfg ? cfg.value('description') : null,
        configOrder: cfg ? cfg.value('order') : null,
        pluginsCanonical,
        pluginsSha,
        raw: normText(itemText),
      });
    };
    while (k < lines.length) {
      const line = lines[k];
      if (isBlankOrComment(line)) { k++; continue; }
      const ind = indentOf(line);
      if (ind < itemIndent) break;
      if (ind === itemIndent && /^[ \t]*-[ \t]/.test(line) && k > blockStart) {
        push(k);
        blockStart = k;
      }
      k++;
    }
    push(k);
    i = k - 1;
  }
  return items;
}

export function agentPresetItems(patchText) {
  const out = [];
  for (const entry of topLevelEntries(patchText)) {
    for (const item of insertItems(entry.text)) {
      const isPresetRow = item.name === PRESET_PLUGIN;
      if (isPresetRow && item.configId) out.push({ ...item, entryStartLine: entry.startLine });
    }
  }
  return out;
}

export function findInsertEntryTextById(patchText, modeId) {
  for (const entry of topLevelEntries(patchText)) {
    for (const item of insertItems(entry.text)) {
      if (item.name === PRESET_PLUGIN && item.configId === modeId) return entry;
    }
  }
  return null;
}

export function topLevelPluginEntries(canonical) {
  const lines = canonical.split('\n');
  const blocks = [];
  let cur = null;
  for (const line of lines) {
    if (/^- id:[ \t]/.test(line)) {
      if (cur) blocks.push(cur);
      cur = { id: unquote(line.replace(/^- id:[ \t]*/, '')), lines: [line] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) blocks.push(cur);
  return blocks.map((b) => ({ ...b, text: b.lines.join('\n') }));
}

// ---------- terminal + fs helpers ----------

export function out(obj, json, humanText) {
  if (json) console.log(JSON.stringify(obj, null, 2));
  else console.log(humanText ?? JSON.stringify(obj, null, 2));
}
export function fail(msg, code = 2) {
  console.error('dsh-profile-builder: ' + msg);
  process.exit(code);
}
export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { args._.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else {
      args._.push(a);
    }
  }
  return args;
}
export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
export function listFilesRecursive(dir, base = dir) {
  const outFiles = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = path.relative(base, abs).split(path.sep).join('/');
    const st = fs.lstatSync(abs);
    if (st.isDirectory()) outFiles.push(...listFilesRecursive(abs, base));
    else outFiles.push(rel);
  }
  return outFiles.sort();
}
export function writeFile(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
}
export function isMain(importUrl) {
  return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(importUrl).pathname);
}
export function nowIso() {
  return new Date().toISOString();
}

// ---------- preset plugins canonical form (shared by mode-base / dump / checks) ----------

/**
 * Extract the canonical plugin list of a config block.
 * Canonical form = the "plugins:" list entries dedented to column 0, trailing whitespace
 * stripped, exactly one trailing newline. Its sha256 is the mode baseline identity.
 */
export function pluginsCanonicalFromConfig(cfg) {
  if (!cfg) return null;
  const lines = cfg.text.split('\n');
  let p = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^[ \t]+plugins:[ \t]*$/.test(lines[i])) { p = i; break; }
  }
  if (p < 0) return null;
  const pluginsIndent = indentOf(lines[p]);
  let q = p + 1;
  while (q < lines.length && isBlankOrComment(lines[q])) q++;
  const entriesIndent = q < lines.length ? indentOf(lines[q]) : pluginsIndent + 2;
  const collected = [];
  for (let x = p + 1; x < lines.length; x++) {
    const line = lines[x];
    if (isBlankOrComment(line)) { collected.push(line); continue; }
    if (indentOf(line) <= pluginsIndent) break;
    collected.push(line);
  }
  const canonical = normText(dedent(collected, entriesIndent).join('\n'));
  return { canonical: canonical, sha: sha256(canonical), entriesIndent: entriesIndent };
}

export function pluginsCanonicalFromEntry(entryText) {
  return pluginsCanonicalFromConfig(entryConfig(entryText));
}

/** Render a baseline YAML file from a canonical plugin list. */
export function renderBaselineYml(preset, canonical) {
  const sha = sha256(canonical);
  const body = canonical
    .split('\n')
    .map((l) => (l === '' ? '' : '  ' + l))
    .join('\n');
  return [
    '# dsh-profile-builder mode baseline — generated, do not edit by hand.',
    '# Extracted from an official dsh --dump-config run; see references/20-workflows.md W4.',
    'preset: ' + preset,
    'sha256: ' + sha,
    'plugins:',
    body.replace(/\n+$/, ''),
    '',
  ].join('\n');
}

/** Read a baseline YAML file. Returns { preset, declaredSha, canonical, sha, ok, error }. */
export function readBaselineYml(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return { ok: false, error: e.message }; }
  const preset = /^preset:[ \t]*(.+)$/m.exec(text);
  const declared = /^sha256:[ \t]*([0-9a-f]{64})$/m.exec(text);
  const lines = normText(text).split('\n');
  let p = -1;
  for (let i = 0; i < lines.length; i++) { if (/^plugins:[ \t]*$/.test(lines[i])) { p = i; break; } }
  if (p < 0) return { ok: false, error: 'missing top-level "plugins:" mapping' };
  const collected = [];
  for (let i = p + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) { collected.push(line); continue; }
    collected.push(line);
  }
  let first = -1;
  for (let i = 0; i < collected.length; i++) {
    if (collected[i].trim() !== '' && !collected[i].trim().startsWith('#')) { first = indentOf(collected[i]); break; }
  }
  if (first < 0) return { ok: false, error: 'empty plugins list' };
  const canonical = normText(dedent(collected, first).join('\n'));
  return {
    ok: true,
    preset: preset ? unquote(preset[1]) : null,
    declaredSha: declared ? declared[1] : null,
    canonical: canonical,
    sha: sha256(canonical),
    pluginsIndent: first,
  };
}
