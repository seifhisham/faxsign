@echo off
echo ========================================
echo    FaxSign Installation Script
echo ========================================
echo.

echo Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo Then run this script again.
    pause
    exit /b 1
)

echo Node.js is installed.
echo.

echo Installing dependencies...
npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies!
    pause
    exit /b 1
)

echo.
echo ========================================
echo    Installation Complete!
echo ========================================
echo.
echo To start the application, run: npm start
echo Or double-click start.bat
echo.
echo The application will be available at:
echo http://localhost:3000
echo.
echo Default login credentials:
echo Username: admin
echo Password: admin123
echo.
pause

