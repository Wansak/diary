$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputFile = Join-Path $projectRoot "starter-gallery.js"

$photoExtensions = @(".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif")
$monthNames = @{
    "01" = "January"; "02" = "February"; "03" = "March"; "04" = "April";
    "05" = "May"; "06" = "June"; "07" = "July"; "08" = "August";
    "09" = "September"; "10" = "October"; "11" = "November"; "12" = "December"
}
$monthLookup = @{
    "january"="01"; "jan"="01"; "1"="01"; "01"="01";
    "february"="02"; "feb"="02"; "2"="02"; "02"="02";
    "march"="03"; "mar"="03"; "3"="03"; "03"="03";
    "april"="04"; "apr"="04"; "4"="04"; "04"="04";
    "may"="05"; "5"="05"; "05"="05";
    "june"="06"; "jun"="06"; "6"="06"; "06"="06";
    "july"="07"; "jul"="07"; "7"="07"; "07"="07";
    "august"="08"; "aug"="08"; "8"="08"; "08"="08";
    "september"="09"; "sep"="09"; "sept"="09"; "9"="09"; "09"="09";
    "october"="10"; "oct"="10"; "10"="10";
    "november"="11"; "nov"="11"; "11"="11";
    "december"="12"; "dec"="12"; "12"="12"
}

$albums = @(
    @{ Type = "photo"; Folder = "photos/with-friends"; Album = "with-friends"; Label = "With friends"; Extensions = $photoExtensions; Recursive = $false },
    @{ Type = "photo"; Folder = "photos/psalm"; Album = "psalm"; Label = "Psalm"; Extensions = $photoExtensions; Recursive = $false },
    @{ Type = "photo"; Folder = "photos/juan"; Album = "juan"; Label = "Juan"; Extensions = $photoExtensions; Recursive = $false },
    @{ Type = "photo"; Folder = "photos/pets"; Album = "pets"; Label = "Pets"; Extensions = $photoExtensions; Recursive = $false },
    @{ Type = "photo"; Folder = "photos/foods"; Album = "foods"; Label = "Foods"; Extensions = $photoExtensions; Recursive = $false },
    @{ Type = "photo"; Folder = "photos/us-together"; Album = "us-together"; Label = "Us Together"; Extensions = $photoExtensions; Recursive = $true }
)

function Normalize-RelativePath([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -eq ".") { return "" }
    return ($Value -replace '\\', '/').Trim('/')
}

function Get-MonthToken([string]$Token) {
    if ([string]::IsNullOrWhiteSpace($Token)) { return $null }
    $clean = $Token.Trim().ToLowerInvariant() -replace '^[0-9]{1,2}[-_ ]+', ''
    if ($monthLookup.ContainsKey($clean)) { return $monthLookup[$clean] }
    return $null
}

function Get-UsTogetherPeriod([string]$FolderPath) {
    $result = @{ Month = $null; Year = $null }
    $normalized = Normalize-RelativePath $FolderPath
    if (-not $normalized) { return $result }
    $segments = $normalized.Split('/')
    $last = $segments[$segments.Length - 1]
    $previous = if ($segments.Length -gt 1) { $segments[$segments.Length - 2] } else { "" }

    if ($last -match '^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[-_ ]+(20\d{2})$') {
        $month = Get-MonthToken $Matches[1]
        if ($month) { $result.Month = $month; $result.Year = [int]$Matches[2]; return $result }
    }
    if ($last -match '^(20\d{2})[-_ ]+(0?[1-9]|1[0-2])(?:[-_ ].*)?$') {
        $result.Month = ([int]$Matches[2]).ToString("00"); $result.Year = [int]$Matches[1]; return $result
    }
    if ($last -match '^(0?[1-9]|1[0-2])[-_ ]+(20\d{2})$') {
        $result.Month = ([int]$Matches[1]).ToString("00"); $result.Year = [int]$Matches[2]; return $result
    }
    if ($previous -match '^20\d{2}$') {
        $month = Get-MonthToken $last
        if ($month) { $result.Month = $month; $result.Year = [int]$previous; return $result }
    }
    if ($last -match '^20\d{2}$') {
        $month = Get-MonthToken $previous
        if ($month) { $result.Month = $month; $result.Year = [int]$last; return $result }
    }
    return $result
}

