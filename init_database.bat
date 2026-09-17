@echo off
title Khoi tao CSDL TechStore
chcp 65001 >nul
cd /d "%~dp0"
echo ====================================================
echo Đang nạp bảng và dữ liệu mẫu vào MySQL...
echo ====================================================
npm run db:init
pause
