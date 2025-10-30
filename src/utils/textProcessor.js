// src/utils/textProcessor.js

/**
 * Извлекает теги из текста с использованием семантического словаря
 * @param {string} text
 * @param {Object} dictionary — предзагруженный словарь
 */
async function extractTags(text, dictionary) {
  const lowerText = text.toLowerCase();
  const tags = new Set();

  for (const [tag, data] of Object.entries(dictionary)) {
    if (!data.формы || !Array.isArray(data.формы)) continue;
    for (const form of data.формы) {
      const normalizedForm = form.trim().toLowerCase();
      if (normalizedForm && lowerText.includes(normalizedForm)) {
        tags.add(tag);
        break;
      }
    }
  }

  if (tags.size === 0) {
    ["размышление", "выбор", "осмысление"].forEach(tag => tags.add(tag));
  }

  return Array.from(tags);
}

/**
 * Определяет уровень рефлексии
 */
function determineReflectionLevel(reflectionText) {
  let level = "средний";
  const levelMatch = reflectionText.match(/Уровень\s*:\s*(.*)$/i);
  if (levelMatch && levelMatch[1]) {
    const extractedLevel = levelMatch[1].trim().toLowerCase().replace(/[^\wа-яё]/gi, '');
    if (["глубокий", "высокий", "глубокая", "высокая"].includes(extractedLevel)) {
      level = "высокий";
    } else if (["средний", "средняя"].includes(extractedLevel)) {
      level = "средний";
    } else if (["поверхностный", "низкий", "поверхностная", "низкая"].includes(extractedLevel)) {
      level = "низкий";
    }
  }
  return level;
}

/**
 * Удаляет строку "Уровень: ..." из текста рефлексии
 */
function cleanReflectionText(reflectionText) {
  return reflectionText.replace(/Уровень\s*:\s*.*$/i, '').trim();
}

module.exports = { extractTags, determineReflectionLevel, cleanReflectionText };
