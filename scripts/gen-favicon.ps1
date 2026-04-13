Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 32, 32
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 185, 28, 28))
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 255, 255, 255), 2)
$g.DrawEllipse($pen, 6, 6, 20, 20)
$g.FillEllipse([System.Drawing.Brushes]::White, 13, 13, 6, 6)
$g.Dispose()
$pen.Dispose()
$root = Split-Path -Parent $PSScriptRoot
$outPng = Join-Path $root "public\favicon-32.png"
$bmp.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
$icoPath = Join-Path $root "public\favicon.ico"
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = [System.IO.File]::Create($icoPath)
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$bmp.Dispose()
Write-Host "Wrote $outPng and $icoPath"
