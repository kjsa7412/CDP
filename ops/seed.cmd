@echo off
REM viewer/fixture 재생성. 통째로 다시 만든다.
cd /d "%~dp0.."
if not exist node_modules (
  echo [ops] node_modules 가 없습니다. 설치부터 합니다.
  call npm install || goto :fail
)
echo [ops] viewer/fixture 재생성
call npm run seed || goto :fail
pause
goto :eof
:fail
echo.
echo [ops] 실패했습니다. 위 메시지를 확인하세요.
pause
exit /b 1
