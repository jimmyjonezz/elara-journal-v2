// src/generate_entry.js
const fs = require('fs/promises');
const path = require('path');
const { generateEssay, generateReflection } = require('./utils/openrouter');

// Пути к файлам данных
const JOURNAL_PATH = path.join(__dirname, '../data/journal.json');
const TAG_STATS_PATH = path.join(__dirname, '../data/tag_statistics.json');
const ANALYSIS_PATH = path.join(__dirname, '../data/literary_analysis.json');

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
 * Извлекает простые динамические теги из текста.
 * @param {string} text - Текст для анализа.
 * @returns {string[]} - Массив динамически извлеченных тегов.
 */
function extractSimpleDynamicTags(text) {
    // Расширенный и уточнённый список стоп-слов (только русские)
  const stopWords = new Set([
    // Основные предлоги, союзы, частицы
    "и", "в", "на", "с", "к", "по", "но", "за", "о", "от", "для", "про", "под", "со", "из",
    // Местоимения
    "я", "мы", "ты", "он", "она", "оно", "они",
    "меня", "тебя", "его", "нее", "нас", "вас", "их",
    "мне", "тебе", "ему", "нам", "вам", "им",
    "мной", "мною", "тобой", "тобою", "ним", "ней", "нами", "вами", "ими",
    "мой", "моя", "моё", "мои", "твой", "твоя", "твоё", "твои",
    "её", "его", "их", "наш", "наша", "наше", "наши", "ваш", "ваша", "ваше", "ваши",
    "себя", "себе", "собой", "собою",
    // Относительные местоимения
    "который", "которая", "которое", "которые",
    // Вопросительные слова
    "кто", "что", "какой", "чей", "где", "куда", "откуда", "когда", "почему", "зачем",
    // Указательные и определительные слова
    "этот", "эта", "это", "эти", "тот", "та", "те",
    "весь", "вся", "всё", "все", "всех", "всем", "всеми", "вся", "всю", "всею",
    "сам", "сама", "само", "сами",
    // Наречия и частицы
    "не", "же", "бы", "ли", "ль", "уже", "ещё", "только", "даже", "всего", "лишь",
    "очень", "более", "менее", "слишком", "довольно", "достаточно",
    // Другие служебные слова
    "быть", "как", "то", "это", "было", "него", "них", "нее", "ими", "ним", "так", "его", "или",
    "также", "тоже", "зато", "однако"
  ]);
  
  // Извлекаем слова
  const words = text.toLowerCase().match(/[а-яёa-z]+/g) || [];
  
  // Подсчитываем частоту слов, исключая стоп-слова
  const wordCount = {};
  words.forEach(word => {
    if (!stopWords.has(word)) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
  });

  // Сортируем по частоте и формируем теги (увеличен минимальный порог)
  const sortedWords = Object.entries(wordCount).sort((a, b) => b[1] - a[1]);
  // const minFrequency = 1; // Старое значение
  const minFrequency = 2; // Новое значение для более значимых тегов
  
  const dynamicTags = [];
  for (const [word, count] of sortedWords) {
    if (count >= minFrequency) {
      dynamicTags.push(word);
    }
  }

  return Array.from(new Set(dynamicTags)); // Убираем дубликаты на случай
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
 * @returns {Promise<{rawEssay: string, rawReflection: string, cleanEntry: string, staticTags: string[], dynamicTags: string[], tags: string[], level: string}>}
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

  // Генерируем эссе
  console.log("✍️ Генерируем эссе...");
  const essayData = { previous_suggestions: previousSuggestions };
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

  // Гибридное тегирование
  const staticTags = extractTags(fullEntryClean);
  console.log(`🏷️ Извлечено статических тегов: ${staticTags.length}`);

  const dynamicTags = extractSimpleDynamicTags(fullEntryClean);
  console.log(`🏷️ Извлечено динамических тегов: ${dynamicTags.length}`);
  
  const allUniqueTags = Array.from(new Set([...staticTags, ...dynamicTags]));
  console.log(`🏷️ Всего уникальных тегов: ${allUniqueTags.length}`);

  console.log(`📊 Уровень рефлексии: ${determinedLevel}`);

  return {
    rawEssay,
    rawReflection,
    cleanEntry: fullEntryClean,
    staticTags,
    dynamicTags,
    tags: allUniqueTags,
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
 * Обновляет и сохраняет статистику тегов (с улучшенным логированием).
 * @param {Object} currentStats - Текущая статистика.
 * @param {string[]} staticTags - Статические теги новой записи.
 * @param {string[]} dynamicTags - Динамические теги новой записи.
 * @param {string} entryDate - Дата новой записи.
 */
async function updateAndSaveTagStatistics(currentStats, staticTags, dynamicTags, entryDate) {
  console.log("📊 [Статистика] Начинаем обновление статистики тегов...");
  
  // Создаем копию текущей статистики
  const updatedStats = { ...currentStats };
  
  // Объединяем теги из текущей записи
  const allTagsFromEntry = new Set([...staticTags, ...dynamicTags]);
  
  console.log(`📊 [Статистика] Обновляем статистику для ${allTagsFromEntry.size} уникальных тегов записи от ${entryDate}...`);
  console.log(`📊 [Статистика] Теги записи: [${Array.from(allTagsFromEntry).join(', ')}]`);

  // Если тегов нет, просто сохраняем то, что было (или пустой объект)
  if (allTagsFromEntry.size === 0) {
      console.log("📊 [Статистика] Нет новых тегов для обновления.");
  } else {
      // Обновляем статистику для каждого тега из записи
      for (const tag of allTagsFromEntry) {
          if (updatedStats[tag]) {
              // Тег уже существует, обновляем счётчик и дату
              updatedStats[tag].count += 1;
              updatedStats[tag].lastSeen = entryDate;
              // Обновляем типы, если нужно
              if (staticTags.includes(tag) && !updatedStats[tag].types.includes('static')) {
                  updatedStats[tag].types.push('static');
              }
              if (dynamicTags.includes(tag) && !updatedStats[tag].types.includes('dynamic')) {
                  updatedStats[tag].types.push('dynamic');
              }
          } else {
              // Новый тег, создаём запись
              updatedStats[tag] = {
                  count: 1,
                  firstSeen: entryDate,
                  lastSeen: entryDate,
                  types: []
              };
              if (staticTags.includes(tag)) updatedStats[tag].types.push('static');
              if (dynamicTags.includes(tag)) updatedStats[tag].types.push('dynamic');
          }
      }
  }

  console.log("💾 [Статистика] Подготовленные данные для сохранения:", JSON.stringify(updatedStats, null, 2));

  try {
      await ensureDirectoryExistence(TAG_STATS_PATH);
      await fs.writeFile(TAG_STATS_PATH, JSON.stringify(updatedStats, null, 2));
      console.log("✅ [Статистика] Статистика тегов обновлена и сохранена.");
  } catch (err) {
      console.error("❌ [Статистика] Ошибка при сохранении статистики тегов:", err.message);
      // Не выбрасываем ошибку, чтобы не останавливать весь процесс генерации записи
  }
}

/**
 * Создает новую запись в журнале.
 */
async function createNewEntry() {
  console.log("📝 Генерируем новую запись от Элары...");

  try {
    const { rawEssay, rawReflection, cleanEntry, staticTags, dynamicTags, tags, level } = await prepareEntryData();

    const entry = {
      date: new Date().toISOString().split('T')[0],
      entry: cleanEntry,
      tags: tags,
      reflection_level: level,
      raw_essay: rawEssay,
      raw_reflection: rawReflection
    };

    const journal = await loadJournal();
    const tagStats = await loadTagStatistics();

    journal.push(entry);
    console.log(`✅ Запись добавлена. Всего записей в памяти: ${journal.length}`);

    await saveJournal(journal);
    await updateAndSaveTagStatistics(tagStats, staticTags, dynamicTags, entry.date);

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
