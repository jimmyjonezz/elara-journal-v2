// src/utils/responseParser.js
const fs = require('fs').promises;
const path = require('path');

/**
 * Пытается извлечь и починить JSON из ответа LLM
 * @param {string} rawText
 * @returns {string} подготовленный текст для парсинга
 */
function repairAndExtractJSON(rawText) {
  if (typeof rawText !== 'string') return '';

  let text = rawText.trim();

  // 1. Удаляем всё до первого ```json или {
  const jsonStartRegex = /(?:```json\s*|```(?:\s*\n)?|\{\s*)/i;
  const startMatch = text.search(jsonStartRegex);
  if (startMatch > 0) {
    text = text.slice(startMatch);
  }

  // 2. Убираем распространённые markdown-обёртки
  text = text
    .replace(/^```json\s*/i, '')
    .replace(/```$/m, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/m, '');

  // 3. Удаляем BOM и zero-width символы
  text = text.replace(/^[\uFEFF\u200B\u200C\u200D]+/, '');

  // 4. Удаляем trailing commas (самый частый косяк LLM)
  text = text.replace(/,\s*([}\]])/g, '$1');

  // 5. Чиним незакрытые строки с двойными кавычками
  //    (очень частый случай — модель обрывает строку)
  text = text.replace(/(".*?)(?<!\\)"\s*(?=[,\]}])/g, (m, p1) => {
    return p1.replace/(?<!\\)"/g, '\\"') + '"';
  });

  // 6. Удаляем лишние запятые перед закрытием объекта/массива
  text = text.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');

  // 7. Последний штрих — убираем текст после закрывающей скобки
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace > -1) {
    text = text.substring(0, lastBrace + 1);
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

    const content = [
      `ERROR: ${errorMessage}`,
      `TIMESTAMP: ${new Date().toISOString()}`,
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
    () => JSON.parse(rawText),                    // 1. как есть
    () => JSON.parse(repairAndExtractJSON(rawText)), // 2. после ремонта
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

  // финальная ошибка
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
      tags_for_search: [],  // пусто, чтобы не добавлять технические теги
      next_context_suggestion: null  // не менять контекст
    };
  }

  // Валидация структуры
  const required = {
    summary: 'string',
    suggestions: ['array', 'string'],
    tags_for_search: ['array', 'string'],
    next_context_suggestion: ['string', 'undefined'],
  };

  for (const [field, expected] of Object.entries(required)) {
    if (!(field in data)) {
      throw new Error(`Отсутствует обязательное поле: ${field}`);
    }

    const value = data[field];

    if (Array.isArray(expected)) {
      const [mainType, fallbackType] = expected;
      if (mainType === 'array') {
        if (!Array.isArray(value)) {
          if (fallbackType && typeof value === fallbackType) {
            data[field] = [value].filter(Boolean);
          } else {
            throw new Error(`Поле ${field} должно быть массивом (получено: ${typeof value})`);
          }
        }
      } else if (fallbackType && typeof value !== mainType && typeof value !== fallbackType) {
        throw new Error(`Неверный тип поля ${field}: ожидался ${mainType} или ${fallbackType}`);
      }
    } else if (typeof value !== expected) {
      throw new Error(`Неверный тип поля ${field}: ожидался ${expected}, получен ${typeof value}`);
    }
  }

  // Финальная нормализация
  data.suggestions = Array.isArray(data.suggestions) ? data.suggestions : [data.suggestions].filter(Boolean);
  data.tags_for_search = Array.isArray(data.tags_for_search) ? data.tags_for_search : [data.tags_for_search].filter(Boolean);

  // Удаляем служебные поля, если они есть
  delete data.generated_at;

  console.log(`Парсер: получено ${data.tags_for_search.length} тегов, ${data.suggestions.length} предложений`);
  return data;
}

module.exports = {
  parseCriticResponse,
  safeParseJSON,
  repairAndExtractJSON,   // для тестов и отладки
};
