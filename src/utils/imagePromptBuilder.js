// src/utils/imagePromptBuilder.js

const fs = require('fs').promises;
const path = require('path');
const { IMAGE_PROMPT_PATH } = require('../config'); // Предполагаем, что путь к шаблону будет в config.js

/**
 * Генерирует промпт для изображения на основе позы и обстановки.
 * @param {string} pose - Описание позы.
 * @param {string} setting - Описание обстановки.
 * @returns {Promise<string>} - Сгенерированный промпт.
 */
async function buildImagePrompt(pose, setting) {
  try {
    // Попробуем прочитать шаблон из файла, определенного в конфигурации
    let template = await fs.readFile(IMAGE_PROMPT_PATH, 'utf8');
    console.log(`🖼️ Используется шаблон промпта из: ${IMAGE_PROMPT_PATH}`);
    let prompt = template
      .replace(/{POSE}/g, pose)
      .replace(/{SETTING}/g, setting);

    return prompt.trim();
  } catch (err) {
    // Если файл шаблона не найден или произошла ошибка, используем минимальный шаблон
    console.warn('⚠️ Не удалось загрузить шаблон промпта изображения, используется базовый шаблон:', err.message);
    return `A 24-year-old woman with long wavy chestnut hair, sitting in a vintage armchair, thoughtful expression, soft golden hour lighting, melancholic atmosphere, cinematic realism, hyperrealistic painting style. Pose: ${pose}. Setting: ${setting}.`;
  }
}

module.exports = { buildImagePrompt };
