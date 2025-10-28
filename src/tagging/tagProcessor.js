// src/tagging/tagProcessor.js

const { extractTags } = require('../utils/textProcessor');

/**
 * Обрабатывает сцену и извлекает теги из новой записи
 */
async function processSceneAndTags(content, externalContext) {
  const { fullEntryText } = content;
  const { semanticDict, criticTags } = externalContext;

  const staticTags = await extractTags(fullEntryText, semanticDict);
  console.log(`🏷️ Извлечено статических тегов: ${staticTags.length}`, staticTags);

  const allTags = Array.from(new Set([...staticTags, ...criticTags]));
  console.log(`🏷️ Всего уникальных тегов: ${allTags.length}`, allTags);

  return { staticTags, allTags };
}

module.exports = { processSceneAndTags };
