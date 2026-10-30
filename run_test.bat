@echo off
title QzStore Automated Tests
chcp 65001 >nul
cd /d "%~dp0"
echo ====================================================
echo Đang chạy kiểm thử tự động hệ thống QzStore...
echo ====================================================
npm test
pause
