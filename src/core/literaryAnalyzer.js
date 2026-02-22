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

/**
 * Гарантированно создаём файл, если его нет
 */
async function ensureJsonFile(filePath, defaultValue = []) {
  try {
    await fs.access(filePath);
    return await readJSON(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`Создаём отсутствующий файл: ${path.basename(filePath)}`);
      await writeJSON(filePath, defaultValue);
      return defaultValue;
    }
    throw err;
  }
}

/**
 * Был ли анализ уже сделан сегодня
 */
function wasAnalyzedToday(journal) {
  if (!Array.isArray(journal) || journal.length === 0) return false;
  const today = new Date().toISOString().slice(0, 10);
  const last = journal.at(-1);
  return last?.date?.startsWith(today) && Array.isArray(last.critic_tags) && last.critic_tags.length > 0;
}

/**
 * Применяем теги к копии журнала
 */
function applyCriticTags(journal, tags) {
  if (!Array.isArray(journal) || journal.length === 0) return journal;
  const copy = structuredClone(journal);
  const last = copy.at(-1);
  if (Array.isArray(tags) && tags.length > 0) {
    last.critic_tags = [...new Set(tags)]; // убираем дубликаты
  }
  return copy;
}

/**
 * Добавляем контекст только если он выглядит полезным
 */
async function appendUsefulContext(suggestion) {
  const text = String(suggestion ?? '').trim();
  if (text.length < 12) return false;
  if (/^(продолжить|дальше|то же|тот же|похожий|аналогичный|ещё|продолжение)$/i.test(text)) return false;

  let data = { contexts: [] };
  try {
    data = await readJSON(CONTEXTS_PATH) || { contexts: [] };
    if (!Array.isArray(data.contexts)) data.contexts = [];
  } catch {}

  data.contexts.push({
    context: text,
    added_at: new Date().toISOString(),
  });

  await writeJSON(CONTEXTS_PATH, data);
  console.log(`Добавлен контекст (${data.contexts.length} шт)`);
  return true;
}

/**
 * Основная функция
 */
async function runLiteraryCritique() {
  console.log('🔍 Запуск литературного анализа...');

  // 1. Читаем журнал
  let journal = await ensureJsonFile(JOURNAL_PATH, []);

  if (!Array.isArray(journal) || journal.length === 0) {
    console.error('Журнал пуст или повреждён');
    process.exitCode = 1;
    return;
  }

  if (wasAnalyzedToday(journal)) {
    console.log('Анализ за сегодня уже есть → пропуск');
    return;
  }

  const lastEntry = journal.at(-1);

  // 2. Готовим данные для критика
  const todayRu = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  const recent = journal.slice(-3).map(e => ({
    date: e.date,
    reflection_level: e.reflection_level || 'средний',
    tags: Array.isArray(e.tags) ? e.tags : [],
    word_count: String(e.raw_essay || '').trim().split(/\s+/).filter(Boolean).length,
    has_metaphor: /(как|словно|будто|точно)\s/i.test(e.raw_essay || ''),
    has_dialog: /["«»„“][^"«»„“]*["«»„“]/.test(e.raw_essay || ''),
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

  // 3. Получаем ответ модели
  let rawResponse;
  try {
    rawResponse = await withRetry(
      () => generateCritique(critiqueData),
      MAX_RETRIES,
      BASE_DELAY_MS,
      'генерация критики'
    );
  } catch (err) {
    console.error('Не удалось получить ответ модели после всех попыток');
    process.exitCode = 1;
    return;
  }

  // 4. Парсим с fallback
  let analysis;
  try {
    analysis = parseCriticResponse(rawResponse);
  } catch (err) {
    console.error('Парсер упал → используем fallback-анализ');
    console.error(err.message);

    analysis = {
      summary: "Не удалось корректно распарсить ответ литературного критика",
      suggestions: ["Повторите запуск позже", "Проверьте качество промпта и модель"],
      tags_for_search: ["parse_error", "llm_failure", "техническая проблема"],
      next_context_suggestion: lastEntry.context || "Вернитесь к предыдущему контексту",
    };
  }

  const result = {
    generated_at: new Date().toISOString(),
    ...analysis,
  };

  // 5. Сохраняем всё
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
    console.error('Ошибка сохранения результатов анализа', err.message);
    process.exitCode = 1;
  }

  console.log('Литературный анализ завершён (с или без ошибок)');
}

module.exports = { runLiteraryCritique };

if (require.main === module) {
  runLiteraryCritique().catch(err => {
    console.error('Критическая ошибка в literaryAnalyzer:', err);
    process.exitCode = 1;
  });
}
