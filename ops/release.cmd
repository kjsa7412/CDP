@echo off
REM 서버 산출물을 만든다 -- ops\out\server\cdp-server-v<버전>.tar.gz 하나(v1.0 -- win zip, exe 는 없다).
cd /d "%~dp0.."
if not exist node_modules (
  echo [ops] node_modules 가 없습니다. 설치부터 합니다.
  call npm install || goto :fail
)
call npm run release:server -- %1 || goto :fail
echo.
echo [ops] 끝났습니다. ops\out\server 폴더를 확인하세요.
pause
goto :eof
:fail
echo.
echo [ops] 실패했습니다. 위 메시지를 확인하세요.
pause
exit /b 1
