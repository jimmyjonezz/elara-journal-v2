// src/generation/contentGenerator.js

const { generateEssay, generateReflection } = require('../utils/openrouter');
const { parseScene } = require('../utils/sceneParser'); // Импортируем функцию из нового файла
const { cleanReflectionText, determineReflectionLevel, extractTags } = require('../utils/textProcessor'); // Импортируем extractTags из textProcessor
const { withRetry } = require('../utils/retryHandler');
const { MAX_RETRIES, BASE_DELAY_MS } = require('../config');

/**
 * Генерирует эссе и рефлексию
 */
async function generateContent(externalContext, mood, context) {
  const { previousSuggestions, semanticDict, criticTags } = externalContext;

  // Извлекаем теги из советов, используя импортированную функцию
  const staticInspirationTags = await extractTags(previousSuggestions, semanticDict);

  // Определяем кластеры
  const clusters = [...new Set([...staticInspirationTags, ...criticTags])]
    .map(tag => semanticDict[tag]?.кластер)
    .filter(Boolean);

  const essayData = {
    previous_suggestions: previousSuggestions,
    semantic_clusters: clusters.join(', ') || 'размышление, осмысление',
    current_mood_name: mood.name,
    current_mood_description: mood.description,
    current_context: context
  };

  const rawEssay = await withRetry(() => generateEssay(essayData), MAX_RETRIES, BASE_DELAY_MS, "генерации эссе");
  if (!rawEssay || rawEssay.trim().length < 10) {
    throw new Error(`Подозрительно короткий ответ эссе (длина: ${rawEssay?.length || 0}).`);
  }
  console.log("📄 Длина сырого эссе:", rawEssay.length);

  // --- Используем вынесенную функцию parseScene ---
  const { pose, setting, essayWithoutScene } = parseScene(rawEssay);

  // --- Генерация рефлексии ---
  console.log("💭 Генерируем рефлексию...");
  const rawReflection = await withRetry(() => generateReflection(essayWithoutScene), MAX_RETRIES, BASE_DELAY_MS, "генерации рефлексии");
  if (!rawReflection || rawReflection.trim().length < 10) {
    throw new Error(`Подозрительно короткий ответ рефлексии (длина: ${rawReflection?.length || 0}).`);
  }
  console.log("💭 Длина сырой рефлексии:", rawReflection.length);

  const reflectionWithoutLevel = cleanReflectionText(rawReflection);
  const fullEntryText = `${essayWithoutScene}\n\n${reflectionWithoutLevel}`;

  return {
    essayWithoutScene,
    reflectionWithoutLevel,
    fullEntryText,
    pose,
    setting
  };
}

// // Удаляем дублирующую функцию extractTags из этого файла
// async function extractTags(text, dictionary) { ... }

module.exports = { generateContent };
