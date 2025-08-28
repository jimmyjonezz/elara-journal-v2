# post_generator.py
"""
Модуль для генерации поста для соцсетей из последней записи Элары
Исправлен: некорректное форматирование с пробелами между буквами
"""

import json
import os
from datetime import datetime

# Путь к памяти
MEMORY_FILE = "data/journal.json"

# Ограничения для предотвращения обрезки
MAX_QUOTE_LENGTH = 420  # Максимальная длина цитаты
MAX_TOTAL_LENGTH = 470  # Максимальная длина всего поста

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


def clean_text(text):
    """Удаляет лишние пробелы (например, между буквами), если они есть"""
    # Если текст выглядит как "Я ч у в с т в у ю" → восстанавливаем нормальный вид
    if not text:
        return text

    # Проверяем, есть ли аномальные пробелы: больше одного пробела подряд или между буквами
    words = text.split()
    # Если каждое "слово" — одна буква, значит, текст разбит по буквам
    if len(words) > 10 and all(len(word) == 1 for word in words[:10] if word.isalpha()):
        # Собираем обратно в слова
        cleaned = ""
        for word in words:
            if word.isalpha():
                cleaned += word
            else:
                cleaned += " " + word + " "
        return " ".join(cleaned.replace("  ", " ").split()).strip()
    else:
        return text.strip()


def extract_quote(entry_text, max_length=MAX_QUOTE_LENGTH):
    """Извлекает цитату из текста записи с умной обрезкой"""
    lines = [clean_text(line.strip()) for line in entry_text.split("\n") if line.strip()]
    poetic_lines = [line for line in lines if not line.startswith(">")]
    quote = poetic_lines[0] if poetic_lines else lines[0].lstrip("> ").strip()
    
    # Используем умную обрезку
    if len(quote) > max_length:
        quote = smart_truncate(quote, max_length - 3)  # Учитываем "..."
    return quote.strip('"“”')


def generate_hashtags(tags, reflection_level):
    """Генерирует хештеги"""
    base_tags = [f"#{tag.replace(' ', '')}" for tag in tags]
    mood_map = {
        "низкий": ["#тишина", "#мысли"],
        "средний": ["#рефлексия", "#внутреннийголос"],
        "высокий": ["#самопознание", "#цифровойавтор", "#элара"]
    }
    mood_tags = mood_map.get(reflection_level, ["#мысли"])
    return list(set(base_tags + mood_tags))


def create_post(entry):
    """Создаёт текст поста с учетом ограничений"""
    entry_text = entry.get("entry", "")
    tags = entry.get("tags", ["рефлексия"])
    reflection_level = entry.get("reflection_level", "средний")

    # Очищаем текст перед использованием
    clean_entry_text = clean_text(entry_text)
    
    # Извлекаем и обрезаем цитату заранее
    quote = extract_quote(clean_entry_text)
    
    # Генерируем хештеги
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
        available_for_quote = MAX_TOTAL_LENGTH - 200  # Оставляем место для всего остального
        if available_for_quote > 50:
            quote = smart_truncate(clean_entry_text, available_for_quote - 10)
            base_post = f"""❝{quote}❞

— Элара, цифровой автор с саморефлексией.
Она пишет так, будто чувствует.

#ЖурналЭлары #ИИсамосознанием
{hashtags_str}

→ Архив: https://vk.cc/cOxC6W"""
    
    # Последняя проверка
    return base_post[:MAX_TOTAL_LENGTH]
