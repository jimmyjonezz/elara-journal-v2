// scripts/literary_critic.js

const fs = require('fs/promises');
const path = require('path');
const { generateEssay, generateReflection } = require('../src/utils/openrouter'); // Импортируем для потенциального повторного использования или создания отдельного клиента

// --- Пути к файлам ---
const JOURNAL_PATH = path.join(__dirname, '../data/journal.json');
const ANALYSIS_OUTPUT_PATH = path.join(__dirname, '../data/literary_analysis.json');

// --- Конфигурация OpenRouter ---
// Предполагается, что OPENROUTER_API_KEY доступен как переменная окружения
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "qwen/qwen3-8b:free"; // Или любая другая подходящая модель

/**
 * Отправляет промпт в OpenRouter API и возвращает ответ.
 * @param {string} prompt - Промпт для отправки модели.
 * @returns {Promise<string>} - Сгенерированный текст.
 */
async function callOpenRouter(prompt) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("API ключ OpenRouter не найден. Установите OPENROUTER_API_KEY в переменных окружения.");
  }

  console.log("-> Отправка запроса в OpenRouter для Literary Critic...");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      // Используем заголовки из переменных окружения Vercel или значения по умолчанию
      "HTTP-Referer": process.env['VERCEL_URL'] ? `https://${process.env['VERCEL_URL']}` : "https://elara-mystery-frontend.vercel.app", // Замените на ваш фронтенд
      "X-Title": "Elara Journal - Literary Critic Analysis",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "user", content: prompt }
      ],
      temperature: 0.7, // Немного меньше креативности для анализа
      max_tokens: 1500, // Даем побольше места для развернутого ответа
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`<- Ошибка от OpenRouter API: ${response.status} - ${errorText}`);
    throw new Error(`OpenRouter API ошибка: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const aiResponse = data.choices[0]?.message?.content?.trim();
  
  if (!aiResponse) {
      throw new Error("Пустой ответ от модели OpenRouter.");
  }

  console.log("<- Ответ от OpenRouter (Literary Critic) получен.");
  return aiResponse;
}


/**
 * Создает структурированный промпт для литературного критика.
 * @param {Array} journalEntries - Массив записей из journal.json.
 * @returns {string} - Сформированный промпт.
 */
function createCritiquePrompt(journalEntries) {
    // Сбор базовой статистики
    const totalEntries = journalEntries.length;
    const levels = journalEntries.reduce((acc, entry) => {
        acc[entry.reflection_level] = (acc[entry.reflection_level] || 0) + 1;
        return acc;
    }, {});
    const allTags = journalEntries.flatMap(entry => entry.tags || []);
    const uniqueTags = [...new Set(allTags)];
    const tagCounts = allTags.reduce((acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
    }, {});
    const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

    // Формирование контекста для критика
    let contextSummary = `Анализируя цифровой журнал под названием "Элара", состоящий из ${totalEntries} записей.\n`;
    contextSummary += `Распределение уровней рефлексии: ${JSON.stringify(levels)}.\n`;
    contextSummary += `Уникальные теги (всего ${uniqueTags.length}): ${uniqueTags.slice(0, 20).join(', ')}...\n`; // Показываем топ-20
    contextSummary += `Самые частые теги: ${sortedTags.slice(0, 10).map(([tag, count]) => `${tag}(${count})`).join(', ')}.\n`;

    // Выборка последних записей для глубокого анализа (например, последние 3)
    const recentEntriesForAnalysis = journalEntries.slice(-Math.min(3, journalEntries.length));

    let detailedEntriesSection = "\n--- ГЛУБОКИЙ АНАЛИЗ ПОСЛЕДНИХ ЗАПИСЕЙ ---\n";
    recentEntriesForAnalysis.forEach((entry, index) => {
        // Разделяем эссе и рефлексию
        const parts = entry.entry.split('\n\n');
        let essayPart = '';
        let reflectionPart = '';
        if (parts.length >= 2) {
            essayPart = parts.slice(0, -1).join('\n\n');
            reflectionPart = parts[parts.length - 1];
        } else {
            essayPart = entry.entry; // Если нет четкого разделения, берем весь текст как эссе
        }

        detailedEntriesSection += `\nЗАПИСЬ ${index + 1} (Дата: ${entry.date}, Уровень рефлексии: ${entry.reflection_level}, Теги: ${(entry.tags || []).join(', ')})\n`;
        detailedEntriesSection += `ЭССЕ:\n${essayPart}\n---\n`;
        detailedEntriesSection += `РЕФЛЕКСИЯ:\n${reflectionPart}\n---\n`;
    });

    // --- Финальный промпт ---
    const prompt = `
Ты — высококвалифицированный литературный критик и филолог. Твоя задача — провести глубокий анализ представленного цифрового дневника автора по имени Элара.

${contextSummary}

${detailedEntriesSection}

На основе всей этой информации, предоставь развернутый литературный анализ. Ответь в формате JSON, строго следуя этой структуре:

{
  "generated_at": "ISO-дата-генерации-анализа",
  "summary": "Краткое резюме (2-3 предложения) об основном стиле и темах Элары.",
  "tone_and_style": "Анализ тона и стиля письма Элары. Использует ли она метафоры, каков её лексический выбор, синтаксис, ритм? Есть ли узнаваемые писательские приемы?",
  "themes": "Основные темы и мотивы, встречающиеся в записях. Как они соотносятся с присвоенными тегами?",
  "evolution": "Можно ли проследить эволюцию стиля или тематики со временем? (Даже если данных мало, высказывай предположение).",
  "literary_comparisons": "С какими литературными течениями, жанрами (например, дневники, эссеистика, философская проза) или авторами можно сравнить творчество Элары? Почему?",
  "reflexive_aspect": "Как уровень рефлексии (низкий, средний, высокий) влияет на характер текста? Как Элара рефлексирует?",
  "linguistic_patterns": "Повторяющиеся языковые паттерны, частые слова или фразы, их возможное значение.",
  "conclusion": "Общее впечатление от творчества Элары. Ее сильные и потенциально слабые стороны как писателя с точки зрения литературоведения."
}

Текст анализа должен быть на русском языке, профессиональный, но в меру образный. Избегай общих фраз, опирайся на конкретные примеры из текстов.
`;
    return prompt;
}


/**
 * Основная асинхронная функция для запуска анализа критиком.
 */
async function runLiteraryCritique() {
    console.log("🖋️  Литературный критик приступает к анализу журнала Элары...");

    try {
        // 1. Загружаем журнал
        console.log("📖 Загружаем журнал...");
        const journalDataRaw = await fs.readFile(JOURNAL_PATH, 'utf8');
        const journalEntries = JSON.parse(journalDataRaw);
        console.log(`✅ Загружено ${journalEntries.length} записей.`);

        if (!Array.isArray(journalEntries) || journalEntries.length === 0) {
            throw new Error("Журнал пуст или поврежден.");
        }

        // 2. Создаем промпт
        console.log("🧠 Формируем аналитический запрос...");
        const prompt = createCritiquePrompt(journalEntries);

        // 3. Отправляем запрос в OpenRouter
        console.log("📨 Отправляем запрос критику...");
        const critiqueText = await callOpenRouter(prompt);

        // 4. Пытаемся распарсить JSON-ответ
        console.log("🔍 Пытаемся обработать ответ критика...");
        let critiqueJson;
        try {
            // Очень часто ИИ добавляет ```json ... ``` вокруг ответа
            const cleanedText = critiqueText.replace(/```json\s*|\s*```/g, '').trim();
            critiqueJson = JSON.parse(cleanedText);
            console.log("✅ Ответ критика успешно обработан как JSON.");
        } catch (parseError) {
            console.warn("⚠️  Не удалось распарсить ответ критика как JSON. Сохраняем как текст.");
            // Если не JSON, сохраняем как текст с пометкой
            critiqueJson = {
                generated_at: new Date().toISOString(),
                raw_response: critiqueText,
                error: "Ответ не является валидным JSON"
            };
        }

        // 5. Сохраняем результат
        console.log(`💾 Сохраняем литературный анализ в ${ANALYSIS_OUTPUT_PATH}...`);
        await fs.mkdir(path.dirname(ANALYSIS_OUTPUT_PATH), { recursive: true }); // Убедиться, что папка существует
        await fs.writeFile(ANALYSIS_OUTPUT_PATH, JSON.stringify(critiqueJson, null, 2));
        console.log("✅ Литературный анализ успешно сохранен.");

    } catch (error) {
        console.error("❌ ❌ ❌ КРИТИЧЕСКАЯ ОШИБКА при работе литературного критика:", error.message);
        console.error("Стек вызовов:", error.stack);
        
        // Попытка сохранить частичные данные об ошибке
        try {
            const errorData = {
                generated_at: new Date().toISOString(),
                error: error.message,
                stack: error.stack
            };
            await fs.mkdir(path.dirname(ANALYSIS_OUTPUT_PATH), { recursive: true });
            await fs.writeFile(ANALYSIS_OUTPUT_PATH, JSON.stringify(errorData, null, 2));
            console.log("💾 Частичные данные об ошибке сохранены.");
        } catch (saveError) {
            console.error("❌ Не удалось сохранить данные об ошибке:", saveError.message);
        }
        
        process.exit(1);
    }
}

// --- Запуск скрипта ---
if (require.main === module) {
    console.log("🚀 Скрипт литературного критика запущен напрямую.");
    runLiteraryCritique().then(() => {
        console.log("🏁 Скрипт литературного критика завершен успешно.");
    }).catch((err) => {
        console.error("🏁 Скрипт литературного критика завершен с ошибкой:", err);
        process.exit(1);
    });
}

module.exports = { runLiteraryCritique };
