// src/utils/openrouter.js
const fs = require('fs').promises;
const path = require('path');

const API_KEY = process.env.OPENROUTER_API_KEY;
const API_URL = "https://openrouter.ai/api/v1/chat/completions"; // Убран пробел в конце URL
const MODEL = "mistralai/mistral-nemo:free";
// Альтернативные модели (раскомментируй при необходимости):
// "qwen/qwen3-8b:free"
// "moonshotai/kimi-k2:free"
// "cognitivecomputations/dolphin-mistral-24b-venice-edition:free"

/**
 * Загружает шаблон промпта из папки prompt_templates
 */
async function loadPromptTemplate(templateName) {
  const templatePath = path.join(__dirname, '../prompt_templates', `${templateName}.txt`);
  try {
    return await fs.readFile(templatePath, 'utf8');
  } catch (err) {
    console.error(`Ошибка загрузки шаблона ${templateName}:`, err.message);
    throw err;
  }
}

/**
 * Отправляет запрос в OpenRouter API
 */
async function callOpenRouter(prompt) {
  if (!API_KEY) {
    throw new Error("API ключ не найден. Установите OPENROUTER_API_KEY в переменных окружения.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "HTTP-Referer": "https://jimmyjonezz.github.io/elara-journal-v2/",
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
    if (response.status === 429) {
      throw new Error(`OpenRouter API ошибка 429 (Rate limit exceeded). Детали: ${errorText}`);
    }
    throw new Error(`OpenRouter API ошибка: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/**
 * Генерирует эссе, используя предоставленные данные и шаблон.
 * @param {Object} data - Данные для подстановки в шаблон.
 * @param {string} data.previous_suggestions - Строка с последними советами критика.
 * @param {string} data.semantic_clusters - Строка с кластерами тем (например, "время_и_память, я_и_смысл").
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
  
  // Заменяем {{previous_suggestions}}
  const suggestionsText = data?.previous_suggestions || "Советы от литературного критика отсутствуют.";
  prompt = prompt.replace('{{previous_suggestions}}', suggestionsText);

  // Заменяем {{semantic_clusters}} ← ДОБАВЛЕНО
  const clustersText = data?.semantic_clusters || "размышление, осмысление";
  prompt = prompt.replace('{{semantic_clusters}}', clustersText);

  // Опционально: если вдруг используется {{themes}} — тоже заменяем
  const themesText = data?.themes?.join(', ') || "темы не указаны";
  if (prompt.includes('{{themes}}')) {
    prompt = prompt.replace('{{themes}}', themesText);
  }

  // 4. Вызываем LLM
  return await callOpenRouter(prompt);
}

/**
 * Генерирует рефлексию на основе эссе
 */
async function generateReflection(essay) {
  let prompt = await loadPromptTemplate('reflection_prompt');
  prompt = prompt.replace("{essay}", essay);
  return await callOpenRouter(prompt);
}

module.exports = {
  generateEssay,
  generateReflection,
  callOpenRouter
};
