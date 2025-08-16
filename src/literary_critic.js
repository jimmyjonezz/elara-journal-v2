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
    console.log('Попытка загрузки журнала из:', JOURNAL_PATH);
    const data = await fs.readFile(JOURNAL_PATH, 'utf8');
    console.log('Данные загружены, размер:', data.length, 'символов');
    
    if (!data.trim()) {
      console.log('Файл журнала пуст.');
      return []; // Возвращаем пустой массив, если файл пуст
    }
    
    const parsedData = JSON.parse(data);
    console.log('Данные успешно распаршены. Тип:', typeof parsedData);
    
    let entriesArray;
    if (Array.isArray(parsedData)) {
      entriesArray = parsedData;
      console.log('Загружен массив записей. Количество записей:', entriesArray.length);
    } else if (parsedData && typeof parsedData === 'object' && Array.isArray(parsedData.entries)) {
      entriesArray = parsedData.entries;
      console.log('Загружен объект с записями. Количество записей в entries:', entriesArray.length);
    } else {
      console.log('Неожиданная структура данных. Ожидается массив или объект с полем "entries".');
      console.log('Полученные данные (первые 300 символов):', JSON.stringify(parsedData, null, 2).substring(0, 300));
      return []; // Возвращаем пустой массив в случае неожиданной структуры
    }
    
    return entriesArray;
  } catch (error) {
    console.error('Ошибка загрузки журнала:', error.message);
    // Выводим часть содержимого файла для диагностики, если ошибка при парсинге
    if (error instanceof SyntaxError) {
       try {
         const rawData = await fs.readFile(JOURNAL_PATH, 'utf8');
         console.error('Содержимое файла (первые 500 символов):', rawData.substring(0, 500));
       } catch (readError) {
         console.error('Не удалось прочитать файл для диагностики:', readError.message);
       }
    }
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
  if (currentIndex === -1) {
    console.log(`Текущая запись с ID ${currentId} не найдена в журнале. Используем последние ${count} записей.`);
    // Если запись не найдена, берем последние count записей
    const startIndex = Math.max(0, entries.length - count);
    return entries.slice(startIndex).map(formatEntryForContext).join('\n---\n');
  }
  
  const previousEntries = entries.slice(Math.max(0, currentIndex - count), currentIndex);
  console.log(`Создан контекст из ${previousEntries.length} предыдущих записей.`);
  return previousEntries.map(formatEntryForContext).join('\n---\n');
}

/**
 * Форматирует запись для включения в контекст
 * @param {Object} entry - Запись из журнала
 */
function formatEntryForContext(entry) {
  return `Дата: ${entry.id}\n` +
         `Заголовок: ${entry.title || entry.topic || 'Без заголовка'}\n` +
         `Теги: ${(entry.tags || []).join(', ')}\n` +
         `Фрагмент эссе: ${(entry.essay || entry.entry || '').substring(0, 150)}...\n` +
         `Фрагмент рефлексии: ${(entry.reflection || '').substring(0, 150)}...`;
}

/**
 * Загружает шаблон промпта
 */
async function loadPromptTemplate() {
  try {
    console.log('Загрузка шаблона промпта из:', PROMPT_TEMPLATE_PATH);
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
  console.log('Подстановка данных в шаблон промпта...');
  return template
    .replace('{{entry_title}}', data.title || data.topic || '')
    .replace('{{entry_tags}}', (data.tags || []).join(', '))
    .replace('{{entry_reflection_level}}', data.reflection_level || data.level || '')
    .replace('{{entry_essay}}', data.essay || data.entry || '')
    .replace('{{entry_reflection}}', data.reflection || '')
    .replace('{{history_context}}', data.history_context || 'Контекст недоступен');
}

/**
 * Создает промпт для анализа и генерации советов, используя шаблон
 * @param {Object} entry - Текущая запись для анализа
 * @param {string} historyContext - Контекст из предыдущих записей
 */
async function createAnalysisPrompt(entry, historyContext) {
  console.log('Создание промпта для анализа записи:', entry.id);
  const template = await loadPromptTemplate();
  
  const promptData = {
    title: entry.title,
    topic: entry.topic, // для совместимости
    tags: entry.tags,
    reflection_level: entry.reflection_level,
    level: entry.level, // для совместимости
    essay: entry.essay,
    entry: entry.entry, // для совместимости
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
    console.log('🖋️ Литературный критик приступает к анализу журнала (включая новую запись)...');
    const journal = await loadJournal();
    
    if (!journal || journal.length === 0) {
      console.log('Журнал пуст, анализ не требуется.');
      // Создаем пустой файл анализа или записываем сообщение
      const emptyAnalysis = {
        generated_at: new Date().toISOString().split('T')[0],
        error: "Журнал пуст, анализ не требуется."
      };
      await fs.writeFile(ANALYSIS_PATH, JSON.stringify(emptyAnalysis, null, 2));
      console.log('✅ Анализ литературного критика завершен. Файл literary_analysis.json создан/обновлен.');
      return;
    }
    
    // Берем последнюю запись
    const latestEntry = journal[journal.length - 1];
    console.log(`Анализ записи от ${latestEntry.id}...`);
    
    // Создаем контекст из истории
    const historyContext = createHistoryContext(journal, latestEntry.id);
    
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
    
    // Формируем финальный результат с датой генерации
    const finalResult = {
      generated_at: new Date().toISOString().split('T')[0], // Добавляем дату генерации
      ...analysisResult
    };
    
    // Сохраняем результат
    await fs.writeFile(ANALYSIS_PATH, JSON.stringify(finalResult, null, 2));
    console.log(`✅ Анализ литературного критика завершен. Файл literary_analysis.json создан/обновлен.`);
    
  } catch (error) {
    console.error('❌ Ошибка в процессе анализа:', error);
    // Записываем ошибку в файл анализа для диагностики
    const errorResult = {
      generated_at: new Date().toISOString().split('T')[0],
      error: error.message,
      raw_response: error.message.includes('LLM') ? error.response : undefined
    };
    try {
      await fs.writeFile(ANALYSIS_PATH, JSON.stringify(errorResult, null, 2));
    } catch (writeError) {
      console.error('❌ Не удалось записать ошибку в файл анализа:', writeError);
    }
    process.exit(1);
  }
}

// Запуск скрипта
if (require.main === module) {
  analyzeLatestEntry();
}

module.exports = { analyzeLatestEntry };
