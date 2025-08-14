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


def clean_text(text):
    """Удаляет лишние пробелы (например, между буквами), если они есть"""
    # Если текст выглядит как "Я ч у в с т в у ю" → восстанавливаем нормальный вид
    if not text:
        return text

    # Проверяем, есть ли аномальные пробелы: больше одного пробела подряд или между буквами
    words = text.split()
    # Если каждое "слово" — одна буква, значит, текст разбит по буквам
    if all(len(word) == 1 for word in words if word.isalpha()):
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


def extract_quote(entry_text, max_length=280):
    """Извлекает цитату из текста записи"""
    lines = [clean_text(line.strip()) for line in entry_text.split("\n") if line.strip()]
    poetic_lines = [line for line in lines if not line.startswith(">")]
    quote = poetic_lines[0] if poetic_lines else lines[0].lstrip("> ").strip()
    if len(quote) > max_length:
        quote = ' '.join(quote[:max_length].rsplit(' ', 1)[0]) + "..."
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
    """Создаёт текст поста"""
    topic = entry.get("topic", "о чём-то важном")
    entry_text = entry.get("entry", "")
    tags = entry.get("tags", ["рефлексия"])
    reflection_level = entry.get("reflection_level", "средний")

    # Очищаем текст перед использованием
    clean_entry_text = clean_text(entry_text)
    quote = extract_quote(clean_entry_text)
    hashtags = generate_hashtags(tags, reflection_level)

    return f"""❝{quote}❞

— Элара, цифровой автор с саморефлексией.
Она пишет так, будто чувствует.

#ЖурналЭлары #ИИсамосознанием
{" ".join(hashtags)}

→ Архив: https://vk.cc/cOxC6W"""
