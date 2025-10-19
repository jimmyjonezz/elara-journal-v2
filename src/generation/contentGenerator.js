// src/generation/contentGenerator.js

const { generateEssay, generateReflection } = require('../utils/openrouter');
const { parseScene } = require('../utils/sceneParser'); // Импортируем новую функцию
const { cleanReflectionText, determineReflectionLevel } = require('../utils/textProcessor'); // Импортируем функции
const { withRetry } = require('../utils/retryHandler'); // Импортируем сюда
const { MAX_RETRIES, BASE_DELAY_MS } = require('../config'); // Импортируем конфиг

/**
 * Генерирует эссе и рефлексию
 */
async function generateContent(externalContext, mood, context) {
  const { previousSuggestions, semanticDict, criticTags } = externalContext;

  // Извлекаем теги из советов
  const staticInspirationTags = await extractTags(previousSuggestions, semanticDict); // Предполагаем, что extractTags будет вынесена в textProcessor или останется здесь

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

  // --- Парсинг сцены (устойчивый к отсутствию [/SCENE]) ---
  let pose = "she is sitting curled up in a worn vintage armchair, with her legs tucked under her.";
  let setting = "a dimly lit room filled with books, the last rays of the autumn sun.";

  // Обновленное регулярное выражение, учитывающее [/SCENE]
  const sceneMatch = rawEssay.match(/\[SCENE\]\s*\n(?:Pose:\s*(.*?)\s*\n)?(?:Setting:\s*(.*?)\s*\n)?\s*\[\/SCENE\]/);

  if (sceneMatch) {
    // Используем захваченные группы, если они есть, иначе значения по умолчанию
    pose = sceneMatch[1] ? sceneMatch[1].trim().replace(/\.$/, '') : pose;
    setting = sceneMatch[2] ? sceneMatch[2].trim().replace(/\.$/, '') : setting;
    console.log(`🖼️ Извлечена сцена: Поза:"${pose}", Обстановка:"${setting}"`);
  } else {
    console.warn('⚠️ Блок [SCENE] в формате [SCENE]\nPose: ...\nSetting: ...\n[/SCENE] не найден. Используются значения по умолчанию.');
  }

  // Удаляем ВЕСЬ блок [SCENE] ... [/SCENE] из текста эссе
  const essayWithoutScene = rawEssay.replace(/\[SCENE\][\s\S]*?\[\/SCENE\][\s\n]*/, '').trim();

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

// Вспомогательная функция, возможно, тоже стоит вынести
async function extractTags(text, dictionary) {
  const lowerText = text.toLowerCase();
  const tags = new Set();

  for (const [tag, data] of Object.entries(dictionary)) {
    if (!data.формы || !Array.isArray(data.формы)) continue;
    for (const form of data.формы) {
      const normalizedForm = form.trim().toLowerCase();
      if (normalizedForm && lowerText.includes(normalizedForm)) {
        tags.add(tag);
        break;
      }
    }
  }

  if (tags.size === 0) {
    ["размышление", "выбор", "осмысление"].forEach(tag => tags.add(tag));
  }

  return Array.from(tags);
}


module.exports = { generateContent };
