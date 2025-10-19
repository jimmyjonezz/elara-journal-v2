// src/generation/critiqueGenerator.js
const { generateCritique } = require('../utils/openrouter');
const { parseCriticResponse } = require('../utils/responseParser'); // Новый модуль для парсинга
const { withRetry } = require('../utils/retryHandler'); // Используем общий модуль retry
const { MAX_RETRIES, BASE_DELAY_MS } = require('../config'); // Импортируем настройки

/**
 * Генерирует литературный анализ на основе данных.
 * Использует retry-логику и парсит ответ.
 */
async function generateContentAnalysis(critiqueData) {
  // Генерация с ретраями
  const rawResponse = await withRetry(
    () => generateCritique(critiqueData),
    MAX_RETRIES,
    BASE_DELAY_MS,
    'генерации литературного анализа'
  );

  // Парсинг ответа
  const analysis = parseCriticResponse(rawResponse);

  // Удаляем generated_at, если модель его добавила (чтобы не перезаписал системную дату)
  delete analysis.generated_at;

  // Возвращаем анализ с актуальной датой
  return {
    generated_at: new Date().toISOString(),
    ...analysis
  };
}

module.exports = { generateContentAnalysis };
