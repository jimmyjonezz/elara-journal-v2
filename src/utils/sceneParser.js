// src/utils/sceneParser.js

/**
 * Извлекает Pose и Setting из блока [SCENE] и удаляет его из текста эссе.
 * @param {string} rawEssayText - Исходный текст эссе, содержащий блок [SCENE].
 * @returns {Object} Объект с полями pose, setting и essayWithoutScene.
 */
function parseScene(rawEssay) {
  let pose = "she is sitting curled up in a worn vintage armchair, with her legs tucked under her.";
  let setting = "a dimly lit room filled with books, the last rays of the autumn sun.";

  // Одинаковая регулярка для поиска и удаления
  const sceneRegex = /\[SCENE\]\s*\nPose:\s*([^\n]*)\s*\nSetting:\s*([\s\S]*?)(?:\n\s*\[\/SCENE\]|\n\s*\n|$)/;

  const sceneMatch = rawEssay.match(sceneRegex);

  if (sceneMatch) {
    pose = sceneMatch[1].trim().replace(/\.$/, '');
    setting = sceneMatch[2].trim().replace(/\.$/, '');
    console.log(`🖼️ Извлечена сцена: Поза="${pose}", Обстановка="${setting}"`);
  } else {
    console.warn('⚠️ Блок [SCENE] не найден. Используются значения по умолчанию.');
  }

  // Удаляем ВЕСЬ блок, включая [/SCENE] или пустую строку
  const essayWithoutScene = rawEssay.replace(sceneRegex, '').trim();

  return { pose, setting, essayWithoutScene };
}

module.exports = { parseScene };
