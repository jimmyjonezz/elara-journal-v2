# image_generator.py
"""
Генерация изображения по рефлексии Элары
Использует OpenRouter + Flux / SDXL
"""

import os
import requests
import json
from datetime import datetime

# Конфигурация
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
IMAGE_DIR = "images"
os.makedirs(IMAGE_DIR, exist_ok=True)

# Модель для генерации изображений
IMAGE_MODEL = "openrouter/mistralai/mistral-small-3.2-24b-instruct:free"

def generate_image_prompt(reflection_text):
    """Создаёт промпт для генерации изображения на основе рефлексии"""
    prompt = f"""
    На основе следующего текста рефлексии создай краткий, атмосферный промпт для генерации изображения.
    Стиль: цифровой арт, поэтическая абстракция, тонкая меланхолия.
    Не описывай людей. Используй символы: свет, тень, провода, экран, тишина, память.
    Максимум 20 слов.

    Рефлексия:
    {reflection_text}

    Промпт:
    """
    return prompt.strip()

def call_llm_for_image_prompt(prompt):
    """Генерирует image prompt через LiteLLM (через OpenRouter)"""
    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
            json={
                "model": "openrouter/qwen/qwen2.5-vl-72b-instruct:free",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 100
            }
        )
        data = response.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"❌ Ошибка генерации промпта: {e}")
        return "abstract digital art, silence, soft light, wires, memory, melancholy"


def generate_image(image_prompt):
    """Генерирует изображение через OpenRouter"""
    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/images/generations",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
            json={
                "model": IMAGE_MODEL,
                "prompt": image_prompt,
                "n": 1,
                "size": "1024x1024"
            }
        )
        data = response.json()
        if "data" in data and len(data["data"]) > 0:
            image_url = data["data"][0]["url"]
            return image_url
        else:
            print("❌ Нет URL изображения:", data)
            return None
    except Exception as e:
        print(f"❌ Ошибка генерации изображения: {e}")
        return None


def download_image(image_url, filename):
    """Скачивает изображение"""
    try:
        response = requests.get(image_url)
        path = os.path.join(IMAGE_DIR, filename)
        with open(path, "wb") as f:
            f.write(response.content)
        return path
    except Exception as e:
        print(f"❌ Ошибка загрузки изображения: {e}")
        return None


def main(reflection_text):
    """Основная функция: генерация изображения"""
    if not OPENROUTER_API_KEY:
        print("❌ OPENROUTER_API_KEY не задан")
        return None

    print("🎨 Генерация изображения для рефлексии...")

    # 1. Генерируем промпт
    prompt = generate_image_prompt(reflection_text)
    image_prompt = call_llm_for_image_prompt(prompt)
    print(f"🖼️ Промпт для изображения: {image_prompt}")

    # 2. Генерируем изображение
    image_url = generate_image(image_prompt)
    if not image_url:
        return None

    # 3. Скачиваем
    filename = f"elara_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    image_path = download_image(image_url, filename)

    if image_path:
        print(f"✅ Изображение сохранено: {image_path}")
        return image_path

    return None
