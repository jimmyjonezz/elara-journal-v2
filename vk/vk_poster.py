# vk_poster.py
"""
Автоматическая публикация поста в группу ВКонтакте
Использует API ВКонтакте и токен группы
"""

import os
import json
import requests
from post_generator import create_post, load_latest_entry

# Конфигурация ВКонтакте
VK_GROUP_ID = os.getenv("VK_GROUP_ID")        # например: 222111000
VK_ACCESS_TOKEN = os.getenv("VK_ACCESS_TOKEN") # токен группы
VK_API_VERSION = "5.199"

def get_wall_upload_server():
    """Получает адрес сервера для загрузки изображений"""
    url = "https://api.vk.ru/method/photos.getWallUploadServer"
    params = {
        "group_id": VK_GROUP_ID,
        "access_token": VK_ACCESS_TOKEN,
        "v": VK_API_VERSION
    }
    response = requests.get(url, params=params)
    data = response.json()
    return data["response"]["upload_url"]


def upload_image_to_server(upload_url, image_path):
    """Загружает изображение на сервер ВК"""
    files = {"photo": open(image_path, "rb")}
    response = requests.post(upload_url, files=files)
    data = response.json()
    return data


def save_wall_photo(photo, server, hash_value):
    """Сохраняет фото в альбоме группы"""
    url = "https://api.vk.ru/method/photos.saveWallPhoto"
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
    return data["response"][0]  # attachment string


def post_to_vk(message, attachment=None):
    """Публикует пост на стене группы"""
    url = "https://api.vk.ru/method/wall.post"
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

    # 1. Генерируем текст поста
    entry = load_latest_entry()
    if not entry:
        print("❌ Нечего публиковать")
        return

    post_text = create_post(entry)

    # 2. Загружаем изображение (лог, скриншот и т.п.)
    image_path = "logs/latest_run.png"  # или путь к вашему изображению
    if not os.path.exists(image_path):
        print(f"🖼️ Изображение не найдено: {image_path} → публикация без фото")
        result = post_to_vk(post_text)
    else:
        try:
            # Получаем сервер загрузки
            upload_url = get_wall_upload_server()

            # Загружаем изображение
            upload_data = upload_image_to_server(upload_url, image_path)

            # Сохраняем фото в альбоме
            photo_data = save_wall_photo(
                upload_data["photo"],
                upload_data["server"],
                upload_data["hash"]
            )

            # Формируем вложение
            attachment = f"photo{photo_data['owner_id']}_{photo_data['id']}"

            # Публикуем с фото
            result = post_to_vk(post_text, attachment)
        except Exception as e:
            print(f"❌ Ошибка с изображением: {e}")
            print("📤 Публикация без изображения...")
            result = post_to_vk(post_text)

    # 3. Результат
    if "response" in result:
        print(f"✅ Пост опубликован: https://vk.ru/club{VK_GROUP_ID}")
        print(f"Post ID: {result['response']['post_id']}")
    else:
        print(f"❌ Ошибка публикации: {result}")


if __name__ == "__main__":
    main()
