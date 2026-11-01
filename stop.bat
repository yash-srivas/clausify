@echo off
title Stopping Intelligent Legal Risk Analyzer
color 0C
cls

echo ======================================================================
echo    Stopping Intelligent Legal Risk Analyzer Services...
echo ======================================================================
echo.

:: Stop processes listening on port 3000 (Backend)
echo [1/3] Stopping Node.js Backend on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Stop processes listening on port 8000 (AI Microservice)
echo [2/3] Stopping Python AI Microservice on port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Optional: Stop docker container
echo [3/3] Stopping database container...
docker stop legal_risk_db >nul 2>&1

echo.
echo ======================================================================
echo    All services have been shut down cleanly.
echo ======================================================================
echo.
ping 127.0.0.1 -n 3 >nul
exit
