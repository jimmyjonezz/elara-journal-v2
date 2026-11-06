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

// Семьи повторяющихся образов. Если последние записи уже использовали контекст
// из той же семьи, ротация его пропускает — иначе неделями шли одни и те же
// «запах старой бумаги», «холод металла ключа», «вкус остывшего чая».
const CONTEXT_FAMILIES = [
  { name: 'paper', stems: ['бумаг', 'письм', 'книг', 'страниц', 'черновик', 'конверт', 'тетрад'] },
  { name: 'key', stems: ['ключ', 'замок', 'подъезд'] },
  { name: 'metal', stems: ['металл', 'желез', 'латун', 'ножниц', 'ложк'] },
  { name: 'tea', stems: ['чай', 'чашк', 'кружк', 'стакан'] },
  { name: 'wool', stems: ['шерст', 'ткан', 'пальто', 'свитер'] },
  { name: 'smell', stems: ['запах', 'аромат'] },
  { name: 'cold', stems: ['холод', 'ледян', 'мороз'] },
  { name: 'taste', stems: ['вкус', 'привкус'] }
];

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

function contextFamily(text) {
  const low = (text || '').toLowerCase();
  for (const f of CONTEXT_FAMILIES) {
    if (f.stems.some((s) => low.includes(s))) return f.name;
  }
  return null;
}

/**
 * Выбирает индекс контекста из пула: первый, чья семья образов не совпадает
 * с семьями последних использованных. Перебираем не больше 4 кандидатов —
 * иначе в маленьком пуле можно перекрутить FIFO.
 */
function pickContextIndex(contexts, recentFamilies, maxLook = 4) {
  for (let i = 0; i < Math.min(maxLook, contexts.length); i++) {
    const family = contextFamily(contexts[i]?.context);
    if (!family || !recentFamilies.has(family)) return i;
  }
  return 0;
}

/**
 * Берёт контекст из contexts.json и переносит его в КОНЕЦ (FIFO-цикл),
 * чтобы пул никогда не иссякал. Если файл пуст/сломан — дефолтный контекст,
 * который тоже добавляется в пул для будущих итераций.
 * Контекст из той же семьи образов, что в двух последних записях,
 * пропускается — иначе неделями шли «запах старой бумаги» и «холод металла».
 */
async function getAndRotateContext() {
  const DEFAULT_CONTEXT = "Ты сидишь за столом. За окном — тишина.";
  try {
    const contexts = await readJSON(CONTEXTS_PATH);
    if (!Array.isArray(contexts?.contexts) || contexts.contexts.length === 0) {
      throw new Error("Формат contexts.json нарушен или файл пуст: ожидается { contexts: Array<{ context: string }> }.");
    }

    const journal = await loadJournal();
    const recentFamilies = new Set(
      journal
        .slice(-2)
        .map((e) => contextFamily(e?.context))
        .filter(Boolean)
    );

    const idx = pickContextIndex(contexts.contexts, recentFamilies);
    const [picked] = contexts.contexts.splice(idx, 1);
    const firstContext = picked?.context || DEFAULT_CONTEXT;

    contexts.contexts.push({ context: firstContext, added_at: new Date().toISOString() });
    await writeJSON(CONTEXTS_PATH, contexts);

    console.log(`🔄 Контекст #${idx + 1} взят и возвращён в цикл (в пуле ${contexts.contexts.length}): ${firstContext.substring(0, 60)}...`);
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

/**
 * Собирает зачины последних N записей журнала.
 * Передаётся в промпт эссе — иначе модель не знает, как начинались
 * предыдущие дни, и открывает все записи одинаковой конструкцией.
 */
async function getRecentOpenings(count = 5) {
  const journal = await loadJournal();
  return journal.slice(-count)
    .map((entry, i) => {
      const essay = (entry && typeof entry.raw_essay === 'string') ? entry.raw_essay : '';
      const firstSentence = essay.split(/[.!?\n]/)[0]?.trim().slice(0, 70) || '';
      return firstSentence ? `${i + 1}. «${firstSentence}»` : null;
    })
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  loadJournal,
  loadLastJournalEntry, // Экспортируем новую функцию
  getSeasonalMood,
  getAndRotateContext,
  loadExternalContext,
  getRecentOpenings,
  loadSemanticDictionary,
  contextFamily,
  pickContextIndex
};
