@echo off
rem Opens Trading Rules Checkbook in its own app window (Chrome or Edge),
rem or in the default browser if neither is installed.
setlocal
set "PAGE=%~dp0index.html"
set "URL=file:///%PAGE:\=/%"

for %%B in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do (
  if exist %%B (
    start "" %%B --app="%URL%"
    exit /b 0
  )
)

start "" "%PAGE%"
