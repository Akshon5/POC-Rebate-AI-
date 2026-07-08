FROM python:3.11-slim

# Install system dependencies: Tesseract (OCR) and Poppler (PDF rendering)
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    poppler-utils \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Port that Render/Railway will bind to
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
