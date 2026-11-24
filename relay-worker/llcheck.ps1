$ErrorActionPreference = 'Continue'
$channels = @('can_0ec0b7b3f9752f2a','can_6feca5fcf3cb54f3','can_186b266b770f2145','can_02ad851eaa346c4f')
foreach ($id in $channels) {
  try {
    $r = Invoke-RestMethod -Uri "https://goltv.stream/api/canales/$id" -TimeoutSec 60
    $kind = $r.kind
    Write-Output "$id => kind=$kind"
    if ($kind -eq 'hls' -or $r.src -match 'm3u8') {
      $pl = Invoke-WebRequest -Uri ('https://goltv.stream' + $r.src) -UseBasicParsing -TimeoutSec 60
      $hasPart = $pl.Content -match 'EXT-X-PART'
      $segCount = ([regex]::Matches($pl.Content, '\.ts|\.m4s|\.mp4|/seg')).Count
      Write-Output "   playlist: parts=$hasPart segrefs=$segCount len=$($pl.RawContentLength)"
      $pl.Content.Substring(0, [Math]::Min(400, $pl.Content.Length))
    }
  } catch { Write-Output "$id => ERR $($_.Exception.Message)" }
}