$items = New-Object System.Collections.Generic.List[object]
$order = 0

foreach ($album in $albums) {
    $folderPath = Join-Path $projectRoot ("assets/gallery/" + $album.Folder)
    if (-not (Test-Path $folderPath)) {
        New-Item -ItemType Directory -Path $folderPath -Force | Out-Null
    }

    $files = if ($album.Recursive) {
        Get-ChildItem -Path $folderPath -File -Recurse
    } else {
        Get-ChildItem -Path $folderPath -File
    }

    $files = $files | Where-Object {
        $album.Extensions -contains $_.Extension.ToLowerInvariant()
    } | Sort-Object `
        @{ Expression = { ($_.DirectoryName.Substring($folderPath.Length).TrimStart('\', '/') -replace '\\', '/').ToLowerInvariant() } }, `
        @{ Expression = { if ($_.BaseName -match '^\d+$') { [int64]$_.BaseName } else { [int64]::MaxValue } } }, `
        @{ Expression = { $_.Name.ToLowerInvariant() } }

    foreach ($file in $files) {
        $order++
        $relativeFile = Normalize-RelativePath ($file.FullName.Substring($folderPath.Length).TrimStart('\', '/'))
        $relativeFolder = Normalize-RelativePath (Split-Path $relativeFile -Parent)
        $rawId = "starter-$($album.Type)-$($album.Album)-$($relativeFile.ToLowerInvariant())"
        $id = $rawId -replace '[^a-z0-9_-]', '-'
        $period = if ($album.Album -eq "us-together") { Get-UsTogetherPeriod $relativeFolder } else { @{ Month = $null; Year = $null } }
        $periodLabel = if ($period.Month -and $period.Year) { "$($monthNames[$period.Month]) $($period.Year)" } else { "" }

        $item = [ordered]@{
            id = $id
            type = $album.Type
            album = $album.Album
            filename = $file.Name
            title = if ($periodLabel) { "$($album.Label) · $periodLabel · $($file.BaseName)" } else { "$($album.Label) $($file.BaseName)" }
            date = if ($periodLabel) { "$($period.Year)-$($period.Month)-01" } else { "" }
            description = ""
            authorId = "starter"
            authorName = "Starter gallery"
            createdAt = $order
            updatedAt = $order
        }
        if ($album.Album -eq "us-together" -and $relativeFolder) { $item.folderPath = $relativeFolder }
        if ($period.Month) { $item.month = $period.Month }
        if ($period.Year) { $item.year = $period.Year }
        $items.Add($item)
    }
}

$json = if ($items.Count -eq 0) { "[]" } else { $items | ConvertTo-Json -Depth 6 }
$content = @"
// Auto-generated file. Do not edit manually.
// Generated from starter photos inside assets/gallery. Videos are stored in Google Drive.
export const STARTER_GALLERY = $json;
"@

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputFile, $content, $utf8NoBom)

Write-Host ""
Write-Host "Starter gallery generated successfully." -ForegroundColor Green
Write-Host "Total starter photos found: $($items.Count)" -ForegroundColor Cyan
foreach ($album in $albums) {
    $count = ($items | Where-Object { $_.type -eq $album.Type -and $_.album -eq $album.Album }).Count
    Write-Host ("- {0}: {1}" -f $album.Label, $count)
}
Write-Host ""
Write-Host "Us Together supports month-and-year folders such as:"
Write-Host "- assets/gallery/photos/us-together/July 2026/1.jpg"
Write-Host "- assets/gallery/photos/us-together/2026/July/1.jpg"
Write-Host ""
Write-Host "Videos are intentionally excluded because deployed videos now live in Google Drive."
Write-Host "Output: starter-gallery.js"
