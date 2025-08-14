# vk_poster.py
"""
Автоматическая публикация поста в группу ВКонтакте
С текстом из рефлексии Элары и сгенерированным изображением
"""

import os
import json
import requests
from datetime import datetime

# Импортируем наши модули
try:
    from post_generator import create_post, load_latest_entry
    from image_generator import generate_image_prompt, call_llm_for_image_prompt, generate_image, download_image
except ImportError as e:
    print(f"❌ Ошибка импорта: {e}")
    exit(1)

# Конфигурация ВКонтакте
VK_GROUP_ID = os.getenv("VK_GROUP_ID")
VK_ACCESS_TOKEN = os.getenv("VK_ACCESS_TOKEN")
VK_API_VERSION = "5.131"

# Путь для сохранения изображений
IMAGE_DIR = "images"
os.makedirs(IMAGE_DIR, exist_ok=True)

# Функции для работы с API ВКонтакте
def get_wall_upload_server():
    url = "https://api.vk.com/method/photos.getWallUploadServer"
    params = {
        "group_id": VK_GROUP_ID,
        "access_token": VK_ACCESS_TOKEN,
        "v": VK_API_VERSION
    }
    response = requests.get(url, params=params)
    data = response.json()
    if "response" in data:
        return data["response"]["upload_url"]
    else:
        print("❌ Ошибка получения сервера загрузки:", data)
        return None


def upload_image_to_server(upload_url, image_path):
    files = {"photo": open(image_path, "rb")}
    response = requests.post(upload_url, files=files)
    return response.json()


def save_wall_photo(photo, server, hash_value):
    url = "https://api.vk.com/method/photos.saveWallPhoto"
    params = {
        "group_id": VK_GROUP_ID,
        "photo": photo,
        "server": server,
        "hash": hash_value,
        "access_token": VK_ACCESS_TOKEN,
        "v": VK_API_VERSION
    }
    response = requests.post(url, params=params)
    data = response.json()
    if "response" in data:
        photo_data = data["response"][0]
        return f"photo{photo_data['owner_id']}_{photo_data['id']}"
    else:
        print("❌ Ошибка сохранения фото:", data)
        return None


def post_to_vk(message, attachment=None):
    url = "https://api.vk.com/method/wall.post"
    params = {
        "owner_id": -int(VK_GROUP_ID),
        "from_group": 1,
        "message": message,
        "signed": 0,
        "access_token": VK_ACCESS_TOKEN,
        "v": VK_API_VERSION
    }
    if attachment:
        params["attachments"] = attachment

    response = requests.post(url, params=params)
    return response.json()


def main():
    print("🚀 Подготовка поста для ВКонтакте...")

    # 1. Загружаем последнюю запись
    entry = load_latest_entry()
    if not entry:
        print("❌ Нечего публиковать")
        return

    # 2. Генерируем текст поста
    try:
        post_text = create_post(entry)
        print("✅ Текст поста сгенерирован")
    except Exception as e:
        print(f"❌ Ошибка генерации текста: {e}")
        return

    # 3. Генерируем изображение
    reflection_text = entry.get("entry", "")
    image_path = None

    if reflection_text.strip():
        try:
            print("🎨 Генерация изображения...")

            # Шаг 1: Создаём промпт для изображения
            prompt = generate_image_prompt(reflection_text)
            image_prompt = call_llm_for_image_prompt(prompt)
            print(f"🖼️ Промпт для изображения: {image_prompt}")

            # Шаг 2: Генерируем изображение
            image_url = generate_image(image_prompt)
            if image_url:
                # Шаг 3: Скачиваем
                filename = f"elara_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                image_path = download_image(image_url, filename)
            else:
                print("❌ Не удалось получить URL изображения")
        except Exception as e:
            print(f"❌ Ошибка генерации изображения: {e}")
    else:
        print("⚠️ Рефлексия пуста — изображение не генерируется")

    # 4. Загружаем изображение в ВК (если есть)
    attachment = None
    if image_path and os.path.exists(image_path):
        try:
            upload_url = get_wall_upload_server()
            if upload_url:
                upload_data = upload_image_to_server(upload_url, image_path)
                photo_data = save_wall_photo(
                    upload_data["photo"],
                    upload_data["server"],
                    upload_data["hash"]
                )
                if photo_data:
                    attachment = photo_data
                    print("✅ Изображение загружено в ВК")
        except Exception as e:
            print(f"❌ Ошибка загрузки в ВК: {e}")

    # 5. Публикуем пост
    try:
        result = post_to_vk(post_text, attachment)
        if "response" in result:
            post_id = result["response"]["post_id"]
            print(f"✅ Пост опубликован: https://vk.com/club{VK_GROUP_ID}?w=wall-{VK_GROUP_ID}_{post_id}")
        else:
            print(f"❌ Ошибка публикации: {result}")
    except Exception as e:
        print(f"❌ Ошибка API ВК: {e}")


if __name__ == "__main__":
    # Проверка переменных окружения
    if not VK_GROUP_ID:
        print("❌ VK_GROUP_ID не задан в переменных окружения")
        exit(1)
    if not VK_ACCESS_TOKEN:
        print("❌ VK_ACCESS_TOKEN не задан в переменных окружения")
        exit(1)

    main()
