// src/literary_critic.js
const { generateCritique } = require('./utils/openrouter');
const { readJSON, writeJSON } = require('./utils/fileUtils');
const {
  JOURNAL_PATH,
  ANALYSIS_PATH,
  MAX_RETRIES = 3,
  BASE_DELAY_MS = 2000
} = require('./config');

const path = require('path');
const fs = require('fs').promises;

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
        break; // не повторяем при фатальных ошибках (напр., неверный промпт)
      }
    }
  }
  console.error(`❌ Все ${maxRetries} попыток ${actionName} провалились.`);
  throw lastError;
}

/**
 * Загружает последние записи из журнала
 */
async function loadLatestEntries(count = 5) {
  const journal = await readJSON(JOURNAL_PATH);
  if (!Array.isArray(journal) || journal.length === 0) {
    throw new Error('Журнал пуст — нечего анализировать.');
  }
  return journal.slice(-count); // последние N записей
}

/**
 * Форматирует записи для анализа
 */
function formatEntriesForCritique(entries) {
  return entries.map((entry, i) => {
    return `Запись от ${entry.date}:\n${entry.entry}\n`;
  }).join('\n---\n\n');
}

/**
 * Сохраняет анализ в файл
 */
async function saveAnalysis(analysis) {
  // Добавляем дату генерации
  const result = {
    generated_at: new Date().toISOString(),
    ...analysis
  };
  await writeJSON(ANALYSIS_PATH, result);
  console.log(`✅ Анализ сохранён в ${ANALYSIS_PATH}`);
}

// --- Основная функция ---
async function runLiteraryCritique() {
  console.log('🔍 Запуск литературного анализа...');

  const entries = await loadLatestEntries(5);
  const entriesText = formatEntriesForCritique(entries);

  const critiqueData = {
    entries: entriesText,
    count: entries.length
  };

  // Генерация с ретраями
  const rawResponse = await withRetry(
    () => generateCritique(critiqueData),
    MAX_RETRIES,
    BASE_DELAY_MS,
    'генерации литературного анализа'
  );

  // Парсинг JSON (если нужно)
  let analysis;
  if (typeof rawResponse === 'string') {
    try {
      analysis = JSON.parse(rawResponse);
    } catch (e) {
      console.error('❌ Ошибка парсинга JSON от критика:', e.message);
      console.error('Сырой ответ:', rawResponse);
      throw new Error('Некорректный формат ответа от модели');
    }
  } else {
    analysis = rawResponse; // уже объект
  }

  await saveAnalysis(analysis);
  console.log('🏁 Литературный анализ завершён.');
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
