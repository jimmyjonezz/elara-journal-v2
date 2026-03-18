"""
Скрипт генерации изображения для Журнала Элары.
Использует промпт из data/latest_image_prompt.txt и дату из data/journal.json.
Сохраняет изображение в data/images/{date}.webp
Теперь через Grok Imagine API (xAI).
"""

import requests
import os
import datetime
import json
import sys

# Убедитесь, что установлен API ключ xAI
XAI_API_KEY = os.environ.get("XAI_API_KEY")
if not XAI_API_KEY:
    print("❌ Не найден API ключ xAI")
    print("Пожалуйста, установите переменную окружения XAI_API_KEY (получите на https://console.x.ai)")
    sys.exit(1)

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

# Генерируем изображение через Grok Imagine
try:
    print("🎨 Запускаем генерацию через Grok Imagine API (grok-imagine-image)...")

    headers = {
        "Authorization": f"Bearer {XAI_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "grok-imagine-image",          # официальная модель для изображений
        "prompt": prompt_text,
        "n": 1,
        "aspect_ratio": "1:1",                  # как было в оригинале
        "seed": 2909,                           # для постоянства стиля (если поддерживается)
        # "quality": "high"                     # можно добавить при необходимости
    }

    api_response = requests.post(
        "https://api.x.ai/v1/images/generations",
        headers=headers,
        json=payload,
        timeout=120
    )

    if api_response.status_code != 200:
        print(f"❌ Ошибка API: {api_response.status_code}")
        print(api_response.text)
        sys.exit(1)

    data = api_response.json()
    image_url = data["data"][0]["url"]
    print(f"✅ Изображение сгенерировано! URL: {image_url}")

    # Скачиваем
    print("⬇️ Скачиваем изображение...")
    response = requests.get(image_url, headers={'User-Agent': 'Mozilla/5.0 (compatible; ImageGenerator/1.0)'})

    if response.status_code != 200:
        raise requests.HTTPError(f"HTTP {response.status_code}")

    # Сохраняем
    filename = f"{entry_date_str}.webp"
    filepath = os.path.join(IMAGES_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(response.content)

    print(f"✅ Изображение сохранено: {filepath}")
    print(f"📍 Полный путь: {os.path.abspath(filepath)}")

except requests.RequestException as e:
    print(f"❌ Ошибка сети/API: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Непредвиденная ошибка: {e}")
    sys.exit(1)
