@echo off
echo ========================================
echo   自习课噪音监控系统后端启动脚本
echo ========================================
echo.

REM 检查Node.js是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到Node.js，请先安装Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [信息] 检测到Node.js版本: %node_version%
echo.

REM 检查依赖是否安装
if not exist "node_modules" (
    echo [信息] 正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo [成功] 依赖安装完成
    echo.
)

REM 检查数据库是否需要初始化
if not exist "noise_monitor.db" (
    echo [信息] 正在初始化数据库...
    call node setup-db.js
    if errorlevel 1 (
        echo [错误] 数据库初始化失败
        pause
        exit /b 1
    )
    echo [成功] 数据库初始化完成
    echo.
)

REM 启动服务器
echo [信息] 正在启动服务器...
echo.
echo ========================================
echo   服务器信息
echo ========================================
echo 本地访问: http://localhost:3000
echo API地址: http://localhost:3000/api
echo 系统状态: http://localhost:3000/health
echo ========================================
echo.

node server.js