# MPI-633 — sum dedicated GPU memory over an EXPLICIT pid list.
#
# Per-process VRAM is not attributable via nvidia-smi under WDDM on this machine
# (MPI-631), so this reads '\GPU Process Memory(*)\Dedicated Usage', whose instance
# names carry the pid: pid_<pid>_luid_..._phys_0.
#
# The pid list must come from Electron's own app.getAppMetrics(). A process-tree walk
# does NOT work: Win32_Process reports no children for the Electron main pid (measured
# 2026-08-27, tree(1) while getAppMetrics listed Browser/GPU/Tab/Utility), so a tree
# sampler reads 0.0 MB for a perfectly healthy app. Never match on process NAME either
# — an agent's Electron instance and the user's live app are byte-identical.
param([Parameter(Mandatory = $true)][string]$Pids)

$want = New-Object System.Collections.Generic.HashSet[int]
foreach ($p in $Pids.Split(',')) { if ($p.Trim()) { [void]$want.Add([int]$p.Trim()) } }

$samples = (Get-Counter '\GPU Process Memory(*)\Dedicated Usage' -ErrorAction SilentlyContinue).CounterSamples
$total = 0.0
$seen = 0
foreach ($s in $samples) {
  if ($s.InstanceName -match '^pid_(\d+)_' -and $want.Contains([int]$Matches[1])) {
    $total += $s.CookedValue
    if ($s.CookedValue -gt 0) { $seen++ }
  }
}

[pscustomobject]@{
  totalMB   = [math]::Round($total / 1MB, 1)
  pids      = $want.Count
  instances = $seen
} | ConvertTo-Json -Compress
