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
 * Удаляет невидимые Unicode-символы
 */
function removeInvisibleChars(text) {
  if (typeof text !== 'string') return '';
  text = text.replace(/^\uFEFF/, '');
  text = text.replace(/[\u200B\u200C\u200D\u200E\u200F\u2060\u2061\u2062\u2063\u2064]/g, '');
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return text;
}

/**
 * 🔥 Умное экранирование кавычек внутри строковых значений
 * Исправленная версия — все условия в одном блоке
 */
function escapeQuotesInValues(text) {
  let result = '';
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const prevChar = i > 0 ? text[i - 1] : '';
    
    // Отслеживаем обратный слэш
    if (char === '\\' && !escaped) {
      escaped = true;
      result += char;
      continue;
    }
    
    // Кавычка
    if (char === '"' && !escaped) {
      // Проверяем, что после кавычки (для определения типа кавычки)      const remaining = text.slice(i + 1);
      const isClosingQuote = /^\s*[,}\]]/.test(remaining);
      
      if (inString && isClosingQuote) {
        // Закрывающая кавычка значения
        inString = false;
        result += char;
      } else if (!inString) {
        // Открывающая кавычка (ключа или значения)
        inString = true;
        result += char;
      } else {
        // Кавычка внутри строки — экранируем
        result += '\\"';
      }
    } else {
      result += char;
    }
    
    escaped = false;
  }
  
  return result;
}

/**
 * Пытается извлечь и починить JSON из ответа LLM
 */
function repairAndExtractJSON(rawText) {
  if (typeof rawText !== 'string') return '';

  let text = rawText;

  // 1. Удаляем невидимые символы
  text = removeInvisibleChars(text);
  text = text.trim();

  // 2. Удаляем markdown-обёртки
  text = text
    .replace(/^```json\s*/i, '')
    .replace(/```$/m, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/m, '');

  // 3. Снова чистим после markdown
  text = removeInvisibleChars(text);
  text = text.trim();

  // 4. Находим первую { и последнюю }
  const firstBrace = text.indexOf('{');  const lastBrace = text.lastIndexOf('}');
  
  if (firstBrace > -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  // 5. Удаляем trailing commas перед } или ]
  text = text.replace(/,\s*([}\]])/g, '$1');

  // 6. 🔥 Экранируем кавычки внутри значений
  text = escapeQuotesInValues(text);

  return text;
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

    let hexContext = 'N/A';
    if (position !== null && position !== undefined) {
      const start = Math.max(0, position - 10);
      const end = Math.min(rawText.length, position + 10);
      hexContext = rawText.slice(start, end).split('').map(c => 
        `${c.charCodeAt(0).toString(16).padStart(4, '0')}(${c === '\n' ? '\\n' : c === '\r' ? '\\r' : c})`
      ).join(' ');
    }

    const content = [
      `ERROR: ${errorMessage}`,
      `TIMESTAMP: ${new Date().toISOString()}`,
      `POSITION: ${position || 'N/A'}`,
      '─'.repeat(80),
      'HEX CODES AROUND ERROR:',
      hexContext,
      '─'.repeat(80),
      'CONTEXT AROUND ERROR:',
      position ? showContextAroundError(rawText, position) : 'N/A',
      '─'.repeat(80),
      'RAW INPUT:',      rawText.slice(0, 4000) + (rawText.length > 4000 ? '\n… (truncated)' : ''),
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
        console.debug(`Парсинг попытка ${i + 1} не удалась: ${e.message}`);
      }
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

  const tags = data.tags_for_search || data.tagsForSearch || [];
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
  delete data.tagsForSearch;
  delete data.nextContextSuggestion;

  console.log(`Парсер: получено ${data.tags_for_search.length} тегов, ${data.suggestions.length} предложений`);
  return data;
}

module.exports = {
  parseCriticResponse,
  safeParseJSON,  repairAndExtractJSON,
  escapeQuotesInValues,
  removeInvisibleChars,
  showContextAroundError,
};
