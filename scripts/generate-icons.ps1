# Raster versions of the existing folder/check logo for home-screen icons.
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$iconsDirectory = Join-Path $projectRoot 'icons'
[System.IO.Directory]::CreateDirectory($iconsDirectory) | Out-Null
foreach ($size in @(180, 192, 512)) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform(($size / 64.0), ($size / 64.0))
    $tile = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.Point]::new(0, 0), [System.Drawing.Point]::new(64, 64),
        [System.Drawing.ColorTranslator]::FromHtml('#BA9AFF'),
        [System.Drawing.ColorTranslator]::FromHtml('#7050D5'))
    $graphics.FillRectangle($tile, 0, 0, 64, 64)
    $folder = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $folder.AddArc(15, 18, 8, 8, 180, 90)
    $folder.AddLine(19, 18, 27, 18)
    $folder.AddLine(27, 18, 32, 23)
    $folder.AddLine(32, 23, 45, 23)
    $folder.AddArc(41, 23, 8, 8, 270, 90)
    $folder.AddLine(49, 27, 49, 42)
    $folder.AddArc(41, 38, 8, 8, 0, 90)
    $folder.AddLine(45, 46, 19, 46)
    $folder.AddArc(15, 38, 8, 8, 90, 90)
    $folder.CloseFigure()
    $paper = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.Point]::new(16, 21), [System.Drawing.Point]::new(48, 47),
        [System.Drawing.Color]::White, [System.Drawing.ColorTranslator]::FromHtml('#D8CCFF'))
    $graphics.FillPath($paper, $folder)
    $check = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#7954D6'), 4.5)
    $check.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $check.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $check.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawLines($check, [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(24, 33), [System.Drawing.PointF]::new(30, 39), [System.Drawing.PointF]::new(42, 26)))
    $dot = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#9EF0E5'))
    $graphics.FillEllipse($dot, 44, 13, 8, 8)
    $outputPath = if ($size -eq 180) { Join-Path $projectRoot 'apple-touch-icon.png' } else { Join-Path $iconsDirectory "icon-$size.png" }
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $dot.Dispose(); $check.Dispose(); $paper.Dispose(); $folder.Dispose()
    $tile.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
    Write-Output "Created $outputPath"
}
