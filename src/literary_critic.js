const path = require('path');
const { callOpenRouter } = require('./utils/openrouter');
const { readJSON, writeJSON } = require('./utils/fileUtils');
const {
  JOURNAL_PATH,
  ANALYSIS_PATH,
  DYNAMIC_TAGS_PATH,
  PROMPT_TEMPLATE_PATH,
} = require('./config');

// Загрузка журнала
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

// Остальная логика, включая createHistoryContext, formatEntryForContext, loadPromptTemplate, fillPromptTemplate, createAnalysisPrompt, saveDynamicTags, analyzeLatestEntry

// Везде, где раньше были прямые вызовы fs.readFile / fs.writeFile заменить на readJSON/writeJSON
// Например:
async function loadPromptTemplate() {
  try {
    console.log('Загрузка шаблона промпта из:', PROMPT_TEMPLATE_PATH);
    const templateContent = await readFile(PROMPT_TEMPLATE_PATH, 'utf8');
    return templateContent;
  } catch (error) {
    console.error('Ошибка загрузки шаблона промпта:', error);
    throw error;
  }
}

// Аналогично для saveDynamicTags:
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

// Экспорт и запуск оставляем без изменений

module.exports = { analyzeLatestEntry };

// Запуск если main
if (require.main === module) {
  analyzeLatestEntry();
}
