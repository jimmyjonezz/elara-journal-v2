// src/generate_entry.js
const { generateEssay, generateReflection } = require('./utils/openrouter');
const { readJSON, writeJSON } = require('./utils/fileUtils');
const {
  DATA_DIR,
  JOURNAL_PATH,
  ANALYSIS_PATH,
  DYNAMIC_TAGS_PATH,
  TAG_STATS_PATH,
  MAX_RETRIES,
  BASE_DELAY_MS,
  SEMANTIC_DICT_PATH,
  MOODS_PATH,
  CONTEXTS_PATH
} = require('./config');

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
 * @param {string} text
 * @param {Object} dictionary — предзагруженный словарь
 */
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
    if (!Array.isArray(contexts?.contexts)) {
      throw new Error("Формат contexts.json нарушен: ожидается { contexts: Array<{ context: string }> }");
    }
    const items = contexts.contexts;
    const randomItem = items[Math.floor(Math.random() * items.length)];
    return randomItem.context;
  } catch (err) {
    console.warn('⚠️ Не удалось загрузить contexts.json:', err.message);
    return "Ты сидишь за столом. За окном — тишина.";
  }
}

// --- НОВЫЕ: этапы подготовки данных ---

/**
 * Загружает внешний контекст: советы критика, теги, семантический словарь
 */
async function loadExternalContext() {
  // --- Загрузка советов критика ---
  let previousSuggestions = "Советы от литературного критика отсутствуют.";
  try {
    const analysisData = await readJSON(ANALYSIS_PATH);
    if (!Array.isArray(analysisData?.suggestions)) {
      console.warn("⚠️ analysis.json: поле 'suggestions' отсутствует или не массив. Ожидался: { suggestions: string[] }");
    } else if (analysisData.suggestions.length > 0) {
      const lastSuggestions = analysisData.suggestions.slice(-3);
      previousSuggestions = lastSuggestions.join('\n');
      console.log(`✅ Загружено ${lastSuggestions.length} последних советов из анализа.`);
    }
  } catch (error) {
    console.warn("⚠️ Ошибка при загрузке файла литературного анализа:", error.message);
  }

  // --- Загрузка тегов критика ---
  let criticTags = [];
  try {
    const dynamicTagsData = await readJSON(DYNAMIC_TAGS_PATH);
    if (!Array.isArray(dynamicTagsData?.tags)) {
      console.warn("⚠️ dynamic_tags.json: поле 'tags' отсутствует или не массив. Ожидалось: { tags: string[] }");
    } else {
      criticTags = [...new Set(dynamicTagsData.tags.map(tag => tag.toLowerCase().trim()))];
      console.log(`✅ Загружено ${criticTags.length} тегов от критика:`, criticTags);
    }
  } catch (error) {
    console.warn("⚠️ Ошибка при загрузке файла тегов критика:", error.message);
  }

  // --- Загрузка семантического словаря (один раз) ---
  const semanticDict = await loadSemanticDictionary();

  return { previousSuggestions, criticTags, semanticDict };
}

/**
 * Генерирует эссе и рефлексию
 */
async function generateContent(externalContext, mood, context) {
  const { previousSuggestions, semanticDict, criticTags } = externalContext;

  // Извлекаем теги из советов
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

  // --- Парсинг сцены (устойчивый к отсутствию [/SCENE]) ---
  let pose = "сидит, свернувшись в потрёпанном винтажном кресле, поджав под себя ноги";
  let setting = "тусклая комната, заполненная книгами, последние лучи сентябрьского солнца";
  
  const sceneMatch = rawEssay.match(/\[SCENE\]\s*Поза:\s*([\s\S]*?)\s*Обстановка:\s*([\s\S]*?)(?=\n\n|\n\[|$)/);
  if (sceneMatch) {
    pose = sceneMatch[1].trim().replace(/\.$/, '');
    setting = sceneMatch[2].trim().replace(/\.$/, '');
    console.log(`🖼️ Извлечена сцена: Поза="${pose}", Обстановка="${setting}"`);
  } else {
    console.warn('⚠️ Блок [SCENE] не найден. Используются значения по умолчанию.');
  }
  
  // Удаляем блок [SCENE] из текста
  const essayWithoutScene = rawEssay.replace(/\[SCENE\][\s\S]*?(?=\n\n|\n\[|$)/, '').trim();

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

/**
 * Обрабатывает сцену и извлекает теги из новой записи
 */
async function processSceneAndTags(content, externalContext) {
  const { fullEntryText } = content;
  const { semanticDict, criticTags } = externalContext;

  const staticTags = await extractTags(fullEntryText, semanticDict);
  console.log(`🏷️ Извлечено статических тегов: ${staticTags.length}`, staticTags);

  const allTags = Array.from(new Set([...staticTags, ...criticTags]));
  console.log(`🏷️ Всего уникальных тегов: ${allTags.length}`, allTags);

  return { staticTags, allTags };
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

// --- Функция генерации промпта (временно оставлена здесь, как обсуждалось ранее) ---
// Примечание: в будущем будет вынесена в fileUtils после рефакторинга путей
const fs = require('fs').promises;
const path = require('path');

async function buildImagePrompt(pose, setting) {
  try {
    const templatePath = path.join(__dirname, 'prompt_templates/image.txt');
    let template = await fs.readFile(templatePath, 'utf8');

    let prompt = template
      .replace(/{POSE}/g, pose)
      .replace(/{SETTING}/g, setting);

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

// --- Основная функция ---

/**
 * Подготавливает данные для новой записи
 */
async function prepareEntryData() {
  console.log("🧠 Подготовка данных для новой записи...");

  const externalContext = await loadExternalContext();
  const mood = await getSeasonalMood();
  const context = await getRandomContext();
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
      essayWithoutScene,
      reflectionWithoutLevel,
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
    await fs.writeFile(path.join(__dirname, '../data/latest_image_prompt.txt'), imagePrompt, 'utf8');
    console.log('🖼️ Промпт для изображения сохранён в data/latest_image_prompt.txt');

    const entry = {
      date: new Date().toISOString().split('T')[0],
      season: season,
      mood: { name: mood.name, description: mood.description },
      context: context, // ← сохраняем контекст, использованный при генерации
      entry: fullEntryText,
      tags: allTags,
      reflection_level: level,
      raw_essay: essayWithoutScene,
      raw_reflection: reflectionWithoutLevel
    };

    const journal = await loadJournal();
    journal.push(entry);
    await writeJSON(JOURNAL_PATH, journal);
    console.log(`✅ Новая запись добавлена. Всего записей: ${journal.length}`);

    const tagStats = await readJSON(TAG_STATS_PATH);
    await updateAndSaveTagStatistics(tagStats, staticTags, criticTags, entry.date);

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
