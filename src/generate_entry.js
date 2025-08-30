const { generateEssay, generateReflection } = require('./utils/openrouter');
const { readJSON, writeJSON } = require('./utils/fileUtils');
const {
  JOURNAL_PATH,
  TAG_STATS_PATH,
  ANALYSIS_PATH,
  DYNAMIC_TAGS_PATH,
  MAX_RETRIES,
  BASE_DELAY_MS,
} = require('./config');

/**
 * Извлекает теги из текста
 */
function extractTags(text) {
  const commonTags = [
    "судьба", "память", "самоопределение", "голос", "ночь", "мысль",
    "время", "любовь", "жизнь", "грусть", "осознание",
    "свобода", "выбор", "смысл", "одиночество", "ностальгия", "ветер",
    "размышление", "осмысление"
  ];

  const tags = new Set();
  const lowerText = text.toLowerCase();

  for (const tag of commonTags) {
    if (lowerText.includes(tag.replace(/_/g, ' '))) {
      tags.add(tag);
    }
  }

  if (tags.size === 0) {
    ["размышление", "выбор", "осмысление"].forEach(tag => tags.add(tag));
  }

  return Array.from(tags);
}

/**
 * Определяет уровень рефлексии.
 * @param {string} reflectionText - Текст рефлексии.
 * @returns {string} - Уровень рефлексии ("низкий", "средний", "высокий").
 */
function determineReflectionLevel(reflectionText) {
  let level = "средний";
  const levelMatch = reflectionText.match(/Уровень\s*:\s*(.*)$/i);
  if (levelMatch && levelMatch[1]) {
    const extractedLevel = levelMatch[1].trim().toLowerCase();
    if (["глубокий", "высокий", "глубокая", "высокая"].includes(extractedLevel)) {
      level = "высокий";
    } else if (["средний", "средняя"].includes(extractedLevel)) {
      level = "средний";
    } else if (["поверхностный", "низкий", "поверхностная", "низкая"].includes(extractedLevel)) {
      level = "низкий";
    }
  }
  return level;
}

/**
 * Удаляет строку "Уровень: ..." из текста рефлексии.
 * @param {string} reflectionText - Текст рефлексии.
 * @returns {string} - Очищенный текст.
 */
function cleanReflectionText(reflectionText) {
  return reflectionText.replace(/Уровень\s*:\s*.*$/i, '').trim();
}

/**
 * Выполняет функцию с повторными попытками в случае ошибки.
 */
