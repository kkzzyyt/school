FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    OCR_BIND=0.0.0.0 \
    OCR_PORT=8077

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir paddlepaddle==3.2.0 \
      -i https://www.paddlepaddle.org.cn/packages/stable/cpu/ \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY server.py ./
RUN useradd --create-home --uid 10001 ocr
USER ocr

EXPOSE 8077
HEALTHCHECK --interval=15s --timeout=3s --start-period=180s --retries=4 \
  CMD python -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8077/health", timeout=2)' || exit 1

CMD ["python", "server.py"]
