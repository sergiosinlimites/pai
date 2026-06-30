$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$python = Join-Path $workspace "backend\.venv\Scripts\python.exe"
$frontend = Join-Path $workspace "frontend"
$backend = Join-Path $workspace "backend"

if (-not (Test-Path -LiteralPath $python)) {
    throw "No se encontró el entorno Python en $python"
}

if (-not (Test-Path -LiteralPath (Join-Path $frontend "dist\index.html"))) {
    & npm.cmd --prefix $frontend run build
    if ($LASTEXITCODE -ne 0) {
        throw "No fue posible compilar el frontend"
    }
}

if (-not $env:PLC_SIMULATOR) {
    $env:PLC_SIMULATOR = "false"
}
if (-not $env:PLC_SERIAL_PORT) {
    $env:PLC_SERIAL_PORT = "COM9"
}

Set-Location -LiteralPath $backend
& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
