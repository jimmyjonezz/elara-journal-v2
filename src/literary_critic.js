// src/literary_critic.js
const { generateCritique } = require('./utils/openrouter');
const { readJSON, writeJSON } = require('./utils/fileUtils');
const {
  JOURNAL_PATH,
  CONTEXTS_PATH,
  ANALYSIS_PATH,
  MAX_RETRIES = 3,
  BASE_DELAY_MS = 2000
} = require('./config');

/**
 * Выполняет функцию с повторными попытками при сетевых/временных ошибках
 */
async function withRetry(fn, maxRetries, baseDelay, actionName) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Попытка ${attempt}/${maxRetries} для ${actionName}...`);
      const result = await fn();
      console.log(`✅ ${actionName} успешно завершён на попытке ${attempt}.`);
      return result;
    } catch (error) {
      lastError = error;
      const msg = error.message || String(error);

      // Повторяем только при временных ошибках
      const isRetryable = 
        msg.includes('502') || 
        msg.includes('503') || 
        msg.includes('504') || 
        msg.includes('Bad Gateway') || 
        msg.includes('Service Unavailable') || 
        msg.includes('timeout') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ENOTFOUND');

      console.warn(`⚠️ Попытка ${attempt} для ${actionName} не удалась:`, msg);

      if (isRetryable && attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * baseDelay;
        console.log(`⏳ Ожидание ${delay} мс перед повтором...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        break; // не повторяем при фатальных ошибках
      }
    }
  }
  console.error(`❌ Все ${maxRetries} попыток ${actionName} провалились.`);
  throw lastError;
}

/**
 * Основная функция анализа последней записи
 */
async function runLiteraryCritique() {
  console.log('🔍 Запуск литературного анализа...');

  // Загружаем журнал
  const journal = await readJSON(JOURNAL_PATH);
  if (!Array.isArray(journal) || journal.length === 0) {
    throw new Error('Журнал пуст — нечего анализировать.');
  }

  const lastEntry = journal[journal.length - 1];

  // Формат даты как в эссе: "7 октября 2025 года"
  const today = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

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
  
  //Надёжное извлечение и парсинг JSON из ответа модели ---
  let analysis;
  if (typeof rawResponse === 'string') {
    try {
      // Находим первую '{' и последнюю '}' — отсекаем всё лишнее
      const startIdx = rawResponse.indexOf('{');
      const endIdx = rawResponse.lastIndexOf('}');
      
      if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
        throw new Error('Не удалось найти корректные границы JSON-объекта');
      }
    
      const jsonStr = rawResponse.slice(startIdx, endIdx + 1);
      analysis = JSON.parse(jsonStr);
    } catch (e) {
      console.error('❌ Ошибка парсинга JSON от критика:', e.message);
      console.error('📝 Сырой ответ от модели (первые 500 символов):');
      console.error(rawResponse.substring(0, 500));
      throw new Error('Некорректный формат ответа от модели');
    }
  } else {
    analysis = rawResponse; // уже объект
  }
  
  // Удаляем generated_at, если модель его добавила (чтобы не перезаписал системную дату)
  delete analysis.generated_at;

  // Сохраняем анализ с актуальной датой
  const result = {
    generated_at: new Date().toISOString(),
    ...analysis
  };

  await writeJSON(ANALYSIS_PATH, result);
  console.log(`✅ Анализ сохранён в ${ANALYSIS_PATH}`);

  // --- Обновление последней записи в journal.json с тегами критика ---
  try {
    const { readJSON, writeJSON } = require('./utils/fileUtils');
    const { JOURNAL_PATH } = require('./config'); // Убедись, что JOURNAL_PATH есть в config.js
    
    const journal = await readJSON(JOURNAL_PATH);
    if (!Array.isArray(journal) || journal.length === 0) {
      console.warn('⚠️ Журнал пуст, невозможно обновить запись с тегами критика.');
    } else {
      const lastEntry = journal[journal.length - 1];

      // Извлекаем теги критика из только что сгенерированного анализа
      const criticTagsFromAnalysis = Array.isArray(result.tags_for_search) ? result.tags_for_search : [];
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
    }
  } catch (e) {
    console.error('❌ Ошибка обновления journal.json с тегами критика:', e.message);
    // Не останавливаем весь процесс, если теги не обновились
  }

  // --- Добавление нового контекста в конец contexts.json ---
  try {
  const { readJSON, writeJSON } = require('./utils/fileUtils');
  const { CONTEXTS_PATH } = require('./config'); // Убедись, что CONTEXTS_PATH есть в config.js

  // 1. Прочитать новый контекст из result (предполагается, что он в next_context_suggestion)
  const newContextSuggestion = result.next_context_suggestion; // Из literary_analysis.json

  if (!newContextSuggestion || typeof newContextSuggestion !== 'string' || newContextSuggestion.trim() === '') {
    console.warn('⚠️ Критик не сгенерировал next_context_suggestion или он пуст. Пропускаем обновление contexts.json.');
  } else {
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
    currentContextsData.contexts.push({ context: newContextSuggestion.trim() });

    // 4. Сохранить contexts.json
    await writeJSON(CONTEXTS_PATH, currentContextsData);
    console.log(`✅ Новый контекст добавлен в конец contexts.json. Всего контекстов: ${currentContextsData.contexts.length}.`);
  }
} catch (e) {
  console.error('❌ Ошибка обновления contexts.json с новым контекстом:', e.message);
  // Не останавливаем весь процесс, если контекст не обновился
}
}

module.exports = { runLiteraryCritique };

// --- Запуск напрямую ---
if (require.main === module) {
  (async () => {
    try {
      await runLiteraryCritique();
    } catch (err) {
      console.error('💥 Критическая ошибка в literary_critic.js:', err.message);
      process.exit(1);
    }
  })();
}
