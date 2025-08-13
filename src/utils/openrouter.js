const fs = require('fs').promises;
const path = require('path');

// Загрузка API ключа из переменной окружения или файла
const API_KEY = process.env.OPENROUTER_API_KEY || loadApiKeyFromFile();

async function loadApiKeyFromFile() {
  try {
    const keyPath = path.join(__dirname, '../../.env.local');
    const envContent = await fs.readFile(keyPath, 'utf8');
    const match = envContent.match(/OPENROUTER_API_KEY=(.+)/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "qwen/qwen3-235b-a22b:free"; // или "qwen/qwen3" в зависимости от формата OpenRouter

/**
 * Загружает текст шаблона
 */
async function loadPromptTemplate(templateName) {
  const templatePath = path.join(__dirname, '../prompt_templates', `${templateName}.txt`);
  return await fs.readFile(templatePath, 'utf8');
}

/**
 * Отправляет запрос к OpenRouter API
 */
async function callOpenRouter(prompt) {
  const apiKey = await API_KEY;
  if (!apiKey) {
    throw new Error("API ключ не найден. Установите OPENROUTER_API_KEY в переменных окружения или в .env.local");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://jimmyjonezz.github.io/elara-journal-v2/", // Замените на ваш сайт
      "X-Title": "Elara Journal",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "user", content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API ошибка: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/**
 * Генерирует эссе
 */
async function generateEssay() {
  const prompt = await loadPromptTemplate('essay_prompt');
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
  generateReflection
};
