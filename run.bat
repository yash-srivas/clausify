@echo off
title Intelligent Legal Risk Analyzer - Platform Runner
color 0B
cls

cd /d "%~dp0"

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not found on PATH.
    echo Please install Node.js 20+ from https://nodejs.org
    pause
    exit /b 1
)

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not found on PATH.
    echo Please install Python 3.11+ from https://python.org
    pause
    exit /b 1
)

:: Launch Unified Platform Supervisor
node scripts/start_all.js
