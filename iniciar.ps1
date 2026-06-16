# Sobe o mtg-brain: Postgres (Docker) + API (que serve o frontend) e abre o navegador.
# Pré-requisitos (uma vez): docker, Ollama instalado (roda como serviço), e o frontend
# buildado (cd web; npm run build). O Ollama já sobe sozinho com o Windows.
$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
Set-Location $repo

Write-Host "Subindo o Postgres (Docker)..." -ForegroundColor Magenta
docker compose up -d

Write-Host "Abrindo http://localhost:8000 ..." -ForegroundColor Magenta
Start-Process "http://localhost:8000"

Write-Host "Iniciando a API (Ctrl+C para parar)..." -ForegroundColor Magenta
& "$repo\.venv\Scripts\python.exe" -m uvicorn mtg_brain.api.app:app --port 8000
