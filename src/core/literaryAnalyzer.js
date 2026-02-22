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
 * Проверяет существование файла и создаёт пустой массив, если файла нет
 * @param {string} filePath
 * @returns {Promise<Array|Object>}
 */
async function ensureJsonFile(filePath, defaultValue = []) {
  try {
    await fs.access(filePath);
    const data = await readJSON(filePath);
    return data;
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`ℹ️ Файл ${path.basename(filePath)} не найден → создаём`);
      await writeJSON(filePath, defaultValue);
      return defaultValue;
    }
    throw err;
  }
}

/**
 * Проверяет, был ли уже выполнен анализ сегодня
 * @param {Array} journal
 * @returns {boolean}
 */
function wasAnalyzedToday(journal) {
  if (!Array.isArray(journal) || journal.length === 0) return false;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const lastEntry = journal.at(-1);

  return (
    lastEntry?.date?.startsWith(today) &&
    Array.isArray(lastEntry.critic_tags) &&
    lastEntry.critic_tags.length > 0
  );
}

/**
 * Добавляет теги критика к последней записи журнала (работает с копией)
 */
function applyCriticTags(journal, tags) {
  if (!Array.isArray(journal) || journal.length === 0) return journal;

  const copy = structuredClone(journal);
  const last = copy.at(-1);

  if (Array.isArray(tags) && tags.length > 0) {
    last.critic_tags = [...tags];
  }

  return copy;
}

/**
 * Добавляет новый контекст, если он осмысленный
 */
async function appendContextIfMeaningful(suggestion) {
  const text = (suggestion ?? '').trim();

  if (text.length < 15) {
    console.warn(`Пропущен контекст — слишком короткий: "${text.substring(0, 40)}..."`);
    return false;
  }

  if (/^(продолжить|дальше|то же|тот же|похожий|аналогичный)$/i.test(text)) {
    console.warn(`Пропущен бесполезный контекст: "${text.substring(0, 60)}..."`);
    return false;
  }

  let contextsData;
  try {
    contextsData = await readJSON(CONTEXTS_PATH);
    if (!contextsData || !Array.isArray(contextsData.contexts)) {
      contextsData = { contexts: [] };
    }
  } catch {
    contextsData = { contexts: [] };
  }

  contextsData.contexts.push({ context: text, added_at: new Date().toISOString() });
  await writeJSON(CONTEXTS_PATH, contextsData);

  console.log(`➕ Добавлен контекст (${contextsData.contexts.length} всего)`);
  return true;
}

/**
 * Сохраняет сырой ответ модели при проблемах с парсингом
 */
async function saveRawCriticResponse(raw, error) {
  try {
    const logsDir = path.join(__dirname, '../../logs/critic-errors');
    await fs.mkdir(logsDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `critic-raw-${ts}.txt`;
    const filepath = path.join(logsDir, filename);

    const content = [
      `ERROR: ${error.message}`,
      `TIMESTAMP: ${new Date().toISOString()}`,
      '',
      'RAW RESPONSE:',
      raw,
    ].join('\n');

    await fs.writeFile(filepath, content, 'utf-8');
    console.log(`📄 Сырой ответ сохранён → ${filename}`);
  } catch (saveErr) {
    console.error('Не удалось сохранить сырой ответ критика:', saveErr.message);
  }
}

/**
 * Основная функция литературного анализа
 */
async function runLiteraryCritique() {
  console.log('🔍 Запуск литературного анализа...');

  // ─── 1. Чтение и валидация журнала ────────────────────────────────────────
  let journal = await ensureJsonFile(JOURNAL_PATH, []);

  if (!Array.isArray(journal) || journal.length === 0) {
    throw new Error('Журнал пуст или повреждён → анализ невозможен');
  }

  // Проверка на дубликат за сегодня
  if (wasAnalyzedToday(journal)) {
    console.log('→ Анализ за сегодня уже выполнен. Пропуск.');
    return;
  }

  const lastEntry = journal.at(-1);

  // ─── 2. Подготовка данных для критика ──────────────────────────────────────
  const todayRu = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const recentEntries = journal.slice(-3);

  const styleHistory = recentEntries.map((e) => ({
    date: e.date,
    reflection_level: e.reflection_level || 'средний',
    tags: Array.isArray(e.tags) ? e.tags : [],
    word_count: typeof e.raw_essay === 'string' ? e.raw_essay.trim().split(/\s+/).filter(Boolean).length : 0,
    has_metaphor: /как|словно|будто|точно\s/i.test(e.raw_essay || ''),
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
    style_history: styleHistory,
  };

  // ─── 3. Генерация анализа с повторами ──────────────────────────────────────
  let rawResponse;
  try {
    rawResponse = await withRetry(
      () => generateCritique(critiqueData),
      MAX_RETRIES,
      BASE_DELAY_MS,
      'генерация критики',
    );
  } catch (err) {
    console.error('❌ Не удалось получить ответ от модели после всех попыток');
    throw err;
  }

  // ─── 4. Парсинг ответа ─────────────────────────────────────────────────────
  let parsed;
  try {
    parsed = parseCriticResponse(rawResponse);
  } catch (parseErr) {
    console.error('💥 Ошибка парсинга ответа критика:', parseErr.message);
    await saveRawCriticResponse(rawResponse, parseErr);
    throw parseErr;
  }

  const analysisResult = {
    generated_at: new Date().toISOString(),
    ...parsed,
  };

  // ─── 5. Атомарное сохранение результатов ───────────────────────────────────
  try {
    // Сначала сохраняем анализ
    await writeJSON(ANALYSIS_PATH, analysisResult);
    console.log(`💾 Анализ сохранён → ${ANALYSIS_PATH}`);

    // Обновляем журнал (копия + теги)
    const updatedJournal = applyCriticTags(journal, analysisResult.tags_for_search);
    await writeJSON(JOURNAL_PATH, updatedJournal);
    console.log(`🏷️ Теги критика добавлены в журнал`);

    // Добавляем контекст (если есть и осмысленный)
    if (analysisResult.next_context_suggestion) {
      await appendContextIfMeaningful(analysisResult.next_context_suggestion);
    }
  } catch (commitErr) {
    console.error('❌ Ошибка при сохранении результатов:', commitErr.message);
    console.warn('Журнал и contexts могли остаться несинхронизированными!');
    throw commitErr;
  }

  console.log('🎉 Литературный анализ успешно завершён');
}

module.exports = { runLiteraryCritique };

if (require.main === module) {
  runLiteraryCritique().catch((err) => {
    console.error('💥 Критическая ошибка в literaryAnalyzer:', err);
    process.exitCode = 1;
  });
}
