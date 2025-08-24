// src/generate_entry.js
// Используем fs/promises напрямую
const fs = require('fs/promises');
const path = require('path');
const { generateEssay, generateReflection } = require('./utils/openrouter');

// Путь к журналу
const JOURNAL_PATH = path.join(__dirname, '../data/journal.json');
// НОВОЕ: Путь к файлу статистики тегов
const TAG_STATS_PATH = path.join(__dirname, '../data/tag_statistics.json');
// НОВОЕ: Путь к файлу литературного анализа
const ANALYSIS_PATH = path.join(__dirname, '../data/literary_analysis.json');
// Максимальное количество попыток генерации при ошибках
const MAX_RETRIES = 3;
// Базовая задержка между попытками (мс)
const BASE_DELAY_MS = 2000;

/**
 * Гарантирует существование директории для файла (асинхронно).
 * @param {string} filePath - Путь к файлу.
 */
async function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  try {
    // Проверяем доступ на чтение (или любую операцию) для проверки существования
    await fs.access(dirname);
    console.log(`✅ Директория ${dirname} уже существует.`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`📁 Создаем директорию ${dirname}...`);
      try {
        await fs.mkdir(dirname, { recursive: true });
        console.log(`✅ Директория ${dirname} создана.`);
      } catch (mkdirErr) {
        console.error(`❌ Ошибка при создании директории ${dirname}:`, mkdirErr.message);
        throw mkdirErr; // Пробрасываем ошибку дальше
      }
    } else {
      // Другая ошибка, например, проблема с правами доступа
      console.error(`❌ Ошибка при проверке директории ${dirname}:`, err.message);
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

  // Используем for...of для более современного синтаксиса
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
 * Извлекает простые динамические теги из текста (с расширенным логированием).
 * @param {string} text - Текст для анализа.
 * @returns {string[]} - Массив динамически извлеченных тегов.
 */
function extractSimpleDynamicTags(text) {
  // --- Добавлено для диагностики ---
  console.log("📄 [Динамические теги] Входной текст (первые 300 символов):", text.substring(0, 300) + (text.length > 300 ? "..." : ""));
  console.log("📄 [Динамические теги] Длина входного текста:", text.length);
  // --- Конец добавления ---
  
  console.log("🔍 [Динамические теги] Начинаем извлечение из текста длиной", text.length);
  
  // Исправленный список стоп-слов (убраны дубликаты "них")
  const stopWords = new Set([
    "и", "в", "на", "с", "как", "то", "это", "к", "по", "но", "за", "о", "от", "для",
    "не", "же", "бы", "ли", "быть", "ещё", "уже", "или", "под", "про", "со", "из",
    "а", "но", "что", "он", "как", "мой", "весь", "она", "так", "его", "только",
    "было", "него", "них", "нее", "ими", "ним", // Исправлено: убраны дубликаты
    "них", "них", "них", "них", "них", "них", "них", "них", "них", // Исправлено: убраны дубликаты
    // Английские стоп-слова тоже могут быть полезны
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
    "by", "is", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does",
    "did", "will", "would", "could", "should", "may", "might", "must", "can"
    // Добавьте сюда любые другие слова, которые не кажутся значимыми как теги
  ]);
  console.log("🚫 [Динамические теги] Стоп-слов загружено:", stopWords.size);

  // 1. Разбиваем текст на слова, приводим к нижнему регистру
  // \b[а-яёa-z]+\b ищет последовательности букв (русских и английских)
  const words = text.toLowerCase().match(/\b[а-яёa-z]+\b/g) || [];
  console.log("🔤 [Динамические теги] Извлечено слов (до фильтрации):", words.length);
  console.log("🔤 [Динамические теги] Примеры извлеченных слов:", words.slice(0, 10)); // Показать первые 10

  // 2. Подсчитываем частоту слов
  const wordCount = {};
  words.forEach(word => {
    // Пропускаем стоп-слова
    if (stopWords.has(word)) {
      // console.log("⏭️ [Динамические теги] Пропущено стоп-слово:", word);
      return;
    }
    wordCount[word] = (wordCount[word] || 0) + 1;
    // console.log("🧮 [Динамические теги] Счетчик для '", word, "':", wordCount[word]); // Очень подробно
  });
  console.log("🧮 [Динамические теги] Словарь частот после фильтрации:", Object.keys(wordCount).length);
  console.log("🧮 [Динамические теги] Примеры частот:", Object.entries(wordCount).slice(0, 10)); // Показать первые 10

  // 3. Сортируем слова по частоте (по убыванию)
  const sortedWords = Object.entries(wordCount).sort((a, b) => b[1] - a[1]);
  console.log("📊 [Динамические теги] Слова, отсортированные по частоте:", sortedWords.slice(0, 10));

  // 4. Берем слова с частотой >= 1
  const minFrequency = 1; // Минимальная частота для динамического тега
  console.log("📉 [Динамические теги] Минимальная частота для тега:", minFrequency);

  const dynamicTagsArray = [];
  for (const [word, count] of sortedWords) {
    // console.log("🔍 [Динамические теги] Проверяем слово '", word, "' с частотой", count); // Очень подробно
    if (count >= minFrequency) {
      // Исправлено: word уже одно слово, замена пробелов не нужна
      // const tag = word.replace(/\s+/g, '_'); // <-- Старая строка
      const tag = word; // <-- Новое
      // console.log("✅ [Динамические теги] Добавляем тег:", tag); // Очень подробно
      dynamicTagsArray.push(tag);
    } else {
      // console.log("❌ [Динамические теги] Слово '", word, "' не прошло по частоте (", count, ")"); // Очень подробно
    }
  }
  console.log("🏷️ [Динамические теги] Теги до удаления дубликатов:", dynamicTagsArray);

  // Set удаляет дубликаты, но в этом цикле их быть не должно, если wordCount ключи уникальны.
  const dynamicTagsSet = new Set(dynamicTagsArray); 
  const finalDynamicTags = Array.from(dynamicTagsSet);
  console.log("🏷️ [Динамические теги] Финальные теги (Set -> Array):", finalDynamicTags);
  
  // Специально проверим потенциально важные слова
  const wordsToCheck = ['звук', 'звуки', 'сегодня', 'окно', 'писать', 'письмо', 'мои', 'мой', 'я', 'это', 'солнце', 'ajanely', 'балкон', 'кот', 'лайма', 'город', 'просыпался', 'луч', 'тишина', 'мысли'];
  for (const checkWord of wordsToCheck) {
    if (wordCount[checkWord]) {
      console.log("☀️ [Динамические теги] Слово '" + checkWord + "' найдено с частотой:", wordCount[checkWord]);
      if (finalDynamicTags.includes(checkWord)) {
        console.log("☀️ [Динамические теги] Тег '" + checkWord + "' успешно добавлен в финальный список.");
      } else {
        console.log("☀️ [Динамические теги] Тег '" + checkWord + "' НЕ попал в финальный список, несмотря на частоту.");
      }
    } else {
      console.log("☀️ [Динамические теги] Слово '" + checkWord + "' НЕ найдено в словаре частот.");
    }
  }

  return finalDynamicTags;
}

/**
 * Определяет уровень рефлексии, извлекая его из текста.
 * @param {string} reflectionText - Текст рефлексии.
 * @returns {string} - Уровень рефлексии ("низкий", "средний", "высокий").
 */
function determineReflectionLevel(reflectionText) {
  let level = "средний";
  // Улучшенное регулярное выражение: допускает пробелы вокруг ':'
  const levelMatch = reflectionText.match(/Уровень\s*:\s*(.*)$/i);
  if (levelMatch && levelMatch[1]) {
    const extractedLevel = levelMatch[1].trim().toLowerCase();
    if (["глубокий", "высокий", "глубокая", "высокая"].includes(extractedLevel)) {
      level = "высокий";
    } else if (["средний", "средняя"].includes(extractedLevel)) {
      level = "средний";
    } else if (["поверхностный", "низкий", "поверхностная", "низкая"].includes(extractedLevel)) {
      level = "низкий";
    } else {
      console.log(`⚠️  Не удалось распознать уровень рефлексии: "${extractedLevel}". Установлен уровень по умолчанию: ${level}`);
    }
  } else {
    console.log("⚠️  Уровень рефлексии не найден в тексте. Установлен уровень по умолчанию: средний");
  }
  return level;
}

/**
 * Удаляет строку "Уровень: ..." из текста рефлексии.
 * @param {string} reflectionText - Текст рефлексии.
 * @returns {string} - Очищенный текст.
 */
function cleanReflectionText(reflectionText) {
  // Используем то же улучшенное регулярное выражение
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
      console.warn(`⚠️  Попытка ${attempt} для ${actionName} не удалась:`, error.message);
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * baseDelay; // Экспоненциальная задержка
        console.log(`⏳ Ожидание ${delay}мс перед следующей попыткой...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`❌ Все ${maxRetries} попыток ${actionName} не удались.`);
  throw lastError;
}

/**
 * Подготавливает данные для новой записи: генерирует эссе и рефлексию.
 * @returns {Promise<{rawEssay: string, rawReflection: string, cleanEntry: string, staticTags: string[], dynamicTags: string[], tags: string[], level: string}>}
 */
async function prepareEntryData() {
  console.log("🧠 Подготовка данных для новой записи...");
  
  // --- НОВОЕ: Загрузка советов из литературного анализа ---
  let previousSuggestions = "Советы от литературного критика отсутствуют.";
  try {
    console.log(`Попытка загрузки советов из: ${ANALYSIS_PATH}`);
    const analysisData = await fs.readFile(ANALYSIS_PATH, 'utf8');
    if (analysisData.trim()) {
      const parsedAnalysis = JSON.parse(analysisData);
      if (Array.isArray(parsedAnalysis.suggestions) && parsedAnalysis.suggestions.length > 0) {
        // Берем, например, последние 3 совета
        const lastSuggestions = parsedAnalysis.suggestions.slice(-3);
        previousSuggestions = lastSuggestions.join('\n'); // Объединяем в строки, разделенные новой строкой
        console.log(`✅ Загружено ${lastSuggestions.length} последних советов из анализа.`);
      } else {
         console.log("⚠️ В файле анализа нет массива 'suggestions' или он пуст.");
      }
    } else {
       console.log("⚠️ Файл анализа пуст.");
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log("ℹ️ Файл литературного анализа не найден. Будут использованы стандартные данные.");
    } else {
      console.warn("⚠️ Ошибка при загрузке файла литературного анализа:", err.message);
    }
    // previousSuggestions останется со значением по умолчанию
  }
  // --- КОНЕЦ НОВОГО ---

  // 1. Генерируем эссе с повторными попытками, передавая данные
  console.log("✍️  Генерируем эссе...");
  // --- ИЗМЕНЕНО: Передаем объект с данными в generateEssay ---
  const essayData = {
    // Предыдущие версии могли передавать темы и т.д. Здесь можно добавить
    // Например, если бы у вас была логика выбора тем:
    // themes: ["время", "память", "осознание"], 
    previous_suggestions: previousSuggestions // <-- Передаем советы
  };
  const rawEssay = await withRetry(
    () => generateEssay(essayData), // <-- Передаем essayData
    MAX_RETRIES,
    BASE_DELAY_MS,
    "генерации эссе"
  );
  // --- КОНЕЦ ИЗМЕНЕНИЙ ---
  
  // --- Базовая проверка на пустоту/обрезанность эссе ---
  if (!rawEssay || rawEssay.trim().length < 10) { // Пример: очень короткий ответ
     const errorMsg = `Получен подозрительно короткий или пустой ответ для эссе (длина: ${rawEssay?.length || 0}).`;
     console.error(`❌ ${errorMsg}`);
     throw new Error(errorMsg);
  }
  console.log("📄 Сырой ответ эссе (первые 100 символов):", rawEssay.substring(0, 100) + (rawEssay.length > 100 ? "..." : ""));
  console.log("📄 Длина сырого эссе:", rawEssay.length);
  // --- Конец проверки ---

  // 2. Генерируем рефлексию с повторными попытками
  console.log("💭 Генерируем рефлексию...");
  const rawReflection = await withRetry(
    () => generateReflection(rawEssay), // Передаем эссе как аргумент
    MAX_RETRIES,
    BASE_DELAY_MS,
    "генерации рефлексии"
  );

  // --- Базовая проверка на пустоту/обрезанность рефлексии ---
  if (!rawReflection || rawReflection.trim().length < 10) {
     const errorMsg = `Получен подозрительно короткий или пустой ответ для рефлексии (длина: ${rawReflection?.length || 0}).`;
     console.error(`❌ ${errorMsg}`);
     throw new Error(errorMsg);
  }
  console.log("💭 Сырой ответ рефлексии (первые 100 символов):", rawReflection.substring(0, 100) + (rawReflection.length > 100 ? "..." : ""));
  console.log("💭 Длина сырой рефлексии:", rawReflection.length);
  // --- Конец проверки ---

  // 3. Обрабатываем тексты
  console.log("🧮 Обрабатываем тексты для записи...");
  const determinedLevel = determineReflectionLevel(rawReflection);
  const cleanReflection = cleanReflectionText(rawReflection);
  const fullEntryClean = `${rawEssay}\n\n${cleanReflection}`;
  // --- Добавлено для диагностики ---
  console.log("📄 Текст для тегирования (первые 200 символов):", fullEntryClean.substring(0, 200) + (fullEntryClean.length > 200 ? "..." : ""));
  console.log("📄 Длина текста для тегирования:", fullEntryClean.length);
  // --- Конец добавления ---

  // --- Гибридное тегирование ---
  const staticTags = extractTags(fullEntryClean); // <-- 1. Получаем статические теги
  console.log(`🏷️  Извлечено статических тегов: ${staticTags.length}`, staticTags);

  const dynamicTags = extractSimpleDynamicTags(fullEntryClean); // <-- 2. Получаем динамические теги
  console.log(`🏷️  Извлечено динамических тегов: ${dynamicTags.length}`, dynamicTags);
  
  // 3. Объединяем и убираем дубликаты
  const allUniqueTags = Array.from(new Set([...staticTags, ...dynamicTags]));
  console.log(`🏷️  Всего уникальных тегов: ${allUniqueTags.length}`, allUniqueTags);
  // --- КОНЕЦ Гибридного тегирования ---

  console.log(`📊 Уровень рефлексии: ${determinedLevel}`);

  // Возвращаем все необходимые данные, включая раздельные теги для статистики
  return {
    rawEssay,
    rawReflection,
    cleanEntry: fullEntryClean,
    staticTags, // <-- Возвращаем отдельно
    dynamicTags, // <-- Возвращаем отдельно
    tags: allUniqueTags, // <-- Итоговый массив тегов
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
    console.log("✅ Файл журнала прочитан.");
    const parsedData = JSON.parse(data);
    console.log("✅ JSON данных разобран.");
    if (Array.isArray(parsedData)) {
      journal = parsedData;
      console.log(`✅ Загружено ${journal.length} существующих записей.`);
    } else {
      console.log("⚠️  Журнал поврежден: данные не являются массивом. Создаем новый.");
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log("📭 Журнал не найден. Будет создан новый.");
    } else {
      console.log("⚠️  Ошибка при чтении журнала (возможно, некорректный JSON). Создаем новый.");
      console.log("Детали ошибки загрузки:", err.message);
    }
  }
  return journal;
}

/**
 * Сохраняет журнал.
 * @param {Array} journal - Массив записей.
 */
async function saveJournal(journal) {
  // 1. Убедиться, что директория существует
  console.log("📂 Проверяем/создаем директорию для журнала...");
  await ensureDirectoryExistence(JOURNAL_PATH);
  console.log("✅ Готово.");

  // 2. Сохраняем журнал
  console.log(`💾 Сохраняем журнал в ${JOURNAL_PATH}...`);
  await fs.writeFile(JOURNAL_PATH, JSON.stringify(journal, null, 2));
  console.log("✅ Файл журнала успешно записан.");
}

// --- НОВЫЕ ФУНКЦИИ ДЛЯ СТАТИСТИКИ ТЕГОВ ---

/**
 * Загружает текущую статистику тегов из файла.
 * @returns {Promise<Object>} Объект, где ключи - теги, значения - { count: number, lastSeen: string(date) }.
 */
async function loadTagStatistics() {
  try {
    const data = await fs.readFile(TAG_STATS_PATH, 'utf8');
    const stats = JSON.parse(data);
    console.log("📈 Статистика тегов загружена.");
    return stats;
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log("📭 Файл статистики тегов не найден. Будет создан новый.");
    } else {
      console.warn("⚠️  Ошибка при чтении статистики тегов. Создаем новую.", err.message);
    }
    return {}; // Возвращаем пустой объект, если файла нет или он поврежден
  }
}

/**
 * Обновляет и сохраняет статистику тегов (с расширенным логированием).
 * @param {Object} currentStats - Текущая статистика (из loadTagStatistics).
 * @param {string[]} staticTags - Статические теги новой записи.
 * @param {string[]} dynamicTags - Динамические теги новой записи.
 * @param {string} entryDate - Дата новой записи.
 */
async function updateAndSaveTagStatistics(currentStats, staticTags, dynamicTags, entryDate) {
  console.log("📊 [Статистика] Начинаем обновление статистики тегов...");
  console.log("📊 [Статистика] Получены данные для обновления:", { staticTags, dynamicTags, entryDate });
  
  const updatedStats = { ...currentStats }; // Копируем, чтобы не мутировать оригинал
  const allTagsFromEntry = new Set([...staticTags, ...dynamicTags]); // Уникальные теги записи

  console.log(`📊 [Статистика] Обновляем статистику для ${allTagsFromEntry.size} уникальных тегов записи от ${entryDate}...`);

  for (const tag of allTagsFromEntry) {
    if (updatedStats[tag]) {
      updatedStats[tag].count += 1;
      // Отслеживаем, в каких типах тегов он появился
      if (staticTags.includes(tag) && !updatedStats[tag].types.includes('static')) {
        updatedStats[tag].types.push('static');
      }
      if (dynamicTags.includes(tag) && !updatedStats[tag].types.includes('dynamic')) {
        updatedStats[tag].types.push('dynamic');
      }
    } else {
      // Новый тег
      updatedStats[tag] = {
        count: 1,
        firstSeen: entryDate,
        lastSeen: entryDate,
        types: [] // Типы, из которых был получен тег
      };
      if (staticTags.includes(tag)) updatedStats[tag].types.push('static');
      if (dynamicTags.includes(tag)) updatedStats[tag].types.push('dynamic');
    }
    // Всегда обновляем дату последнего появления
    updatedStats[tag].lastSeen = entryDate;
  }

  console.log("💾 [Статистика] Подготовленные данные для сохранения:", JSON.stringify(updatedStats, null, 2));

  try {
    // Убеждаемся, что директория существует
    await ensureDirectoryExistence(TAG_STATS_PATH);
    await fs.writeFile(TAG_STATS_PATH, JSON.stringify(updatedStats, null, 2));
    console.log("✅ [Статистика] Статистика тегов обновлена и сохранена.");
  } catch (err) {
    console.error("❌ [Статистика] Ошибка при сохранении статистики тегов:", err.message);
    // Не выбрасываем ошибку, чтобы не останавливать весь процесс генерации записи
  }
}

// --- КОНЕЦ НОВЫХ ФУНКЦИЙ ---

/**
 * Создает новую запись в журнале.
 */
async function createNewEntry() {
  console.log("📝 Генерируем новую запись от Элары...");

  try {
    // Подготавливаем данные записи
    const { rawEssay, rawReflection, cleanEntry, staticTags, dynamicTags, tags, level } = await prepareEntryData();

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
    await updateAndSaveTagStatistics(tagStats, staticTags, dynamicTags, entry.date);
    // --- КОНЕЦ НОВОГО ---

    console.log("✅ Запись успешно добавлена в журнал.");

  } catch (error) {
    console.error("❌ ❌ ❌ КРИТИЧЕСКАЯ ОШИБКА при создании записи:", error.message);
    console.error("Стек вызовов:", error.stack);
    throw error; // Лучше пробросить ошибку
  } finally {
    console.log("🏁 Функция createNewEntry завершена.");
  }
}

// --- Исправленный основной блок ---
// Экспорт функции (убедитесь, что это идет ПЕРЕД её использованием в IIFE ниже)
module.exports = { createNewEntry };

// Запуск, если скрипт вызван напрямую
if (require.main === module) {
  console.log("🚀 Скрипт запущен напрямую.");
  (async () => { // Используем IIFE для async/await
    try {
      // Теперь мы можем безопасно вызвать функцию, определенную выше
      // и экспортированную выше этого блока.
      await createNewEntry(); 
      console.log("🏁 Скрипт завершен успешно.");
    } catch (err) {
      console.error("🏁 Скрипт завершен с ошибкой:", err);
      process.exit(1);
    }
  })();
}
// --- Конец исправленного блока ---
