@echo off
title Push FinanceFlow to GitHub
echo ===================================================
echo   FinanceFlow GitHub Upload Helper
echo ===================================================
echo.

cd /d "C:\Users\mkmoh\.gemini\antigravity\scratch\home_expense_dashboard"

:: Check if git remote already exists
git remote get-url origin >nul 2>&1
if %errorlevel% equ 0 (
    echo Remote 'origin' is already configured.
    echo.
    goto push
)

set /p username="Enter your GitHub username: "
echo.
echo Linking repository to: https://github.com/%username%/home-expense-dashboard.git
git remote add origin https://github/%username%/home-expense-dashboard.git
git remote set-url origin https://github.com/%username%/home-expense-dashboard.git

:push
echo.
echo Starting upload to GitHub...
echo (A GitHub login window may pop up in your browser to verify your credentials)
echo.
git push -u origin main

if %errorlevel% neq 0 (
    echo.
    echo ---------------------------------------------------
    echo ERROR: Push failed. Make sure you created the repo 
    echo 'home-expense-dashboard' on GitHub first!
    echo ---------------------------------------------------
) else (
    echo.
    echo ===================================================
    echo SUCCESS! Your code is now uploaded to GitHub!
    echo ===================================================
)

echo.
pause
