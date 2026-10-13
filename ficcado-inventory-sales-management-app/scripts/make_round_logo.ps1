Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\assets\Images\ficcado_logo.jpg"
$destPng = Join-Path $PSScriptRoot "..\public\ficcado_logo.png"
$destIcon = Join-Path $PSScriptRoot "..\app\icon.png"

$img = [System.Drawing.Image]::FromFile($srcPath)
$size = [Math]::Min($img.Width, $img.Height)

$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddEllipse(0, 0, $size, $size)
$g.SetClip($path)

$cropX = [int][Math]::Floor(($img.Width - $size) / 2)
$cropY = [int][Math]::Floor(($img.Height - $size) / 2)
$srcRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $size, $size)
$destRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)

$g.DrawImage($img, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

$g.Dispose()
$img.Dispose()

$bmp.Save($destPng, [System.Drawing.Imaging.ImageFormat]::Png)
Copy-Item $destPng $destIcon -Force
$bmp.Dispose()

Write-Host "Circular Ficcado logo PNG generated successfully!"
