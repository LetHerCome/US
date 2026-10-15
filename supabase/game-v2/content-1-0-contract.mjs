// US 1.0 content — the founder-approved drafts (2026-10-14) are kept verbatim
// in ./content-1-0 as the human-reviewable source: new Game V2 prompts and
// Swipe cards, Italian fixes, retired cards and the English text of every row.
// The migration carries the SQL generated from them between the
// `-- content-1-0:begin/end` markers; tests/content-1-0-catalog.test.js fails
// when the two drift apart. Regenerate with:
//   node scripts/build-content-1-0-sql.mjs
// The M11B/M11C sources (./catalog, ./recipes) stay pinned to their own
// historical migrations and are only read here as the rows being fixed.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, catalog, recipes } from './catalog-contract.mjs';

export const REPO = path.resolve(ROOT, '../..');
export const DIR = path.join(ROOT, 'content-1-0');
export const MIGRATION = 'supabase/migrations/20261014220000_content_1_0.sql';
export const BLOCK = 'content-1-0';
export const GAME_FILES = ['quanto_mi_conosci', 'scopritevi', 'ridete', 'confrontatevi', 'rivivete'];
export const NEW_PER_FAMILY = { quanto_mi_conosci: 40, scopritevi: 30, ridete: 30, confrontatevi: 30, rivivete: 20 };
export const SWIPE_NEW = 40;

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

export function drafts() {
  return {
    games: Object.fromEntries(GAME_FILES.map((f) => [f, readJson(path.join(DIR, `${f}.json`))])),
    swipe: readJson(path.join(DIR, 'swipe.json')),
    daily: readJson(path.join(DIR, 'daily_and_recipes_en.json')),
    overrides: readJson(path.join(DIR, 'overrides.json')),
    quests: readJson(path.join(DIR, 'quests.json')),
  };
}

// Rows that only exist in the baseline reference data (generated from the
// production capture): the Daily Question bank and the weekly Quest templates.
export function referenceRows(table) {
  const sql = fs.readFileSync(path.join(REPO, 'supabase/baseline/95_reference_data.sql'), 'utf8');
  const start = sql.indexOf(`insert into ${table}\n`);
  if (start < 0) throw new Error(`no reference data for ${table}`);
  const open = sql.indexOf('$rows$', start) + '$rows$'.length;
  return JSON.parse(sql.slice(open, sql.indexOf('$rows$', open)));
}

const swipeBase = () => readJson(path.join(ROOT, 'swipe-v1/catalog.json')).items;
const familyOf = (id) => id.split('-')[0];
const byId = (rows, key = 'id') => new Map(rows.map((r) => [r[key], r]));
const need = (map, id, where) => {
  if (!map.has(id)) throw new Error(`${where}: unknown id ${id}`);
  return map.get(id);
};
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Applies a fix like the migration does: only the given fields change and the
// version moves on when the wording actually changes.
function applyFix(row, fix, fields) {
  const next = { ...row };
  for (const [from, to] of fields) if (fix[from] !== undefined) next[to] = fix[from];
  const changed = fields.some(([, to]) => !same(next[to], row[to]));
  if (changed && 'version' in row) next.version = row.version + 1;
  return next;
}

const GAME_FIX_FIELDS = [['question_text', 'question_text'], ['predict_text', 'predict_text'], ['options', 'options']];
const SWIPE_FIX_FIELDS = [['question_text', 'question_text'], ['options', 'options']];

function gameEn(row, en) {
  const options = row.options || [];
  if (options.length && !(en.options_en || []).length) throw new Error(`${row.id}: options without English`);
  return {
    question_text_en: en.question_text_en,
    predict_text_en: en.predict_text_en ?? null,
    options_en: options.length ? en.options_en : [],
  };
}

