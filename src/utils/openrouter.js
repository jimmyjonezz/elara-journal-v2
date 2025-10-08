// src/utils/openrouter.js
const fs = require('fs').promises;
const path = require('path');

const API_KEY = process.env.OPENROUTER_API_KEY;
const API_URL = "https://openrouter.ai/api/v1/chat/completions"; // без пробела

// Модель для генерации записей (бесплатная)
const ESSAY_MODEL = "mistralai/mistral-nemo:free";
// Альтернативы: "qwen/qwen3-8b:free", "cognitivecomputations/dolphin-mistral-24b-venice-edition:free"

// Модель для литературного анализа (рекомендуется платная, но стабильная)
const CRITIQUE_MODEL = "grok/grok-4-fast:free";
// Если нужна бесплатная: "qwen/qwen3-8b:free" — но возможны ошибки формата
const today = new Date().toLocaleDateString('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

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
 * Генерирует эссе, используя предоставленные данные и шаблон.
 */
async function generateEssay(data) {

  let prompt = await loadPromptTemplate('essay_prompt');
  prompt = prompt.replace('{DATE}', today);
  prompt = prompt.replace('{{previous_suggestions}}', data?.previous_suggestions || "Советы от литературного критика отсутствуют.");
  prompt = prompt.replace('{{semantic_clusters}}', data?.semantic_clusters || "размышление, осмысление");
  prompt = prompt.replace('{{current_mood_name}}', data?.current_mood_name || "нейтральное");
  prompt = prompt.replace('{{current_mood_description}}', data?.current_mood_description || "");
  prompt = prompt.replace('{{current_context}}', data?.current_context || "Ты сидишь за столом. За окном — тишина.");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "HTTP-Referer": "https://jimmyjonezz.github.io/elara-journal-v2/",
      "X-Title": "Elara Journal",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: ESSAY_MODEL,
      messages: [{ role: "user", content: prompt }],
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

  const result = await response.json();
  return result.choices[0].message.content.trim();
}

/**
 * Генерирует рефлексию на основе эссе
 */
async function generateReflection(essay) {
  let prompt = await loadPromptTemplate('reflection_prompt');
  prompt = prompt.replace("{essay}", essay);

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "HTTP-Referer": "https://jimmyjonezz.github.io/elara-journal-v2/",
      "X-Title": "Elara Journal",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: ESSAY_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2024
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API ошибка: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result.choices[0].message.content.trim();
}

/**
 * Генерирует внутренний отклик ("вчерашняя Элара") на запись — по промпту RPP v2.0
 */
async function generateCritique(data) {
  let prompt = await loadPromptTemplate('critique_prompt'); // ← должен содержать твой RPP v2.0

  const substitutions = {
    '{{entry_title}}': data.entry_date,
    '{{entry_tags}}': JSON.stringify(data.entry_tags || []),
    '{{entry_reflection_level}}': data.entry_reflection_level || 'средний',
    '{{entry_essay}}': data.entry_essay || '',
    '{{entry_reflection}}': data.entry_reflection || '',
    '{{history_context}}': data.history_context || 'Контекст истории отсутствует.'
  };

  for (const [placeholder, value] of Object.entries(substitutions)) {
    prompt = prompt.replace(new RegExp(placeholder, 'g'), value);
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
      model: CRITIQUE_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2024
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API ошибка: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result.choices[0].message.content.trim();
}

module.exports = {
  generateEssay,
  generateReflection,
  generateCritique,
  callOpenRouter: null // если не используется напрямую — можно убрать
};
