# vk_poster.py
"""
Автоматическая публикация поста в группу ВКонтакте
Использует API ВКонтакте и токен группы
"""

import os
import json
import requests
import glob
from datetime import datetime
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
    if 'error' in data:
        raise Exception(f"VK API Error getting upload server: {data['error']}")
    return data["response"]["upload_url"]


def upload_image_to_server(upload_url, image_path):
    """Загружает изображение на сервер ВК"""
    with open(image_path, "rb") as f:
        files = {"photo": f}
        response = requests.post(upload_url, files=files)
    data = response.json()
    if 'error' in data:
        raise Exception(f"VK API Error uploading photo: {data['error']}")
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
    if 'error' in data:
        raise Exception(f"VK API Error saving photo: {data['error']}")
    return data["response"][0]  # attachment object


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


def get_latest_image_from_folder(folder_path="data/images/"):
    """Находит последнее по дате создания изображение в папке"""
    # Поддерживаемые расширения изображений
    extensions = ["*.webp", "*.png", "*.jpg", "*.jpeg"]
    image_files = []
    for ext in extensions:
        # Ищем файлы в указанной папке
        image_files.extend(glob.glob(os.path.join(folder_path, ext)))
        image_files.extend(glob.glob(os.path.join(folder_path, ext.upper()))) # для *.WEBP и т.п.

    if not image_files:
        print(f"🖼️ В папке {folder_path} не найдено изображений.")
        return None

    # Находим файл с самой поздней датой модификации (mtime)
    latest_file = max(image_files, key=os.path.getmtime)
    latest_time = datetime.fromtimestamp(os.path.getmtime(latest_file))
    print(f"🖼️ Найдено последнее изображение: {latest_file} (изменено: {latest_time.strftime('%Y-%m-%d %H:%M:%S')})")
    return latest_file


def main():
    print("🚀 Подготовка поста для ВКонтакте...")

    # 1. Генерируем текст поста
    entry = load_latest_entry()
    if not entry:
        print("❌ Нечего публиковать")
        return

    post_text = create_post(entry)

    # 2. Находим последнее сгенерированное изображение
    image_path = get_latest_image_from_folder()

    if not image_path or not os.path.exists(image_path):
        print(f"🖼️ Изображение не найдено или путь неверен: {image_path} → публикация без фото")
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
