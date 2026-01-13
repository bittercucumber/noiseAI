@echo off
echo ========================================
echo   自习课噪音监控系统 - 启动服务器
echo ========================================
echo.

REM 检查Python是否安装
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo [√] 检测到Python，使用Python服务器启动...
    echo.
    echo 服务器地址: http://localhost:8080
    echo 局域网访问: http://[本机IP]:8080
    echo.
    echo 按 Ctrl+C 停止服务器
    echo.
    python -m http.server 8080
) else (
    echo [×] 未检测到Python
    echo.
    echo 请选择以下方式之一：
    echo 1. 安装Python: https://www.python.org/downloads/
    echo 2. 使用其他Web服务器（如IIS、Nginx）
    echo.
    pause
)


