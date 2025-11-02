// src/core/entryGenerator.js
const { generateEssay, generateReflection } = require('../utils/openrouter');
const { readJSON, writeJSON } = require('../utils/fileUtils');
const {
  DATA_DIR,
  JOURNAL_PATH,
  ANALYSIS_PATH,
  TAG_STATS_PATH,
  MAX_RETRIES,
  BASE_DELAY_MS,
  SEMANTIC_DICT_PATH,
  MOODS_PATH,
  CONTEXTS_PATH
} = require('../config');

// --- Импорты из новых модулей ---
const { getCurrentSeason } = require('../utils/dateUtils');
const { extractTags, determineReflectionLevel, cleanReflectionText } = require('../utils/textProcessor');
const { parseScene } = require('../utils/sceneParser');
const { withRetry } = require('../utils/retryHandler');
const { buildImagePrompt } = require('../utils/imagePromptBuilder');
const { loadJournal, loadExternalContext, getSeasonalMood, getAndRemoveFirstContext, loadSemanticDictionary } = require('../data/dataLoader');
const { processSceneAndTags } = require('../tagging/tagProcessor');
const { generateContent } = require('../generation/contentGenerator');

// --- Основная функция подготовки данных ---

/**
 * Подготавливает данные для новой записи
 */
async function prepareEntryData() {
  console.log("🧠 Подготовка данных для новой записи...");

  const externalContext = await loadExternalContext();
  const mood = await getSeasonalMood();
  const context = await getAndRemoveFirstContext();
  console.log(`🎭 Текущее настроение: ${mood.name} (${mood.season})`);
  console.log(`📖 Случайный контекст: ${context.substring(0, 60)}...`);

  const content = await generateContent(externalContext, mood, context);
  const tagData = await processSceneAndTags(content, externalContext);
  const finalData = await finalizeEntryData(content, externalContext, mood);

  return {
    ...content,
    ...tagData,
    ...finalData,
    season: mood.season,
    mood: {                   // ← добавить это
      name: mood.name,
      description: mood.description
    },
    context,
    criticTags: externalContext.criticTags
  };
}

/**
 * Финализирует данные записи
 */
async function finalizeEntryData(content, externalContext, mood) {
  const { reflectionWithoutLevel, pose, setting } = content;
  const level = determineReflectionLevel(reflectionWithoutLevel);

  // Промпт для изображения — возвращаем, но не сохраняем здесь
  const imagePrompt = await buildImagePrompt(pose, setting);

  return { level, imagePrompt };
}

/**
 * Обновляет статистику тегов
 */
async function updateAndSaveTagStatistics(currentStats, staticTags, criticTagsFromCurrentRun, criticTagsFromAnalysis, entryDate) {
async function updateAndSaveTagStatistics(currentStats, staticTags, criticTagsFromAnalysis, entryDate) {
  // staticTags: из новой записи (извлечённые теги из эссе)
  // criticTagsFromAnalysis: из literary_analysis.json (из поля tags_for_search)

  const normalizedStaticTags = staticTags.map(tag => tag.toLowerCase());
  const normalizedCriticTagsFromAnalysis = (criticTagsFromAnalysis || []).map(tag => tag.toLowerCase());

  // Объединяем все теги для обновления статистики
  const allTagsFromEntry = new Set([
    ...normalizedStaticTags,
    ...normalizedCriticTagsFromAnalysis
  ]);

  const updatedStats = { ...currentStats };

  for (const tag of allTagsFromEntry) {
    if (updatedStats[tag]) {
      updatedStats[tag].count += 1;
      updatedStats[tag].lastSeen = entryDate;
      // Добавляем типы 'static' или 'critic', если их ещё нет
      if (normalizedStaticTags.includes(tag) && !updatedStats[tag].types.includes('static')) {
        updatedStats[tag].types.push('static');
      }
      if (normalizedCriticTagsFromAnalysis.includes(tag) && !updatedStats[tag].types.includes('critic')) {
        updatedStats[tag].types.push('critic');
      }
    } else {
      // Создаём новую запись для тега
      updatedStats[tag] = {
        count: 1,
        firstSeen: entryDate,
        lastSeen: entryDate,
        types: []
      };
      // Присваиваем тип в зависимости от источника
      if (normalizedStaticTags.includes(tag)) {
        updatedStats[tag].types.push('static');
      }
      if (normalizedCriticTagsFromAnalysis.includes(tag)) {
        updatedStats[tag].types.push('critic');
      }
    }
  }

  await writeJSON(TAG_STATS_PATH, updatedStats);
  console.log('✅ Статистика тегов обновлена и сохранена.');
}

// --- Основная функция ---
async function generateEntry() {
  try {
    const {
      essayWithoutScene,
      reflectionWithoutLevel, // <-- Извлекаем
      fullEntryText,
      staticTags,
      criticTags,
      allTags,
      level,
      season,
      mood,
      context,
      imagePrompt
    } = await prepareEntryData();

    // 🔹 Сохранение промпта изображения — теперь здесь, без побочного эффекта в prepareEntryData
    const fs = require('fs').promises;
    const path = require('path');
    await fs.writeFile(path.join(__dirname, '../../data/latest_image_prompt.txt'), imagePrompt, 'utf8');
    console.log('🖼️ Промпт для изображения сохранён в data/latest_image_prompt.txt');

    const entry = {
      date: new Date().toISOString().split('T')[0],
      season: season,
      mood: { name: mood.name, description: mood.description },
      context: context, // ← сохраняем контекст, использованный при генерации
      entry: fullEntryText, // <-- Старое поле: эссе + рефлексия
      raw_essay: essayWithoutScene, // <-- Уже есть
      raw_reflection: reflectionWithoutLevel, // <-- НОВОЕ ПОЛЕ: только рефлексия
      tags: allTags,
      reflection_level: level,
      // ... другие поля ...
    };

    const journal = await loadJournal();
    journal.push(entry);
    await writeJSON(JOURNAL_PATH, journal);
    console.log(`✅ Новая запись добавлена. Всего записей: ${journal.length}`);

    const tagStats = await readJSON(TAG_STATS_PATH);
    // --- НОВОЕ: чтение tags_for_search из literary_analysis.json ---
    let tagsFromAnalysis = [];
    try {
      const analysisData = await readJSON(ANALYSIS_PATH);
      if (analysisData && Array.isArray(analysisData.tags_for_search)) {
        tagsFromAnalysis = analysisData.tags_for_search;
        console.log(`🏷️ Теги из анализа для статистики:`, tagsFromAnalysis);
      } else {
        console.log('⚠️ В literary_analysis.json нет поля tags_for_search или оно не массив.');
      }
    } catch (e) {
      console.warn('⚠️ Ошибка чтения literary_analysis.json для обновления статистики:', e.message);
      // Не останавливаем процесс, просто не добавляем теги из анализа
    }
    await updateAndSaveTagStatistics(tagStats, staticTags, criticTags, tagsFromAnalysis, entry.date);

  } catch (error) {
    console.error('❌ Критическая ошибка при создании записи:', error);
    throw error;
  }
}

module.exports = { generateEntry };

// --- Запуск ---
if (require.main === module) {
  (async () => {
    try {
      await generateEntry();
      console.log('🏁 Скрипт завершён успешно.');
    } catch (err) {
      console.error('🏁 Скрипт завершён с ошибкой:', err);
      process.exit(1);
    }
  })();
}
