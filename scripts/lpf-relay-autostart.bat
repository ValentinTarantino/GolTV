@echo off
title LPF Relay
cd /d "%~dp0.."

:loop
echo [%date% %time%] iniciando relay LPF...
node scripts\lpf-relay.mjs
echo.
echo [%date% %time%] el relay se cerro. reiniciando en 10 segundos...
echo (cerrar esta ventana para detenerlo definitivamente)
timeout /t 10 /nobreak >nul
goto loop
