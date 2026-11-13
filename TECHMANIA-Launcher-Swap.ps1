param(
    [Parameter(Mandatory = $true)][string]$StagedPath,
    [Parameter(Mandatory = $true)][string]$TargetPath,
    [Parameter(Mandatory = $true)][string]$LogPath
)

$ErrorActionPreference = 'Stop'
$temporaryPath = "$TargetPath.new"
$backupPath = "$TargetPath.old"
$deadline = (Get-Date).AddMinutes(2)

function Write-SwapLog([string]$message) {
    Add-Content -LiteralPath $LogPath -Value "$(Get-Date -Format o) $message" -Encoding UTF8
}

try {
    if (-not (Test-Path -LiteralPath $StagedPath -PathType Leaf)) {
        exit 0
    }

    Copy-Item -LiteralPath $StagedPath -Destination $temporaryPath -Force
    while ((Get-Date) -lt $deadline) {
        try {
            if (Test-Path -LiteralPath $backupPath -PathType Leaf) {
                Remove-Item -LiteralPath $backupPath -Force
            }
            if (Test-Path -LiteralPath $TargetPath -PathType Leaf) {
                Move-Item -LiteralPath $TargetPath -Destination $backupPath -Force
            }
            Move-Item -LiteralPath $temporaryPath -Destination $TargetPath -Force
            Remove-Item -LiteralPath $StagedPath -Force
            if (Test-Path -LiteralPath $backupPath -PathType Leaf) {
                Remove-Item -LiteralPath $backupPath -Force
            }
            Write-SwapLog 'Launcher update installed.'
            exit 0
        }
        catch {
            if (-not (Test-Path -LiteralPath $TargetPath -PathType Leaf) -and
                (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
                Move-Item -LiteralPath $backupPath -Destination $TargetPath -Force
            }
            Start-Sleep -Milliseconds 500
        }
    }
    throw 'Timed out waiting for the launcher to close.'
}
catch {
    Write-SwapLog "Launcher update failed: $($_.Exception.Message)"
    exit 1
}
