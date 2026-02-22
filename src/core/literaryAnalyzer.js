// src/core/literaryAnalyzer.js
const fs = require('fs').promises;
const path = require('path');

const { generateCritique } = require('../utils/openrouter');
const { readJSON, writeJSON } = require('../utils/fileUtils');
const { withRetry } = require('../utils/retryHandler');
const { parseCriticResponse } = require('../utils/responseParser');

const {
  JOURNAL_PATH,
  CONTEXTS_PATH,
  ANALYSIS_PATH,
  MAX_RETRIES = 3,
  BASE_DELAY_MS = 2000,
} = require('../config');

/* ────────────────────────────────────────────────
   Вспомогательные функции
───────────────────────────────────────────────── */

async function ensureJsonFile(filePath, defaultValue = []) {
  try {
    await fs.access(filePath);
    return await readJSON(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await writeJSON(filePath, defaultValue);
      return defaultValue;
    }
    throw err;
  }
}

function wasAnalyzedToday(journal) {
  if (!Array.isArray(journal) || journal.length === 0) return false;
  const today = new Date().toISOString().slice(0, 10);
  const last = journal.at(-1);
  return last?.date?.startsWith(today) && Array.isArray(last.critic_tags) && last.critic_tags.length > 0;
}

function applyCriticTags(journal, tags) {
  if (!Array.isArray(journal) || journal.length === 0) return journal;
  const copy = structuredClone(journal);
  const last = copy.at(-1);
  if (Array.isArray(tags) && tags.length > 0) {
    last.critic_tags = [...new Set(tags)];
  }
  return copy;
}

async function appendUsefulContext(suggestion) {
  const text = String(suggestion ?? '').trim();
  if (text.length < 12) return false;
  if (/^(продолжить|дальше|то же|тот же|похожий|аналогичный|ещё)$/i.test(text)) return false;

  let data = { contexts: [] };
  try {
    data = (await readJSON(CONTEXTS_PATH)) || { contexts: [] };
  } catch {}

  if (!Array.isArray(data.contexts)) data.contexts = [];

  data.contexts.push({
    context: text,
    added_at: new Date().toISOString(),
  });

  await writeJSON(CONTEXTS_PATH, data);
  console.log(`Добавлен контекст (${data.contexts.length} всего)`);
  return true;
}

/* ────────────────────────────────────────────────
   Основная логика
───────────────────────────────────────────────── */

async function runLiteraryCritique() {
  console.log('🔍 Запуск литературного анализа...');

  let journal = await ensureJsonFile(JOURNAL_PATH, []);

  if (!Array.isArray(journal) || journal.length === 0) {
    console.error('Журнал пуст или повреждён');
    process.exitCode = 1;
    return;
  }

  if (wasAnalyzedToday(journal)) {
    console.log('Анализ за сегодня уже выполнен → пропуск');
    return;
  }

  const lastEntry = journal.at(-1);

  const todayRu = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const recent = journal.slice(-3).map(e => ({
    date: e.date,
    reflection_level: e.reflection_level || 'средний',
    tags: Array.isArray(e.tags) ? e.tags : [],
    word_count: String(e.raw_essay || '').trim().split(/\s+/).filter(Boolean).length,
    has_metaphor: /(как|словно|будто|точно)\s/i.test(e.raw_essay || ''),
  }));

  const critiqueData = {
    entry_date: todayRu,
    current_mood_name: lastEntry.mood?.name || 'не указан',
    current_season: lastEntry.season || 'не указан',
    current_context: lastEntry.context || '—',
    entry_tags: Array.isArray(lastEntry.tags) ? lastEntry.tags : [],
    entry_reflection_level: lastEntry.reflection_level || 'средний',
    entry_essay: lastEntry.raw_essay || '',
    entry_reflection: lastEntry.raw_reflection || '',
    style_history: recent,
  };

  let rawResponse;
  try {
    rawResponse = await withRetry(
      () => generateCritique(critiqueData),
      MAX_RETRIES,
      BASE_DELAY_MS,
      'генерация критики'
    );
  } catch (err) {
    console.error('Модель не ответила после всех попыток');
    process.exitCode = 1;
    return;
  }

  let analysis;
  try {
    analysis = parseCriticResponse(rawResponse);
  } catch (err) {
    console.error('Парсер критика упал:', err.message);
    // Fallback-анализ, чтобы не терять весь цикл
    analysis = {
      summary: "Не удалось корректно распарсить ответ критика",
      suggestions: ["Повторите запуск позже", "Проверьте промпт и модель"],
      tags_for_search: ["parse_error", "техническая проблема"],
      next_context_suggestion: lastEntry.context || "Вернитесь к предыдущему контексту",
    };
  }

  const result = {
    generated_at: new Date().toISOString(),
    ...analysis,
  };

  try {
    await writeJSON(ANALYSIS_PATH, result);
    console.log(`Анализ сохранён → ${ANALYSIS_PATH}`);

    const updatedJournal = applyCriticTags(journal, analysis.tags_for_search || []);
    await writeJSON(JOURNAL_PATH, updatedJournal);
    console.log('Теги критика добавлены в журнал');

    if (analysis.next_context_suggestion) {
      await appendUsefulContext(analysis.next_context_suggestion);
    }
  } catch (err) {
    console.error('Ошибка при сохранении результатов анализа:', err.message);
    process.exitCode = 1;
  }

  console.log('Литературный анализ завершён');
}

module.exports = { runLiteraryCritique };

if (require.main === module) {
  runLiteraryCritique().catch(err => {
    console.error('Критическая ошибка в literaryAnalyzer:', err);
    process.exitCode = 1;
  });
}
