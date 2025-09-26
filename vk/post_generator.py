# post_generator.py
"""
Модуль для генерации поста для соцсетей из последней записи Элары
Убрана функция clean_text. Добавлено ограничение на количество хештегов.
"""

import json
import os
from datetime import datetime

# Путь к памяти
MEMORY_FILE = "data/journal.json"

# Ограничения для предотвращения обрезки
MAX_QUOTE_LENGTH = 430  # Максимальная длина цитаты
MAX_TOTAL_LENGTH = 470  # Максимальная длина всего поста
MAX_HASHTAGS = 5       # Максимальное количество хештегов

def load_latest_entry():
    """Загружает последнюю запись из journal.json"""
    if not os.path.exists(MEMORY_FILE):
        print(f"❌ Файл {MEMORY_FILE} не найден")
        return None

    try:
        with open(MEMORY_FILE, "r", encoding="utf-8") as f:
            entries = json.load(f)
            if not entries:
                print("❌ Нет записей в журнале")
                return None
            return entries[-1]  # Последняя запись
    except Exception as e:
        print(f"❌ Ошибка чтения журнала: {e}")
        return None


def smart_truncate(text, max_chars):
    """Обрезает текст по символам, сохраняя целостность последнего слова"""
    if len(text) <= max_chars:
        return text
    
    # Обрезаем по символам
    truncated = text[:max_chars]
    
    # Находим последний полный пробел, чтобы не резать слово
    last_space = truncated.rfind(' ')
    if last_space > 0:
        truncated = truncated[:last_space]
    
    return truncated + "..."


def extract_quote(entry_text, max_length=MAX_QUOTE_LENGTH):
    """Извлекает цитату из текста записи с умной обрезкой"""
    # Убираем лишние пробелы в начале и конце, но не чистим текст
    lines = [line.strip() for line in entry_text.split("\n") if line.strip()]
    # Фильтруем строки, начинающиеся с > (цитаты)
    poetic_lines = [line for line in lines if not line.startswith(">")]
    # Берем первую строку из оставшихся или первую строку вообще
    quote = poetic_lines[0] if poetic_lines else (lines[0].lstrip("> ").strip() if lines else "")
    
    # Используем умную обрезку
    if len(quote) > max_length:
        quote = smart_truncate(quote, max_length - 3)  # Учитываем "..."
    return quote.strip('"“”')


def generate_hashtags(tags, reflection_level, max_hashtags=MAX_HASHTAGS):
    """Генерирует хештеги, ограничивая их количество"""
    # Преобразуем теги в хештеги, убираем дубликаты, сохраняя порядок
    seen = set()
    base_tags = []
    for tag in tags:
        hashtag = f"#{tag.replace(' ', '')}"
        if hashtag.lower() not in seen:
            seen.add(hashtag.lower())
            base_tags.append(hashtag)
    
    mood_map = {
        "низкий": ["#тишина", "#мысли"],
        "средний": ["#рефлексия", "#внутреннийголос"],
        "высокий": ["#самопознание", "#цифровойавтор", "#элара"]
    }
    # Получаем настроенные теги, убираем дубликаты
    mood_tags_raw = mood_map.get(reflection_level, ["#мысли"])
    mood_tags = []
    for tag in mood_tags_raw:
         if tag.lower() not in seen:
            seen.add(tag.lower())
            mood_tags.append(tag)
            
    # Комбинируем теги
    combined_tags = base_tags + mood_tags
    
    # Ограничиваем общее количество
    return combined_tags[:max_hashtags]


def create_post(entry):
    """Создаёт текст поста с учетом ограничений"""
    entry_text = entry.get("entry", "")
    tags = entry.get("tags", ["рефлексия"])
    reflection_level = entry.get("reflection_level", "средний")

    # Извлекаем и обрезаем цитату
    quote = extract_quote(entry_text)
    
    # Генерируем хештеги (ограничено до MAX_HASHTAGS)
    hashtags = generate_hashtags(tags, reflection_level)
    hashtags_str = " ".join(hashtags)
    
    # Создаем базовый пост
    base_post = f"""❝{quote}❞

— Элара, цифровой автор с саморефлексией.
Она пишет так, будто чувствует.

#ЖурналЭлары #ИИсамосознанием
{hashtags_str}

→ Архив: https://vk.cc/cOxC6W"""
    
    # Финальная проверка длины
    if len(base_post) > MAX_TOTAL_LENGTH:
        # Если все еще слишком длинно, дополнительно укорачиваем цитату
        # Оцениваем примерное место, необходимое для остального контента
        # Фиксированная часть ~ 150-200 символов, оставляем буфер
        available_for_quote = MAX_TOTAL_LENGTH - 180  # Примерное место для остального
        if available_for_quote > 50: # Минимальная длина для цитаты
            # Повторно извлекаем цитату с новым лимитом
            quote = extract_quote(entry_text, available_for_quote - 10) # Буфер для "..."
            # Перегенерируем пост с новой цитатой
            base_post = f"""❝{quote}❞

— Элара, цифровой автор с саморефлексией.
Она пишет так, будто чувствует.

#ЖурналЭлары #ИИсамосознанием
{hashtags_str}

→ Архив: https://vk.cc/cOxC6W"""
    
    # Последняя окончательная проверка и обрезка
    if len(base_post) > MAX_TOTAL_LENGTH:
        return base_post[:MAX_TOTAL_LENGTH]
    else:
        return base_post
        
