FROM python:3.11-slim

WORKDIR /app

# System deps for PyMuPDF and OCR
RUN apt-get update && apt-get install -y \
    libmupdf-dev \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
