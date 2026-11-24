$ErrorActionPreference = 'Continue'
$id = 'can_02ad851eaa346c4f'
$r = Invoke-RestMethod -Uri "https://goltv.stream/api/canales/$id" -TimeoutSec 60
$master = Invoke-WebRequest -Uri ('https://goltv.stream' + $r.src) -UseBasicParsing -TimeoutSec 60
$mtxt = [System.Text.Encoding]::UTF8.GetString($master.Content)
$variant = [regex]::Match($mtxt, '/api/canales/stream\?[^\s]+').Value
Write-Output "variant: $($variant.Substring(0,60))..."
$pl = Invoke-WebRequest -Uri ('https://goltv.stream' + $variant) -UseBasicParsing -TimeoutSec 60
$txt = [System.Text.Encoding]::UTF8.GetString($pl.Content)
Write-Output "--- playlist head ---"
Write-Output $txt.Substring(0, [Math]::Min(1200, $txt.Length))
Write-Output "--- stats ---"
Write-Output "EXT-X-PART: $(([regex]::Matches($txt,'EXT-X-PART')).Count)"
Write-Output "EXTINF: $(([regex]::Matches($txt,'EXTINF')).Count)"
Write-Output "seg refs: $(([regex]::Matches($txt,'/api/canales/seg')).Count)"
Write-Output "EXT-X-TARGETDURATION: $(([regex]::Match($txt,'EXT-X-TARGETDURATION:(\d+)')).Groups[1].Value)"
