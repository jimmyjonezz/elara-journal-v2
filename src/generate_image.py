#!/usr/bin/env python3
"""
Генерация изображения для Журнала Элары.
Промпт — data/latest_image_prompt.txt, дата — data/journal.json.
Генерация через Pollinations API (модель FLUX 3 Max, бесплатная),
авторизация по ключу из переменной окружения FLUX (GitHub Secret).
Сохраняет в data/images/{date}.{расширение по сигнатуре байтов}.

Старый legacy-эндпоинт image.pollinations.ai/prompt/ параметр модели
молча игнорирует (все модели отдают побайтово одну и ту же картинку),
поэтому используется OpenAI-совместимый gen.pollinations.ai.
"""

import os
import sys
import json
import base64
import datetime

import requests

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
IMAGES_DIR = os.path.join(DATA_DIR, "images")
IMAGE_PROMPT_FILE = os.path.join(DATA_DIR, "latest_image_prompt.txt")
JOURNAL_FILE = os.path.join(DATA_DIR, "journal.json")

API_URL = "https://gen.pollinations.ai/v1/images/generations"
# Дефолт — flux.2-klein-4b: рабочий компромисс качества и доступности на
# бесплатном ключе (0 pollen на балансе). Эмпирически проверено 08.11.2026:
# ✅ работают: flux.1-schnell, flux.1-kontext-pro, flux.2-klein-4b,
#    tongyi-mai/z-image-turbo
# ❌ flux-3-max — grant категории video; flux-3-image — ненулевой баланс;
#    flux.1.1-pro — детерминированный отказ content-moderation на промптах
#    дневника (апстрим myceli режет интимные описания персонажа)
MODEL = os.environ.get("FLUX_IMAGE_MODEL", "black-forest-labs/flux.2-klein-4b")


def ext_of(raw, media_type):
    """Расширение по сигнатуре байтов, а не по заголовку — иначе можно
    положить JPEG в файл с расширением .webp и сломать загрузку в ВК."""
    if raw.startswith(b"\xff\xd8"):
        return "jpg"
    if raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
        return "webp"
    if raw.startswith(b"\x89PNG"):
        return "png"
    if media_type:
        return media_type.split("/")[-1].replace("jpeg", "jpg")
    return "png"


def main():
    api_key = os.environ.get("FLUX")
    if not api_key:
        print("❌ Нет ключа FLUX (GitHub Secret FLUX) — генерация отменена.")
        sys.exit(2)

    os.makedirs(IMAGES_DIR, exist_ok=True)

    # Дата последней записи — по ней именуется файл и считается seed
    try:
        with open(JOURNAL_FILE, "r", encoding="utf-8") as f:
            journal_data = json.load(f)
        entry_date_str = journal_data[-1].get("date")
        entry_date = datetime.datetime.strptime(entry_date_str, "%Y-%m-%d").date()
        print(f"📅 Дата из последней записи: {entry_date_str}")
    except Exception as e:
        print(f"❌ Ошибка чтения journal.json: {e}")
        sys.exit(1)

    # Промпт целиком — лимит API 32000 символов
    try:
        with open(IMAGE_PROMPT_FILE, "r", encoding="utf-8") as f:
            prompt_text = f.read().strip()
        if not prompt_text:
            raise ValueError("Файл latest_image_prompt.txt пуст.")
        print(f"✅ Промпт загружен ({len(prompt_text)} символов)")
    except Exception as e:
        print(f"❌ Ошибка чтения промпта: {e}")
        sys.exit(1)

    # Seed детерминирован дате — повторный прогон того же дня не плодит варианты
    seed = int(entry_date.strftime("%Y%m%d"))
    print(f"🎨 Генерация: model={MODEL}, seed={seed}, size=1024x1024")

    try:
        response = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "prompt": prompt_text,
                "n": 1,
                "size": "1024x1024",
                "seed": seed,
                "response_format": "b64_json",
            },
            timeout=420,
        )
    except requests.RequestException as e:
        print(f"❌ Ошибка сети/API: {e}")
        sys.exit(1)

    if response.status_code != 200:
        print(f"❌ API вернул {response.status_code}: {response.text[:400]}")
        sys.exit(1)

    try:
        data = response.json().get("data") or []
    except ValueError:
        print(f"❌ Ответ не JSON: {response.text[:300]}")
        sys.exit(1)

    if not data:
        print("❌ Пустой data в ответе API")
        sys.exit(1)

    item = data[0]
    media_type = item.get("media_type")

    if item.get("b64_json"):
        raw = base64.b64decode(item["b64_json"])
    elif item.get("url"):
        print(f"⬇️ Скачиваем с {item['url'][:80]}...")
        img_resp = requests.get(item["url"], timeout=180)
        if img_resp.status_code != 200:
            print(f"❌ Не удалось скачать изображение: {img_resp.status_code}")
            sys.exit(1)
        raw = img_resp.content
        if not media_type:
            media_type = img_resp.headers.get("Content-Type")
    else:
        print("❌ В ответе нет ни b64_json, ни url")
        sys.exit(1)

    # Slug модели в имени файла: test-прогоны разных моделей не перетирают
    # друг друга (никто из потребителей не завязан на точное имя: vk-постер
    # берёт картинку по mtime, сайт images не использует).
    ext = ext_of(raw, media_type)
    model_slug = MODEL.rsplit("/", 1)[-1]
    filename = f"{entry_date_str}.{model_slug}.{ext}"
    filepath = os.path.join(IMAGES_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(raw)

    print(f"✅ Изображение сохранено: {filepath}")
    print(f"   Размер: {len(raw)} байт, формат: {ext}")
    if item.get("revised_prompt"):
        print(f"   Переписанный промпт: {item['revised_prompt'][:120]}")


if __name__ == "__main__":
    main()
