"""
Скрипт генерации изображения для Журнала Элары.
Использует промпт из data/latest_image_prompt.txt и дату из data/journal.json.
Сохраняет изображение в data/images/{date}.webp
Через Pollinations API (бесплатно, без ключа).
"""

import requests
import os
import datetime
import json
import sys
import urllib.parse

# Определяем пути
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
IMAGES_DIR = os.path.join(DATA_DIR, "images")
IMAGE_PROMPT_FILE = os.path.join(DATA_DIR, "latest_image_prompt.txt")
JOURNAL_FILE = os.path.join(DATA_DIR, "journal.json")

# Создаём папку для изображений
os.makedirs(IMAGES_DIR, exist_ok=True)

# Читаем дату последней записи
try:
    with open(JOURNAL_FILE, "r", encoding="utf-8") as f:
        journal_data = json.load(f)
    last_entry = journal_data[-1]
    entry_date_str = last_entry.get("date")
    entry_date = datetime.datetime.strptime(entry_date_str, "%Y-%m-%d").date()
    print(f"📅 Дата из последней записи: {entry_date_str}")
except Exception as e:
    print(f"❌ Ошибка чтения journal.json: {e}")
    sys.exit(1)

# Читаем промпт
try:
    with open(IMAGE_PROMPT_FILE, "r", encoding="utf-8") as f:
        prompt_text = f.read().strip()
    if not prompt_text:
        raise ValueError("Файл latest_image_prompt.txt пуст.")
    print("✅ Промпт загружен")
except Exception as e:
    print(f"❌ Ошибка чтения промпта: {e}")
    sys.exit(1)

# Генерируем изображение через Pollinations API
try:
    print("🎨 Запускаем генерацию через Pollinations...")

    # URL-кодируем промпт
    encoded = urllib.parse.quote(prompt_text[:200])
    url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=1024&model=realistic-vision&nologo=true&seed={entry_date.strftime('%Y%m%d')}&negative=bad+anatomy+mutation+extra+fingers+deformed"

    print(f"⬇️ Скачиваем изображение...")
    response = requests.get(url, timeout=60)

    if response.status_code != 200:
        print(f"❌ Ошибка API: {response.status_code}")
        print(response.text[:200])
        sys.exit(1)

    # Сохраняем
    filename = f"{entry_date_str}.webp"
    filepath = os.path.join(IMAGES_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(response.content)

    print(f"✅ Изображение сохранено: {filepath}")
    print(f"📍 Полный путь: {os.path.abspath(filepath)}")
    print(f"   Размер: {len(response.content)} байт")

except requests.RequestException as e:
    print(f"❌ Ошибка сети/API: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Непредвиденная ошибка: {e}")
    sys.exit(1)
