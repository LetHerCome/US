@echo off
setlocal
set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if not exist "%ADB%" set "ADB=adb"

"%ADB%" reverse tcp:4173 tcp:4173
if errorlevel 1 exit /b 1

"%ADB%" shell am start -a android.intent.action.VIEW -d "http://localhost:4173/?us-dev=1" com.android.chrome
if errorlevel 1 exit /b 1

echo US Visual Lab opened on Chrome Android.
