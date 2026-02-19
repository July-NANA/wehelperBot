$ErrorActionPreference = 'Stop'

pnpm install --frozen-lockfile
pnpm build:win

Write-Host "MSI build completed."
