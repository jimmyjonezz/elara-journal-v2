"""
Автоматическая публикация поста в группу ВКонтакте
Использует библиотеку vk_api для взаимодействия с API ВКонтакте.
Предполагается использование токена сообщества.
"""

import os
import json
import vk_api  # Импортируем библиотеку vk_api
import glob
from datetime import datetime
from post_generator import create_post, load_latest_entry

# Конфигурация ВКонтакте
VK_GROUP_ID_RAW = os.getenv("VK_GROUP_ID")  # например: 222111000 (в виде строки)
VK_ACCESS_TOKEN = os.getenv("VK_ACCESS_TOKEN") # токен сообщества
VK_API_VERSION = "5.199"

def get_oldest_image_from_folder(folder_path="data/images/"):
    """Находит САМОЕ СТАРОЕ (по дате модификации) изображение в папке"""
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

    # Находим файл с САМОЙ РАННЕЙ датой модификации (mtime)
    oldest_file = min(image_files, key=os.path.getmtime)
    oldest_time = datetime.fromtimestamp(os.path.getmtime(oldest_file))
    print(f"🖼️ Найдено САМОЕ СТАРОЕ изображение: {oldest_file} (изменено: {oldest_time.strftime('%Y-%m-%d %H:%M:%S')})")
    return oldest_file

def delete_image(image_path):
    """Удаляет файл изображения."""
    try:
        os.remove(image_path)
        print(f"🗑️ Удалено старое изображение: {image_path}")
    except OSError as e:
        print(f"❌ Ошибка при удалении изображения {image_path}: {e}")


def main():
    print("🚀 Подготовка поста для ВКонтакте...")

    # Проверка и преобразование VK_GROUP_ID
    if not VK_GROUP_ID_RAW:
        print("❌ Ошибка: Не задан VK_GROUP_ID в переменных окружения.")
        return
    try:
        # Убираем знак минус, если он есть, так как vk_api ожидает положительное число для group_id в upload методах
        # Но для wall.post нужно отрицательное
        VK_GROUP_ID = int(VK_GROUP_ID_RAW.lstrip('-'))
    except ValueError:
        print(f"❌ Ошибка: VK_GROUP_ID должен быть числом, получено: '{VK_GROUP_ID_RAW}'")
        return

    # 1. Инициализация API ВКонтакте через библиотеку
    try:
        session = vk_api.VkApi(token=VK_ACCESS_TOKEN, api_version=VK_API_VERSION)
        # Проверка токена (опционально, но полезно для отладки)
        session.get_api().users.get()
        print("✅ Токен ВКонтакте действителен.")
    except vk_api.exceptions.ApiError as e:
        print(f"❌ Ошибка аутентификации ВКонтакте: {e}")
        return
    except Exception as e:
        print(f"❌ Ошибка инициализации ВКонтакте: {e}")
        return

    # 2. Генерируем текст поста
    entry = load_latest_entry()
    if not entry:
        print("❌ Нечего публиковать")
        return

    post_text = create_post(entry)

    # 3. Находим САМОЕ СТАРОЕ сгенерированное изображение
    image_path = get_oldest_image_from_folder()

    # 4. Инициализация загрузчика
    upload = vk_api.upload.VkUpload(session)

    attachment = None
    if not image_path or not os.path.exists(image_path):
        print(f"🖼️ Изображение не найдено или путь неверен: {image_path} → публикация без фото")
    else:
        try:
            # Загружаем фото на стену (библиотека сама обрабатывает получение сервера, загрузку и сохранение)
            photo_list = upload.photo_wall(photos=image_path, group_id=VK_GROUP_ID)
            # Формируем вложение
            attachment = f"photo{photo_list[0]['owner_id']}_{photo_list[0]['id']}"
            print(f"🖼️ Изображение загружено и готово к публикации: {attachment}")
        except vk_api.exceptions.ApiError as e:
            print(f"❌ Ошибка загрузки изображения в ВК: {e}")
            print("📤 Публикация без изображения...")
        except Exception as e:
            print(f"❌ Неожиданная ошибка при загрузке изображения: {e}")
            print("📤 Публикация без изображения...")

    # 5. Публикация поста
    try:
        api = session.get_api()
        result = api.wall.post(
            owner_id=-VK_GROUP_ID,  # Отрицательный ID для группы
            from_group=1,
            message=post_text,
            attachments=attachment # Передаём вложение (может быть None)
        )
        print(f"✅ Пост опубликован: https://vk.ru/wall-{VK_GROUP_ID}_{result['post_id']}")
        post_id = result['post_id']
    except vk_api.exceptions.ApiError as e:
        print(f"❌ Ошибка публикации поста в ВК: {e}")
        return
    except Exception as e:
        print(f"❌ Неожиданная ошибка при публикации поста: {e}")
        return

    # 6. Удаление изображения (только если оно существовало и было найдено)
    if image_path and os.path.exists(image_path):
        delete_image(image_path)


if __name__ == "__main__":
    main()
