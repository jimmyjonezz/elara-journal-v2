// src/generate_entry.js
const fs = require('fs/promises');
const path = require('path');
const { generateEssay, generateReflection } = require('./utils/openrouter');

// Пути к файлам данных
const JOURNAL_PATH = path.join(__dirname, '../data/journal.json');
const TAG_STATS_PATH = path.join(__dirname, '../data/tag_statistics.json');
const ANALYSIS_PATH = path.join(__dirname, '../data/literary_analysis.json');
// --- Добавлено: Путь к файлу тегов критика ---
const DYNAMIC_TAGS_PATH = path.join(__dirname, '../data/dynamic_tags.json');
// --- Конец добавления ---

// Константы для повторных попыток
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

/**
 * Гарантирует существование директории для файла.
 * @param {string} filePath - Путь к файлу.
 */
async function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  try {
    await fs.access(dirname);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.mkdir(dirname, { recursive: true });
    } else {
      throw err;
    }
  }
}

/**
 * Извлекает теги из текста на основе заранее определенного списка.
 * @param {string} text - Текст для анализа.
 * @returns {string[]} - Массив тегов.
 */
function extractTags(text) {
  const commonTags = [
    "судьба", "память", "самоопределение", "голос", "ночь", "мысль",
    "время", "любовь", "жизнь", "грусть", "осознание",
    "свобода", "выбор", "смысл", "одиночество", "ностальгия", "ветер", "размышление", "внутренний_диалог", "осмысление"
  ];

  const tags = new Set();
  const lowerText = text.toLowerCase();

  for (const tag of commonTags) {
    if (lowerText.includes(tag.replace(/_/g, ' '))) {
      tags.add(tag);
    }
  }

  if (tags.size === 0) {
    const fallbackTags = ["размышление", "внутренний_диалог", "осмысление"];
    fallbackTags.forEach(tag => tags.add(tag));
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
 * @param {Function} fn - Асинхронная функция для выполнения.
 * @param {number} maxRetries - Максимальное количество попыток.
 * @param {number} baseDelay - Базовая задержка между попытками (мс).
 * @param {string} actionName - Название действия для логов.
 * @returns {Promise<any>} - Результат выполнения функции.
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
 * Подготавливает данные для новой записи.
 * @returns {Promise<{rawEssay: string, rawReflection: string, cleanEntry: string, staticTags: string[], criticTags: string[], tags: string[], level: string}>}
 */
async function prepareEntryData() {
  console.log("🧠 Подготовка данных для новой записи...");
  
  // Загрузка советов из литературного анализа
  let previousSuggestions = "Советы от литературного критика отсутствуют.";
  try {
    console.log(`Попытка загрузки советов из: ${ANALYSIS_PATH}`);
    const analysisData = await fs.readFile(ANALYSIS_PATH, 'utf8');
    if (analysisData.trim()) {
      const parsedAnalysis = JSON.parse(analysisData);
      if (Array.isArray(parsedAnalysis.suggestions) && parsedAnalysis.suggestions.length > 0) {
        const lastSuggestions = parsedAnalysis.suggestions.slice(-3);
        previousSuggestions = lastSuggestions.join('\n');
        console.log(`✅ Загружено ${lastSuggestions.length} последних советов из анализа.`);
      } else {
         console.log("⚠️ В файле анализа нет массива 'suggestions' или он пуст.");
      }
    } else {
       console.log("⚠️ Файл анализа пуст.");
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn("⚠️ Ошибка при загрузке файла литературного анализа:", err.message);
    }
  }

  // --- Добавлено: Загрузка тегов, сгенерированных критиком ---
  let criticTags = [];
  try {
    console.log(`Попытка загрузки тегов критика из: ${DYNAMIC_TAGS_PATH}`);
    const dynamicTagsData = await fs.readFile(DYNAMIC_TAGS_PATH, 'utf8');
    const parsedTags = JSON.parse(dynamicTagsData);
    if (parsedTags && Array.isArray(parsedTags.tags)) {
        criticTags = parsedTags.tags;
        console.log(`✅ Загружено ${criticTags.length} тегов от критика:`, criticTags);
    } else {
       console.log("⚠️ В файле тегов критика нет поля 'tags' или оно не является массивом.");
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
        console.log("ℹ️ Файл тегов критика (dynamic_tags.json) не найден. Будут использованы только статические теги.");
    } else {
        console.warn("⚠️ Ошибка при загрузке файла тегов критика:", err.message);
    }
  }
  // --- Конец добавления ---

  // Генерируем эссе
  console.log("✍️ Генерируем эссе...");
  // --- Обновлено: Передаем и статические, и теги критика ---
  const essayData = {
    previous_suggestions: previousSuggestions,
    // Объединяем статические и теги критика для передачи в промпт
    combined_inspiration_tags: [...extractTags(previousSuggestions), ...criticTags].join(', ')
  };
  // --- Конец обновления ---
  const rawEssay = await withRetry(
    () => generateEssay(essayData),
    MAX_RETRIES,
    BASE_DELAY_MS,
    "генерации эссе"
  );
  
  if (!rawEssay || rawEssay.trim().length < 10) {
     throw new Error(`Получен подозрительно короткий или пустой ответ для эссе (длина: ${rawEssay?.length || 0}).`);
  }
  console.log("📄 Длина сырого эссе:", rawEssay.length);

  // Генерируем рефлексию
  console.log("💭 Генерируем рефлексию...");
  const rawReflection = await withRetry(
    () => generateReflection(rawEssay),
    MAX_RETRIES,
    BASE_DELAY_MS,
    "генерации рефлексии"
  );

  if (!rawReflection || rawReflection.trim().length < 10) {
     throw new Error(`Получен подозрительно короткий или пустой ответ для рефлексии (длина: ${rawReflection?.length || 0}).`);
  }
  console.log("💭 Длина сырой рефлексии:", rawReflection.length);

  // Обрабатываем тексты
  console.log("🧮 Обрабатываем тексты для записи...");
  const determinedLevel = determineReflectionLevel(rawReflection);
  const cleanReflection = cleanReflectionText(rawReflection);
  const fullEntryClean = `${rawEssay}\n\n${cleanReflection}`;
  console.log("📄 Длина текста для тегирования:", fullEntryClean.length);

  // --- Обновлено: Формируем теги ---
  // Извлекаем статические теги из полного текста записи
  const staticTags = extractTags(fullEntryClean);
  console.log(`🏷️ Извлечено статических тегов: ${staticTags.length}`, staticTags);

  // Объединяем статические теги и теги критика как финальный список
  // const dynamicTags = extractSimpleDynamicTags(fullEntryClean); // Удалено
  const allUniqueTags = Array.from(new Set([...staticTags, ...criticTags])); // Используем criticTags вместо dynamicTags
  console.log(`🏷️ Всего уникальных тегов (статические + критика): ${allUniqueTags.length}`, allUniqueTags);
  // --- Конец обновления ---

  console.log(`📊 Уровень рефлексии: ${determinedLevel}`);

  // Возвращаем все необходимые данные
  return {
    rawEssay,
    rawReflection,
    cleanEntry: fullEntryClean,
    staticTags, // Возвращаем отдельно для статистики
    // dynamicTags, // Удалено
    criticTags, // Возвращаем теги критика отдельно
    tags: allUniqueTags, // Итоговый массив тегов
    level: determinedLevel
  };
}

/**
 * Загружает существующий журнал.
 * @returns {Promise<Array>} - Массив записей.
 */
async function loadJournal() {
  console.log("📖 Загружаем существующий журнал...");
  let journal = [];
  try {
    const data = await fs.readFile(JOURNAL_PATH, 'utf8');
    const parsedData = JSON.parse(data);
    if (Array.isArray(parsedData)) {
      journal = parsedData;
      console.log(`✅ Загружено ${journal.length} существующих записей.`);
    } else {
      console.log("⚠️ Журнал поврежден: данные не являются массивом. Создаем новый.");
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.log("⚠️ Ошибка при чтении журнала. Создаем новый.", err.message);
    }
  }
  return journal;
}

/**
 * Сохраняет журнал.
 * @param {Array} journal - Массив записей.
 */
async function saveJournal(journal) {
  await ensureDirectoryExistence(JOURNAL_PATH);
  await fs.writeFile(JOURNAL_PATH, JSON.stringify(journal, null, 2));
  console.log("✅ Файл журнала успешно записан.");
}

/**
 * Загружает текущую статистику тегов из файла.
 * @returns {Promise<Object>} Объект со статистикой тегов.
 */
async function loadTagStatistics() {
  try {
    const data = await fs.readFile(TAG_STATS_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn("⚠️ Ошибка при чтении статистики тегов. Создаем новую.", err.message);
    }
    return {};
  }
}

/**
 * Обновляет и сохраняет статистику тегов.
 * @param {Object} currentStats - Текущая статистика.
 * @param {string[]} staticTags - Статические теги новой записи.
 * @param {string[]} criticTags - Теги критика новой записи.
 * @param {string} entryDate - Дата новой записи.
 */
async function updateAndSaveTagStatistics(currentStats, staticTags, criticTags, entryDate) {
  const updatedStats = { ...currentStats };
  // Объединяем теги из текущей записи (теперь используем staticTags и criticTags)
  const allTagsFromEntry = new Set([...staticTags, ...criticTags]);

  console.log(`📊 [Статистика] Обновляем статистику для ${allTagsFromEntry.size} уникальных тегов записи от ${entryDate}...`);

  for (const tag of allTagsFromEntry) {
    if (updatedStats[tag]) {
      updatedStats[tag].count += 1;
      // Отслеживаем, в каких типах тегов он появился
      if (staticTags.includes(tag) && !updatedStats[tag].types.includes('static')) {
        updatedStats[tag].types.push('static');
      }
      // Теперь обновляем тип 'critic' вместо 'dynamic'
      if (criticTags.includes(tag) && !updatedStats[tag].types.includes('critic')) {
        updatedStats[tag].types.push('critic');
      }
    } else {
      // Новый тег
      updatedStats[tag] = {
        count: 1,
        firstSeen: entryDate,
        lastSeen: entryDate,
        types: []
      };
      if (staticTags.includes(tag)) updatedStats[tag].types.push('static');
      // Теперь добавляем тип 'critic' вместо 'dynamic'
      if (criticTags.includes(tag)) updatedStats[tag].types.push('critic');
    }
    // Всегда обновляем дату последнего появления
    updatedStats[tag].lastSeen = entryDate;
  }

  console.log("💾 [Статистика] Подготовленные данные для сохранения:", JSON.stringify(updatedStats, null, 2));

  try {
    await ensureDirectoryExistence(TAG_STATS_PATH);
    await fs.writeFile(TAG_STATS_PATH, JSON.stringify(updatedStats, null, 2));
    console.log("✅ [Статистика] Статистика тегов обновлена и сохранена.");
  } catch (err) {
    console.error("❌ [Статистика] Ошибка при сохранении статистики тегов:", err.message);
  }
}


/**
 * Создает новую запись в журнале.
 */
async function createNewEntry() {
  console.log("📝 Генерируем новую запись от Элары...");

  try {
    // Подготавливаем данные записи
    const { rawEssay, rawReflection, cleanEntry, staticTags, criticTags, tags, level } = await prepareEntryData(); // Извлекаем criticTags

    // Формируем объект записи
    const entry = {
      date: new Date().toISOString().split('T')[0],
      entry: cleanEntry,
      tags: tags,
      reflection_level: level,
      raw_essay: rawEssay,
      raw_reflection: rawReflection
    };

    // Загружаем существующий журнал
    const journal = await loadJournal();

    // --- НОВОЕ: Загружаем статистику тегов ---
    const tagStats = await loadTagStatistics();
    // --- КОНЕЦ НОВОГО ---

    // Добавляем новую запись
    console.log("➕ Добавляем новую запись в память...");
    journal.push(entry);
    console.log(`✅ Запись добавлена. Всего записей в памяти: ${journal.length}`);

    // Сохраняем журнал
    await saveJournal(journal);

    // --- НОВОЕ: Обновляем и сохраняем статистику тегов ---
    // Передаем staticTags и criticTags вместо staticTags и dynamicTags
    await updateAndSaveTagStatistics(tagStats, staticTags, criticTags, entry.date);
    // --- КОНЕЦ НОВОГО ---

    console.log("✅ Запись успешно добавлена в журнал.");

  } catch (error) {
    console.error("❌ ❌ ❌ КРИТИЧЕСКАЯ ОШИБКА при создании записи:", error.message);
    console.error("Стек вызовов:", error.stack);
    throw error;
  } finally {
    console.log("🏁 Функция createNewEntry завершена.");
  }
}

// Экспорт и запуск
module.exports = { createNewEntry };

if (require.main === module) {
  console.log("🚀 Скрипт запущен напрямую.");
  (async () => {
    try {
      await createNewEntry();
      console.log("🏁 Скрипт завершен успешно.");
    } catch (err) {
      console.error("🏁 Скрипт завершен с ошибкой:", err);
      process.exit(1);
    }
  })();
}
