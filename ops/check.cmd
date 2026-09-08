@echo off
REM 지식 레포 검사. 인자가 없으면 sample-repo.
cd /d "%~dp0.."
if not exist node_modules (
  echo [ops] node_modules 가 없습니다. 설치부터 합니다.
  call npm install || goto :fail
)
set "REPO=%~1"
if "%REPO%"=="" set "REPO=sample-repo"
echo [ops] 검사: %REPO%
node viewer/bin/ctx-cli.mjs check --repo "%REPO%"
if errorlevel 1 (
  echo.
  echo [ops] 커밋할 수 없는 상태입니다. 위 목록을 고치세요.
  pause
  exit /b 1
)
pause
goto :eof
:fail
echo.
echo [ops] 실패했습니다. 위 메시지를 확인하세요.
pause
exit /b 1
