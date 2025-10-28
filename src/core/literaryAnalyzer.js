// src/core/literaryAnalyzer.js
const { generateCritique } = require('../utils/openrouter'); // Путь к openrouter.js
const { readJSON, writeJSON } = require('../utils/fileUtils'); // Путь к fileUtils.js
const {
  JOURNAL_PATH,
  CONTEXTS_PATH,
  ANALYSIS_PATH,
  MAX_RETRIES = 3,
  BASE_DELAY_MS = 2000
} = require('../config'); // Путь к config.js

const { withRetry } = require('../utils/retryHandler'); // Импорт из нового файла
const { parseCriticResponse } = require('../utils/responseParser'); // Импорт новой функции
const { loadLastJournalEntry } = require('../data/dataLoader'); // Импорт новой функции

/**
 * Обновляет последнюю запись в journal.json с тегами критика
 */
async function updateJournalWithCriticTags(analysisResult) {
  try {
    const journal = await readJSON(JOURNAL_PATH);
    if (!Array.isArray(journal) || journal.length === 0) {
      console.warn('⚠️ Журнал пуст, невозможно обновить запись с тегами критика.');
      return;
    }

    const lastEntry = journal[journal.length - 1];

    // Извлекаем теги критика из только что сгенерированного анализа
    const criticTagsFromAnalysis = Array.isArray(analysisResult.tags_for_search) ? analysisResult.tags_for_search : [];
    if (criticTagsFromAnalysis.length > 0) {
      // Добавляем теги критика как отдельное поле в запись
      lastEntry.critic_tags = criticTagsFromAnalysis;

      console.log(`🏷️ Теги критика добавлены к последней записи:`, criticTagsFromAnalysis);

      // Сохраняем обновлённый журнал
      await writeJSON(JOURNAL_PATH, journal);
      console.log('✅ Журнал обновлён с тегами критика.');
    } else {
      console.warn('⚠️ В анализе нет тегов критика (tags_for_search) для добавления в запись.');
    }
  } catch (e) {
    console.error('❌ Ошибка обновления journal.json с тегами критика:', e.message);
    // Не останавливаем весь процесс, если теги не обновились
  }
}

/**
 * Добавляет новый контекст в конец contexts.json
 */
async function updateContextsWithSuggestion(analysisResult) {
  try {
    // 1. Прочитать новый контекст из result (предполагается, что он в next_context_suggestion)
    const newContextSuggestion = analysisResult.next_context_suggestion;

    if (!newContextSuggestion || typeof newContextSuggestion !== 'string' || newContextSuggestion.trim() === '') {
      console.warn('⚠️ Критик не сгенерировал next_context_suggestion или он пуст. Пропускаем обновление contexts.json.');
      return;
    }

    console.log(`🔄 Критик предложил новый контекст: ${newContextSuggestion.substring(0, 60)}...`);

    // 2. Прочитать текущие contexts
    let currentContextsData;
    try {
      currentContextsData = await readJSON(CONTEXTS_PATH);
      if (!currentContextsData || !Array.isArray(currentContextsData.contexts)) {
        throw new Error("Структура contexts.json некорректна. Ожидается { contexts: [] }.");
      }
    } catch (e) {
      console.error('❌ Ошибка чтения contexts.json:', e.message);
      // Если файл не существует или сломан, создаём новый
      currentContextsData = { contexts: [] };
      console.log('ℹ️ Создаём новый файл contexts.json.');
    }

    // 3. Добавить новый контекст в конец
    // ВАЖНО: Учитываем, что literary_critic может записать контекст без id, как было обнаружено ранее.
    // Для сохранения структуры, можно добавить id здесь, например, на основе даты или инкрементный.
    // Пока оставим как есть, как и было решено ранее, но отмечаем.
    currentContextsData.contexts.push({ context: newContextSuggestion.trim() });

    // 4. Сохранить contexts.json
    await writeJSON(CONTEXTS_PATH, currentContextsData);
    console.log(`✅ Новый контекст добавлен в конец contexts.json. Всего контекстов: ${currentContextsData.contexts.length}.`);
  } catch (e) {
    console.error('❌ Ошибка обновления contexts.json с новым контекстом:', e.message);
    // Не останавливаем весь процесс, если контекст не обновился
  }
}


/**
 * Основная функция анализа последней записи
 */
async function runLiteraryCritique() {
  console.log('🔍 Запуск литературного анализа...');

  // Загружаем последнюю запись
  const lastEntry = await loadLastJournalEntry(); // Используем новую функцию

  // Формат даты как в эссе: "7 октября 2025 года"
  const today = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Загружаем *весь* журнал для стилевой истории
  const journal = await readJSON(JOURNAL_PATH);
  if (!Array.isArray(journal) || journal.length === 0) {
    throw new Error('Журнал пуст — невозможно сформировать стилевую историю.');
  }

  // Собираем стилевую историю из последних 3 записей
  const lastEntries = journal.slice(-3);
  const style_history = lastEntries.map(entry => ({
    date: entry.date,
    reflection_level: entry.reflection_level || 'средний',
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    word_count: (entry.entry || '').split(/\s+/).filter(w => w).length,
    // Простой признак метафоры — наличие "как" или "словно"
    has_metaphor: /(?:как|словно|будто|точно)\s/i.test(entry.entry || '')
  }));

  const critiqueData = {
    entry_date: today,
    current_mood_name: lastEntry.mood?.name || 'still',
    current_season: lastEntry.season || 'winter',
    current_context: lastEntry.context || 'Контекст не сохранён.',
    entry_tags: lastEntry.tags || [],
    entry_reflection_level: lastEntry.reflection_level || 'средний',
    entry_essay: lastEntry.raw_essay || '',
    entry_reflection: lastEntry.raw_reflection || '',
    style_history: style_history
  };

  // Генерация с ретраями
  const rawResponse = await withRetry(
    () => generateCritique(critiqueData),
    MAX_RETRIES,
    BASE_DELAY_MS,
    'генерации литературного анализа'
  );

  // Парсинг ответа
  const analysis = parseCriticResponse(rawResponse); // Используем новую функцию

  // Удаляем generated_at, если модель его добавила (чтобы не перезаписал системную дату)
  delete analysis.generated_at;

  // Сохраняем анализ с актуальной датой
  const result = {
    generated_at: new Date().toISOString(),
    ...analysis
  };

  await writeJSON(ANALYSIS_PATH, result);
  console.log(`✅ Анализ сохранён в ${ANALYSIS_PATH}`);

  // Обновляем последнюю запись с тегами критика
  await updateJournalWithCriticTags(result);

  // Добавляем новый контекст
  await updateContextsWithSuggestion(result);

}

module.exports = { runLiteraryCritique };

// --- Запуск напрямую ---
if (require.main === module) {
  (async () => {
    try {
      await runLiteraryCritique();
    } catch (err) {
      console.error('💥 Критическая ошибка в literaryAnalyzer.js:', err.message);
      process.exit(1);
    }
  })();
}