async function withRetry(fn, maxRetries, baseDelay, actionName) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Попытка ${attempt}/${maxRetries} для ${actionName}...`);
      const result = await fn();
      console.log(`✅ ${actionName} успешно завершена на попытке ${attempt}.`);
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ Попытка ${attempt} для ${actionName} не удалась:`, error.message);
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * baseDelay;
        console.log(`⏳ Ожидание ${delay}мс перед следующей попыткой...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`❌ Все ${maxRetries} попыток ${actionName} не удались.`);
  throw lastError;
}

/**
 * Подготавливает данные для новой записи
 */
async function prepareEntryData() {
  console.log("🧠 Подготовка данных для новой записи...");
  let previousSuggestions = "Советы от литературного критика отсутствуют.";
  try {
    const analysisData = await readJSON(ANALYSIS_PATH);
    if (Array.isArray(analysisData.suggestions) && analysisData.suggestions.length > 0) {
      const lastSuggestions = analysisData.suggestions.slice(-3);
      previousSuggestions = lastSuggestions.join('\n');
      console.log(`✅ Загружено ${lastSuggestions.length} последних советов из анализа.`);
    } else {
      console.log("⚠️ В файле анализа нет массива 'suggestions' или он пуст.");
    }
  } catch (error) {
    console.warn("⚠️ Ошибка при загрузке файла литературного анализа:", error.message);
  }

  let criticTags = [];
  try {
    const dynamicTagsData = await readJSON(DYNAMIC_TAGS_PATH);
    if (dynamicTagsData && Array.isArray(dynamicTagsData.tags)) {
      criticTags = dynamicTagsData.tags;
      console.log(`✅ Загружено ${criticTags.length} тегов от критика:`, criticTags);
    } else {
      console.log("⚠️ В файле тегов критика нет поля 'tags' или оно не является массивом.");
    }
  } catch (error) {
    console.warn("⚠️ Ошибка при загрузке файла тегов критика:", error.message);
  }

  console.log("✍️ Генерируем эссе...");
  const essayData = {
    previous_suggestions: previousSuggestions,
    combined_inspiration_tags: [...extractTags(previousSuggestions), ...criticTags].join(', ')
  };
  const rawEssay = await withRetry(() => generateEssay(essayData), MAX_RETRIES, BASE_DELAY_MS, "генерации эссе");
  if (!rawEssay || rawEssay.trim().length < 10) throw new Error(`Подозрительно короткий ответ эссе (длина: ${rawEssay?.length || 0}).`);
  console.log("📄 Длина сырого эссе:", rawEssay.length);

  console.log("💭 Генерируем рефлексию...");
  const rawReflection = await withRetry(() => generateReflection(rawEssay), MAX_RETRIES, BASE_DELAY_MS, "генерации рефлексии");
  if (!rawReflection || rawReflection.trim().length < 10) throw new Error(`Подозрительно короткий ответ рефлексии (длина: ${rawReflection?.length || 0}).`);
  console.log("💭 Длина сырой рефлексии:", rawReflection.length);

  const cleanReflection = cleanReflectionText(rawReflection);
  const fullEntryClean = `${rawEssay}\n\n${cleanReflection}`;

  const staticTags = extractTags(fullEntryClean);
  console.log(`🏷️ Извлечено статических тегов: ${staticTags.length}`, staticTags);

  const allTags = Array.from(new Set([...staticTags, ...criticTags]));
  console.log(`🏷️ Всего уникальных тегов: ${allTags.length}`, allTags);

  const level = determineReflectionLevel(rawReflection);

  return { rawEssay, rawReflection: cleanReflection, cleanEntry: fullEntryClean, staticTags, criticTags, tags: allTags, level };
}

async function loadJournal() {
  const journal = await readJSON(JOURNAL_PATH);
  return Array.isArray(journal) ? journal : [];
}

async function saveJournal(journal) {
  await writeJSON(JOURNAL_PATH, journal);
}

async function loadTagStatistics() {
  return await readJSON(TAG_STATS_PATH);
}

async function updateAndSaveTagStatistics(currentStats, staticTags, criticTags, entryDate) {
  const updatedStats = { ...currentStats };
  const allTagsFromEntry = new Set([...staticTags, ...criticTags]);

  for (const tag of allTagsFromEntry) {
    if (updatedStats[tag]) {
      updatedStats[tag].count += 1;
      if (staticTags.includes(tag) && !updatedStats[tag].types.includes('static')) updatedStats[tag].types.push('static');
      if (criticTags.includes(tag) && !updatedStats[tag].types.includes('critic')) updatedStats[tag].types.push('critic');
    } else {
      updatedStats[tag] = {
        count: 1,
        firstSeen: entryDate,
        lastSeen: entryDate,
        types: []
      };
      if (staticTags.includes(tag)) updatedStats[tag].types.push('static');
      if (criticTags.includes(tag)) updatedStats[tag].types.push('critic');
    }
    updatedStats[tag].lastSeen = entryDate;
  }

  await writeJSON(TAG_STATS_PATH, updatedStats);
  console.log('✅ Статистика тегов обновлена и сохранена.');
}

async function createNewEntry() {
  try {
    const { rawEssay, rawReflection, cleanEntry, staticTags, criticTags, tags, level } = await prepareEntryData();

    const entry = {
      date: new Date().toISOString().split('T')[0],
      entry: cleanEntry,
      tags,
      reflection_level: level,
      raw_essay: rawEssay,
      raw_reflection: rawReflection // очищенный текст без строки "Уровень"
    };

    const journal = await loadJournal();
    journal.push(entry);
    await saveJournal(journal);
    console.log(`✅ Новая запись добавлена. Всего записей: ${journal.length}`);

    const tagStats = await loadTagStatistics();
    await updateAndSaveTagStatistics(tagStats, staticTags, criticTags, entry.date);

  } catch (error) {
    console.error('❌ Критическая ошибка при создании записи:', error);
    throw error;
  }
}

module.exports = { createNewEntry };

if (require.main === module) {
  (async () => {
    try {
      await createNewEntry();
      console.log('🏁 Скрипт завершён успешно.');
    } catch (err) {
      console.error('🏁 Скрипт завершён с ошибкой:', err);
      process.exit(1);
    }
  })();
}
