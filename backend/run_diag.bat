@echo off
chcp 65001 > nul
cd /d "%~dp0"
.venv\Scripts\python.exe -u diag_run.py 2>&1
