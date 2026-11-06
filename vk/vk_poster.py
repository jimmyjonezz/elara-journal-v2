"""
Автоматическая публикация поста в группу ВКонтакте
Использует библиотеку vk_api для взаимодействия с API ВКонтакте.

Важно: публикации на стене группы (wall.post, photo_wall) требуют
ПОЛЬЗОВАТЕЛЬСКИЙ токен (scope=wall,photos). Токен сообщества проходит
базовую проверку, но получает ошибки [27]/[214] «method is unavailable
with group auth» на этапе публикации.
"""

import os
import sys
import json
import vk_api  # Импортируем библиотеку vk_api
import glob
from datetime import datetime
from post_generator import create_post, load_latest_entry

# Конфигурация ВКонтакте
VK_GROUP_ID_RAW = os.getenv("VK_GROUP_ID")  # например: 222111000 (в виде строки)
VK_ALBUM_ID_RAW = os.getenv("VK_ALBUM_ID")  # например: 123456 (в виде строки), может быть пустым
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

def upload_to_album(upload, photo_path, group_id, album_id):
    """Загружает фото в указанный альбом группы."""
    try:
        # Загружаем фото в альбом
        # vk_api.upload.VkUpload.photo принимает album_id и group_id
        photo_list = upload.photo(photos=photo_path, album_id=album_id, group_id=group_id)
        print(f"🖼️ Изображение загружено в альбом {album_id}: photo{photo_list[0]['owner_id']}_{photo_list[0]['id']}")
        return True
    except vk_api.exceptions.ApiError as e:
        print(f"❌ Ошибка загрузки изображения в альбом {album_id}: {e}")
        return False
    except Exception as e:
        print(f"❌ Неожиданная ошибка при загрузке в альбом: {e}")
        return False


def main():
    print("🚀 Подготовка поста для ВКонтакте...")

    # Проверка и преобразование VK_GROUP_ID
    if not VK_GROUP_ID_RAW:
        print("❌ Ошибка: Не задан VK_GROUP_ID в переменных окружения.")
        sys.exit(1)
    try:
        # Убираем знак минус, если он есть, так как vk_api ожидает положительное число для group_id в upload методах
        VK_GROUP_ID = int(VK_GROUP_ID_RAW.lstrip('-'))
    except ValueError:
        print(f"❌ Ошибка: VK_GROUP_ID должен быть числом, получено: '{VK_GROUP_ID_RAW}'")
        sys.exit(1)

    # Проверка и преобразование VK_ALBUM_ID (необязательно)
    VK_ALBUM_ID = None
    if VK_ALBUM_ID_RAW:
        try:
            VK_ALBUM_ID = int(VK_ALBUM_ID_RAW)
            print(f"🖼️ Будет использоваться альбом ID: {VK_ALBUM_ID}")
        except ValueError:
            print(f"⚠️ Ошибка: VK_ALBUM_ID должен быть числом, получено: '{VK_ALBUM_ID_RAW}'. Альбом будет пропущен.")
    else:
        print("ℹ️ VK_ALBUM_ID не задан — загрузка в альбом будет пропущена.")


    # 1. Инициализация API ВКонтакте через библиотеку
    try:
        session = vk_api.VkApi(token=VK_ACCESS_TOKEN, api_version=VK_API_VERSION)
        # Проверка токена: users.get() проходит и для токена сообщества (возвращает
        # id=100, «Сообщество»), поэтому проверяем именно тип токена — иначе
        # публикация упадёт с [27]/[214 «method is unavailable with group auth».
        api = session.get_api()
        user_info = api.users.get()
        user_id = int(user_info[0].get("id", 0)) if user_info else 0
        if user_id == 100:
            print("❌ VK_ACCESS_TOKEN — это ТОКЕН СООБЩЕСТВА (id=100).")
            print("   wall.post и загрузка фото на стену с него недоступны (ошибки 27/214).")
            print("   Нужен пользовательский токен с правами wall,photos.")
            sys.exit(1)
        print(f"✅ Токен ВКонтакте действителен (пользователь id{user_id}).")
    except vk_api.exceptions.ApiError as e:
        print(f"❌ Ошибка аутентификации ВКонтакте: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Ошибка инициализации ВКонтакте: {e}")
        sys.exit(1)

    # 2. Генерируем текст поста
    entry = load_latest_entry()
    if not entry:
        print("❌ Нечего публиковать")
        sys.exit(1)

    post_text = create_post(entry)

    # 2.5 Защита от дублей: повторные запуски этого workflow (ручные или из-за
    # повторного завершения «Новое эссе») не должны плодить одинаковые посты —
    # каждый запуск публикует последнюю запись журнала без памяти о прошлых.
    # Если такой же текст уже есть на стене — выходим без ошибки.
    # Закреплённый пост всегда идёт первым в wall.get, поэтому проверяем все N.
    try:
        api = session.get_api()
        latest_items = api.wall.get(owner_id=-VK_GROUP_ID, count=10).get("items", [])
        wall_texts = [str(i.get("text", "")) for i in latest_items]
    except Exception as e:
        print(f"⚠️ Не удалось прочитать последние записи стены ({e}) — проверка дубля пропущена.")
        wall_texts = []
    if any(t.strip() == post_text.strip() for t in wall_texts):
        print("⏭️ Эта запись уже опубликована на стене — повторная публикация пропущена (защита от дублей).")
        sys.exit(0)

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
            print(f"🖼️ Изображение загружено на стену и готово к публикации: {attachment}")

            # Загружаем фото в альбом (если ID альбома задан и изображение успешно загружено на стену)
            if VK_ALBUM_ID:
                upload_to_album(upload, image_path, VK_GROUP_ID, VK_ALBUM_ID)

        except vk_api.exceptions.ApiError as e:
            print(f"❌ Ошибка загрузки изображения в ВК (стена или альбом): {e}")
            print("📤 Публикация без изображения...")
            attachment = None # Сбрасываем вложение, если загрузка не удалась
        except Exception as e:
            print(f"❌ Неожиданная ошибка при загрузке изображения: {e}")
            print("📤 Публикация без изображения...")
            attachment = None # Сбрасываем вложение, если загрузка не удалась

    # 5. Публикация поста
    try:
        api = session.get_api()
        result = api.wall.post(
            owner_id=-VK_GROUP_ID,  # Отрицательный ID для группы
            from_group=1,
            message=post_text,
            attachments=attachment # Передаём вложение (может быть None)
        )
        print(f"✅ Пост опубликован: https://vk.com/wall-{VK_GROUP_ID}_{result['post_id']}")
        post_id = result['post_id']
    except vk_api.exceptions.ApiError as e:
        print(f"❌ Ошибка публикации поста в ВК: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Неожиданная ошибка при публикации поста: {e}")
        sys.exit(1)

    # 6. Удаление изображения (только если оно существовало и было найдено)
    if image_path and os.path.exists(image_path):
        delete_image(image_path)


if __name__ == "__main__":
    main()
