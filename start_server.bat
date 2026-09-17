@echo off
title TechStore Web Server
chcp 65001 >nul
cd /d "%~dp0"
echo ====================================================
echo Đang kiểm tra và giải phóng cổng 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

echo ====================================================
echo Đang khởi động TechStore Web Server...
echo Tự động mở trình duyệt web...
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"
echo ====================================================
npm run dev
pause
