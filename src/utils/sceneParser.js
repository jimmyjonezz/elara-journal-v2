// src/utils/sceneParser.js

/**
 * Извлекает Pose и Setting из блока [SCENE] и удаляет его из текста эссе.
 * @param {string} rawEssayText - Исходный текст эссе, содержащий блок [SCENE].
 * @returns {Object} Объект с полями pose, setting и essayWithoutScene.
 */
function parseScene(rawEssayText) {
  let pose = "she is sitting curled up in a worn vintage armchair, with her legs tucked under her.";
  let setting = "a dimly lit room filled with books, the last rays of the autumn sun.";

  //Обновленное регулярное выражение, учитывающее [/SCENE]
  //Устойчивый парсинг [SCENE] (английские метки, многострочный Setting)
  const sceneMatch = rawEssay.match(/\[SCENE\]\s*\nPose:\s*([^\n]*)\s*\nSetting:\s*([\s\S]*?)(?=\n\n|\n\[\/SCENE\]|\n\[|$)/);
  if (sceneMatch) {
    pose = sceneMatch[1].trim().replace(/\.$/, '');
    setting = sceneMatch[2].trim().replace(/\.$/, '');
    console.log(`🖼️ Извлечена сцена: Поза="${pose}", Обстановка="${setting}"`);
  } else {
    console.warn('⚠️ Блок [SCENE] не найден. Используются значения по умолчанию.');
  }
  
  //Удаление всего блока [SCENE]... до первого пустого абзаца или конца
  const essayWithoutScene = rawEssay.replace(/\[SCENE\]\s*\nPose:[^\n]*\nSetting:[\s\S]*?(?=\n\n|\n\[\/SCENE\]|\n\[|$)/g,'').trim();
  
  return { pose, setting, essayWithoutScene };
}

module.exports = { parseScene };
