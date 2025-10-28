// src/utils/responseParser.js

/**
 * Парсит сырой ответ модели, ожидая JSON.
 * Удаляет окружающие блоки кода (```json, ```) и пытается распарсить.
 * @param {string} rawResponse - Сырой ответ от модели.
 * @returns {Object} - Распарсенный JSON-объект.
 * @throws {Error} - Если ответ пуст, не строка или не валидный JSON.
 */
function parseCriticResponse(rawResponse) {
  if (typeof rawResponse !== 'string' || rawResponse.trim() === '') {
    throw new Error('Модель вернула пустой или некорректный ответ (не строка или пустая строка).');
  }

  try {
    // Удаляем возможные блоки кода Markdown
    const cleanJson = rawResponse
      .replace(/^```json\s*/i, '') // Убираем ```json в начале
      .replace(/\s*```$/i, '')    // Убираем ``` в конце
      .trim();                    // Убираем лишние пробелы

    if (!cleanJson) {
      throw new Error('Модель вернула пустой JSON-ответ после очистки.');
    }

    return JSON.parse(cleanJson);
  } catch (e) {
    if (e instanceof SyntaxError) {
      console.error('❌ Ошибка парсинга JSON от критика:', e.message);
      console.error('📝 Сырой ответ от модели (до очистки):');
      console.error(rawResponse);
      throw new Error('Некорректный формат ответа от модели (ошибка JSON.parse).');
    } else {
      // Перебрасываем другие ошибки (например, из логики выше)
      throw e;
    }
  }
}

module.exports = { parseCriticResponse };
