@echo off
title TechStore Automated Tests
chcp 65001 >nul
cd /d "%~dp0"
echo ====================================================
echo Đang chạy kiểm thử tự động hệ thống TechStore...
echo ====================================================
npm test
pause
