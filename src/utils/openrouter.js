const fs = require('fs').promises;
const path = require('path');

const API_KEY = process.env.OPENROUTER_API_KEY;
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "cognitivecomputations/dolphin-mistral-24b-venice-edition:free"; // Уточнено
//qwen/qwen3-8b:free

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
      "HTTP-Referer": "https://jimmyjonezz.github.io/elara-journal-v2/", // Обновлено
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
    // Добавим более информативную обработку 429
    if (response.status === 429) {
        throw new Error(`OpenRouter API ошибка 429 (Rate limit exceeded). Детали: ${errorText}`);
    }
    throw new Error(`OpenRouter API ошибка: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function generateEssay() {
  const prompt = await loadPromptTemplate('essay_prompt');
  return await callOpenRouter(prompt);
}

async function generateReflection(essay) {
  let prompt = await loadPromptTemplate('reflection_prompt');
  prompt = prompt.replace("{essay}", essay);
  return await callOpenRouter(prompt);
}

module.exports = {
  generateEssay,
  generateReflection
};
