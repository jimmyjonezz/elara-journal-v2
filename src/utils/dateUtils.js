// src/utils/dateUtils.js

/**
 * Определяет текущий сезон по дате (северное полушарие)
 */
function getCurrentSeason() {
  const month = new Date().getMonth() + 1; // 1–12
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

module.exports = { getCurrentSeason };
