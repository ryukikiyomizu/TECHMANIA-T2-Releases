param([switch]$Force)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repository = 'ryukikiyomizu/TECHMANIA-T2-Releases'
$archiveName = 'TECHMANIA-Update.zip'
$checksumName = 'TECHMANIA-Update.zip.sha256'
$gameRoot = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$gameRootPrefix = $gameRoot.TrimEnd('\') + '\'
$installedTagPath = Join-Path $gameRoot '.techmania-release'
$launcherPath = Join-Path $gameRoot 'MXGG-TECHMANIA-Launcher.exe'
$stagedLauncherPath = Join-Path $gameRoot 'TECHMANIA-Launcher.exe'
$launcherSwapPath = Join-Path $gameRoot 'TECHMANIA-Launcher-Swap.ps1'
$launcherLogPath = Join-Path $gameRoot 'TECHMANIA-Launcher.log'

function Write-Step([string]$message) {
    Write-Host "[TECHMANIA Updater] $message"
}

function Find-Asset($release, [string]$name) {
    return $release.assets | Where-Object { $_.name -eq $name } | Select-Object -First 1
}

function Install-StagedLauncher {
    if (-not (Test-Path -LiteralPath $stagedLauncherPath -PathType Leaf)) {
        return
    }

    if ((Test-Path -LiteralPath $launcherPath -PathType Leaf) -and
        (Get-FileHash -LiteralPath $launcherPath -Algorithm SHA256).Hash -eq
        (Get-FileHash -LiteralPath $stagedLauncherPath -Algorithm SHA256).Hash) {
        Remove-Item -LiteralPath $stagedLauncherPath -Force
        return
    }

    try {
        Copy-Item -LiteralPath $stagedLauncherPath -Destination $launcherPath -Force
        Remove-Item -LiteralPath $stagedLauncherPath -Force
        Write-Step 'Launcher updated.'
    }
    catch {
        if (-not (Test-Path -LiteralPath $launcherSwapPath -PathType Leaf)) {
            Write-Step 'Launcher update is staged but the swap helper is missing.'
            return
        }

        $windowsRoot = if ([string]::IsNullOrWhiteSpace($env:SystemRoot)) { 'C:\Windows' } else { $env:SystemRoot }
        $powerShell = Join-Path $windowsRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $arguments = @(
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', ('"{0}"' -f $launcherSwapPath),
            '-StagedPath', ('"{0}"' -f $stagedLauncherPath),
            '-TargetPath', ('"{0}"' -f $launcherPath),
            '-LogPath', ('"{0}"' -f $launcherLogPath)
        )
        Start-Process -FilePath $powerShell -ArgumentList $arguments -WindowStyle Hidden
        Write-Step 'Launcher update will finish after this launcher closes.'
    }
}

try {
    if (Get-Process -Name 'TECHMANIA' -ErrorAction SilentlyContinue) {
        throw 'Close TECHMANIA before installing an update.'
    }

    Write-Step 'Checking GitHub Releases...'
    $headers = @{
        'Accept' = 'application/vnd.github+json'
        'User-Agent' = 'TECHMANIA-T2-Updater'
    }
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repository/releases/latest" -Headers $headers
    $releaseTag = [string]$release.tag_name
    if ([string]::IsNullOrWhiteSpace($releaseTag)) {
        throw 'The latest release has no version tag.'
    }

    $installedTag = ''
    if (Test-Path -LiteralPath $installedTagPath) {
        $installedTag = (Get-Content -LiteralPath $installedTagPath -Raw).Trim()
    }
    if (-not $Force -and $installedTag -eq $releaseTag) {
        Install-StagedLauncher
        Write-Step "Already up to date ($releaseTag)."
        exit 0
    }

    $archiveAsset = Find-Asset $release $archiveName
    $checksumAsset = Find-Asset $release $checksumName
    if ($null -eq $archiveAsset -or $null -eq $checksumAsset) {
        throw 'The latest release is missing its update ZIP or checksum.'
    }

    $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('TECHMANIA-Updater-' + [Guid]::NewGuid().ToString('N'))
    $downloadedArchive = Join-Path $tempRoot $archiveName
    $downloadedChecksum = Join-Path $tempRoot $checksumName
    $stagingRoot = Join-Path $tempRoot 'staging'
    New-Item -ItemType Directory -Path $tempRoot, $stagingRoot -Force | Out-Null

    try {
        Write-Step "Downloading $releaseTag..."
        Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri $archiveAsset.browser_download_url -OutFile $downloadedArchive
        Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri $checksumAsset.browser_download_url -OutFile $downloadedChecksum

        $expectedHash = ((Get-Content -LiteralPath $downloadedChecksum -Raw).Trim() -split '\s+')[0].ToUpperInvariant()
        $actualHash = (Get-FileHash -LiteralPath $downloadedArchive -Algorithm SHA256).Hash.ToUpperInvariant()
        if ($expectedHash -ne $actualHash) {
            throw 'Downloaded update failed SHA-256 verification.'
        }

        Write-Step 'Extracting verified update...'
        Expand-Archive -LiteralPath $downloadedArchive -DestinationPath $stagingRoot -Force

        $hasClient = Test-Path -LiteralPath (Join-Path $stagingRoot 'TECHMANIA.exe')
        $hasT2Theme = Test-Path -LiteralPath (Join-Path $stagingRoot 'Themes\Technika 2.tmtheme')
        if (-not $hasClient -and -not $hasT2Theme) {
            throw 'Update package contains neither a client nor the Technika 2 theme.'
        }

        $requiredFiles = @()
        if ($hasClient) {
            $requiredFiles += @(
                'TECHMANIA.exe',
                'TECHMANIA_Data\Managed\Assembly-CSharp.dll',
                'TECHMANIA_Data\Plugins\x86_64\TechmaniaNfcHook.dll',
                'Themes\Default.tmtheme'
            )
        }
        if ($hasT2Theme) {
            $requiredFiles += 'Themes\Technika 2.tmtheme'
        }
        foreach ($relativePath in $requiredFiles) {
            if (-not (Test-Path -LiteralPath (Join-Path $stagingRoot $relativePath))) {
                throw "Update package is incomplete: $relativePath"
            }
        }
        if (-not $hasClient) {
            $unexpectedFile = Get-ChildItem -LiteralPath $stagingRoot -File -Recurse |
                Where-Object Extension -ne '.tmtheme' | Select-Object -First 1
            if ($null -ne $unexpectedFile) {
                throw "Theme-only update contains a non-theme file: $($unexpectedFile.Name)"
            }
        }

        $backupRoot = Join-Path $tempRoot 'backup'
        $installedFiles = @()
        $backedUpFiles = @()
        $staleTutorial = $null
        $staleTutorialBackup = $null
        $markerBackup = Join-Path $backupRoot '.techmania-release'
        $installComplete = $false
        New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

        try {
            Write-Step 'Installing update...'
            foreach ($sourceFile in Get-ChildItem -LiteralPath $stagingRoot -File -Recurse | Sort-Object FullName) {
                $relativePath = $sourceFile.FullName.Substring($stagingRoot.Length).TrimStart([char[]]@('\', '/'))
                $destination = [IO.Path]::GetFullPath((Join-Path $gameRoot $relativePath))
                if (-not $destination.StartsWith($gameRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
                    throw "Unsafe path in update package: $relativePath"
                }

                if (Test-Path -LiteralPath $destination) {
                    if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) {
                        throw "Update destination is not a file: $relativePath"
                    }
                    $backup = Join-Path $backupRoot (Join-Path 'files' $relativePath)
                    New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
                    Copy-Item -LiteralPath $destination -Destination $backup -Force
                    $backedUpFiles += [pscustomobject]@{ Source = $backup; Destination = $destination }
                }
                else {
                    $installedFiles += $destination
                }

                New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
                Copy-Item -LiteralPath $sourceFile.FullName -Destination $destination -Force
            }

            $bundledTutorial = Join-Path $stagingRoot 'TECHMANIA_Data\StreamingAssets\Tracks\T2 Arcade Tutorial\track.tech'
            if ($hasClient -and (Test-Path -LiteralPath $bundledTutorial)) {
                $staleTutorial = [IO.Path]::GetFullPath((Join-Path $gameRoot 'Tracks\T2 Arcade Tutorial'))
                $tracksRoot = [IO.Path]::GetFullPath((Join-Path $gameRoot 'Tracks'))
                if ($staleTutorial.StartsWith($tracksRoot, [StringComparison]::OrdinalIgnoreCase) -and
                    (Test-Path -LiteralPath $staleTutorial)) {
                    $staleTutorialBackup = Join-Path $backupRoot 'stale-tutorial'
                    Copy-Item -LiteralPath $staleTutorial -Destination $staleTutorialBackup -Recurse -Force
                    Remove-Item -LiteralPath $staleTutorial -Recurse -Force
                }
            }

            if (Test-Path -LiteralPath $installedTagPath -PathType Leaf) {
                Copy-Item -LiteralPath $installedTagPath -Destination $markerBackup -Force
            }
            Set-Content -LiteralPath $installedTagPath -Value $releaseTag -Encoding ASCII
            $installComplete = $true
        }
        finally {
            if (-not $installComplete) {
                Write-Step 'Rolling back incomplete update...'
                try {
                    foreach ($destination in $installedFiles) {
                        if (Test-Path -LiteralPath $destination -PathType Leaf) {
                            Remove-Item -LiteralPath $destination -Force
                        }
                    }
                    foreach ($backup in $backedUpFiles) {
                        New-Item -ItemType Directory -Path (Split-Path -Parent $backup.Destination) -Force | Out-Null
                        Copy-Item -LiteralPath $backup.Source -Destination $backup.Destination -Force
                    }
                    if ($null -ne $staleTutorialBackup -and (Test-Path -LiteralPath $staleTutorialBackup)) {
                        if (Test-Path -LiteralPath $staleTutorial) {
                            Remove-Item -LiteralPath $staleTutorial -Recurse -Force
                        }
                        Move-Item -LiteralPath $staleTutorialBackup -Destination $staleTutorial -Force
                    }
                    if (Test-Path -LiteralPath $markerBackup -PathType Leaf) {
                        Copy-Item -LiteralPath $markerBackup -Destination $installedTagPath -Force
                    }
                    elseif (Test-Path -LiteralPath $installedTagPath -PathType Leaf) {
                        Remove-Item -LiteralPath $installedTagPath -Force
                    }
                }
                catch {
                    Write-Step "Rollback warning: $($_.Exception.Message)"
                }
            }
        }

        Install-StagedLauncher
        Write-Step "Updated successfully to $releaseTag."
    }
    finally {
        if (Test-Path -LiteralPath $tempRoot) {
            Remove-Item -LiteralPath $tempRoot -Recurse -Force
        }
    }
}
catch {
    Write-Host "[TECHMANIA Updater] ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