// The content after the migration, one array per table (Italian + English).
export function finalState() {
  const d = drafts();
  const game = byId(catalog().map((e) => ({
    version: 1, source_type: 'curated', predict_text: null, options: [], longitudinal: false, ...e, active: true,
  })));
  for (const f of GAME_FILES) {
    for (const fix of d.games[f].fixes) game.set(fix.id, applyFix(need(game, fix.id, `${f} fix`), fix, GAME_FIX_FIELDS));
    for (const en of d.games[f].existing_en) {
      const row = need(game, en.id, `${f} existing_en`);
      game.set(en.id, { ...row, ...gameEn(row, en) });
    }
    for (const n of d.games[f].new) {
      if (game.has(n.id)) throw new Error(`${n.id} already exists`);
      const row = {
        id: n.id, version: 1, family: familyOf(n.id), source_type: 'curated', mechanic: n.mechanic,
        answer_kind: n.answer_kind, question_text: n.question_text, predict_text: n.predict_text ?? null,
        options: n.options || [], depth: n.depth, topic: n.topic, cooldown_class: n.cooldown_class,
        longitudinal: Boolean(n.longitudinal), active: true,
      };
      game.set(n.id, { ...row, ...gameEn(row, n) });
    }
  }

  const swipe = byId(swipeBase().map((e) => ({ ...e, active: true })));
  for (const fix of d.swipe.fixes) swipe.set(fix.id, applyFix(need(swipe, fix.id, 'swipe fix'), fix, SWIPE_FIX_FIELDS));
  for (const r of d.swipe.retire) swipe.set(r.id, { ...need(swipe, r.id, 'swipe retire'), active: false });
  for (const en of d.swipe.existing_en) {
    swipe.set(en.id, { ...need(swipe, en.id, 'swipe existing_en'), question_text_en: en.question_text_en, options_en: en.options_en });
  }
  for (const n of d.swipe.new) {
    if (swipe.has(n.id)) throw new Error(`${n.id} already exists`);
    swipe.set(n.id, {
      id: n.id, version: n.version || 1, question_text: n.question_text, options: n.options, topic: n.topic,
      active: true, question_text_en: n.question_text_en, options_en: n.options_en,
    });
  }

  const daily = byId(referenceRows('public.daily_question_templates'));
  for (const fix of d.daily.fixes) daily.set(fix.id, { ...need(daily, fix.id, 'daily fix'), question: fix.question });
  for (const en of d.daily.daily_en) daily.set(en.id, { ...need(daily, en.id, 'daily_en'), question_en: en.question_en });

  const recipe = byId(recipes().map((e) => ({ version: 1, options: [], ...e, active: true })));
  for (const fix of d.overrides.recipe_fixes) {
    recipe.set(fix.id, applyFix(need(recipe, fix.id, 'recipe fix'), fix, [['question', 'question_text']]));
  }
  for (const en of d.daily.recipes_en) {
    recipe.set(en.id, { ...need(recipe, en.id, 'recipes_en'), question_text_en: en.question_text_en });
  }

  const quest = byId(referenceRows('public.bond_quest_templates'), 'key');
  for (const fix of d.quests.fixes) quest.set(fix.key, { ...need(quest, fix.key, 'quest fix'), title: fix.title });
  for (const en of d.quests.existing_en) quest.set(en.key, { ...need(quest, en.key, 'quest existing_en'), title_en: en.title_en });

  return {
    catalog: [...game.values()], swipe: [...swipe.values()], daily: [...daily.values()],
    recipes: [...recipe.values()], quests: [...quest.values()],
  };
}

const sqlText = (value) => (value === null || value === undefined ? 'null' : `'${String(value).replace(/'/g, "''")}'`);
const sqlJson = (value) => (value === null || value === undefined ? 'null::jsonb' : `${sqlText(JSON.stringify(value))}::jsonb`);
const tuple = (values) => `  (${values.join(', ')})`;
const sqlArray = (ids) => `array[${ids.map(sqlText).join(', ')}]::text[]`;

function valuesUpdate({ table, alias, key = 'id', columns, rows, set, changed }) {
  return [
    `update ${table} as ${alias}`,
    `set ${set}`,
    'from (values',
    rows.map(tuple).join(',\n'),
    `) as v(${[key, ...columns].join(', ')})`,
    `where ${alias}.${key} = v.${key}`,
    `  and ${changed};`,
  ].join('\n');
}

