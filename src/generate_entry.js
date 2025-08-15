// src/generate_entry.js
// Используем fs/promises напрямую
const fs = require('fs/promises');
const path = require('path');
const { generateEssay, generateReflection } = require('./utils/openrouter');

// Путь к журналу
const JOURNAL_PATH = path.join(__dirname, '../data/journal.json');
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
 * Извлекает теги из текста.
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

  // Используем for...of для более современного синтаксиса и потенциальной оптимизации
  for (const tag of commonTags) {
    if (lowerText.includes(tag.replace(/_/g, ' '))) {
      tags.add(tag);
      // Небольшая оптимизация: если найдены все возможные теги, можно выйти
      // (в данном случае максимум 10, но логика общая)
      // if (tags.size === commonTags.length) break; 
    }
    // Если мы уже нашли все возможные теги из commonTags, можно остановиться
    // (Это опционально, зависит от желаемой логики)
  }

  if (tags.size === 0) {
    const fallbackTags = ["размышление", "внутренний_диалог", "осмысление"];
    fallbackTags.forEach(tag => tags.add(tag));
  }

  return Array.from(tags);
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
 * @returns {Promise<{rawEssay: string, rawReflection: string, cleanEntry: string, tags: string[], level: string}>}
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

  const tags = extractTags(fullEntryClean);

  console.log(`🏷️  Извлечено тегов: ${tags.length}`);
  console.log(`📊 Уровень рефлексии: ${determinedLevel}`);

  return {
    rawEssay,
    rawReflection,
    cleanEntry: fullEntryClean,
    tags,
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

/**
 * Создает новую запись в журнале.
 */
async function createNewEntry() {
  console.log("📝 Генерируем новую запись от Элары...");

  try {
    // Подготавливаем данные записи
    const { rawEssay, rawReflection, cleanEntry, tags, level } = await prepareEntryData();

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

    // Добавляем новую запись
    console.log("➕ Добавляем новую запись в память...");
    journal.push(entry);
    console.log(`✅ Запись добавлена. Всего записей в памяти: ${journal.length}`);

    // Сохраняем журнал
    await saveJournal(journal);

    console.log("✅ Запись успешно добавлена в журнал.");

  } catch (error) {
    console.error("❌ ❌ ❌ КРИТИЧЕСКАЯ ОШИБКА при создании записи:", error.message);
    console.error("Стек вызовов:", error.stack);
    // Вместо process.exit(1), можно выбросить ошибку, чтобы её мог обработать вызывающий код
    // Например, если это будет частью большего приложения.
    // process.exit(1); 
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
