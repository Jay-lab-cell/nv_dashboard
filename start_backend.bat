@echo off
echo === N_Mornitoring v3 백엔드 시작 ===

:: 8001 포트 기존 프로세스 종료
echo 기존 프로세스 정리 중...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8001 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: 백엔드 시작
cd /d "%~dp0backend"
call .venv\Scripts\activate
echo 백엔드 시작 중 (port 8001)...
uvicorn main:app --port 8001 --log-level info
