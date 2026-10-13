$ErrorActionPreference = 'Stop'

$backupRoot = 'C:\Users\Computer Channel\NafranBackups'
$logPath = Join-Path $backupRoot 'backup-task.log'
$sshKey = 'C:\Users\Computer Channel\.ssh\nafran-billing-ed25519'
$server = 'root@100.64.0.1'
$remoteDir = '/var/backups/nafran-billing'

function Invoke-BoundedCommand([string]$file, [string[]]$arguments, [int]$timeoutMs) {
  $process = [Diagnostics.Process]::new()
  $process.StartInfo.FileName = $file
  $process.StartInfo.UseShellExecute = $false
  $process.StartInfo.CreateNoWindow = $true
  $process.StartInfo.RedirectStandardOutput = $true
  $process.StartInfo.RedirectStandardError = $true
  foreach ($argument in $arguments) { [void]$process.StartInfo.ArgumentList.Add($argument) }
  try {
    [void]$process.Start()
    if (-not $process.WaitForExit($timeoutMs)) {
      $process.Kill($true)
      throw "$file timed out after $timeoutMs ms."
    }
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    if ($process.ExitCode -ne 0) { throw "$file failed with exit code $($process.ExitCode): $stderr" }
    return $stdout
  } finally { $process.Dispose() }
}

$sshOptions = @('-i', $sshKey, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30', '-o', 'ConnectionAttempts=3', '-o', 'StrictHostKeyChecking=yes', '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=3')
$remoteCommand = 'find /var/backups/nafran-billing -maxdepth 1 -type f -name "billing-*.db" -printf "%T@ %f\n" | sort -nr | head -n 1'
try {
  $latest = Invoke-BoundedCommand 'ssh.exe' ($sshOptions + @($server, $remoteCommand)) 120000
} catch {
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) lookup failed: $($_.Exception.Message)"
  throw
}

if (-not $latest) { throw 'Could not locate the latest server backup.' }
$name = ($latest -split ' ', 2)[1].Trim()
if ($name -notmatch '^billing-[0-9TZ-]+-[0-9a-f-]{36}\.db$') { throw 'Unexpected backup filename.' }

$encrypted = Join-Path $backupRoot ($name + '.dpapi')
if (Test-Path -LiteralPath $encrypted) {
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) already backed up: $name"
  Write-Output "Already backed up: $name"
  exit 0
}
$plainPath = Join-Path $backupRoot ($name + '.partial')
$encryptedPartial = Join-Path $backupRoot ($name + '.dpapi.partial')
try {
  [void](Invoke-BoundedCommand 'scp.exe' ($sshOptions + @("${server}:${remoteDir}/$name", $plainPath)) 150000)
  $plain = [IO.File]::ReadAllBytes($plainPath)
  $cipher = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes($encryptedPartial, $cipher)
  $restored = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($encryptedPartial), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  if (-not [System.Linq.Enumerable]::SequenceEqual[byte]($plain, $restored)) { throw 'Encrypted backup restore check failed.' }
  Rename-Item -LiteralPath $encryptedPartial -NewName ($name + '.dpapi')
  Remove-Item -LiteralPath $plainPath
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) encrypted backup verified: $name"
  Write-Output "Encrypted off-server backup verified: $name"
} catch {
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) transfer/encryption failed: $($_.Exception.Message)"
  if (Test-Path -LiteralPath $plainPath) { Remove-Item -LiteralPath $plainPath }
  if (Test-Path -LiteralPath $encryptedPartial) { Remove-Item -LiteralPath $encryptedPartial }
  throw
}
