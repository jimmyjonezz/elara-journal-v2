// src/data/dataLoader.js
const { readJSON, writeJSON } = require('../utils/fileUtils');
const {
  DATA_DIR,
  JOURNAL_PATH,
  ANALYSIS_PATH,
  TAG_STATS_PATH,
  SEMANTIC_DICT_PATH,
  MOODS_PATH,
  CONTEXTS_PATH // Обновленный путь к contexts.json
} = require('../config');
const { getCurrentSeason } = require('../utils/dateUtils');

/**
 * Загружает журнал
 */
async function loadJournal() {
  const journal = await readJSON(JOURNAL_PATH);
  return Array.isArray(journal) ? journal : [];
}

/**
 * Загружает последнюю запись из журнала
 */
async function loadLastJournalEntry() {
  const journal = await loadJournal();
  if (journal.length > 0) {
    return journal[journal.length - 1];
  }
  return null; // или undefined, в зависимости от предпочтения
}

/**
 * Получает настроение, соответствующее текущему сезону
 */
async function getSeasonalMood() {
  try {
    const moods = await readJSON(MOODS_PATH);
    const season = getCurrentSeason();

    const seasonMoods = moods[season];

    if (!seasonMoods || !Array.isArray(seasonMoods) || seasonMoods.length === 0) {
      throw new Error(`Нет настроений для сезона: ${season}`);
    }

    const randomMood = seasonMoods[Math.floor(Math.random() * seasonMoods.length)];
    return {
      name: randomMood.mood,
      description: randomMood.description,
      season: season
    };
  } catch (err) {
    console.warn('⚠️ Не удалось загрузить сезонное настроение:', err.message);
    return { name: "still", description: "Like dust in sunlight", season: "winter" };
  }
}

/**
 * Берёт первый контекст из contexts.json и переносит его в КОНЕЦ (FIFO-цикл),
 * чтобы пул никогда не иссякал. Если файл пуст/сломан — дефолтный контекст,
 * который тоже добавляется в пул для будущих итераций.
 */
async function getAndRotateContext() {
  const DEFAULT_CONTEXT = "Ты сидишь за столом. За окном — тишина.";
  try {
    const contexts = await readJSON(CONTEXTS_PATH);
    if (!Array.isArray(contexts?.contexts) || contexts.contexts.length === 0) {
      throw new Error("Формат contexts.json нарушен или файл пуст: ожидается { contexts: Array<{ context: string }> }.");
    }

    // Извлекаем первый элемент и возвращаем его в конец (цикл).
    const firstItem = contexts.contexts.shift();
    const firstContext = firstItem?.context || DEFAULT_CONTEXT;

    contexts.contexts.push({ context: firstContext, added_at: new Date().toISOString() });
    await writeJSON(CONTEXTS_PATH, contexts);

    console.log(`🔄 Контекст взят и возвращён в цикл (в пуле ${contexts.contexts.length}): ${firstContext.substring(0, 60)}...`);
    return firstContext;
  } catch (err) {
    console.warn('⚠️ Не удалось загрузить/прокрутить contexts.json:', err.message);
    return "Ты сидишь за столом. За окном — тишина.";
  }
}

/**
 * Загружает внешний контекст: советы критика, теги, семантический словарь
 */
async function loadExternalContext() {
  // --- Загрузка советов критика ---
  let previousSuggestions = "Советы от литературного критика отсутствуют.";
  try {
    const analysisData = await readJSON(ANALYSIS_PATH);
    if (!Array.isArray(analysisData?.suggestions)) {
      console.warn("⚠️ analysis.json: поле 'suggestions' отсутствует или не массив. Ожидался: { suggestions: string[] }");
    } else if (analysisData.suggestions.length > 0) {
      const lastSuggestions = analysisData.suggestions.slice(-3);
      previousSuggestions = lastSuggestions.join('\n');
      console.log(`✅ Загружено ${lastSuggestions.length} последних советов из анализа.`);
    }
  } catch (error) {
    console.warn("⚠️ Ошибка при загрузке файла литературного анализа:", error.message);
  }

  // criticTags всегда пуст — критик не возвращает теги напрямую (берутся из analysis.tags_for_search).
  // Поле оставлено для совместимости с contentGenerator/tagProcessor.
  const criticTags = [];

  // --- Загрузка семантического словаря (один раз) ---
  const semanticDict = await loadSemanticDictionary();

  return { previousSuggestions, criticTags, semanticDict };
}

/**
 * Загружает семантический словарь
 */
async function loadSemanticDictionary() {
  try {
    const dict = await readJSON(SEMANTIC_DICT_PATH);
    return dict;
  } catch (error) {
    console.warn('⚠️ Не удалось загрузить семантический словарь:', error.message);
    return {};
  }
}

module.exports = {
  loadJournal,
  loadLastJournalEntry, // Экспортируем новую функцию
  getSeasonalMood,
  getAndRotateContext,
  loadExternalContext,
  loadSemanticDictionary
};
