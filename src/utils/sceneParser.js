// src/utils/sceneParser.js

/**
 * Извлекает Pose и Setting из блока [SCENE] и удаляет его из текста эссе.
 * @param {string} rawEssayText - Исходный текст эссе, содержащий блок [SCENE].
 * @returns {Object} Объект с полями pose, setting и essayWithoutScene.
 */
function parseScene(rawEssayText) {
  let pose = "she is sitting curled up in a worn vintage armchair, with her legs tucked under her.";
  let setting = "a dimly lit room filled with books, the last rays of the autumn sun.";

  // Обновленное регулярное выражение, учитывающее [/SCENE]
  const sceneMatch = rawEssayText.match(/\[SCENE\]\s*\n(?:Pose:\s*(.*?)\s*\n)?(?:Setting:\s*(.*?)\s*\n)?\s*\[\/SCENE\]/);

  if (sceneMatch) {
    // Используем захваченные группы, если они есть, иначе значения по умолчанию
    pose = sceneMatch[1] ? sceneMatch[1].trim().replace(/\.$/, '') : pose;
    setting = sceneMatch[2] ? sceneMatch[2].trim().replace(/\.$/, '') : setting;
    console.log(`🖼️ Извлечена сцена: Поза:"${pose}", Обстановка:"${setting}"`);
  } else {
    console.warn('⚠️ Блок [SCENE] в формате [SCENE]\nPose: ...\nSetting: ...\n[/SCENE] не найден. Используются значения по умолчанию.');
  }

  // Удаляем ВЕСЬ блок [SCENE] ... [/SCENE] из текста эссе
  const essayWithoutScene = rawEssayText.replace(/\[SCENE\][\s\S]*?\[\/SCENE\][\s\n]*/, '').trim();

  return { pose, setting, essayWithoutScene };
}

module.exports = { parseScene };
