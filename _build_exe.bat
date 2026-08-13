@echo off
cd /d "%~dp0"
python -m PyInstaller Inkpad.spec --noconfirm
pause
