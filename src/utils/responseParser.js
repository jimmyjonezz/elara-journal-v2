// src/utils/responseParser.js
const fs = require('fs').promises;
const path = require('path');

/**
 * Экранирует вложенные двойные кавычки внутри строковых значений
 */
function escapeInnerQuotes(text) {
  return text.replace(/"((?:[^"\\]|\\.)*)"/g, (match, content) => {
    const escaped = content.replace(/(?<!\\)"/g, '\\"');
    return `"${escaped}"`;
  });
}

/**
 * Извлекает и чинит JSON из ответа LLM — осторожный подход
 */
function repairAndExtractJSON(rawText) {
  if (typeof rawText !== 'string' || rawText.trim() === '') {
    return '{}';
  }

  let text = rawText.trim();

  // 1. Удаляем BOM, zero-width и ведущие невидимые символы
  text = text.replace(/^[\uFEFF\u200B\u200C\u200D\u2060\s]+/, '');

  // 2. Убираем markdown-обёртку и лишний текст до/после
  text = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/gm, '');

  // 3. Вырезаем самый большой { … } блок
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}') + 1;
  if (start === -1 || end <= start) return '{}';
  text = text.slice(start, end);

  // 4. Экранируем вложенные кавычки (самая частая причина падения)
  text = escapeInnerQuotes(text);

  // 5. Убираем trailing commas
  text = text.replace(/,\s*([}\]])/g, '$1');

  // 6. Опционально чиним ключи без кавычек — но только если другие попытки провалились
  //    Здесь оставляем закомментированным, т.к. в большинстве случаев модель даёт кавычки
  // text = text.replace(/([{\[,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  return text.trim();
}

/**
 * Сохраняет проблемный ответ для отладки
 */
async function saveFailedParse(rawText, errorMessage) {
  try {
    const logsDir = path.join(__dirname, '../../logs/parser-errors');
    await fs.mkdir(logsDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(logsDir, `parse-fail-${ts}.txt`);

    const content = [
      `ERROR: ${errorMessage}`,
      `TIMESTAMP: ${new Date().toISOString()}`,
      '─'.repeat(80),
      'RAW INPUT:',
      rawText.slice(0, 6000) + (rawText.length > 6000 ? '\n… (truncated)' : ''),
    ].join('\n');

    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`Проблемный ответ сохранён → ${path.basename(filePath)}`);
  } catch (e) {
    console.error('Не удалось сохранить лог парсинга:', e.message);
  }
}

/**
 * Многоуровневый безопасный парсинг
 */
function safeParseJSON(rawText, options = {}) {
  const { maxLength = 40000 } = options;

  if (typeof rawText !== 'string') {
    throw new TypeError('Ожидалась строка');
  }

  if (rawText.length > maxLength) {
    console.warn(`Ответ слишком большой (${rawText.length} > ${maxLength}) → обрезаем`);
    rawText = rawText.slice(0, maxLength);
  }

  const attempts = [
    // 1. Как пришло
    () => JSON.parse(rawText),

    // 2. Только экранирование вложенных кавычек
    () => JSON.parse(escapeInnerQuotes(rawText)),

    // 3. Вырезание блока + экранирование + trailing commas
    () => JSON.parse(repairAndExtractJSON(rawText)),

    // 4. Агрессивная починка ключей без кавычек (последний шанс)
    () => {
      let t = rawText.trim().replace(/^[\s\uFEFF\u200B-\u200D\u2060]*/, '');
      t = escapeInnerQuotes(t);
      t = t.replace(/([{\[,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
      t = t.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(t);
    },
  ];

  let lastError;

  for (let i = 0; i < attempts.length; i++) {
    try {
      const result = attempts[i]();
      if (result && typeof result === 'object' && result !== null) {
        console.log(`JSON успешно распарсен на попытке ${i + 1}`);
        return result;
      }
    } catch (e) {
      lastError = e;
      if (i < attempts.length - 1) {
        console.debug(`Попытка ${i + 1} не удалась: ${e.message}`);
      }
    }
  }

  saveFailedParse(rawText, lastError?.message || 'Неизвестная ошибка').catch(() => {});

  throw new Error(
    `Не удалось распарсить JSON после всех попыток: ${lastError?.message || '—'}`
  );
}

/**
 * Основная функция парсинга ответа критика
 */
function parseCriticResponse(rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'string' || rawResponse.trim() === '') {
    console.warn('Пустой ответ от модели → fallback');
    return {
      summary: "Ответ модели пустой или некорректный",
      suggestions: [],
      tags_for_search: ["parse_error", "empty_response"],
      next_context_suggestion: "Вернитесь к предыдущему контексту",
    };
  }

  let data;
  try {
    data = safeParseJSON(rawResponse);
  } catch (e) {
    console.error('Парсер полностью провалился:', e.message);
    return {
      summary: "Не удалось корректно распарсить ответ литературного критика",
      suggestions: ["Повторите попытку позже", "Проверьте качество промпта"],
      tags_for_search: ["parse_error", "llm_failure"],
      next_context_suggestion: "Предыдущий контекст",
    };
  }

  // Валидация обязательных полей
  const requiredFields = ['summary', 'suggestions', 'tags_for_search'];
  for (const field of requiredFields) {
    if (!(field in data)) {
      throw new Error(`Отсутствует обязательное поле: ${field}`);
    }
  }

  // Нормализация типов
  data.suggestions = Array.isArray(data.suggestions)
    ? data.suggestions
    : [data.suggestions].filter(Boolean);

  data.tags_for_search = Array.isArray(data.tags_for_search)
    ? data.tags_for_search
    : [data.tags_for_search].filter(Boolean);

  // Удаляем ненужные служебные поля, если есть
  delete data.generated_at;

  console.log(
    `Парсер: ${data.tags_for_search.length} тегов, ${data.suggestions.length} советов`
  );

  return data;
}

module.exports = {
  parseCriticResponse,
  safeParseJSON,
  repairAndExtractJSON,
  escapeInnerQuotes,        // для тестов / отладки
};
