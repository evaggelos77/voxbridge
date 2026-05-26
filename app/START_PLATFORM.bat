
@echo off
chcp 65001 >nul
title VoxBridge — Web App v5
cd /d "%~dp0"
if not exist ".venv\" (
  python -m venv .venv
)
call ".venv\Scripts\activate.bat"
python -m pip install -r requirements.txt
python platform_ui.py
pause
