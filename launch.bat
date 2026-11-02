@echo off
rem Opens Pixel Yak (the studio). Same as "npm start". Point a desktop shortcut at this file.
cd /d "%~dp0"
start "" "node_modules\electron\dist\electron.exe" .
