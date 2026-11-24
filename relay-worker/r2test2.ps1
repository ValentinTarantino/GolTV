$ErrorActionPreference = 'Continue'
$id = 'can_02ad851eaa346c4f'
$r = Invoke-RestMethod -Uri ("https://goltv.stream/api/canales/" + $id) -TimeoutSec 60
$master = Invoke-WebRequest -Uri ("https://goltv.stream" + $r.src) -UseBasicParsing -TimeoutSec 60
$mtxt = [System.Text.Encoding]::UTF8.GetString($master.Content)
$variant = [regex]::Match($mtxt, '/api/canales/stream\?[^\s]+').Value
$pl = Invoke-WebRequest -Uri ("https://goltv.stream" + $variant) -UseBasicParsing -TimeoutSec 60
$txt = [System.Text.Encoding]::UTF8.GetString($pl.Content)
$m = [regex]::Match($txt, '/api/canales/seg\?t=[^\s"'']+')
$tm = [regex]::Match($m.Value, 't=([^&\s]+)')
$tok = [uri]::UnescapeDataString($tm.Groups[1].Value)

$sha = [System.Security.Cryptography.SHA256]::Create()
$bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($tok))
$hex = ([System.BitConverter]::ToString($bytes) -replace '-','').ToLower().Substring(0,48)
$r2url = "https://media.goltv.stream/v1/canal/" + $hex
Write-Output ("R2 URL: " + $r2url)

$pop = "https://goltv.stream/api/populate?kind=canal&t=" + [uri]::EscapeDataString($tok)
$pr = Invoke-WebRequest -Uri $pop -UseBasicParsing -TimeoutSec 90
Write-Output ("populate: " + $pr.StatusCode + " " + $pr.Content)

Start-Sleep -Seconds 2
try {
  $r2 = Invoke-WebRequest -Uri $r2url -UseBasicParsing -TimeoutSec 60
  Write-Output ("R2 GET: " + $r2.StatusCode + " len=" + $r2.RawContentLength + " ct=" + $r2.Headers['Content-Type'])
  Write-Output ("cf-cache-status: " + $r2.Headers['cf-cache-status'])
  Write-Output ("cf-ray: " + $r2.Headers['cf-ray'])
  $r2b = Invoke-WebRequest -Uri $r2url -UseBasicParsing -TimeoutSec 60
  Write-Output ("R2 GET2: " + $r2b.StatusCode + " cf-cache-status: " + $r2b.Headers['cf-cache-status'])
} catch {
  Write-Output ("R2 GET FAILED: " + $_.Exception.Message)
  if ($_.Exception.Response) { Write-Output ("status: " + [int]$_.Exception.Response.StatusCode) }
}
