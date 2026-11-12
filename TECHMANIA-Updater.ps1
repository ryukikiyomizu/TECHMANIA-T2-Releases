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

function Write-Step([string]$message) {
    Write-Host "[TECHMANIA Updater] $message"
}

function Find-Asset($release, [string]$name) {
    return $release.assets | Where-Object { $_.name -eq $name } | Select-Object -First 1
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

        $requiredFiles = @(
            'Themes\Technika 2.tmtheme',
            'TECHMANIA_Data\StreamingAssets\Tracks\T2 Arcade Tutorial\track.tech',
            'TECHMANIA_Data\StreamingAssets\Tracks\T2 Arcade Tutorial\tutorial.ogg'
        )
        foreach ($relativePath in $requiredFiles) {
            if (-not (Test-Path -LiteralPath (Join-Path $stagingRoot $relativePath))) {
                throw "Update package is incomplete: $relativePath"
            }
        }

        Write-Step 'Installing update...'
        foreach ($sourceFile in Get-ChildItem -LiteralPath $stagingRoot -File -Recurse) {
            $relativePath = $sourceFile.FullName.Substring($stagingRoot.Length).TrimStart([char[]]@('\', '/'))
            $destination = [IO.Path]::GetFullPath((Join-Path $gameRoot $relativePath))
            if (-not $destination.StartsWith($gameRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
                throw "Unsafe path in update package: $relativePath"
            }
            $destinationDirectory = Split-Path -Parent $destination
            New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
            Copy-Item -LiteralPath $sourceFile.FullName -Destination $destination -Force
        }

        $staleTutorial = [IO.Path]::GetFullPath((Join-Path $gameRoot 'Tracks\T2 Arcade Tutorial'))
        $tracksRoot = [IO.Path]::GetFullPath((Join-Path $gameRoot 'Tracks'))
        if ($staleTutorial.StartsWith($tracksRoot, [StringComparison]::OrdinalIgnoreCase) -and
            (Test-Path -LiteralPath $staleTutorial)) {
            Remove-Item -LiteralPath $staleTutorial -Recurse -Force
        }

        Set-Content -LiteralPath $installedTagPath -Value $releaseTag -Encoding ASCII
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
