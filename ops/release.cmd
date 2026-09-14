@echo off
REM 배포본 만들기 -- ops\release\v<버전>\ 하나로 묶는다.
cd /d "%~dp0.."
if not exist node_modules (
  echo [ops] node_modules 가 없습니다. 설치부터 합니다.
  call npm install || goto :fail
)
call npm run release -- %1 || goto :fail
echo.
echo [ops] 끝났습니다. ops\release 폴더를 확인하세요.
pause
goto :eof
:fail
echo.
echo [ops] 실패했습니다. 위 메시지를 확인하세요.
pause
exit /b 1
