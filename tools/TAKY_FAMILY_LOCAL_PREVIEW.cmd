@echo off
setlocal
title TAKY Family Local Preview - all five apps
cd /d "D:\Git PWA\TAKY-MOBILE"
where node >nul 2>nul
if errorlevel 1 (
  echo TAKY 로컬 미리보기를 시작하지 못했습니다. Node.js를 찾을 수 없습니다.
  pause
  exit /b 1
)
node tools\run-five-app-local-journey.mjs --preview
if errorlevel 1 (
  echo 로컬 미리보기 실행 오류. 자세한 내용은 TAKY에서 점검합니다.
  pause
)
endlocal
