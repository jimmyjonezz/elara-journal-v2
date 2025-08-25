const { readJSON, writeJSON } = require('./utils/fileUtils');
const { callOpenRouter } = require('./utils/openrouter');
const { JOURNAL_PATH, ANALYSIS_PATH, DYNAMIC_TAGS_PATH, PROMPT_TEMPLATE_PATH } = require('./config');
const fs = require('fs/promises');
const path = require('path');

async function loadJournal() {
  try {
    console.log('Попытка загрузки журнала из:', JOURNAL_PATH);
    const data = await readJSON(JOURNAL_PATH);

    let entriesArray;
    if (Array.isArray(data)) {
      entriesArray = data;
      console.log('Загружен массив записей. Количество записей:', entriesArray.length);
    } else if (data && typeof data === 'object' && Array.isArray(data.entries)) {
      entriesArray = data.entries;
      console.log('Загружен объект с записями. Количество записей в entries:', entriesArray.length);
    } else {
      console.log('Неожиданная структура данных. Ожидается массив или объект с полем "entries".');
      return [];
    }

    return entriesArray;
  } catch (error) {
    console.error('Ошибка загрузки журнала:', error);
    throw error;
  }
}

function createHistoryContext(entries, currentDate, count = 3) {
  const currentIndex = entries.findIndex(entry => entry.date === currentDate);
  if (currentIndex === -1) {
    console.log(`Текущая запись с DATE ${currentDate} не найдена в журнале. Используем последние ${count} записей.`);
    const startIndex = Math.max(0, entries.length - count);
    return entries.slice(startIndex).map(formatEntryForContext).join('\n---\n');
  }

  const previousEntries = entries.slice(Math.max(0, currentIndex - count), currentIndex);
  console.log(`Создан контекст из ${previousEntries.length} предыдущих записей.`);
  return previousEntries.map(formatEntryForContext).join('\n---\n');
}

function formatEntryForContext(entry) {
  return `Дата: ${entry.date}\n` +
    `Заголовок: ${entry.title || entry.topic || 'Без заголовка'}\n` +
    `Теги: ${(entry.tags || []).join(', ')}\n` +
    `Фрагмент эссе: ${(entry.essay || entry.entry || '').substring(0, 150)}...\n` +
    `Фрагмент рефлексии: ${(entry.reflection || '').substring(0, 150)}...`;
}

async function loadPromptTemplate() {
  try {
    console.log('Загрузка шаблона промпта из:', PROMPT_TEMPLATE_PATH);
    return await fs.readFile(PROMPT_TEMPLATE_PATH, 'utf8');
  } catch (error) {
    console.error('Ошибка загрузки шаблона промпта:', error);
    throw error;
  }
}

function fillPromptTemplate(template, data) {
  console.log('Подстановка данных в шаблон промпта...');
  return template
    .replace('{{entry_title}}', data.title || data.topic || '')
    .replace('{{entry_tags}}', (data.tags || []).join(', '))
    .replace('{{entry_reflection_level}}', data.reflection_level || data.level || '')
    .replace('{{entry_essay}}', data.essay || data.entry || '')
    .replace('{{entry_reflection}}', data.reflection || '')
    .replace('{{history_context}}', data.history_context || 'Контекст недоступен');
}

async function createAnalysisPrompt(entry, historyContext) {
  console.log('Создание промпта для анализа записи:', entry.date);
  const template = await loadPromptTemplate();

  const promptData = {
    title: entry.title,
    topic: entry.topic,
    tags: entry.tags,
    reflection_level: entry.reflection_level,
    level: entry.level,
    essay: entry.essay,
    entry: entry.entry,
    reflection: entry.reflection,
    history_context: historyContext
  };

  return fillPromptTemplate(template, promptData);
}

async function saveDynamicTags(tags) {
  try {
    const tagData = {
      last_updated: new Date().toISOString().split('T')[0],
      tags: tags || []
    };
    await writeJSON(DYNAMIC_TAGS_PATH, tagData);
    console.log(`✅ Динамические теги сохранены в ${DYNAMIC_TAGS_PATH}`);
  } catch (error) {
    console.error(`❌ Ошибка при сохранении динамических тегов:`, error);
  }
}

async function analyzeLatestEntry() {
  try {
    console.log('🖋️ Литературный критик приступает к анализу журнала (включая новую запись)...');
    const journal = await loadJournal();

    if (!journal || journal.length === 0) {
      console.log('Журнал пуст, анализ не требуется.');
      const emptyAnalysis = {
        generated_at: new Date().toISOString().split('T')[0],
        error: "Журнал пуст, анализ не требуется."
      };
      await writeJSON(ANALYSIS_PATH, emptyAnalysis);
      console.log('✅ Анализ литературного критика завершен. Файл literary_analysis.json создан/обновлен.');
      return;
    }

    const latestEntry = journal[journal.length - 1];
    console.log(`Анализ записи от ${latestEntry.date}...`);

    const historyContext = createHistoryContext(journal, latestEntry.date);

    const prompt = await createAnalysisPrompt(latestEntry, historyContext);

    console.log('Отправка запроса к LLM...');
    const response = await callOpenRouter(prompt);

    let analysisResult;
    try {
      analysisResult = JSON.parse(response);
      console.log("✅ JSON успешно распарсен напрямую.");
    } catch (parseError) {
      console.error('Ошибка парсинга JSON от LLM на первом этапе:', parseError.message);
      throw parseError;
    }

    let dynamicTagsForSaving = [];
    if (analysisResult && Array.isArray(analysisResult.tags_for_search)) {
      dynamicTagsForSaving = analysisResult.tags_for_search;
      console.log(`🔍 [DEBUG] Извлечено тегов для поиска: ${dynamicTagsForSaving.length}`, dynamicTagsForSaving);
    } else {
      console.warn("⚠️ Поле 'tags_for_search' не найдено или не является массивом в ответе критика.");
    }

    // Сохраняем теги в отдельный файл
    await saveDynamicTags(dynamicTagsForSaving);

    // Исключаем tags_for_search из итогового результата
    const { tags_for_search, ...rest } = analysisResult;
    const finalResult = {
      generated_at: new Date().toISOString().split('T')[0],
      ...rest
    };

    await writeJSON(ANALYSIS_PATH, finalResult);
    console.log(`✅ Анализ литературного критика завершен. Файл literary_analysis.json создан/обновлен.`);

  } catch (error) {
    console.error('❌ Критическая ошибка в процессе анализа:', error);

    const criticalErrorResult = {
      generated_at: new Date().toISOString().split('T')[0],
      error: `Критическая ошибка: ${error.message}`,
      stack: error.stack
    };

    try {
      await writeJSON(ANALYSIS_PATH, criticalErrorResult);
      console.log(`⚠️ Критическая ошибка записана в ${ANALYSIS_PATH}. Процесс завершен.`);
    } catch (writeError) {
      console.error('❌ Не удалось записать критическую ошибку в файл анализа:', writeError);
    }
  }
}

if (require.main === module) {
  analyzeLatestEntry();
}

module.exports = { analyzeLatestEntry };
