// src/utils/sceneParser.js

/**
 * Извлекает Pose и Setting из блока [SCENE] и удаляет его из текста эссе.
 * Предполагается, что блок [SCENE] всегда находится в конце rawEssay.
 * @param {string} rawEssayText - Исходный текст эссе, содержащий блок [SCENE] в конце.
 * @returns {Object} Объект с полями pose, setting и essayWithoutScene.
 */
function parseScene(rawEssay) {
  let pose = "she is sitting curled up in a worn vintage armchair, with her legs tucked under her.";
  let setting = "a dimly lit room filled with books, the last rays of the autumn sun.";

  const sceneStartIndex = rawEssay.indexOf('[SCENE]');

  if (sceneStartIndex !== -1) {
    // Извлекаем часть текста *до* [SCENE] для эссе
    let essayWithoutScene = rawEssay.substring(0, sceneStartIndex).trim();

    // Извлекаем часть текста *после* [SCENE] для поиска Pose и Setting
    const sceneContent = rawEssay.substring(sceneStartIndex);

    // Простые регулярки для извлечения Pose и Setting из оставшегося контента
    const poseMatch = sceneContent.match(/Pose:\s*(.*?)(?:\n|$)/i);
    if (poseMatch && poseMatch[1]) {
      pose = poseMatch[1].trim().replace(/\.$/, '');
    }

    const settingMatch = sceneContent.match(/Setting:\s*([\s\S]*?)(?:\n\s*\[\/SCENE\]|\n.*$|$)/i); // Учитываем [/SCENE] или конец строки/текста
    if (settingMatch && settingMatch[1]) {
      setting = settingMatch[1].trim().replace(/\.$/, '');
    }

    console.log(`🖼️ Извлечена сцена: Поза="${pose}", Обстановка="${setting}"`);

    // Возвращаем извлечённые pose, setting и текст эссе без блока [SCENE]
    return { pose, setting, essayWithoutScene };

  } else {
    // Блок [SCENE] не найден
    console.warn('⚠️ Блок [SCENE] не найден в конце raw_essay. Используются значения по умолчанию.');
    // Возвращаем весь текст как essayWithoutScene, если блок не найден
    return { pose, setting, essayWithoutScene: rawEssay.trim() };
  }
}

module.exports = { parseScene };
