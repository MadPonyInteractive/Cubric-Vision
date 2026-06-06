param(
  [string]$Platform = "win32",
  [string]$Arch = "x64",
  [string]$Version,
  [string]$StageDir,
  [switch]$DryRun,
  [switch]$Clean,
  [switch]$NoSourceManifest
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$nodeScript = Join-Path $scriptDir "build-portable.mjs"

$argsList = @($nodeScript, "--platform", $Platform, "--arch", $Arch)
if ($Version) { $argsList += @("--version", $Version) }
if ($StageDir) { $argsList += @("--stage-dir", $StageDir) }
if ($DryRun) { $argsList += "--dry-run" }
if ($Clean) { $argsList += "--clean" }
if ($NoSourceManifest) { $argsList += "--no-source-manifest" }

Push-Location $repoRoot
try {
  node @argsList
} finally {
  Pop-Location
}
