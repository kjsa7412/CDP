@echo off
REM 개인 서버로 띄운다(127.0.0.1, 첫 접속 주소로 로그인). 인자로 지식 레포 경로를 줄 수 있다 -- 없으면 viewer/fixture.
cd /d "%~dp0.."
if not exist node_modules (
  echo [ops] node_modules 가 없습니다. 설치부터 합니다.
  call npm install || goto :fail
)
if not exist "ops\out\web\index.html" (
  echo [ops] 화면이 아직 없습니다. 빌드부터 합니다.
  call npm run build || goto :fail
)
if "%~1"=="" (
  call npm start || goto :fail
) else (
  node viewer/bin/ctx-cli.mjs serve --personal "%~1" --data ops\out\dev-personal --web ops\out\web || goto :fail
)
goto :eof
:fail
echo.
echo [ops] 실패했습니다. 위 메시지를 확인하세요.
pause
exit /b 1
