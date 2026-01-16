# run.ps1 - Frontend obsolete cleanup (ASCII-safe)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  OBSOLETE FRONTEND CLEANUP SCRIPT" -ForegroundColor Cyan
Write-Host "  Removes legacy features not used by /search-preview route" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$pathsToDelete = @(
  "src\app\features\food",
  "src\app\features\places",
  "src\app\features\basic-chat",
  "src\app\features\explore",
  "src\app\features\dialogue",
  "src\app\chat-widgets",
  "src\app\shared\components\filter-panel",
  "src\app\shared\components\map-display",
  "src\app\shared\components\results-table",
  "src\app\shared\components\vendor-card",
  "src\app\chat.service.ts",
  "src\app\guardrails"
)

if (-not (Test-Path "src\app\features\unified-search")) {
  Write-Host "ERROR: Must run from llm-angular directory!" -ForegroundColor Red
  Write-Host ("Current directory: {0}" -f (Get-Location)) -ForegroundColor Yellow
  exit 1
}

Write-Host "The following will be DELETED:" -ForegroundColor Yellow
Write-Host ""

$totalSize = 0
$existingPaths = @()

foreach ($path in $pathsToDelete) {
  if (Test-Path $path) {
    $existingPaths += $path

    $fileCount = 0
    $size = 0

    if (Test-Path $path -PathType Container) {
      $files = Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue
      $fileCount = $files.Count
      $size = ($files | Measure-Object -Property Length -Sum).Sum
    } else {
      $fileCount = 1
      $size = (Get-Item $path).Length
    }

    $totalSize += $size
    Write-Host ("  {0} ({1} files, {2} KB)" -f $path, $fileCount, ([math]::Round($size / 1KB, 2))) -ForegroundColor Magenta
  }
  else {
    Write-Host ("  {0} (not found, skipping)" -f $path) -ForegroundColor DarkGray
  }
}

Write-Host ""
Write-Host ("Total size to delete: {0} MB" -f ([math]::Round($totalSize / 1MB, 2))) -ForegroundColor Cyan
Write-Host ""

if ($existingPaths.Count -eq 0) {
  Write-Host "Nothing to delete - all paths already removed!" -ForegroundColor Green
  exit 0
}

Write-Host "WARNING: This action CANNOT be undone!" -ForegroundColor Red
$confirmation = Read-Host "Type DELETE to confirm deletion"

if ($confirmation -ne "DELETE") {
  Write-Host "Cancelled - nothing was deleted" -ForegroundColor Yellow
  exit 0
}

Write-Host ""
Write-Host "Deleting files..." -ForegroundColor Cyan

$deletedCount = 0
$errorCount = 0

foreach ($path in $existingPaths) {
  try {
    Write-Host ("  Deleting: {0}" -f $path) -ForegroundColor Gray
    Remove-Item -Path $path -Recurse -Force -ErrorAction Stop
    Write-Host "    OK" -ForegroundColor Green
    $deletedCount++
  }
  catch {
    Write-Host ("    ERROR: {0}" -f $_) -ForegroundColor Red
    $errorCount++
  }
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  CLEANUP COMPLETE" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ("Deleted: {0} items" -f $deletedCount) -ForegroundColor Green

if ($errorCount -gt 0) {
  Write-Host ("Errors: {0} items" -f $errorCount) -ForegroundColor Yellow
}

Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host "  1. Clean app.routes.ts - remove obsolete routes"
Write-Host "  2. Test: http://localhost:4200/search-preview"
Write-Host "  3. Rebuild: ng serve"
Write-Host "  4. Commit: Remove legacy features - unified-search only"
Write-Host ""
