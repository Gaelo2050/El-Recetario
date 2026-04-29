'use strict';

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'prohibited-words.csv');
const COMMENT_PREFIXES = ['#', '//'];
const FALLBACK_WORDS = [];

let entries = [];
let phrases = [];
let singleWordSet = new Set();
let collapsedSingleWords = [];

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^0-9a-z\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const parseCsv = (rawContent) => {
  if (!rawContent || typeof rawContent !== 'string') return [];
  const lines = rawContent.split(/\r?\n/);
  const parsed = [];
  const skipValues = new Set(['', 'palabra', 'palabras', 'word', 'words', 'termino', 'terminos', 'term', 'terms']);

  for (const line of lines) {
    if (!line) continue;
    const trimmedLine = line.trim();
    const isComment = COMMENT_PREFIXES.some((prefix) => trimmedLine.startsWith(prefix));
    if (!trimmedLine || isComment) continue;

    const firstCell = trimmedLine.split(/[;,|]/)[0].trim().replace(/^"(.+)"$/g, '$1');
    if (!firstCell) continue;

    const normalized = normalize(firstCell);
    if (!normalized || skipValues.has(normalized)) continue;

    parsed.push({
      raw: firstCell,
      normalized,
      collapsed: normalized.replace(/\s+/g, ''),
      isPhrase: normalized.includes(' ')
    });
  }

  return parsed;
};

const buildStructures = (list) => {
  entries = Array.isArray(list) ? list : [];
  phrases = entries.filter((entry) => entry.isPhrase);
  singleWordSet = new Set(entries.filter((entry) => !entry.isPhrase).map((entry) => entry.normalized));
  collapsedSingleWords = entries.filter((entry) => !entry.isPhrase).map((entry) => ({ raw: entry.raw, value: entry.collapsed }));
};

const loadFromDisk = () => {
  try {
    const content = fs.existsSync(CSV_PATH) ? fs.readFileSync(CSV_PATH, 'utf8') : '';
    const parsed = parseCsv(content);
    if (!parsed.length && FALLBACK_WORDS.length) {
      buildStructures(parseCsv(FALLBACK_WORDS.join('\n')));
    } else {
      buildStructures(parsed);
    }
  } catch (err) {
    console.warn('[profanityFilter] No se pudo leer el archivo CSV:', err && err.message ? err.message : err);
    buildStructures(parseCsv(FALLBACK_WORDS.join('\n')));
  }
};

loadFromDisk();

try {
  fs.watch(CSV_PATH, { persistent: false }, () => {
    setTimeout(loadFromDisk, 250);
  });
} catch (err) {
  console.warn('[profanityFilter] No se pudo observar el archivo CSV para recargas automáticas:', err && err.message ? err.message : err);
}

const containsProfanity = (value) => {
  if (!value || (!entries.length && !FALLBACK_WORDS.length)) return null;
  const normalizedInput = normalize(value);
  if (!normalizedInput) return null;

  if (phrases.some((entry) => normalizedInput.includes(entry.normalized))) {
    const hit = phrases.find((entry) => normalizedInput.includes(entry.normalized));
    return hit ? hit.raw : true;
  }

  const tokens = normalizedInput.split(' ').filter(Boolean);
  for (const token of tokens) {
    if (singleWordSet.has(token)) {
      const entry = entries.find((item) => !item.isPhrase && item.normalized === token);
      return entry ? entry.raw : token;
    }
  }

  const collapsedInput = normalizedInput.replace(/\s+/g, '');
  if (collapsedInput) {
    for (const entry of collapsedSingleWords) {
      if (!entry.value) continue;
      if (collapsedInput.includes(entry.value)) {
        return entry.raw;
      }
    }
  }

  return null;
};

const ensureClean = (fieldName, value) => {
  const hit = containsProfanity(value);
  if (!hit) return null;
  const error = new Error(`El campo ${fieldName} contiene una palabra no permitida.`);
  error.code = 'PROFANITY_DETECTED';
  error.match = hit;
  throw error;
};

module.exports = {
  containsProfanity,
  ensureClean,
  reload: loadFromDisk,
  getWords: () => entries.map((entry) => entry.raw),
  csvPath: CSV_PATH,
};
