@echo off
rem ctx - 실행기를 고른다 (cmd / PowerShell 에서 사람이 직접 칠 때).
rem git 훅은 bin/ctx (sh) 를 쓴다. 작업환경 v1.1 3.1
setlocal
set HERE=%~dp0

where node >nul 2>&1
if %ERRORLEVEL%==0 if exist "%HERE%ctx.mjs" (
  node "%HERE%ctx.mjs" %*
  exit /b %ERRORLEVEL%
)

if exist "%HERE%..\tools\cdp.exe" (
  "%HERE%..\tools\cdp.exe" ctx %*
  exit /b %ERRORLEVEL%
)
if exist "%HERE%..\tools\ctx-view.exe" (
  "%HERE%..\tools\ctx-view.exe" ctx %*
  exit /b %ERRORLEVEL%
)
where cdp.exe >nul 2>&1
if %ERRORLEVEL%==0 (
  cdp.exe ctx %*
  exit /b %ERRORLEVEL%
)

rem 실행기 없음은 127 -- 검사 실패(1)와 구분한다. bin/ctx 와 같은 이유.
echo ctx: node 도 cdp.exe 도 없습니다. 1>&2
echo      tools\cdp.exe 를 두거나 PATH 에 넣으세요. 1>&2
exit /b 127
