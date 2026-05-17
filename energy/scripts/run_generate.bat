@echo off
setlocal

REM One-click generation for competition-ready energy assets.
REM Usage:
REM   run_generate.bat [seed] [duration] [runs] [style]

set SEED=%1
if "%SEED%"=="" set SEED=20260518

set DURATION=%2
if "%DURATION%"=="" set DURATION=600

set RUNS=%3
if "%RUNS%"=="" set RUNS=8

set STYLE=%4
if "%STYLE%"=="" set STYLE=paper

python "%~dp0generate_energy_assets.py" --seed %SEED% --duration %DURATION% --runs %RUNS% --output "%~dp0.." --style %STYLE%
if errorlevel 1 (
  echo [FAIL] Generation failed.
  exit /b 1
)

echo [DONE] Assets generated under energy\data and energy\figures
endlocal
