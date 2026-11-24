$ErrorActionPreference = 'Continue'
$id = 'can_02ad851eaa346c4f'
$r = Invoke-RestMethod -Uri ("https://goltv.stream/api/canales/" + $id) -TimeoutSec 60
$master = Invoke-WebRequest -Uri ("https://goltv.stream" + $r.src) -UseBasicParsing -TimeoutSec 60
$mtxt = [System.Text.Encoding]::UTF8.GetString($master.Content)
$variant = [regex]::Match($mtxt, '/api/canales/stream\?[^\s]+').Value
Write-Output ("variant: " + $variant.Substring(0, [Math]::Min(80, $variant.Length)))
$pl = Invoke-WebRequest -Uri ("https://goltv.stream" + $variant) -UseBasicParsing -TimeoutSec 60
$txt = [System.Text.Encoding]::UTF8.GetString($pl.Content)
$m = [regex]::Match($txt, '/api/canales/seg\?t=[^\s"'']+')
if ($m.Success) {
  $segUrl = "https://goltv.stream" + $m.Value
  Write-Output ("seg: " + $segUrl.Substring(0, [Math]::Min(100, $segUrl.Length)))
  # extract token t=...
  $tm = [regex]::Match($m.Value, 't=([^&\s]+)')
  $tok = [uri]::UnescapeDataString($tm.Groups[1].Value)
  Write-Output ("token len: " + $tok.Length)
  $pop = "https://goltv.stream/api/populate?kind=canal&t=" + [uri]::EscapeDataString($tok)
  Write-Output ("populate: " + $pop.Substring(0, [Math]::Min(120, $pop.Length)))
  $pr = Invoke-WebRequest -Uri $pop -UseBasicParsing -TimeoutSec 60
  Write-Output ("populate status: " + $pr.StatusCode + " body: " + $pr.Content)
} else {
  Write-Output "NO SEG TOKEN FOUND"
  Write-Output $txt.Substring(0, [Math]::Min(800, $txt.Length))
}
