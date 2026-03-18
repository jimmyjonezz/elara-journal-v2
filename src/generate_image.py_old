#src/generate_image.py
"""
Скрипт генерации изображения для Журнала Элары.
Использует промпт из data/latest_image_prompt.txt и дату из data/journal.json.
Сохраняет изображение в data/images/{date}.webp
"""

import replicate
import requests
import os
import datetime
import json
import sys

# 🔑 Убедитесь, что установлен API ключ Replicate
REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN")
if not REPLICATE_API_TOKEN or not REPLICATE_API_TOKEN.startswith("r8_"):
    print("❌ Не найден или некорректный API ключ Replicate (ожидается r8_...)")
    print("Пожалуйста, установите переменную окружения REPLICATE_API_TOKEN.")
    sys.exit(1)

# 📁 Определяем пути
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
IMAGES_DIR = os.path.join(DATA_DIR, "images")
IMAGE_PROMPT_FILE = os.path.join(DATA_DIR, "latest_image_prompt.txt")
JOURNAL_FILE = os.path.join(DATA_DIR, "journal.json")

# 📁 Создаём папку для изображений, если её нет
os.makedirs(IMAGES_DIR, exist_ok=True)

# 📄 Читаем дату последней записи из journal.json
try:
    with open(JOURNAL_FILE, "r", encoding="utf-8") as f:
        journal_data = json.load(f)
    if not journal_data or not isinstance(journal_data, list):
        raise ValueError("Файл journal.json пуст или не содержит массив записей.")
    last_entry = journal_data[-1]  # Берём последнюю запись
    entry_date_str = last_entry.get("date")
    if not entry_date_str:
        raise ValueError("Поле 'date' отсутствует в последней записи journal.json.")
    # Проверяем формат даты (YYYY-MM-DD)
    entry_date = datetime.datetime.strptime(entry_date_str, "%Y-%m-%d").date()
    print(f"✅ Дата из последней записи: {entry_date_str}")
except FileNotFoundError:
    print(f"❌ Файл {JOURNAL_FILE} не найден!")
    sys.exit(1)
except (ValueError, KeyError, IndexError) as e:
    print(f"❌ Ошибка чтения даты из {JOURNAL_FILE}: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Непредвиденная ошибка при чтении {JOURNAL_FILE}: {e}")
    sys.exit(1)

# 📄 Читаем промпт из latest_image_prompt.txt
try:
    with open(IMAGE_PROMPT_FILE, "r", encoding="utf-8") as f:
        prompt_text = f.read().strip()
    if not prompt_text:
        raise ValueError("Файл latest_image_prompt.txt пуст.")
    print("✅ Промпт загружен из latest_image_prompt.txt")
except FileNotFoundError:
    print(f"❌ Файл {IMAGE_PROMPT_FILE} не найден!")
    print("Убедитесь, что generate_entry.js успешно отработал и создал файл.")
    sys.exit(1)
except Exception as e:
    print(f"❌ Ошибка чтения файла {IMAGE_PROMPT_FILE}: {e}")
    sys.exit(1)

# 🖼️ Генерируем изображение
try:
    print("🖼️ Запускаем генерацию изображения через Replicate (black-forest-labs/flux-dev)...")

    output = replicate.run(
        "black-forest-labs/flux-dev",
        input={
            "prompt": prompt_text,
            "go_fast": True,
            "guidance": 4.5,
            "megapixels": "1",
            "num_outputs": 1,
            "aspect_ratio": "1:1",
            "output_format": "webp",
            "output_quality": 80,
            "prompt_strength": 0.8,
            "num_inference_steps": 28,
            "seed": 2909 # <-- ИСПРАВЛЕНО: seed возвращён для постоянства облика
        }
    )

    if not output or len(output) == 0:
        raise ValueError("Replicate вернул пустой ответ.")

    image_url = output[0]
    print(f"✅ Изображение сгенерировано! Ссылка: {image_url}")

    # 📥 Скачиваем изображение
    print("📥 Скачиваем изображение...")
    response = requests.get(image_url, headers={'User-Agent': 'Mozilla/5.0 (compatible; ImageGenerator/1.0)'})

    if response.status_code != 200:
        raise requests.HTTPError(f"HTTP {response.status_code}: Не удалось скачать изображение.")

    # 🆕 Формируем имя файла на основе даты записи
    filename = f"{entry_date_str}.webp"
    filepath = os.path.join(IMAGES_DIR, filename)

    # 📁 Проверяем, существует ли файл с таким именем (на случай повторного запуска)
    if os.path.exists(filepath):
        print(f"⚠️ Файл {filepath} уже существует. Перезаписываем...")

    with open(filepath, "wb") as f:
        f.write(response.content)

    print(f"✅ Изображение успешно сохранено как '{filepath}'")
    print(f"📁 Полный путь: {os.path.abspath(filepath)}")

except replicate.exceptions.ReplicateError as e:
    print(f"❌ Ошибка Replicate API: {e}")
    sys.exit(1)
except requests.RequestException as e:
    print(f"❌ Ошибка скачивания изображения: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Непредвиденная ошибка: {e}")
    sys.exit(1)
