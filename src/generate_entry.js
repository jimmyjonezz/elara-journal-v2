// src/generate_entry.js
const { generateEssay, generateReflection } = require('./utils/openrouter');
const { readJSON, writeJSON } = require('./utils/fileUtils');
const {
  DATA_DIR,
  JOURNAL_PATH,
  ANALYSIS_PATH,
  DYNAMIC_TAGS_PATH,
  TAG_STATS_PATH,
  PROMPT_TEMPLATE_PATH,
  MAX_RETRIES,
  BASE_DELAY_MS,
  SEMANTIC_DICT_PATH,
  MOODS_PATH,
  CONTEXTS_PATH
} = require('./config');

const path = require('path');
const fs = require('fs').promises;

// 🔹 Пути к новым конфигурационным файлам
//const SEMANTIC_DICT_PATH = path.join(__dirname, 'config', 'semantic-dictionary.json');
//const MOODS_PATH = path.join(__dirname, 'config', 'moods.json');
//const CONTEXTS_PATH = path.join(__dirname, 'config', 'contexts.json');

// --- Вспомогательные функции ---

/**
 * Определяет текущий сезон по дате (северное полушарие)
 */
function getCurrentSeason() {
  const month = new Date().getMonth() + 1; // 1–12
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/**
 * Загружает семантический словарь
 */
async function loadSemanticDictionary() {
  try {
    const dict = await readJSON(SEMANTIC_DICT_PATH);
    return dict;
  } catch (error) {
    console.warn('⚠️ Не удалось загрузить семантический словарь:', error.message);
    return {};
  }
}

/**
 * Извлекает теги из текста с использованием семантического словаря
 */
async function extractTags(text) {
  const dictionary = await loadSemanticDictionary();
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

/**
 * Определяет уровень рефлексии
 */
function determineReflectionLevel(reflectionText) {
  let level = "средний";
  const levelMatch = reflectionText.match(/Уровень\s*:\s*(.*)$/i);
  if (levelMatch && levelMatch[1]) {
    const extractedLevel = levelMatch[1].trim().toLowerCase().replace(/[^\wа-яё]/gi, '');
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
 * Удаляет строку "Уровень: ..." из текста рефлексии
 */
function cleanReflectionText(reflectionText) {
  return reflectionText.replace(/Уровень\s*:\s*.*$/i, '').trim();
}

/**
 * Выполняет функцию с повторными попытками
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
 * Загружает журнал
 */
async function loadJournal() {
  const journal = await readJSON(JOURNAL_PATH);
  return Array.isArray(journal) ? journal : [];
}

/**
 * Получает настроение, соответствующее текущему сезону
 */
async function getSeasonalMood() {
  try {
    const moods = await readJSON(MOODS_PATH);
    const season = getCurrentSeason();
    const seasonMoods = moods[season];

    if (!seasonMoods || !Array.isArray(seasonMoods) || seasonMoods.length === 0) {
      throw new Error(`Нет настроений для сезона: ${season}`);
    }

    const randomMood = seasonMoods[Math.floor(Math.random() * seasonMoods.length)];
    return {
      name: randomMood.mood,
      description: randomMood.description,
      season: season
    };
  } catch (err) {
    console.warn('⚠️ Не удалось загрузить сезонное настроение:', err.message);
    return { name: "still", description: "Like dust in sunlight", season: "winter" };
  }
}

/**
 * Получает случайный контекст из contexts.json
 */
async function getRandomContext() {
  try {
    const contexts = await readJSON(CONTEXTS_PATH);
    const items = contexts.contexts;
    const randomItem = items[Math.floor(Math.random() * items.length)];
    return randomItem.context;
  } catch (err) {
    console.warn('⚠️ Не удалось загрузить contexts.json:', err.message);
    return "Ты сидишь за столом. За окном — тишина.";
  }
}

/**
 * Загружает шаблон изображения и подставляет позу и обстановку
 */
async function buildImagePrompt(pose, setting) {
  try {
    const templatePath = path.join(__dirname, 'src/prompt_templates/image.txt');
    let template = await fs.readFile(templatePath, 'utf8');

    // Поддержка плейсхолдеров
    let prompt = template
      .replace(/{POSE}/g, pose)
      .replace(/{SETTING}/g, setting);

    // Если шаблон не содержит плейсхолдеров — fallback
    if (prompt === template) {
      console.warn('⚠️ Шаблон image.txt не содержит {POSE}/{SETTING}. Используется fallback.');
      prompt = `Персонаж: 24-летняя женщина с длинными волнистыми каштановыми волосами, небрежно собранными сзади. ${pose}. На ней горчично-жёлтый ребристый кардиган с маленькими пуговицами и длинная текстурированная коричневая юбка. Её выражение лица задумчивое, спокойное, с намёком на неразрешённое напряжение.
Обстановка: ${setting}
Стиль: кинематографический реализм, мягкий свет, глубина резкости.
Атмосфера: меланхоличная, интимная, вне времени, наполненная эмоциональными оттенками.
Стиль: гиперреалистичная живописная иллюстрация, мягкое естественное освещение, небольшая глубина резкости, приглушённые землистые тона с акцентами «золотого часа».`;
    }

    return prompt.trim();
  } catch (err) {
    console.warn('⚠️ Не удалось загрузить image.txt, используется минимальный шаблон:', err.message);
    return `A 24-year-old woman with long wavy chestnut hair, sitting in a vintage armchair, thoughtful expression, soft golden hour lighting, melancholic atmosphere, cinematic realism, hyperrealistic painting style. Pose: ${pose}. Setting: ${setting}.`;
  }
}

// --- Основная логика ---

/**
 * Подготавливает данные для новой записи
 */
async function prepareEntryData() {
  console.log("🧠 Подготовка данных для новой записи...");

  // --- Загрузка советов критика ---
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

  // --- Загрузка тегов критика ---
  let criticTags = [];
  try {
    const dynamicTagsData = await readJSON(DYNAMIC_TAGS_PATH);
    if (dynamicTagsData && Array.isArray(dynamicTagsData.tags)) {
      criticTags = [...new Set(dynamicTagsData.tags.map(tag => tag.toLowerCase().trim()))];
      console.log(`✅ Загружено ${criticTags.length} тегов от критика:`, criticTags);
    } else {
      console.log("⚠️ В файле тегов критика нет поля 'tags' или оно не является массивом.");
    }
  } catch (error) {
    console.warn("⚠️ Ошибка при загрузке файла тегов критика:", error.message);
  }

  // --- Получение сезонного настроения и контекста ---
  const mood = await getSeasonalMood();
  const context = await getRandomContext();
  console.log(`🎭 Текущее настроение: ${mood.name} (${mood.season})`);
  console.log(`📖 Случайный контекст: ${context.substring(0, 60)}...`);

  // --- Генерация эссе ---
  console.log("✍️ Генерируем эссе...");
  
  // Загружаем словарь один раз
  const semanticDict = await loadSemanticDictionary();
  
  // Извлекаем теги из советов
  const staticInspirationTags = await extractTags(previousSuggestions);
  
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

  // --- 🔹 Парсинг сцены ---
  let pose = "сидит, свернувшись в потрёпанном винтажном кресле, поджав под себя ноги";
  let setting = "тусклая комната, заполненная книгами, последние лучи сентябрьского солнца";

  const sceneMatch = rawEssay.match(/\[SCENE\]\s*Поза:\s*(.+?)\s*Обстановка:\s*(.+?)\s*\[\/SCENE\]/s);
  if (sceneMatch) {
    pose = sceneMatch[1].trim().replace(/\.$/, '');
    setting = sceneMatch[2].trim().replace(/\.$/, '');
    console.log(`🖼️ Извлечена сцена: Поза="${pose}", Обстановка="${setting}"`);
  } else {
    console.warn('⚠️ Блок [SCENE] не найден. Используются значения по умолчанию.');
  }

  // Удаляем [SCENE] из текста
  const cleanEssay = rawEssay.replace(/\[SCENE\].*?\[\/SCENE\]/gs, '').trim();

  // --- Генерация рефлексии ---
  console.log("💭 Генерируем рефлексию...");
  const rawReflection = await withRetry(() => generateReflection(cleanEssay), MAX_RETRIES, BASE_DELAY_MS, "генерации рефлексии");
  if (!rawReflection || rawReflection.trim().length < 10) {
    throw new Error(`Подозрительно короткий ответ рефлексии (длина: ${rawReflection?.length || 0}).`);
  }
  console.log("💭 Длина сырой рефлексии:", rawReflection.length);

  const cleanReflection = cleanReflectionText(rawReflection);
  const fullEntryClean = `${cleanEssay}\n\n${cleanReflection}`;

  // --- Извлечение тегов из новой записи ---
  const staticTags = await extractTags(fullEntryClean);
  console.log(`🏷️ Извлечено статических тегов: ${staticTags.length}`, staticTags);

  // --- Объединение тегов ---
  const allTags = Array.from(new Set([...staticTags, ...criticTags]));
  console.log(`🏷️ Всего уникальных тегов: ${allTags.length}`, allTags);

  // --- Определение уровня рефлексии ---
  const level = determineReflectionLevel(rawReflection);

  // --- 🔹 Генерация промпта для изображения ---
  const imagePrompt = await buildImagePrompt(pose, setting);
  await fs.writeFile(path.join(__dirname, '../data/latest_image_prompt.txt'), imagePrompt, 'utf8');
  console.log('🖼️ Промпт для изображения сохранён в data/latest_image_prompt.txt');

  return {
    rawEssay: cleanEssay,
    rawReflection: cleanReflection,
    cleanEntry: fullEntryClean,
    staticTags,
    criticTags,
    tags: allTags,
    level,
    season: mood.season
  };
}

/**
 * Обновляет статистику тегов
 */
async function updateAndSaveTagStatistics(currentStats, staticTags, criticTags, entryDate) {
  const updatedStats = { ...currentStats };
  const normalizedStaticTags = staticTags.map(tag => tag.toLowerCase());
  const normalizedCriticTags = criticTags.map(tag => tag.toLowerCase());
  const allTagsFromEntry = new Set([...normalizedStaticTags, ...normalizedCriticTags]);

  for (const tag of allTagsFromEntry) {
    if (updatedStats[tag]) {
      updatedStats[tag].count += 1;
      updatedStats[tag].lastSeen = entryDate;
      if (normalizedStaticTags.includes(tag) && !updatedStats[tag].types.includes('static')) {
        updatedStats[tag].types.push('static');
      }
      if (normalizedCriticTags.includes(tag) && !updatedStats[tag].types.includes('critic')) {
        updatedStats[tag].types.push('critic');
      }
    } else {
      updatedStats[tag] = {
        count: 1,
        firstSeen: entryDate,
        lastSeen: entryDate,
        types: []
      };
      if (normalizedStaticTags.includes(tag)) updatedStats[tag].types.push('static');
      if (normalizedCriticTags.includes(tag)) updatedStats[tag].types.push('critic');
    }
  }

  await writeJSON(TAG_STATS_PATH, updatedStats);
  console.log('✅ Статистика тегов обновлена и сохранена.');
}

// --- Основная функция ---
async function generateEntry() {
  try {
    const {
      rawEssay,
      rawReflection,
      cleanEntry,
      staticTags,
      criticTags,
      tags,
      level,
      season
    } = await prepareEntryData();

    const entry = {
      date: new Date().toISOString().split('T')[0],
      season: season,
      entry: cleanEntry,
      tags,
      reflection_level: level,
      raw_essay: rawEssay,
      raw_reflection: rawReflection
    };

    const journal = await loadJournal();
    journal.push(entry);
    await writeJSON(JOURNAL_PATH, journal);
    console.log(`✅ Новая запись добавлена. Всего записей: ${journal.length}`);

    const tagStats = await readJSON(TAG_STATS_PATH);
    await updateAndSaveTagStatistics(tagStats, staticTags, criticTags, entry.date);

    // 🔹 Опционально: экспорт в Obsidian
    /*
    try {
      const { exportToObsidian } = require('../export_to_obsidian');
      await exportToObsidian();
      console.log('📂 Записи синхронизированы с Obsidian.');
    } catch (e) {
      console.warn('⚠️ Не удалось экспортировать в Obsidian:', e.message);
    }
    */

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
