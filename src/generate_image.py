#!/usr/bin/env python3
"""
Генератор изображений для Журнала Элары
Использует black-forest-labs/FLUX.1-schnell через Hugging Face Inference API
"""

import requests
import os
import sys
import argparse
from PIL import Image
from io import BytesIO

# 🔹 Эндпоинт FLUX.1-schnell (работает при наличии валидного HF_TOKEN)
API_URL = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell"

def get_hf_token():
    """Получает токен из переменной окружения."""
    token = os.getenv('HF_TOKEN')
    if not token:
        print("❌ Ошибка: HF_TOKEN не найден. Установите его в .env или GitHub Secrets.")
        sys.exit(1)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def read_prompt_from_file(filepath):
    """Читает промпт из текстового файла."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except Exception as e:
        print(f"❌ Не удалось прочитать файл промпта: {e}")
        sys.exit(1)

def generate_image(prompt, headers, num_inference_steps=4, guidance_scale=0.0):
    """
    Генерирует изображение через Hugging Face Inference API.
    FLUX.1-schnell работает быстро и не требует guidance_scale.
    """
    payload = {
        "inputs": prompt,
        "parameters": {
            "num_inference_steps": num_inference_steps,
            "guidance_scale": guidance_scale
        }
    }

    print("🖼️ Отправляю запрос к FLUX.1-schnell...")
    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=60)
        
        # Модель может быть в очереди — Hugging Face возвращает 503 с estimated_time
        if response.status_code == 503:
            error_data = response.json()
            wait_time = error_data.get("estimated_time", 20)
            print(f"⏳ Модель загружается. Примерное ожидание: {wait_time} секунд.")
            print("ℹ️ Повторный запуск через CI рекомендуется, если это локальный запуск.")
            return None

        response.raise_for_status()
        content_type = response.headers.get('content-type', '')

        if 'image' in content_type:
            return response.content
        else:
            # Иногда возвращается JSON с ошибкой
            try:
                error_json = response.json()
                print(f"❌ Ошибка API: {error_json}")
            except:
                print(f"❌ Неожиданный ответ: {response.text[:200]}...")
            return None

    except requests.exceptions.RequestException as e:
        print(f"❌ Ошибка сети или запроса: {e}")
        return None

def save_image(image_bytes, output_path="data/generated_image.png"):
    """Сохраняет изображение в указанный путь."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    if image_bytes:
        try:
            image = Image.open(BytesIO(image_bytes))
            image.save(output_path)
            print(f"✅ Изображение сохранено: {output_path}")
            return True
        except Exception as e:
            print(f"❌ Ошибка при сохранении изображения: {e}")
    else:
        print("❌ Нет данных изображения для сохранения.")
    return False

def main():
    parser = argparse.ArgumentParser(description="Генерация изображения Элары через FLUX.1-schnell")
    parser.add_argument("--prompt", type=str, help="Прямой промпт для генерации")
    parser.add_argument("--prompt-file", type=str, help="Путь к файлу с промптом (например, data/latest_image_prompt.txt)")
    parser.add_argument("--output", type=str, default="data/generated_image.png", help="Путь для сохранения изображения")
    args = parser.parse_args()

    # Определяем промпт
    if args.prompt_file:
        prompt = read_prompt_from_file(args.prompt_file)
        print(f"📄 Промпт загружен из: {args.prompt_file}")
    elif args.prompt:
        prompt = args.prompt
        print("✏️  Используется промпт из аргумента.")
    else:
        prompt = os.getenv('PROMPT')
        if not prompt:
            print("❌ Не указан промпт: используйте --prompt, --prompt-file или переменную PROMPT.")
            sys.exit(1)
        print("🌍 Промпт взят из переменной окружения PROMPT.")

    print(f"\n🔍 Длина промпта: {len(prompt)} символов\n")

    headers = get_hf_token()
    image_bytes = generate_image(prompt, headers)

    if image_bytes and save_image(image_bytes, args.output):
        print("\n🎉 Генерация завершена успешно!")
    else:
        print("\n💥 Не удалось сгенерировать изображение.")
        sys.exit(1)

if __name__ == "__main__":
    main()
