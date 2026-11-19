// src/utils/retryHandler.js

const { MAX_RETRIES, BASE_DELAY_MS } = require('../config');

/**
 * Выполняет функцию с повторными попытками при сетевых/временных ошибках
 */
async function withRetry(fn, maxRetries = MAX_RETRIES, baseDelay = BASE_DELAY_MS, actionName) {
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
        msg.includes('429') ||
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

module.exports = { withRetry };
