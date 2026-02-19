// src/utils/responseParser.js
const fs = require('fs').promises;

/**
 * Пытается исправить частые ошибки JSON от LLM
 */
function repairJSON(rawText) {
  let text = rawText.trim();

  // 1. Удаляем markdown-обёртку
  text = text.replace(/^```json\s*/i, '').replace(/```$/, '');
  text = text.replace(/^```\s*/i, '').replace(/```$/, '');

  // 2. Удаляем невидимые символы
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // 3. Удаляем trailing commas
  text = text.replace(/,(\s*[}\]])/g, '$1');

  // 4. Экранируем одиночные кавычки внутри строк
  text = text.replace(/(?<!\\)'/g, "\\'");

  return text;
}

/**
 * Безопасный парсинг JSON с попыткой восстановления
 */
function safeParseJSON(rawText, maxRetries = 2) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      if (i === 0) {
        return JSON.parse(rawText);
      }
      
      const repaired = repairJSON(rawText);
      return JSON.parse(repaired);
      
    } catch (e) {
      console.warn(`⚠️ Попытка парсинга ${i + 1} не удалась: ${e.message}`);
      
      if (i === maxRetries) {
        console.error("❌ Не удалось распарсить JSON после всех попыток ремонта");
        console.error("📄 Последние 500 символов ответа:", rawText.slice(-500));
        throw e;
      }
    }
  }
}

/**
 * Парсит ответ критика и валидирует структуру
 */
function parseCriticResponse(rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'string') {
    throw new Error("Пустой или некорректный ответ от модели");
  }

  const analysis = safeParseJSON(rawResponse);

  // Валидация обязательных полей
  const requiredFields = ['summary', 'suggestions', 'tags_for_search'];
  for (const field of requiredFields) {
    if (!analysis[field]) {
      throw new Error(`Отсутствует обязательное поле: ${field}`);
    }
  }

  // Нормализация типов
  if (!Array.isArray(analysis.suggestions)) {
    analysis.suggestions = [analysis.suggestions];
  }
  if (!Array.isArray(analysis.tags_for_search)) {
    analysis.tags_for_search = [analysis.tags_for_search];
  }

  console.log('✅ JSON успешно распарсен и валидирован');
  return analysis;
}

module.exports = { parseCriticResponse, safeParseJSON, repairJSON };
