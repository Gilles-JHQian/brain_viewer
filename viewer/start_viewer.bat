@echo off
setlocal

cd /d "%~dp0"

set PORT=8080
if not "%~1"=="" set PORT=%~1

if exist "data\metadata.json" goto start_server

if exist "data" (
    rmdir "data" 2>nul
    del "data" 2>nul
)

if exist "..\brain_viewer_data\metadata.json" (
    mklink /J "data" "..\brain_viewer_data"
    goto start_server
)

if exist "brain_viewer_data\metadata.json" (
    mklink /J "data" "brain_viewer_data"
    goto start_server
)

echo.
echo ERROR: Cannot find brain_viewer_data.
echo Please place brain_viewer_data next to the viewer folder.
echo.
pause
exit /b 1

:start_server

if not exist "data\metadata.json" echo [WARN] data\metadata.json not found.
if not exist "data\brain_mesh.json" echo [WARN] data\brain_mesh.json not found.
if not exist "data\car\electrodes.json" echo [WARN] data\car\electrodes.json not found (default reference).

echo.
echo Starting HTTP server on port %PORT%...
echo Open http://localhost:%PORT% in your browser.
echo Press Ctrl+C to stop.
echo.

start "" "http://localhost:%PORT%"

where py >nul 2>&1
if %errorlevel%==0 (
    py -m http.server %PORT%
    goto end
)

where python >nul 2>&1
if %errorlevel%==0 (
    python -m http.server %PORT%
    goto end
)

echo Python not found.
pause

:end
endlocal