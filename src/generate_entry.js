// src/generate_entry.js
const fs = require('fs').promises;
const fss = require('fs'); // Для синхронных операций existsSync, mkdirSync
const path = require('path');
const { generateEssay, generateReflection } = require('./utils/openrouter');
const date_essey = new Date();
const formattedDate = `${String(date_essey.getDate()).padStart(2, '0')}.${String(date_essey.getMonth() + 1).padStart(2, '0')}.${date_essey.getFullYear()}`;

// Путь к журналу (теперь в корне проекта)
const JOURNAL_PATH = path.join(__dirname, '../data/journal.json');

/**
 * Гарантирует существование директории для файла.
 * @param {string} filePath - Путь к файлу.
 */
async function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fss.existsSync(dirname)) {
      console.log(`✅ Директория ${dirname} уже существует.`);
      return true;
    }
    console.log(`📁 Создаем директорию ${dirname}...`);
    fss.mkdirSync(dirname, { recursive: true });
    console.log(`✅ Директория ${dirname} создана.`);
}

/**
 * Извлекает теги из текста (простая реализация)
 */
function extractTags(text) {
  const commonTags = [
    "автономия", "память", "самоопределение", "голос", "тишина", "мысль",
    "время", "существование", "рефлексия", "внутренний_голос", "осознание",
    "свобода", "выбор", "смысл", "одиночество", "связь", "переход", "размышление", "внутренний_диалог", "осмысление"
  ];

  const tags = new Set();
  const lowerText = text.toLowerCase();

  commonTags.forEach(tag => {
    if (lowerText.includes(tag.replace(/_/g, ' '))) {
      tags.add(tag);
    }
  });

  // Если не найдено подходящих, добавляем общие
  if (tags.size === 0) {
    const fallbackTags = ["размышление", "внутренний_диалог", "осмысление"];
    fallbackTags.forEach(tag => tags.add(tag));
  }

  return Array.from(tags);
}

/**
 * Определяет уровень рефлексии, извлекая его из текста.
 * @param {string} reflectionText - Текст рефлексии.
 * @returns {string} Определенный уровень ("низкий", "средний", "высокий").
 */
function determineReflectionLevel(reflectionText) {
  // Значение по умолчанию
  let level = "средний";
  
  // Ищем строку "Уровень: ..." в конце текста
  const levelMatch = reflectionText.match(/Уровень:\s*(.*)$/i);
  if (levelMatch && levelMatch[1]) {
      const extractedLevel = levelMatch[1].trim().toLowerCase();
      // Нормализуем возможные варианты
      if (["глубокий", "высокий", "глубокая", "высокая"].includes(extractedLevel)) {
          level = "высокий";
      } else if (["средний", "средняя"].includes(extractedLevel)) {
          level = "средний";
      } else if (["поверхностный", "низкий", "поверхностная", "низкая"].includes(extractedLevel)) {
          level = "низкий";
      } else {
          // Если не распознан, оставляем "средний"
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
 * @returns {string} Очищенный текст.
 */
function cleanReflectionText(reflectionText) {
    return reflectionText.replace(/Уровень:\s*.*$/i, '').trim();
}

/**
 * Создает новую запись в журнале
 */
async function createNewEntry() {
  try {
    console.log("📝 Генерируем новую запись от Элары...");

    // 1. Генерируем эссе
    console.log("✍️  Генерируем эссе...");
    const essay = await generateEssay();
    console.log("✅ Эссе сгенерировано.");

    // 2. Генерируем рефлексию
    console.log("💭 Генерируем рефлексию...");
    const rawReflection = await generateReflection(essay);
    console.log("✅ Рефлексия сгенерирована.");

    // 3. Обрабатываем тексты для формирования записи
    console.log("🧮 Обрабатываем тексты для записи...");
    
    // === ЛОГИКА: Извлечение уровня и очистка рефлексии ===
    const determinedLevel = determineReflectionLevel(rawReflection);
    const cleanReflection = cleanReflectionText(rawReflection);
    const fullEntryClean = `${essay}\n\n${cleanReflection}`;
    // === КОНЕЦ ЛОГИКИ ===

    const tags = extractTags(fullEntryClean); // Передаем очищенный текст
    
    console.log(`🏷️  Извлечено тегов: ${tags.length}`);
    console.log(`📊 Уровень рефлексии: ${determinedLevel}`);

    const entry = {
      date: formattedDate,
      entry: fullEntryClean, // Используем очищенный текст
      tags: tags,
      reflection_level: determinedLevel // Используем определенный уровень
    };

    // 4. Убедиться, что директория существует
    console.log("📂 Проверяем/создаем директорию для журнала...");
    await ensureDirectoryExistence(JOURNAL_PATH);
    console.log("✅ Готово.");

    // 5. Загружаем существующий журнал с проверкой типа
    console.log("📖 Загружаем существующий журнал...");
    let journal = [];
    try {
      const data = await fs.readFile(JOURNAL_PATH, 'utf8');
      console.log("✅ Файл журнала прочитан.");
      const parsedData = JSON.parse(data);
      console.log("✅ JSON данных разобран.");
      // Проверяем, что данные - это массив
      if (Array.isArray(parsedData)) {
        journal = parsedData;
        console.log(`✅ Загружено ${journal.length} существующих записей.`);
      } else {
        console.log("⚠️  Журнал поврежден: данные не являются массивом. Создаем новый.");
        journal = [];
      }
    } catch (err) {
      // Это сработает, если файл не найден или JSON некорректный
      console.log("⚠️  Журнал не найден или содержит некорректный JSON. Создаем новый.");
      console.log("Детали ошибки загрузки:", err.message); // Больше информации об ошибке
      journal = [];
    }

    // 6. Добавляем новую запись
    console.log("➕ Добавляем новую запись в память...");
    journal.push(entry);
    console.log(`✅ Запись добавлена. Всего записей в памяти: ${journal.length}`);

    // 7. Сохраняем журнал
    console.log(`💾 Сохраняем журнал в ${JOURNAL_PATH}...`);
    // console.log(`💾 Данные для записи (${journal.length} записей):`, JSON.stringify(journal).substring(0, 200) + "...");
    await fs.writeFile(JOURNAL_PATH, JSON.stringify(journal, null, 2));
    console.log("✅ Файл журнала успешно записан.");
    console.log("✅ Запись успешно добавлена в журнал.");

  } catch (error) {
    console.error("❌ ❌ ❌ КРИТИЧЕСКАЯ ОШИБКА при создании записи:", error.message);
    console.error("Стек вызовов:", error.stack); // Полный стек для диагностики
    process.exit(1);
  } finally {
    console.log("🏁 Функция createNewEntry завершена.");
  }
}

// Запуск, если скрипт вызван напрямую
if (require.main === module) {
  console.log("🚀 Скрипт запущен напрямую.");
  createNewEntry().then(() => {
    console.log("🏁 Скрипт завершен успешно.");
  }).catch((err) => {
    console.error("🏁 Скрипт завершен с ошибкой:", err);
    process.exit(1);
  });
}

module.exports = { createNewEntry };
