// src/literary_critic.js
const fs = require('fs').promises;
const path = require('path');
const { callOpenRouter } = require('./utils/openrouter');

// Путь к файлам данных
const JOURNAL_PATH = path.join(__dirname, '../data/journal.json');
const ANALYSIS_PATH = path.join(__dirname, '../data/literary_analysis.json');
const PROMPT_TEMPLATE_PATH = path.join(__dirname, '../prompt_templates/analyst_prompt.txt');

/**
 * Загружает журнал записей
 */
async function loadJournal() {
  try {
    const data = await fs.readFile(JOURNAL_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка загрузки журнала:', error);
    throw error;
  }
}

/**
 * Создает контекст из последних записей
 * @param {Array} entries - Массив всех записей
 * @param {string} currentId - ID текущей записи
 * @param {number} count - Количество предыдущих записей для включения
 */
function createHistoryContext(entries, currentId, count = 3) {
  const currentIndex = entries.findIndex(entry => entry.id === currentId);
  if (currentIndex === -1) return '';
  
  const previousEntries = entries.slice(Math.max(0, currentIndex - count), currentIndex);
  
  return previousEntries.map(entry => 
    `Дата: ${entry.id}\n` +
    `Заголовок: ${entry.title}\n` +
    `Теги: ${entry.tags.join(', ')}\n` +
    `Фрагмент эссе: ${entry.essay.substring(0, 150)}...\n` +
    `Фрагмент рефлексии: ${entry.reflection.substring(0, 150)}...\n`
  ).join('\n---\n');
}

/**
 * Загружает шаблон промпта
 */
async function loadPromptTemplate() {
  try {
    return await fs.readFile(PROMPT_TEMPLATE_PATH, 'utf8');
  } catch (error) {
    console.error('Ошибка загрузки шаблона промпта:', error);
    throw error;
  }
}

/**
 * Подставляет данные в шаблон промпта
 * @param {string} template - Шаблон промпта
 * @param {Object} data - Данные для подстановки
 */
function fillPromptTemplate(template, data) {
  return template
    .replace('{{entry_title}}', data.title || '')
    .replace('{{entry_tags}}', data.tags?.join(', ') || '')
    .replace('{{entry_reflection_level}}', data.reflection_level || '')
    .replace('{{entry_essay}}', data.essay || '')
    .replace('{{entry_reflection}}', data.reflection || '')
    .replace('{{history_context}}', data.history_context || 'Контекст недоступен');
}

/**
 * Создает промпт для анализа и генерации советов, используя шаблон
 * @param {Object} entry - Текущая запись для анализа
 * @param {string} historyContext - Контекст из предыдущих записей
 */
async function createAnalysisPrompt(entry, historyContext) {
  const template = await loadPromptTemplate();
  
  const promptData = {
    title: entry.title,
    tags: entry.tags,
    reflection_level: entry.reflection_level,
    essay: entry.essay,
    reflection: entry.reflection,
    history_context: historyContext
  };
  
  return fillPromptTemplate(template, promptData);
}

/**
 * Запускает анализ последней записи в журнале
 */
async function analyzeLatestEntry() {
  try {
    console.log('Загрузка журнала...');
    const journal = await loadJournal();
    
    if (journal.entries.length === 0) {
      console.log('Журнал пуст, анализ не требуется.');
      return;
    }
    
    // Берем последнюю запись
    const latestEntry = journal.entries[journal.entries.length - 1];
    console.log(`Анализ записи от ${latestEntry.id}...`);
    
    // Создаем контекст из истории
    const historyContext = createHistoryContext(journal.entries, latestEntry.id);
    
    // Создаем промпт
    const prompt = await createAnalysisPrompt(latestEntry, historyContext);
    
    // Вызываем LLM
    console.log('Отправка запроса к LLM...');
    const response = await callOpenRouter(prompt);
    
    // Парсим ответ
    let analysisResult;
    try {
      analysisResult = JSON.parse(response);
    } catch (parseError) {
      console.error('Ошибка парсинга JSON от LLM:', parseError);
      console.log('Сырой ответ:', response);
      // Попытка извлечь JSON из текста (если LLM добавила пояснения)
      const jsonMatch = response.match(/\{.*\}/s);
      if (jsonMatch) {
        try {
          analysisResult = JSON.parse(jsonMatch[0]);
        } catch (secondParseError) {
          throw new Error('Не удалось извлечь корректный JSON из ответа LLM');
        }
      } else {
        throw new Error('Не удалось извлечь JSON из ответа LLM');
      }
    }
    
    // Формируем финальный результат с ID записи
    const finalResult = {
      entry_id: latestEntry.id,
      ...analysisResult
    };
    
    // Сохраняем результат
    await fs.writeFile(ANALYSIS_PATH, JSON.stringify(finalResult, null, 2));
    console.log(`Анализ сохранен в ${ANALYSIS_PATH}`);
    
  } catch (error) {
    console.error('Ошибка в процессе анализа:', error);
    process.exit(1);
  }
}

// Запуск скрипта
if (require.main === module) {
  analyzeLatestEntry();
}

module.exports = { analyzeLatestEntry };
