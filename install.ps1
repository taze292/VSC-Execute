$ErrorActionPreference = "Stop"
$version = "0.3.0"
$vsix = "vsc-execute-$version.vsix"

if ($null -eq (Get-Command code -ErrorAction SilentlyContinue)) {
  Write-Host "The 'code' command was not found." -ForegroundColor Red
  Write-Host "Open VS Code, press Ctrl+Shift+P, run 'Shell Command: Install 'code' command in PATH', then re-run this script." -ForegroundColor Yellow
  exit 1
}

if (Test-Path $vsix) {
  $path = (Resolve-Path $vsix).Path
} else {
  $tmp = Join-Path $env:TEMP $vsix
  Write-Host "Downloading $vsix ..."
  Invoke-WebRequest -Uri "https://raw.githubusercontent.com/taze292/VSC-Execute/main/$vsix" -OutFile $tmp
  $path = $tmp
}

Write-Host "Installing $vsix ..."
try {
  code --install-extension $path --force
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  if (Test-Path (Join-Path $env:TEMP $vsix)) { Remove-Item (Join-Path $env:TEMP $vsix) -Force }
}
Write-Host "Done. Reload VS Code if prompted."