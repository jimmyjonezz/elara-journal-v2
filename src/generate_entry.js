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

// ... (остальные функции ensureDirectoryExistence, extractTags, extractSimpleDynamicTags, 
// determineReflectionLevel, cleanReflectionText, withRetry остаются без изменений)

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

// ... (остальные функции loadJournal, saveJournal, loadTagStatistics, 
// updateAndSaveTagStatistics, createNewEntry остаются без изменений,
// кроме основного блока if (require.main === module), который тоже не меняется)

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
