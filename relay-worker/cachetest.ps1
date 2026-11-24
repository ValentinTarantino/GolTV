$ErrorActionPreference = 'Continue'
$id = 'can_7416263a2fc71d7f'
$resolved = Invoke-RestMethod -Uri "https://goltv.stream/api/canales/$id" -TimeoutSec 90
$mpd = Invoke-WebRequest -Uri ('https://goltv.stream' + $resolved.src) -UseBasicParsing -TimeoutSec 90
$seg = 'https://goltv.stream' + [regex]::Matches($mpd.Content, '/api/canales/seg\?[^"<]+')[0].Value
foreach ($i in 1..4) {
  try {
    $r = Invoke-WebRequest -Uri $seg -UseBasicParsing -TimeoutSec 60
    Write-Output "try$i => $($r.StatusCode) cf=$($r.Headers['cf-cache-status']) age=$($r.Headers['Age']) len=$($r.RawContentLength)"
  } catch {
    $resp = $_.Exception.Response
    if ($resp) { Write-Output "try$i => HTTP $([int]$resp.StatusCode)" } else { Write-Output "try$i => ERR $($_.Exception.Message)" }
  }
  Start-Sleep -Seconds 2
}
