@echo off
REM 앱 실행. 인자로 지식 레포 경로를 줄 수 있다.
cd /d "%~dp0.."
if not exist node_modules (
  echo [ops] node_modules 가 없습니다. 설치부터 합니다.
  call npm install || goto :fail
)
if not exist "out\web\index.html" (
  echo [ops] 화면이 아직 없습니다. 빌드부터 합니다.
  call npm run build || goto :fail
)
if "%~1"=="" (
  call npm start || goto :fail
) else (
  node viewer/server/index.js --repo "%~1" || goto :fail
)
goto :eof
:fail
echo.
echo [ops] 실패했습니다. 위 메시지를 확인하세요.
pause
exit /b 1
