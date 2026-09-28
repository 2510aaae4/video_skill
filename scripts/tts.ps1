# Local TTS with word timings (Windows OneCore voices via WinRT; nothing leaves this PC).
# Input : JSON array [{ "id": "N1", "text": "..." }]
# Output: <OutDir>\<id>.wav and <OutDir>\<id>.json  (word cues: text, start/end seconds, input char range)
param(
  [Parameter(Mandatory)] [string] $InFile,
  [Parameter(Mandatory)] [string] $OutDir,
  [string] $Voice = 'Mark',
  [double] $Rate = 1.0,
  [string] $Language = 'en-*'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
  Select-Object -First 1
function Await($op, [Type] $resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($op))
  $null = $task.Wait(-1)
  $task.Result
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$v = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |
  Where-Object { $_.DisplayName -like "*$Voice*" -and $_.Language -like $Language } | Select-Object -First 1
if (-not $v) {
  $have = ([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | ForEach-Object { "$($_.DisplayName) [$($_.Language)]" }) -join '; '
  throw "voice '$Voice' ($Language) not found. Installed: $have"
}
$synth.Voice = $v
$synth.Options.IncludeWordBoundaryMetadata = $true
$synth.Options.SpeakingRate = $Rate

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$items = Get-Content -Raw -Encoding UTF8 $InFile | ConvertFrom-Json
foreach ($it in $items) {
  $stream = Await ($synth.SynthesizeTextToStreamAsync($it.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $size = [uint32] $stream.Size
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $null = Await ($reader.LoadAsync($size)) ([uint32])
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  [IO.File]::WriteAllBytes((Join-Path $OutDir "$($it.id).wav"), $bytes)
  $cues = @()
  foreach ($track in $stream.TimedMetadataTracks) {
    foreach ($c in $track.Cues) {
      $cues += [pscustomobject]@{
        text   = $c.Text
        start  = [Math]::Round($c.StartTime.TotalSeconds, 4)
        end    = [Math]::Round(($c.StartTime + $c.Duration).TotalSeconds, 4)
        pos    = $c.StartPositionInInput
        endpos = $c.EndPositionInInput
      }
    }
  }
  [pscustomobject]@{ id = $it.id; voice = $v.DisplayName; rate = $Rate; text = $it.text; words = $cues } |
    ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 (Join-Path $OutDir "$($it.id).json")
  "{0}: {1} bytes, {2} word cues" -f $it.id, $size, $cues.Count
}
