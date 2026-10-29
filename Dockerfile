# 화면(frontend)과 서버(backend)를 한 주소로 올리는 배포용 이미지. Render 무료 웹 서비스에서 쓴다.

# 1) 화면 빌드: 서버 연결 모드로 만든다.
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN VITE_USE_API=1 npm run build

# 2) 서버: API + OCR + 빌드한 화면
FROM python:3.13-slim
WORKDIR /app/backend
COPY backend/requirements.txt backend/requirements-ocr.txt ./
RUN pip install --no-cache-dir -r requirements-ocr.txt
COPY backend/ ./
RUN python -m scripts.get_ocr_models
COPY --from=web /web/dist /app/frontend/dist
ENV FRONTEND_DIST=/app/frontend/dist PYTHONUNBUFFERED=1
# Render가 PORT를 정해 준다. 로컬에서는 8000.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
