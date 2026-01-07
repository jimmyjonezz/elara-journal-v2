// src/utils/sceneParser.js

/**
 * Извлекает Pose и Setting из блока [SCENE] и удаляет его из текста эссе.
 * @param {string} rawEssayText - Исходный текст эссе, содержащий блок [SCENE].
 * @returns {Object} Объект с полями pose, setting и essayWithoutScene.
 */
function parseScene(rawEssay) {
  let pose = "she is sitting curled up in a worn vintage armchair, with her legs tucked under her.";
  let setting = "a dimly lit room filled with books, the last rays of the autumn sun.";

  // Регулярное выражение для поиска блока [SCENE] от начала до конца (включая [/SCENE] или до конца строки/текста)
  // Используем жадный захват [\s\S]*? только для содержимого Setting, но четко определяем конец блока.
  // (?=...) - позитивная опережающая проверка, не входит в захват.
  const sceneRegex = /\[SCENE\]\s*\nPose:\s*([^\n]*)\s*\nSetting:\s*([\s\S]*?)(?=\n\s*\[\/SCENE\]|\n\s*\n|$)/;

  const sceneMatch = rawEssay.match(sceneRegex);

  if (sceneMatch) {
    pose = sceneMatch[1].trim().replace(/\.$/, '');
    // Убираем лишние переводы строк и пробелы из setting
    setting = sceneMatch[2].trim().replace(/\.$/, '');
    console.log(`🖼️ Извлечена сцена: Поза="${pose}", Обстановка="${setting}"`);
  } else {
    console.warn('⚠️ Блок [SCENE] не найден. Используются значения по умолчанию.');
  }

  // Регулярное выражение для УДАЛЕНИЯ ВСЕГО блока [SCENE] (включая Pose, Setting и опциональный [/SCENE])
  // Более точное, учитывает возможное отсутствие [/SCENE] и разные окончания
  // Удаляет [SCENE], Pose, Setting и до следующего \n\n или [/SCENE]\n\n или конца строки/текста
  const sceneBlockRegex = /\[SCENE\][\s\S]*?\n(?:\s*\[\/SCENE\])?(?=\s*\n|$)/;

  // Удаляем ВЕСЬ блок, включая [/SCENE] или пустую строку после него
  const essayWithoutScene = rawEssay.replace(sceneBlockRegex, '').trim();

  return { pose, setting, essayWithoutScene };
}

module.exports = { parseScene };
