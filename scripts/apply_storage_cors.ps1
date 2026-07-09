$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $root ".env"
$corsPath = Join-Path $root "firebase-storage-cors.json"

if (-not (Test-Path -LiteralPath $corsPath)) {
  throw "ไม่พบ firebase-storage-cors.json"
}

$bucket = $null
if (Test-Path -LiteralPath $envPath) {
  $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match "^REACT_APP_FIREBASE_STORAGE_BUCKET=" } | Select-Object -First 1
  if ($line) {
    $bucket = ($line -replace "^REACT_APP_FIREBASE_STORAGE_BUCKET=", "").Trim()
  }
}

if (-not $bucket) {
  $bucket = "cmg-budget-control.firebasestorage.app"
}

$bucketUri = "gs://$bucket"
Write-Host "Apply Firebase Storage CORS to $bucketUri"

$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if ($gcloud) {
  & gcloud storage buckets update $bucketUri --cors-file=$corsPath
  Write-Host "Done via gcloud."
  exit 0
}

$gsutil = Get-Command gsutil -ErrorAction SilentlyContinue
if ($gsutil) {
  & gsutil cors set $corsPath $bucketUri
  Write-Host "Done via gsutil."
  exit 0
}

throw "ไม่พบ gcloud หรือ gsutil ในเครื่องนี้ กรุณาติดตั้ง Google Cloud SDK แล้วรัน .\apply_storage_cors.ps1"
