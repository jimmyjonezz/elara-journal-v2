// src/utils/responseParser.js
const fs = require('fs').promises;
const path = require('path');

/**
 * Показывает контекст вокруг позиции ошибки для отладки
 */
function showContextAroundError(text, position, contextLength = 50) {
  if (position === null || position === undefined) return 'Позиция неизвестна';
  const start = Math.max(0, position - contextLength);
  const end = Math.min(text.length, position + contextLength);
  const before = text.slice(start, position).replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  const after = text.slice(position, end).replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  return `...${before}<<HERE>>${after}...`;
}

/**
 * Экранирует кавычки внутри строковых значений JSON
 * Это самая важная функция для работы с LLM
 */
function escapeQuotesInStringValues(text) {
  let result = '';
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const prevChar = i > 0 ? text[i - 1] : '';
    
    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
      result += char;
    } else if (char === '"' && inString && prevChar !== '\\') {
      // Кавычка внутри строки — экранируем
      result += '\\"';
    } else {
      result += char;
    }
  }
  
  return result;
}

/**
 * Пытается извлечь и починить JSON из ответа LLM
 */
function repairAndExtractJSON(rawText) {
  if (typeof rawText !== 'string') return '';

  let text = rawText.trim();
  // 1. Удаляем markdown-обёртки
  text = text
    .replace(/^```json\s*/i, '')
    .replace(/```$/m, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/m, '');

  // 2. Удаляем BOM и zero-width символы
  text = text.replace(/[\uFEFF\u200B\u200C\u200D]/g, '');

  // 3. Находим первую { и последнюю }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  
  if (firstBrace > -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  // 4. Удаляем trailing commas перед } или ]
  text = text.replace(/,\s*([}\]])/g, '$1');

  // 5. 🔥 ЭКРАНИРУЕМ КАВЫЧКИ ВНУТРИ СТРОК (самое важное!)
  text = escapeQuotesInStringValues(text);

  // 6. Заменяем «ёлочки» на обычные кавычки (если они внутри строк)
  text = text.replace(/«/g, '"').replace(/»/g, '"');

  // 7. Экранируем переносы строк внутри строковых значений
  // Простая эвристика: заменяем \n на \\n, но не внутри уже экранированных
  text = text.replace(/(?<!\\)\n/g, '\\n');

  return text.trim();
}

/**
 * Сохраняет проблемный ответ для последующего анализа
 */
async function saveFailedParse(rawText, errorMessage) {
  try {
    const logsDir = path.join(__dirname, '../../logs/parser-errors');
    await fs.mkdir(logsDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(logsDir, `parse-fail-${ts}.txt`);

    const positionMatch = errorMessage.match(/position (\d+)/);
    const position = positionMatch ? parseInt(positionMatch[1]) : null;

    const content = [      `ERROR: ${errorMessage}`,
      `TIMESTAMP: ${new Date().toISOString()}`,
      `POSITION: ${position || 'N/A'}`,
      '─'.repeat(80),
      'CONTEXT AROUND ERROR:',
      position ? showContextAroundError(rawText, position) : 'N/A',
      '─'.repeat(80),
      'RAW INPUT:',
      rawText.slice(0, 4000) + (rawText.length > 4000 ? '\n… (truncated)' : ''),
    ].join('\n');

    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`📄 Проблемный ответ сохранён → logs/parser-errors/${path.basename(filePath)}`);
  } catch (e) {
    console.error('Не удалось сохранить лог парсинга:', e.message);
  }
}

/**
 * Многоуровневый безопасный парсинг JSON
 */
function safeParseJSON(rawText, options = {}) {
  const { maxLength = 32000, logFailures = true } = options;

  if (typeof rawText !== 'string') {
    throw new TypeError('Ожидалась строка');
  }

  if (rawText.length > maxLength) {
    console.warn(`Ответ слишком большой (${rawText.length} символов) → обрезаем`);
    rawText = rawText.slice(0, maxLength);
  }

  const attempts = [
    () => JSON.parse(rawText),
    () => JSON.parse(repairAndExtractJSON(rawText)),
  ];

  let lastError;

  for (let i = 0; i < attempts.length; i++) {
    try {
      const result = attempts[i]();
      if (result && typeof result === 'object') {
        return result;
      }
    } catch (e) {
      lastError = e;
      if (i < attempts.length - 1) {
        console.debug(`Парсинг попытка ${i + 1} не удалась: ${e.message}`);      }
    }
  }

  if (logFailures) {
    saveFailedParse(rawText, lastError?.message || 'Неизвестная ошибка парсинга').catch(() => {});
  }

  throw new Error(`Не удалось распарсить JSON после всех попыток: ${lastError?.message || '—'}`);
}

/**
 * Основная функция парсинга ответа критика
 */
function parseCriticResponse(rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'string' || rawResponse.trim() === '') {
    throw new Error('Пустой или некорректный ответ от модели');
  }

  let data;
  try {
    data = safeParseJSON(rawResponse, { maxLength: 32000 });
  } catch (e) {
    console.error('💥 Ошибка парсинга ответа критика:', e.message);
    return {
      summary: "Анализ не удался",
      suggestions: [],
      tags_for_search: [],
      next_context_suggestion: null,
      error: true,
      error_message: e.message
    };
  }

  // Поддержка обоих вариантов именования полей
  const tags = data.tags_for_search || data.tagsForSearch || data.tags_for_search || [];
  const suggestions = data.suggestions || data.advice || [];
  const nextContext = data.next_context_suggestion || data.nextContextSuggestion || data.next_context || null;

  if (!data.summary || typeof data.summary !== 'string') {
    console.warn('⚠️ Отсутствует поле summary');
    data.summary = "Анализ без резюме";
  }

  data.suggestions = Array.isArray(suggestions) ? suggestions : [suggestions].filter(Boolean);
  data.tags_for_search = Array.isArray(tags) ? tags : [tags].filter(Boolean);
  data.next_context_suggestion = typeof nextContext === 'string' ? nextContext : null;

  delete data.generated_at;
  delete data.tagsForSearch;  delete data.nextContextSuggestion;

  console.log(`Парсер: получено ${data.tags_for_search.length} тегов, ${data.suggestions.length} предложений`);
  return data;
}

module.exports = {
  parseCriticResponse,
  safeParseJSON,
  repairAndExtractJSON,
  showContextAroundError,
};
