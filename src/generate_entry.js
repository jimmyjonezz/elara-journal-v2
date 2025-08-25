const { generateEssay, generateReflection } = require('./utils/openrouter');
const { readJSON, writeJSON, ensureDirectoryExistence } = require('./utils/fileUtils');
const {
  JOURNAL_PATH,
  TAG_STATS_PATH,
  ANALYSIS_PATH,
  DYNAMIC_TAGS_PATH,
  MAX_RETRIES,
  BASE_DELAY_MS,
} = require('./config');

// Пример: загрузка журнала
async function loadJournal() {
  const journal = await readJSON(JOURNAL_PATH);
  return Array.isArray(journal) ? journal : [];
}

// Сохранение журнала
async function saveJournal(journal) {
  await writeJSON(JOURNAL_PATH, journal);
}

// Аналогично обновляем функции работы со статистикой тегов
async function loadTagStatistics() {
  return await readJSON(TAG_STATS_PATH);
}

async function updateAndSaveTagStatistics(currentStats, staticTags, criticTags, entryDate) {
  const updatedStats = { ...currentStats };
  const allTagsFromEntry = new Set([...staticTags, ...criticTags]);
  for (const tag of allTagsFromEntry) {
    if (updatedStats[tag]) {
      updatedStats[tag].count += 1;
      if (staticTags.includes(tag) && !updatedStats[tag].types.includes('static')) {
        updatedStats[tag].types.push('static');
      }
      if (criticTags.includes(tag) && !updatedStats[tag].types.includes('critic')) {
        updatedStats[tag].types.push('critic');
      }
    } else {
      updatedStats[tag] = {
        count: 1,
        firstSeen: entryDate,
        lastSeen: entryDate,
        types: []
      };
      if (staticTags.includes(tag)) updatedStats[tag].types.push('static');
      if (criticTags.includes(tag)) updatedStats[tag].types.push('critic');
    }
    updatedStats[tag].lastSeen = entryDate;
  }
  await writeJSON(TAG_STATS_PATH, updatedStats);
  console.log('✅ [Статистика] Статистика тегов обновлена.');
}

// Основной поток создания новой записи и так далее остается,
// при этом внутри будут использоваться readJSON/writeJSON из fileUtils.

module.exports = { createNewEntry };

if (require.main === module) {
  (async () => {
    try {
      await createNewEntry();
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
}
