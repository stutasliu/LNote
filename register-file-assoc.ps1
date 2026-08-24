# Register L.Note as an image + markdown handler:
#   - "Open with" entry (right-click -> Open with -> L.Note)
#   - default double-click handler for common image types and .md/.markdown
# Writes to HKCU only (no admin rights required).
#
# Run it either by:
#   1) double-clicking register-file-assoc.bat, or
#   2) powershell -NoProfile -ExecutionPolicy Bypass -File register-file-assoc.ps1
#
# After running, double-click a .md file (or right-click -> "Open with" -> L.Note).

$ErrorActionPreference = 'Stop'

# Locate the built executable relative to this script (source stays ASCII-safe).
$exe = Join-Path $PSScriptRoot 'dist\L.Note.exe'
if (-not (Test-Path -LiteralPath $exe)) {
    Write-Host "[ERROR] EXE not found: $exe" -ForegroundColor Red
    Write-Host "Build it first: python -m PyInstaller Inkpad.spec --noconfirm" -ForegroundColor Yellow
    exit 1
}

$progId  = 'L.Note.Image'
$command = '"' + $exe + '" "%1"'
$exts    = '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico'
$docExts = '.md', '.markdown'

# 1) Register the app in the "Open with" dialog (per-user Applications key).
$appCmd = "HKCU:\Software\Classes\Applications\L.Note.exe\shell\open\command"
New-Item -Path $appCmd -Force | Out-Null
Set-Item -Path $appCmd -Value $command

# 2) Define a ProgID pointing to the same command (friendly name + icon).
$prog = "HKCU:\Software\Classes\$progId"
New-Item -Path "$prog\shell\open\command" -Force | Out-Null
Set-Item -Path "$prog\shell\open\command" -Value $command

New-Item -Path "$prog\DefaultIcon" -Force | Out-Null
Set-Item -Path "$prog\DefaultIcon" -Value "$exe,0"

New-ItemProperty -Path $prog -Name 'FriendlyAppName' -Value 'L.Note' -PropertyType String -Force | Out-Null

# 3) Attach the ProgID to common image extensions + make it the default handler.
foreach ($e in $exts) {
    # Open-with entry
    $oid = "HKCU:\Software\Classes\$e\OpenWithProgids"
    New-Item -Path $oid -Force | Out-Null
    New-ItemProperty -Path $oid -Name $progId -Value '' -PropertyType String -Force | Out-Null

    # Default double-click handler
    $extKey = "HKCU:\Software\Classes\$e"
    if (-not (Test-Path $extKey)) { New-Item -Path $extKey -Force | Out-Null }
    Set-Item -Path $extKey -Value $progId
}

# 4) Attach the ProgID to markdown extensions + make it the default handler.
foreach ($e in $docExts) {
    # Open-with entry
    $oid = "HKCU:\Software\Classes\$e\OpenWithProgids"
    New-Item -Path $oid -Force | Out-Null
    New-ItemProperty -Path $oid -Name $progId -Value '' -PropertyType String -Force | Out-Null

    # Default double-click handler
    $extKey = "HKCU:\Software\Classes\$e"
    if (-not (Test-Path $extKey)) { New-Item -Path $extKey -Force | Out-Null }
    Set-Item -Path $extKey -Value $progId
}

Write-Host '[OK] L.Note registered as the default image + markdown handler.' -ForegroundColor Green