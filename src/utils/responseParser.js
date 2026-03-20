// src/utils/responseParser.js
const fs = require('fs').promises;
const path = require('path');

// 🔥 ИСПРАВЛЕННЫЙ И НАДЁЖНЫЙ импорт для jsonrepair@3.13.3 (актуально на март 2026)
let jsonrepair;
try {
  const module = require('jsonrepair');
  jsonrepair = module.jsonrepair || module.default || module;

  // Защита: если вдруг экспорт изменился в будущем
  if (typeof jsonrepair !== 'function') {
    throw new Error('jsonrepair не является функцией');
  }
} catch (e) {
  console.warn('⚠️ jsonrepair не загружен — используем встроенный парсер');
  jsonrepair = (text) => text;
}

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
 * 🔥 Встроенная функция экранирования кавычек (последний fallback)
 */
function escapeQuotesInValues(text) {
  let result = '';
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = i < text.length - 1 ? text[i + 1] : '';
    
    if (char === '\\' && !escaped) {
      escaped = true;
      result += char;
      continue;
    }
    
    if (char === '"' && !escaped) {
      if (!inString) {
        inString = true;
        result += char;
      } else {
        const isClosing = nextChar === ',' || nextChar === '}' || nextChar === ']' || nextChar === '\n' || nextChar === '';
        if (isClosing) {
          inString = false;
          result += char;
        } else {
          result += '\\"';
        }
      }
    } else {
      result += char;
    }
    
    escaped = false;
  }
  
  return result;
}

/**
 * 🔥 Улучшенная предварительная очистка (BOM, zero-width, markdown)
 */
function cleanBeforeRepair(rawText) {
  if (typeof rawText !== 'string') return '';
  return rawText.trim()
    .replace(/^\uFEFF/, '')                    // BOM
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // zero-width символы (jsonrepair тоже их чистит, но на всякий случай)
    .replace(/^```json\s*/i, '')
    .replace(/```$/gm, '')
    .replace(/^```\s*/i, '');
}

/**
 * Извлекает JSON из ответа LLM (удаляет markdown, обрезки)
 */
function extractJSON(rawText) {
  if (typeof rawText !== 'string') return '';

  // Используем улучшенную очистку
  let text = cleanBeforeRepair(rawText);

  // 2. 🔥 Умный поиск { и } (игнорируем внутри строк) — оригинальная логика без изменений
  let firstBrace = -1;
  let lastBrace = -1;
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (char === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    
    if (char === '"' && !escaped) {
      inString = !inString;
    } else if (char === '{' && !inString && firstBrace === -1) {
      firstBrace = i;
    } else if (char === '}' && !inString) {
      lastBrace = i;
    }
    
    escaped = false;
  }
  
  // 3. Если нет {, пробуем восстановить
  if (firstBrace === -1) {
    console.warn('⚠️ Нет открывающей { — добавляем искусственно');
    if (lastBrace > -1) {
      text = '{' + text.substring(0, lastBrace + 1);
    } else {
      text = '{}';
    }
  } else if (lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  } else {
    text = text.substring(firstBrace) + '}';
  }

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
      'RAW INPUT (first 500 chars):',
      rawText.slice(0, 500) + (rawText.length > 500 ? '\n… (truncated)' : ''),
      '─'.repeat(80),
      'RAW INPUT (last 500 chars):',
      rawText.length > 500 ? rawText.slice(-500) : rawText,
    ].join('\n');

    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`📄 Проблемный ответ сохранён → logs/parser-errors/${path.basename(filePath)}`);
  } catch (e) {
    console.error('Не удалось сохранить лог парсинга:', e.message);
  }
}

/**
 * Многоуровневый безопасный парсинг JSON — улучшенная версия
 */
function safeParseJSON(rawText, options = {}) {
  const { maxLength = 32000, logFailures = true } = options;

  if (typeof rawText !== 'string') {
    throw new TypeError('Ожидалась строка');
  }

  // Не мутируем входной параметр
  let text = rawText;
  if (text.length > maxLength) {
    console.warn(`Ответ слишком большой (${text.length} символов) → обрезаем`);
    text = text.slice(0, maxLength);
  }

  // 1. Извлекаем JSON из текста
  const extractedJSON = extractJSON(text);

  const attempts = [
    () => JSON.parse(extractedJSON),           // Попытка 1: чистый парсинг
    () => {
      // Попытка 2: ремонт через jsonrepair (основной путь)
      const repaired = jsonrepair(extractedJSON);
      return JSON.parse(repaired);
    },
    () => {      
      // Попытка 3: встроенный fallback (экранирование кавычек)
      const repaired = escapeQuotesInValues(extractedJSON);
      return JSON.parse(repaired);
    },
  ];

  let lastError;

  for (let i = 0; i < attempts.length; i++) {
    try {
      const result = attempts[i]();
      if (result && typeof result === 'object') {
        console.log(`✅ Парсинг успешен (попытка ${i + 1})`);
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
  safeParseJSON,
  extractJSON,
  showContextAroundError,
};
