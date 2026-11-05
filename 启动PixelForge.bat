@echo off
rem PixelForge 特效工厂 —— Windows 一键启动
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [PixelForge] 未找到 Node.js。请安装 Node.js 后重试，或直接双击 dist\pixelforge-standalone.html
  pause
  exit /b 1
)
node server.js
