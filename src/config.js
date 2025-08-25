const path = require('path');

module.exports = {
  DATA_DIR: path.join(__dirname, '../data'),
  JOURNAL_PATH: path.join(__dirname, '../data/journal.json'),
  ANALYSIS_PATH: path.join(__dirname, '../data/literary_analysis.json'),
  DYNAMIC_TAGS_PATH: path.join(__dirname, '../data/dynamic_tags.json'),
  TAG_STATS_PATH: path.join(__dirname, '../data/tag_statistics.json'),
  PROMPT_TEMPLATE_PATH: path.join(__dirname, 'prompt_templates/analyst_prompt.txt'),

  MAX_RETRIES: 3,
  BASE_DELAY_MS: 2000
};
