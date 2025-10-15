// src/literary_critic.js
const { generateCritique } = require('./utils/openrouter');
const { readJSON, writeJSON } = require('./utils/fileUtils');
const {
  JOURNAL_PATH,
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
      console.log(`🔄 Попытка ${attempt}/${maxRettries} для ${actionName}...`);
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

  // Парсинг JSON
  let analysis;
  if (typeof rawResponse === 'string') {
    try {
      // Удаляем возможные блоки кода
      const cleanJson = rawResponse
        .replace(/^```json\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      analysis = JSON.parse(cleanJson);
    } catch (e) {
      console.error('❌ Ошибка парсинга JSON от критика:', e.message);
      console.error('Сырой ответ:', rawResponse);
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