export function contentSql() {
  const d = drafts();
  const gameBase = byId(catalog());
  const gameNew = GAME_FILES.flatMap((f) => d.games[f].new);
  const gameFixes = GAME_FILES.flatMap((f) => d.games[f].fixes);
  const gameEnRows = GAME_FILES.flatMap((f) => d.games[f].existing_en);
  for (const f of GAME_FILES) for (const n of d.games[f].new) if (familyOf(n.id) !== f) throw new Error(`${n.id} is not ${f}`);
  const fixCoalesce = (alias, cols) => cols.map((c) => `coalesce(v.${c}, ${alias}.${c})`);

  const out = [
    `-- ${BLOCK}:begin (generated by scripts/build-content-1-0-sql.mjs from supabase/game-v2/content-1-0; do not edit by hand)`,
    '',
    `-- Game V2 catalog: ${gameNew.length} new prompts, Italian and English.`,
    'insert into public.game_v2_catalog (id, version, family, source_type, mechanic, answer_kind, question_text, predict_text, options, depth, topic, cooldown_class, longitudinal, question_text_en, predict_text_en, options_en) values',
    gameNew.map((n) => {
      const options = n.options || [];
      return tuple([
        sqlText(n.id), '1', sqlText(familyOf(n.id)), sqlText('curated'), sqlText(n.mechanic), sqlText(n.answer_kind),
        sqlText(n.question_text), sqlText(n.predict_text ?? null), sqlJson(options), String(n.depth), sqlText(n.topic),
        sqlText(n.cooldown_class), n.longitudinal ? 'true' : 'false', sqlText(n.question_text_en),
        sqlText(n.predict_text_en ?? null), sqlJson(options.length ? n.options_en : []),
      ]);
    }).join(',\n'),
    'on conflict (id) do nothing;',
    '',
    `-- Game V2 catalog: ${gameFixes.length} new Italian wordings (same id, version + 1, only when the text changes).`,
    valuesUpdate({
      table: 'public.game_v2_catalog', alias: 'c', columns: ['question_text', 'predict_text', 'options'],
      rows: gameFixes.map((f) => [sqlText(f.id), sqlText(f.question_text ?? null), sqlText(f.predict_text ?? null), sqlJson(f.options ?? null)]),
      set: 'question_text = coalesce(v.question_text, c.question_text), predict_text = coalesce(v.predict_text, c.predict_text),\n    options = coalesce(v.options, c.options), version = c.version + 1',
      changed: `(c.question_text, c.predict_text, c.options) is distinct from (${fixCoalesce('c', ['question_text', 'predict_text', 'options']).join(', ')})`,
    }),
    '',
    `-- Game V2 catalog: English for the ${gameEnRows.length} existing prompts.`,
    valuesUpdate({
      table: 'public.game_v2_catalog', alias: 'c', columns: ['question_text_en', 'predict_text_en', 'options_en'],
      rows: gameEnRows.map((en) => {
        const base = need(gameBase, en.id, 'existing_en');
        const options = (gameFixes.find((f) => f.id === en.id)?.options) || base.options || [];
        return [sqlText(en.id), sqlText(en.question_text_en), sqlText(en.predict_text_en ?? null), sqlJson(options.length ? en.options_en : [])];
      }),
      set: 'question_text_en = v.question_text_en, predict_text_en = v.predict_text_en, options_en = v.options_en',
      changed: '(c.question_text_en, c.predict_text_en, c.options_en) is distinct from (v.question_text_en, v.predict_text_en, v.options_en)',
    }),
    '',
    `-- Swipe V1: ${d.swipe.new.length} new cards, Italian and English.`,
    'insert into private.game_swipe_v1_catalog (id, version, question_text, options, topic, active, question_text_en, options_en) values',
    d.swipe.new.map((n) => tuple([
      sqlText(n.id), String(n.version || 1), sqlText(n.question_text), sqlJson(n.options), sqlText(n.topic), 'true',
      sqlText(n.question_text_en), sqlJson(n.options_en),
    ])).join(',\n'),
    'on conflict (id) do nothing;',
    '',
    `-- Swipe V1: ${d.swipe.fixes.length} new Italian wordings (same id, version + 1, only when the text changes).`,
    valuesUpdate({
      table: 'private.game_swipe_v1_catalog', alias: 'c', columns: ['question_text', 'options'],
      rows: d.swipe.fixes.map((f) => [sqlText(f.id), sqlText(f.question_text ?? null), sqlJson(f.options ?? null)]),
      set: 'question_text = coalesce(v.question_text, c.question_text), options = coalesce(v.options, c.options), version = c.version + 1',
      changed: `(c.question_text, c.options) is distinct from (${fixCoalesce('c', ['question_text', 'options']).join(', ')})`,
    }),
    '',
    `-- Swipe V1: ${d.swipe.retire.length} retired cards (kept, never deleted).`,
    `update private.game_swipe_v1_catalog set active = false where id = any (${sqlArray(d.swipe.retire.map((r) => r.id))}) and active;`,
    '',
    `-- Swipe V1: English for the ${d.swipe.existing_en.length} kept cards.`,
    valuesUpdate({
      table: 'private.game_swipe_v1_catalog', alias: 'c', columns: ['question_text_en', 'options_en'],
      rows: d.swipe.existing_en.map((en) => [sqlText(en.id), sqlText(en.question_text_en), sqlJson(en.options_en)]),
      set: 'question_text_en = v.question_text_en, options_en = v.options_en',
      changed: '(c.question_text_en, c.options_en) is distinct from (v.question_text_en, v.options_en)',
    }),
    '',
    `-- Daily Question bank: ${d.daily.fixes.length} new Italian wordings.`,
    valuesUpdate({
      table: 'public.daily_question_templates', alias: 't', columns: ['question'],
      rows: d.daily.fixes.map((f) => [sqlText(f.id), sqlText(f.question)]),
      set: 'question = v.question',
      changed: 't.question is distinct from v.question',
    }),
    '',
    `-- Daily Question bank: English for the ${d.daily.daily_en.length} questions.`,
    valuesUpdate({
      table: 'public.daily_question_templates', alias: 't', columns: ['question_en'],
      rows: d.daily.daily_en.map((en) => [sqlText(en.id), sqlText(en.question_en)]),
      set: 'question_en = v.question_en',
      changed: 't.question_en is distinct from v.question_en',
    }),
    '',
    `-- Context recipes: ${d.overrides.recipe_fixes.length} new Italian wording (version + 1).`,
    valuesUpdate({
      table: 'public.game_v2_recipes', alias: 'r', columns: ['question_text'],
      rows: d.overrides.recipe_fixes.map((f) => [sqlText(f.id), sqlText(f.question)]),
      set: 'question_text = v.question_text, version = r.version + 1',
      changed: 'r.question_text is distinct from v.question_text',
    }),
    '',
    `-- Context recipes: English for the ${d.daily.recipes_en.length} templates.`,
    valuesUpdate({
      table: 'public.game_v2_recipes', alias: 'r', columns: ['question_text_en'],
      rows: d.daily.recipes_en.map((en) => [sqlText(en.id), sqlText(en.question_text_en)]),
      set: 'question_text_en = v.question_text_en',
      changed: 'r.question_text_en is distinct from v.question_text_en',
    }),
    '',
    `-- Weekly Quests: ${d.quests.fixes.length} new Italian titles.`,
    valuesUpdate({
      table: 'public.bond_quest_templates', alias: 'q', key: 'key', columns: ['title'],
      rows: d.quests.fixes.map((f) => [sqlText(f.key), sqlText(f.title)]),
      set: 'title = v.title',
      changed: 'q.title is distinct from v.title',
    }),
    '',
    `-- Weekly Quests: English for the ${d.quests.existing_en.length} templates.`,
    valuesUpdate({
      table: 'public.bond_quest_templates', alias: 'q', key: 'key', columns: ['title_en'],
      rows: d.quests.existing_en.map((en) => [sqlText(en.key), sqlText(en.title_en)]),
      set: 'title_en = v.title_en',
      changed: 'q.title_en is distinct from v.title_en',
    }),
    '',
    '-- Fails closed (and rolls the whole migration back) unless every row this',
    '-- content names exists, retired cards are inactive and every active row has English.',
    'do $content_1_0_check$',
    'begin',
    ...[
      ['public.game_v2_catalog', 'id', [...gameNew, ...gameFixes].map((r) => r.id), 'Game V2 catalog rows missing'],
      ['private.game_swipe_v1_catalog', 'id', [...d.swipe.new, ...d.swipe.fixes, ...d.swipe.retire].map((r) => r.id), 'Swipe cards missing'],
      ['public.daily_question_templates', 'id', d.daily.fixes.map((r) => r.id), 'Daily Question rows missing'],
      ['public.game_v2_recipes', 'id', d.overrides.recipe_fixes.map((r) => r.id), 'recipe rows missing'],
      ['public.bond_quest_templates', 'key', d.quests.fixes.map((r) => r.key), 'Quest templates missing'],
    ].map(([table, key, ids, message]) => [
      `  if (select count(*) from ${table} where ${key} = any (${sqlArray(ids)})) <> ${new Set(ids).size} then`,
      `    raise exception using errcode = 'P0001', message = 'content 1.0: ${message}';`,
      '  end if;',
    ].join('\n')),
    `  if exists (select 1 from private.game_swipe_v1_catalog where id = any (${sqlArray(d.swipe.retire.map((r) => r.id))}) and active) then`,
    "    raise exception using errcode = 'P0001', message = 'content 1.0: a retired Swipe card is still active';",
    '  end if;',
    '  if exists (select 1 from public.game_v2_catalog where active and (question_text_en is null or options_en is null',
    '      or (predict_text is null) <> (predict_text_en is null))) then',
    "    raise exception using errcode = 'P0001', message = 'content 1.0: an active Game V2 prompt has no English';",
    '  end if;',
    '  if exists (select 1 from private.game_swipe_v1_catalog where active and (question_text_en is null or options_en is null)) then',
    "    raise exception using errcode = 'P0001', message = 'content 1.0: an active Swipe card has no English';",
    '  end if;',
    '  if exists (select 1 from public.daily_question_templates where active and question_en is null) then',
    "    raise exception using errcode = 'P0001', message = 'content 1.0: an active Daily Question has no English';",
    '  end if;',
    '  if exists (select 1 from public.game_v2_recipes where active and question_text_en is null) then',
    "    raise exception using errcode = 'P0001', message = 'content 1.0: an active recipe has no English';",
    '  end if;',
    '  if exists (select 1 from public.bond_quest_templates where active and title_en is null) then',
    "    raise exception using errcode = 'P0001', message = 'content 1.0: an active Quest template has no English';",
    '  end if;',
    'end;',
    '$content_1_0_check$;',
    `-- ${BLOCK}:end`,
  ];
  return out.join('\n');
}
