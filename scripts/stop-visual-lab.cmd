@echo off
setlocal
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":4173" ^| findstr "LISTENING"') do (
  taskkill /PID %%P /T /F >nul 2>&1
)
echo US Visual Lab stopped if it was listening on port 4173.
