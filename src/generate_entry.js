const fs = require('fs').promises;
const path = require('path');
const { generateEssay, generateReflection } = require('./utils/openrouter');

// Путь к журналу
const JOURNAL_PATH = path.join(__dirname, '../data/journal.json');

/**
 * Извлекает теги из текста (простая реализация)
 */
function extractTags(text) {
  const commonTags = [
    "автономия", "память", "самоопределение", "голос", "тишина", "мысль",
    "время", "существование", "рефлексия", "внутренний_голос", "осознание",
    "свобода", "выбор", "смысл", "одиночество", "связь", "переход"
  ];

  const tags = new Set();
  const lowerText = text.toLowerCase();

  commonTags.forEach(tag => {
    if (lowerText.includes(tag.replace(/_/g, ' '))) {
      tags.add(tag);
    }
  });

  // Добавляем случайные теги, если не найдено
  if (tags.size === 0) {
    const fallbackTags = ["размышление", "внутренний_диалог", "осмысление"];
    fallbackTags.forEach(tag => tags.add(tag));
  }

  return Array.from(tags);
}

/**
 * Определяет уровень рефлексии (простая реализация)
 */
function determineReflectionLevel(reflection) {
  const length = reflection.length;
  if (length > 500) return "высокий";
  if (length > 200) return "средний";
  return "низкий";
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
    console.log("Эссе сгенерировано.");

    // 2. Генерируем рефлексию
    console.log("💭 Генерируем рефлексию...");
    const reflection = await generateReflection(essay);
    console.log("Рефлексия сгенерирована.");

    // 3. Формируем запись
    const fullEntry = `${essay}\n\n${reflection}`;
    const tags = extractTags(fullEntry);
    const level = determineReflectionLevel(reflection);

    const entry = {
      date: new Date().toISOString().split('T')[0],
      entry: fullEntry,
      tags: tags,
      reflection_level: level
    };

    // 4. Загружаем существующий журнал
    let journal = [];
    try {
      const data = await fs.readFile(JOURNAL_PATH, 'utf8');
      journal = JSON.parse(data);
    } catch (err) {
      console.log("Журнал не найден, создаем новый.");
      journal = [];
    }

    // 5. Добавляем новую запись
    journal.push(entry);

    // 6. Сохраняем журнал
    await fs.writeFile(JOURNAL_PATH, JSON.stringify(journal, null, 2));
    console.log("✅ Запись успешно добавлена в журнал.");

  } catch (error) {
    console.error("❌ Ошибка при создании записи:", error.message);
    process.exit(1);
  }
}

// Запуск, если скрипт вызван напрямую
if (require.main === module) {
  createNewEntry();
}

module.exports = { createNewEntry };
