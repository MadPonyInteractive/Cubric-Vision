# MPI-511 - capture the dev-box CPU spike IN THE ACT.
#
# Run this WHILE the box is sitting high. It needs no admin: it reads perf
# counters, not Get-Process .CPU. That matters - .CPU returns 0 for every
# protected process (MsMpEng, System, dwm, Registry) in a non-elevated shell,
# so a Get-Process delta silently omits Defender and the kernel, which is
# exactly where this spike is expected to live.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File capture-cpu.ps1
#
# Writes a timestamped report next to itself and prints it.

param([int]$Seconds = 30)

$cores  = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$out    = Join-Path $PSScriptRoot "cpu-capture-$stamp.txt"
$lines  = New-Object System.Collections.Generic.List[string]
function Say($s) { $lines.Add($s); Write-Output $s }

Say "=== MPI-511 CPU capture  $stamp ==="
Say ("cores = $cores   window = ${Seconds}s   uptime = " +
     [math]::Round(((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalHours, 2) + ' h')
Say ''

# --- where the time goes: user code, kernel, or a driver ---------------------
$paths = '\Processor(_Total)\% Processor Time','\Processor(_Total)\% Privileged Time',
         '\Processor(_Total)\% User Time','\Processor(_Total)\% DPC Time',
         '\Processor(_Total)\% Interrupt Time'
$sys = Get-Counter $paths -SampleInterval 1 -MaxSamples $Seconds
Say '=== box totals (averaged over the window) ==='
$sys.CounterSamples | Group-Object Path | ForEach-Object {
  Say ('  {0,-22} {1}%' -f ($_.Name -replace '.*\\',''),
       [math]::Round((($_.Group | Measure-Object CookedValue -Average).Average), 2))
}
Say ''
Say '  READ IT LIKE THIS: privileged >> user means a service or driver, not an app.'
Say '  DPC or interrupt above ~5% means a DRIVER, and no process will own it.'
Say ''

# --- per process, protected ones included ------------------------------------
# -ErrorAction SilentlyContinue is load-bearing: any process that EXITS mid-run
# invalidates one sample and Get-Counter reports it as a terminating-looking
# error while still returning good data. Without this the script reads broken.
$proc = Get-Counter '\Process(*)\% Processor Time' -SampleInterval 1 `
          -MaxSamples ([math]::Min($Seconds, 15)) -ErrorAction SilentlyContinue
Say '=== top processes (avg % of the whole box) ==='
$proc.CounterSamples |
  Where-Object { $_.InstanceName -notin @('_total','idle') } |
  Group-Object InstanceName |
  ForEach-Object {
    [pscustomobject]@{
      Name = $_.Name
      Pct  = [math]::Round((($_.Group | Measure-Object CookedValue -Average).Average) / $cores, 2)
    }
  } | Where-Object { $_.Pct -gt 0.05 } | Sort-Object Pct -Descending | Select-Object -First 20 |
  ForEach-Object { Say ('  {0,-28} {1}%' -f $_.Name, $_.Pct) }
Say ''

# --- Defender: is it mid-scan, and how hot -----------------------------------
$d = Get-MpComputerStatus
Say '=== Defender ==='
Say ('  ScanInProgress   = ' + $d.ScanInProgress)
Say ('  QuickScanAge (d) = ' + $d.QuickScanAge + '   FullScanAge (d) = ' + $d.FullScanAge)
Say ('  RealTime = ' + $d.RealTimeProtectionEnabled + '   BehaviorMonitor = ' + $d.BehaviorMonitorEnabled)
$mp = $proc.CounterSamples | Where-Object { $_.InstanceName -match 'msmpeng' }
if ($mp) { Say ('  MsMpEng          = ' + [math]::Round((($mp | Measure-Object CookedValue -Average).Average) / $cores, 2) + '%') }
else     { Say '  MsMpEng          = not sampled' }
Say ''
Say '=== process census ==='
Say ('  Code procs = ' + @(Get-Process Code -ErrorAction SilentlyContinue).Count +
     '   node procs = ' + @(Get-Process node -ErrorAction SilentlyContinue).Count +
     '   electron procs = ' + @(Get-Process electron -ErrorAction SilentlyContinue).Count)

$lines | Set-Content -Path $out -Encoding UTF8
Write-Output ''
Write-Output "saved: $out"
