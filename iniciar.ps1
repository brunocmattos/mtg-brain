# Sobe o mtg-brain INTEIRO (banco + API) via Docker e abre o navegador.
# Depois do primeiro 'up', o Docker religa tudo sozinho no boot — nem precisa rodar isto.
# Use --build (ou rode `docker compose up -d --build`) depois de mudar o código.
$repo = $PSScriptRoot
Write-Host "Subindo o mtg-brain (Docker: banco + API)..." -ForegroundColor Magenta
docker compose -f "$repo\docker-compose.yml" --project-directory "$repo" up -d
Start-Process "http://localhost:8000"
Write-Host "Pronto: http://localhost:8000" -ForegroundColor Green
