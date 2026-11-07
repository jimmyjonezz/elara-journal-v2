const fs = require('fs/promises');
const path = require('path');

async function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  try {
    await fs.access(dirname);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.mkdir(dirname, { recursive: true });
    } else {
      throw err;
    }
  }
}

async function readJSON(filePath, returnEmptyObjectIfError = true) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) {
      console.warn(`⚠️ Файл ${filePath} пуст.`);
      return returnEmptyObjectIfError ? {} : null;
    }
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`⚠️ Ошибка при чтении ${filePath}:`, err.message);
    }
    return returnEmptyObjectIfError ? {} : null;
  }
}

async function writeJSON(filePath, data) {
  await ensureDirectoryExistence(filePath);
  // Атомарная запись через temp + rename: прямой fs.writeFile при обрыве
  // посередине оставит половину файла — JSON тогда не парсится, readJSON
  // вернёт {} и следующий прогон может затереть, например, весь журнал.
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, filePath);
  console.log(`✅ Файл ${filePath} успешно сохранён.`);
}

module.exports = {
  ensureDirectoryExistence,
  readJSON,
  writeJSON,
};
