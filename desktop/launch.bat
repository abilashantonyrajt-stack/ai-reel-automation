@echo off
cd /d "%~dp0"
set "PYTHON=C:\Users\abila\AppData\Local\Programs\Python\Python314\pythonw.exe"
if exist "%PYTHON%" (
    start /b "" "%PYTHON%" main.py
) else (
    start /b "" pythonw main.py
)
