// src/utils/openrouter.js
const fs = require('fs').promises;
const path = require('path');

const API_KEY = process.env.OPENROUTER_API_KEY;
const API_URL = "https://openrouter.ai/api/v1/chat/completions"; // Убран пробел в конце URL
const MODEL = "mistralai/mistral-nemo:free"; // Уточнено
//qwen/qwen3-8b:free
//moonshotai/kimi-k2:free
//cognitivecomputations/dolphin-mistral-24b-venice-edition:free";

async function loadPromptTemplate(templateName) {
  const templatePath = path.join(__dirname, '../prompt_templates', `${templateName}.txt`);
  try {
      return await fs.readFile(templatePath, 'utf8');
  } catch (err) {
      console.error(`Ошибка загрузки шаблона ${templateName}:`, err.message);
      throw err;
  }
}

async function callOpenRouter(prompt) {
  if (!API_KEY) {
    throw new Error("API ключ не найден. Установите OPENROUTER_API_KEY в переменных окружения.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "HTTP-Referer": "https://jimmyjonezz.github.io/elara-journal-v2/", // Убран пробел в конце
      "X-Title": "Elara Journal",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    // Добавим более информативную обработку 429
    if (response.status === 429) {
        throw new Error(`OpenRouter API ошибка 429 (Rate limit exceeded). Детали: ${errorText}`);
    }
    throw new Error(`OpenRouter API ошибка: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// --- Обновлённая функция generateEssay ---
/**
 * Генерирует эссе, используя предоставленные данные и шаблон.
 * @param {Object} data - Данные для подстановки в шаблон.
 * @param {string} data.previous_suggestions - Строка с последними советами критика.
 * @param {Array<string>} data.themes - Массив тем.
 * @returns {Promise<string>} Сгенерированное эссе.
 */
async function generateEssay(data) {
  // 1. Получаем текущую дату
  const today = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // 2. Загружаем шаблон
  const template = await loadPromptTemplate('essay_prompt');

  // 3. Подставляем переменные в шаблон
  let prompt = template;
  // Заменяем {DATE}
  prompt = prompt.replace('{DATE}', today);
  
  // Заменяем {{previous_suggestions}} (новая переменная)
  // Если data.previous_suggestions не передано, используем значение по умолчанию
  const suggestionsText = data?.previous_suggestions || "Советы от литературного критика отсутствуют.";
  prompt = prompt.replace('{{previous_suggestions}}', suggestionsText);

  // Заменяем {{themes}} (если используется в шаблоне)
  // Предполагая, что темы передаются как массив в data.themes
  const themesText = data?.themes?.join(', ') || "темы не указаны";
  // Проверим, есть ли в шаблоне переменная {{themes}} перед заменой
  if (prompt.includes('{{themes}}')) {
    prompt = prompt.replace('{{themes}}', themesText);
  }
  // Если {{themes}} нет в шаблоне, эта замена просто не сработает, что безопасно.

  // 4. Вызываем LLM
  return await callOpenRouter(prompt);
}
// --- Конец обновлённой функции generateEssay ---

async function generateReflection(essay) {
  let prompt = await loadPromptTemplate('reflection_prompt');
  prompt = prompt.replace("{essay}", essay);
  return await callOpenRouter(prompt);
}

module.exports = {
  generateEssay, // Экспортируем обновлённую функцию
  generateReflection,
  callOpenRouter
};
