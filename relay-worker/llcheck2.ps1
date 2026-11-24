$ErrorActionPreference = 'Continue'
$id = 'can_02ad851eaa346c4f'
$r = Invoke-RestMethod -Uri "https://goltv.stream/api/canales/$id" -TimeoutSec 60
Write-Output "src: $($r.src)"
$pl = Invoke-WebRequest -Uri ('https://goltv.stream' + $r.src) -UseBasicParsing -TimeoutSec 60
$txt = [System.Text.Encoding]::UTF8.GetString($pl.Content)
Write-Output "--- playlist head ---"
Write-Output $txt.Substring(0, [Math]::Min(900, $txt.Length))
Write-Output "--- stats ---"
Write-Output "EXT-X-PART count: $(([regex]::Matches($txt,'EXT-X-PART')).Count)"
Write-Output "seg refs: $(([regex]::Matches($txt,'/api/canales/seg')).Count)"
Write-Output "EXTINF count: $(([regex]::Matches($txt,'EXTINF')).Count)"
