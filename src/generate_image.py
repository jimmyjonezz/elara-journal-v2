import requests
import os
from PIL import Image
from io import BytesIO
import sys
import argparse

# API-эндпоинт для Flux.1-schnell (быстрая версия)
API_URL = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell"

def get_hf_token():
    """Получает токен из env var или аргумента."""
    token = os.getenv('HF_TOKEN')
    if not token:
        print("Ошибка: HF_TOKEN не найден. Установите в GitHub Secrets или передайте как env var.")
        sys.exit(1)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    return headers

def generate_image(prompt, headers, num_inference_steps=4, guidance_scale=0.0, width=1024, height=1024):
    """
    Генерирует изображение по промпту.
    """
    payload = {
        "inputs": prompt,
        "parameters": {
            "num_inference_steps": num_inference_steps,
            "guidance_scale": guidance_scale,
            "width": width,
            "height": height
        }
    }
    
    try:
        response = requests.post(API_URL, headers=headers, json=payload)
        response.raise_for_status()
        
        if response.content:
            return response.content
        else:
            print("Ошибка: Пустой ответ от API (модель может быть в очереди).")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Ошибка запроса: {e}")
        if hasattr(e.response, 'text'):
            print(f"Детали: {e.response.text}")
        return None

def save_image(image_bytes, filename="generated_image.png"):
    """
    Сохраняет изображение в ./data/.
    """
    os.makedirs("data", exist_ok=True)
    filepath = os.path.join("data", filename)
    
    if image_bytes:
        image = Image.open(BytesIO(image_bytes))
        image.save(filepath)
        print(f"Изображение сохранено: {filepath}")
        return True
    return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Генератор изображений с Flux.1")
    parser.add_argument("--prompt", type=str, help="Промпт для генерации (дефолт: стиль Ian McQue)")
    args = parser.parse_args()
    
    # Дефолтный промпт в стиле Ian McQue
    default_prompt = (
        "A dystopian urban cityscape at dusk, with abandoned rusty cars parked along foggy streets, "
        "towering ruined skyscrapers in the background, detailed ink sketch style like Ian McQue's sketchbook, "
        "high contrast, moody atmospheric lighting, intricate line work, cinematic perspective, "
        "black and white with subtle gray tones, highly detailed, concept art"
    )
    
    prompt = args.prompt or os.getenv('PROMPT') or default_prompt
    print(f"Используемый промпт: {prompt}")
    print("Генерирую изображение...")
    
    headers = get_hf_token()
    image_bytes = generate_image(prompt, headers)
    
    if save_image(image_bytes):
        print("Готово! Изображение в ./output/generated_image.png")
    else:
        print("Не удалось сгенерировать изображение.")
        sys.exit(1)
