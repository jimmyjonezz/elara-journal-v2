"""
Скрипт генерации изображения для Журнала Элары.
Использует промпт из data/latest_image_prompt.txt и дату из data/journal.json.
Сохраняет изображение в data/images/{date}.webp
Через DashScope Image API (Qwen).
"""

import requests
import os
import datetime
import json
import sys
import time

# API ключ DashScope
QWEN_TOKEN = os.environ.get("QWEN_TOKEN")
if not QWEN_TOKEN:
    print("❌ Не найден API ключ QWEN_TOKEN")
    print("Пожалуйста, установите переменную окружения QWEN_TOKEN")
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

# Генерируем изображение через DashScope Image API
try:
    print("🎨 Запускаем генерацию через DashScope (qwen-image-2.0-pro)...")

    headers = {
        "Authorization": f"Bearer {QWEN_TOKEN}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "qwen-image-2.0-pro",
        "input": {
            "prompt": prompt_text,
        },
        "parameters": {
            "size": "1024x1024",
            "n": 1,
        }
    }

    api_response = requests.post(
        "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
        headers=headers,
        json=payload,
        timeout=120
    )

    if api_response.status_code != 200:
        print(f"❌ Ошибка API: {api_response.status_code}")
        try:
            err = api_response.json()
            code = err.get("code", "?")
            msg = err.get("message", api_response.text[:200])
            print(f"   Код: {code}")
            print(f"   Сообщение: {msg}")
            if code == "Throttling.RateQuota":
                print("   ⏳ Достигнут лимит запросов. Попробуйте позже.")
        except Exception:
            print(api_response.text[:300])
        sys.exit(1)

    data = api_response.json()

    # Синхронный режим: результат сразу в output.results
    if "output" in data and "results" in data["output"]:
        image_url = data["output"]["results"][0]["url"]
    else:
        print(f"❌ Неожиданный формат ответа: {json.dumps(data, indent=2)[:300]}")
        sys.exit(1)

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
