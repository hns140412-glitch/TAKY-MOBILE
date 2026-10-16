$ErrorActionPreference='Stop'
$base='D:\Git PWA'
$out=Join-Path $base 'TAKY-MOBILE\artifacts\device-mock-audit-20261011\path-migration-e2e'
$procs=@()
$sites=@(
@{n='mobile';p=4350;dir='TAKY-MOBILE';mode='static'},
@{n='ready';p=4351;dir='READY-WEBAPP-20261006';mode='static'},
@{n='hide';p=4352;dir='Hide & Seek';mode='static'},
@{n='snap';p=4321;dir='Snap & Pop';mode='static'},
@{n='playcamp';p=4331;dir='Play Camp';mode='vite'})
try {
 foreach($s in $sites){
  $port=[int]$s.p
  if(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue){throw "PORT_BUSY_$port"}
  $cwd=Join-Path $base $s.dir
  if($s.mode -eq 'vite'){$proc=Start-Process -FilePath 'node.exe' -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',"$port",'--strictPort') -WorkingDirectory $cwd -WindowStyle Hidden -PassThru}
  else {$proc=Start-Process -FilePath 'python.exe' -ArgumentList @('-m','http.server',"$port",'--bind','127.0.0.1') -WorkingDirectory $cwd -WindowStyle Hidden -PassThru}
  $procs+= $proc
  Write-Output ("START "+$s.n+" "+$proc.Id)
 }
 foreach($s in $sites){
  $ok=$false
  for($i=0;$i -lt 50;$i++){
   try{$res=Invoke-WebRequest -Uri ("http://127.0.0.1:"+$s.p+"/") -UseBasicParsing -TimeoutSec 2;if($res.StatusCode -eq 200){$ok=$true;break}}catch{}
   Start-Sleep -Milliseconds 300
  }
  Write-Output ("CHECK "+$s.n+" "+$ok)
  if(-not $ok){throw ('SERVER_FAILED_'+$s.n)}
 }
 $log=Join-Path $out 'multi-specialist.log'
 $result=& node.exe (Join-Path $base 'TAKY-MOBILE\tests\learning-loop-multi-specialist-roundtrip-e2e.cjs') 2>&1
 $exit=$LASTEXITCODE
 ($result|Out-String)|Set-Content -Path $log -Encoding utf8
 Write-Output ('MULTI_E2E_EXIT='+$exit)
 $result|Select-Object -Last 36
 if($exit -ne 0){
  $r2=& node.exe (Join-Path $base 'TAKY-MOBILE\tests\learning-loop-roundtrip-e2e.cjs') 2>&1
  ($r2|Out-String)|Set-Content -Path (Join-Path $out 'single-hide.log') -Encoding utf8
  Write-Output ('SINGLE_E2E_EXIT='+$LASTEXITCODE)
  $r2|Select-Object -Last 20
 }
}finally{foreach($p in $procs){Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue;Write-Output ('CLEANUP_PID='+$p.Id)}}
