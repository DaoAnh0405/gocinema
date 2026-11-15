@echo off
setlocal
cd /d "%~dp0"
if not exist ".env" (
  echo Chua co .env. Hay sao chep .env.example va cau hinh database truoc.
  pause
  exit /b 1
)
if not exist "node_modules\nodemon\bin\nodemon.js" (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Dang chay GoCinema tu thu muc: %CD%
echo Khi server san sang, mo http://localhost:3000/admin/cinemas
echo Giu cua so nay mo. Nhan Ctrl+C de dung.
call npm run dev
if errorlevel 1 pause
