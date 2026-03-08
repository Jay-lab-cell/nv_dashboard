# 공식 Playwright-Python 이미지 사용 (Ubuntu 22.04 기반)
FROM mcr.microsoft.com/playwright/python:v1.40.0-jammy

# 작업 디렉토리 설정
WORKDIR /app

# 파이썬 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright 설치 (OS 종속성 포함 - 베이스 이미지가 처리하지만 확실히 하기 위해)
RUN playwright install chromium

# 백엔드 소스코드 복사
COPY . .

# 포트 노출
EXPOSE 8000

# 서버 실행 (uvicorn)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
