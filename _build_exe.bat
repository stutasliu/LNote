@echo off
cd /d "%~dp0"
python -m PyInstaller Inkpad.spec --noconfirm
if errorlevel 1 exit /b %errorlevel%

set "ISCC="
for %%P in ("%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" "%ProgramFiles%\Inno Setup 6\ISCC.exe") do (
  if not defined ISCC if exist "%%~P" set "ISCC=%%~P"
)
if not defined ISCC (
  echo [ERROR] ISCC.exe not found. Please install Inno Setup 6 first.
  pause
  exit /b 1
)
"%ISCC%" "installer\LNote.iss"
pause
