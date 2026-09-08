@echo off
REM CDP 최초 설치 -- 의존성을 받는다. 1회만.
cd /d "%~dp0.."
echo [ops] 의존성 설치
call npm install || goto :fail
echo.
echo [ops] 끝났습니다. ops\release.cmd 로 배포본을 만들 수 있습니다.
pause
goto :eof
:fail
echo.
echo [ops] 실패했습니다. 위 메시지를 확인하세요.
pause
exit /b 1
