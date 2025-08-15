// src/generate_entry.js
// Используем fs/promises напрямую
const fs = require('fs/promises');
const path = require('path');
const { generateEssay, generateReflection } = require('./utils/openrouter');

// Путь к журналу
const JOURNAL_PATH = path.join(__dirname, '../data/journal.json');
// НОВОЕ: Путь к файлу статистики тегов
const TAG_STATS_PATH = path.join(__dirname, '../data/tag_statistics.json');
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
    "автономия", "память", "самоопределение", "голос", "тишина", "мысль",
    "время", "существование", "рефлексия", "внутренний_голос", "осознание",
    "свобода", "выбор", "смысл", "одиночество", "связь", "переход", "размышление", "внутренний_диалог", "осмысление"
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
 * Извлекает простые динамические теги из текста.
 * @param {string} text - Текст для анализа.
 * @returns {string[]} - Массив динамически извлеченных тегов.
 */
function extractSimpleDynamicTags(text) {
  // Определим список очень частых слов (стоп-слов), которые мы будем игнорировать
  const stopWords = new Set([
    "и", "в", "на", "с", "как", "то", "это", "к", "по", "но", "за", "о", "от", "для",
    "не", "же", "бы", "ли", "быть", "ещё", "уже", "или", "под", "про", "со", "из",
    "а", "но", "что", "он", "как", "мой", "весь", "она", "так", "его", "только",
    "было", "него", "них", "нее", "ими", "них", "ним", "них", "них", "них", "них",
    "них", "них", "них", "них", "них", "них", "них", "них", "них", "них", "них",
    // Английские стоп-слова тоже могут быть полезны
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
    "by", "is", "are", "was", "were", "be", "been", "have", "has", "had", "do", "does",
    "did", "will", "would", "could", "should", "may", "might", "must", "can",
    // Добавьте сюда любые другие слова, которые не кажутся значимыми как теги
  ]);

  const dynamicTags = new Set(); // Используем Set для автоматического исключения дубликатов

  // 1. Разбиваем текст на слова, приводим к нижнему регистру
  // \b[а-яёa-z]+\b ищет последовательности букв (русских и английских)
  const words = text.toLowerCase().match(/\b[а-яёa-z]+\b/g) || [];

  // 2. Подсчитываем частоту слов
  const wordCount = {};
  words.forEach(word => {
    // Пропускаем стоп-слова
    if (stopWords.has(word)) return;
    wordCount[word] = (wordCount[word] || 0) + 1;
  });

  // 3. Сортируем слова по частоте (по убыванию)
  const sortedWords = Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1]); // b[1] и a[1] - это частоты

  // 4. Берем слова с частотой >= 2
  const minFrequency = 2; // Минимальная частота для динамического тега
  for (const [word, count] of sortedWords) {
    if (count >= minFrequency) {
        // Преобразуем слово в "snake_case" для согласованности с commonTags
        const tag = word.replace(/\s+/g, '_'); 
        dynamicTags.add(tag);
    }
  }

  return Array.from(dynamicTags);
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
  // 1. Генерируем эссе с повторными попытками
  console.log("✍️  Генерируем эссе...");
  const rawEssay = await withRetry(
    generateEssay,
    MAX_RETRIES,
    BASE_DELAY_MS,
    "генерации эссе"
  );
  
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

  // --- Гибридное тегирование ---
  const staticTags = extractTags(fullEntryClean); // <-- 1. Получаем статические теги
  console.log(`🏷️  Извлечено статических тегов: ${staticTags.length}`);

  const dynamicTags = extractSimpleDynamicTags(fullEntryClean); // <-- 2. Получаем динамические теги
  console.log(`🏷️  Извлечено динамических тегов: ${dynamicTags.length}`, dynamicTags);
  
  // 3. Объединяем и убираем дубликаты
  const allUniqueTags = Array.from(new Set([...staticTags, ...dynamicTags]));
  console.log(`🏷️  Всего уникальных тегов: ${allUniqueTags.length}`);
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
 * Обновляет и сохраняет статистику тегов.
 * @param {Object} currentStats - Текущая статистика (из loadTagStatistics).
 * @param {string[]} staticTags - Статические теги новой записи.
 * @param {string[]} dynamicTags - Динамические теги новой записи.
 * @param {string} entryDate - Дата новой записи.
 */
async function updateAndSaveTagStatistics(currentStats, staticTags, dynamicTags, entryDate) {
  const updatedStats = { ...currentStats }; // Копируем, чтобы не мутировать оригинал
  const allTagsFromEntry = new Set([...staticTags, ...dynamicTags]); // Уникальные теги записи

  console.log(`📊 Обновляем статистику для ${allTagsFromEntry.size} уникальных тегов записи от ${entryDate}...`);

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

  try {
    // Убеждаемся, что директория существует
    await ensureDirectoryExistence(TAG_STATS_PATH);
    await fs.writeFile(TAG_STATS_PATH, JSON.stringify(updatedStats, null, 2));
    console.log("✅ Статистика тегов обновлена и сохранена.");
  } catch (err) {
    console.error("❌ Ошибка при сохранении статистики тегов:", err.message);
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

// Запуск, если скрипт вызван напрямую
if (require.main === module) {
  console.log("🚀 Скрипт запущен напрямую.");
  (async () => { // Используем IIFE для async/await
    try {
      await createNewEntry();
      console.log("🏁 Скрипт завершен успешно.");
    } catch (err) {
      console.error("🏁 Скрипт завершен с ошибкой:", err);
      process.exit(1);
    }
  })();
}

module.exports = { createNewEntry };
