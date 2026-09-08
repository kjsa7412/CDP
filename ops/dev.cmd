@echo off
REM 개발 서버 -- 화면(vite)과 API(node)를 따로 띄운다.
cd /d "%~dp0.."
if not exist node_modules (
  echo [ops] node_modules 가 없습니다. 설치부터 합니다.
  call npm install || goto :fail
)
echo [ops] API 서버를 새 창에 띄웁니다 (포트 7373)
start "cdp api" cmd /k npm run dev:server
echo [ops] 화면 (포트 5173) -- 이 창을 닫으면 멈춥니다
call npm run dev || goto :fail
goto :eof
:fail
echo.
echo [ops] 실패했습니다. 위 메시지를 확인하세요.
pause
exit /b 1
