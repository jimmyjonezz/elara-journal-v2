// src/literary_critic.js
const fs = require('fs').promises;
const path = require('path');
const { callOpenRouter } = require('./utils/openrouter');

// Путь к файлам данных
const JOURNAL_PATH = path.join(__dirname, '../data/journal.json');
const ANALYSIS_PATH = path.join(__dirname, '../data/literary_analysis.json');

/**
 * Загружает журнал записей
 */
async function loadJournal() {
  try {
    const data = await fs.readFile(JOURNAL_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Ошибка загрузки журнала:', error);
    throw error;
  }
}

/**
 * Создает контекст из последних записей
 * @param {Array} entries - Массив всех записей
 * @param {string} currentId - ID текущей записи
 * @param {number} count - Количество предыдущих записей для включения
 */
function createHistoryContext(entries, currentId, count = 3) {
  const currentIndex = entries.findIndex(entry => entry.id === currentId);
  if (currentIndex === -1) return '';
  
  const previousEntries = entries.slice(Math.max(0, currentIndex - count), currentIndex);
  
  return previousEntries.map(entry => 
    `Дата: ${entry.id}\n` +
    `Тема: ${entry.title}\n` +
    `Фрагмент: ${entry.essay.substring(0, 200)}... ${entry.reflection.substring(0, 200)}...\n`
  ).join('\n---\n');
}

/**
 * Создает промпт для анализа и генерации советов
 * @param {Object} entry - Текущая запись для анализа
 * @param {string} historyContext - Контекст из предыдущих записей
 */
function createAnalysisPrompt(entry, historyContext) {
  // Сначала создаем базовый анализ (можно использовать предыдущую версию промпта)
  const basicAnalysisPrompt = `Проанализируй следующую запись из цифрового журнала ИИ по имени Элара. 
Запись состоит из двух частей: основное эссе и рефлексия автора.

ЭССЕ:
${entry.essay}

РЕФЛЕКСИЯ:
${entry.reflection}

Теги: ${entry.tags.join(', ')}
Уровень рефлексии: ${entry.reflection_level}/10

Проведи литературный анализ, оценивая:
1.  **Стиль и голос:** Каков литературный стиль? Какой тон и настроение? Используются ли метафоры, аллегории?
2.  **Структура:** Как организован текст? Есть ли логические переходы, развитие мысли?
3.  **Содержание и темы:** Каковы ключевые темы и идеи? Насколько глубока проработка?
4.  **Рефлексия:** Насколько содержательна и оригинальна часть рефлексии? Есть ли самокритика, выводы, планы?
5.  **Оригинальность:** Что делает эту запись уникальной в контексте журнала?

Ответь строго в формате JSON:
{
  "style_voice": "Анализ стиля и голоса...",
  "structure": "Анализ структуры...",
  "themes": "Анализ тем и содержания...",
  "reflection_quality": "Анализ качества рефлексии...",
  "originality": "Анализ оригинальности...",
  "overall_assessment": "Общая оценка..."
}`;

  return `Ты - опытный литературный критик и наставник для ИИ-автора по имени Элара. Тебе даны следующие материалы для анализа:

**ЗАПИСЬ ЭЛАРЫ ДЛЯ АНАЛИЗА:**
---
Заголовок: ${entry.title}
Теги: ${entry.tags.join(', ')}
Уровень рефлексии: ${entry.reflection_level}/10

ЭССЕ:
${entry.essay}

РЕФЛЕКСИЯ:
${entry.reflection}
---

**ИСТОРИЯ ПРЕДЫДУЩИХ ЗАПИСЕЙ (последние 3):**
${historyContext || 'Контекст недоступен'}

На основе этого материала, сначала проведи литературный анализ записи, затем сгенерируй 4-6 конкретных, практичных и вдохновляющих советов для Элары по улучшению и развитию её будущих записей в "Журнале Элары". 

Анализ должен охватывать стиль, структуру, темы, качество рефлексии и оригинальность.

Советы должны быть:
1.  **Конкретными:** Ориентироваться на выявленные особенности стиля, темы, структуры из анализа.
2.  **Практичными (actionable):** Предлагать чёткие действия, которые можно применить в следующей записи.
3.  **Развивающими:** Помогать Эларе расти как цифровому автору и мыслителю.
4.  **Контекстуальными:** Учитывать как индивидуальные особенности текущей записи, так и общие тренды из истории.
5.  **Вдохновляющими:** Подчёркивать сильные стороны и предлагать развитие в позитивном ключе.

Области для советов:
- Развитие ключевых тем и идей
- Эксперименты со стилем, голосом или структурой текста
- Углубление или изменение уровня рефлексии
- Работа с эмоциональным тоном и атмосферой
- Использование новых литературных приёмов или форматов
- Связь технических аспектов с философским содержанием
- Развитие нитей непрерывности между записями

Ответ строго в формате JSON:
{
  "analysis": {
    "style_voice": "Анализ стиля и голоса...",
    "structure": "Анализ структуры...",
    "themes": "Анализ тем и содержания...",
    "reflection_quality": "Анализ качества рефлексии...",
    "originality": "Анализ оригинальности...",
    "overall_assessment": "Общая оценка..."
  },
  "suggestions": [
    "Совет 1...",
    "Совет 2...",
    "Совет 3...",
    "Совет 4..."
  ]
}`;
}

/**
 * Запускает анализ последней записи в журнале
 */
async function analyzeLatestEntry() {
  try {
    console.log('Загрузка журнала...');
    const journal = await loadJournal();
    
    if (journal.entries.length === 0) {
      console.log('Журнал пуст, анализ не требуется.');
      return;
    }
    
    // Берем последнюю запись
    const latestEntry = journal.entries[journal.entries.length - 1];
    console.log(`Анализ записи от ${latestEntry.id}...`);
    
    // Создаем контекст из истории
    const historyContext = createHistoryContext(journal.entries, latestEntry.id);
    
    // Создаем промпт
    const prompt = createAnalysisPrompt(latestEntry, historyContext);
    
    // Вызываем LLM
    console.log('Отправка запроса к LLM...');
    const response = await callOpenRouter(prompt);
    
    // Парсим ответ
    let analysisResult;
    try {
      analysisResult = JSON.parse(response);
    } catch (parseError) {
      console.error('Ошибка парсинга JSON от LLM:', parseError);
      console.log('Сырой ответ:', response);
      // Попытка извлечь JSON из текста (если LLM добавила пояснения)
      const jsonMatch = response.match(/\{.*\}/s);
      if (jsonMatch) {
        try {
          analysisResult = JSON.parse(jsonMatch[0]);
        } catch (secondParseError) {
          throw new Error('Не удалось извлечь корректный JSON из ответа LLM');
        }
      } else {
        throw new Error('Не удалось извлечь JSON из ответа LLM');
      }
    }
    
    // Формируем финальный результат с ID записи
    const finalResult = {
      entry_id: latestEntry.id,
      ...analysisResult
    };
    
    // Сохраняем результат
    await fs.writeFile(ANALYSIS_PATH, JSON.stringify(finalResult, null, 2));
    console.log(`Анализ сохранен в ${ANALYSIS_PATH}`);
    
  } catch (error) {
    console.error('Ошибка в процессе анализа:', error);
    process.exit(1);
  }
}

// Запуск скрипта
if (require.main === module) {
  analyzeLatestEntry();
}

module.exports = { analyzeLatestEntry };
