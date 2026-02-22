// src/core/literaryAnalyzer.js
const { generateCritique } = require('../utils/openrouter');
const { readJSON, writeJSON } = require('../utils/fileUtils');
const {
  JOURNAL_PATH,
  CONTEXTS_PATH,
  ANALYSIS_PATH,
  MAX_RETRIES = 3,
  BASE_DELAY_MS = 2000
} = require('../config');

const { withRetry } = require('../utils/retryHandler');
const { parseCriticResponse } = require('../utils/responseParser');
const { loadLastJournalEntry } = require('../data/dataLoader');
const fs = require('fs').promises;
const path = require('path');

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
    const criticTagsFromAnalysis = Array.isArray(analysisResult.tags_for_search) ? analysisResult.tags_for_search : [];
    
    if (criticTagsFromAnalysis.length > 0) {
      lastEntry.critic_tags = criticTagsFromAnalysis;
      console.log(`🏷️ Теги критика добавлены к последней записи:`, criticTagsFromAnalysis);
      await writeJSON(JOURNAL_PATH, journal);
      console.log('✅ Журнал обновлён с тегами критика.');
    } else {
      console.warn('⚠️ В анализе нет тегов критика (tags_for_search) для добавления в запись.');
    }
  } catch (e) {
    console.error('❌ Ошибка обновления journal.json с тегами критика:', e.message);
  }
}

/**
 * Добавляет новый контекст в конец contexts.json
 */
async function updateContextsWithSuggestion(analysisResult) {
  try {
    const newContextSuggestion = analysisResult.next_context_suggestion;
    if (!newContextSuggestion || typeof newContextSuggestion !== 'string' || newContextSuggestion.trim() === '') {
      console.warn('⚠️ Критик не сгенерировал next_context_suggestion или он пуст. Пропускаем обновление contexts.json.');
      return;
    }

    console.log(`🔄 Критик предложил новый контекст: ${newContextSuggestion.substring(0, 60)}...`);

    let currentContextsData;
    try {
      currentContextsData = await readJSON(CONTEXTS_PATH);
      if (!currentContextsData || !Array.isArray(currentContextsData.contexts)) {
        throw new Error("Структура contexts.json некорректна. Ожидается { contexts: [] }.");
      }
    } catch (e) {
      console.error('❌ Ошибка чтения contexts.json:', e.message);
      currentContextsData = { contexts: [] };
      console.log('ℹ️ Создаём новый файл contexts.json.');
    }

    currentContextsData.contexts.push({ context: newContextSuggestion.trim() });
    await writeJSON(CONTEXTS_PATH, currentContextsData);
    console.log(`✅ Новый контекст добавлен в конец contexts.json. Всего контекстов: ${currentContextsData.contexts.length}.`);
  } catch (e) {
    console.error('❌ Ошибка обновления contexts.json с новым контекстом:', e.message);
  }
}

/**
 * Сохраняет сырой ответ модели при ошибке парсинга
 */
async function saveRawResponse(rawResponse, error) {
  try {
    const logsDir = path.join(__dirname, '../../logs');
    await fs.mkdir(logsDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(logsDir, `critic_json_error_${timestamp}.txt`);
    
    await fs.writeFile(filePath, `ERROR: ${error.message}\n\nRAW RESPONSE:\n${rawResponse}`, 'utf8');
    console.log(`📄 Сырой ответ сохранён в ${filePath}`);
  } catch (e) {
    console.error('❌ Не удалось сохранить сырой ответ:', e.message);
  }
}

/**
 * Основная функция анализа последней записи
 */
async function runLiteraryCritique() {  console.log('🔍 Запуск литературного анализа...');

  const lastEntry = await loadLastJournalEntry();

  const today = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const journal = await readJSON(JOURNAL_PATH);
  if (!Array.isArray(journal) || journal.length === 0) {
    throw new Error('Журнал пуст — невозможно сформировать стилевую историю.');
  }

  const lastEntries = journal.slice(-3);
  const style_history = lastEntries.map(entry => ({
    date: entry.date,
    reflection_level: entry.reflection_level || 'средний',
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    word_count: (entry.raw_essay || '').split(/\s+/).filter(w => w).length,
    has_metaphor: /(?:как|словно|будто|точно)\s/i.test(entry.raw_essay || '')
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

  // Парсинг ответа с обработкой ошибок
  let analysis;
  try {
    analysis = parseCriticResponse(rawResponse);
  } catch (e) {
    console.error('💥 Критическая ошибка парсинга JSON от критика:', e.message);    await saveRawResponse(rawResponse, e); // <-- Сохраняем сырой ответ
    throw e;
  }

  delete analysis.generated_at;

  const result = {
    generated_at: new Date().toISOString(),
    ...analysis
  };

  await writeJSON(ANALYSIS_PATH, result);
  console.log(`✅ Анализ сохранён в ${ANALYSIS_PATH}`);

  await updateJournalWithCriticTags(result);
  await updateContextsWithSuggestion(result);
}

module.exports = { runLiteraryCritique };

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
