param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('up', 'down', 'logs', 'ps', 'config')]
    [string]$Command
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$composeFile = 'deployments/docker-compose.yml'

function Invoke-Compose {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )

    & docker compose -f $composeFile @Args
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose $($Args -join ' ') failed with exit code $LASTEXITCODE"
    }
}

switch ($Command) {
    'up' {
        Invoke-Compose @('up', '-d')
    }
    'down' {
        Invoke-Compose @('down')
    }
    'logs' {
        Invoke-Compose @('logs', '-f')
    }
    'ps' {
        Invoke-Compose @('ps')
    }
    'config' {
        Invoke-Compose @('config')
    }
}
