# Starts the fully-local sovereign stack (STT + TTS + API) as detached processes.
# Run this in your own terminal so the servers stay alive:  ./tools/local-stack/run-local.ps1
# Ollama (LLM) is assumed to be already running as a service.
$root = "C:\Users\yh930\OneDrive\Desktop\ProjectsNewPC\afiyet-ai-main"
$py   = "$root\training\venv311\Scripts\python.exe"

# Stop anything already on our ports.
foreach ($port in 9000, 8020, 8080) {
  $procId = (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess
  if ($procId) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
}

# STT — faster-whisper small
$env:WHISPER_MODEL = "$root\tools\local-stack\models\faster-whisper-small"
$env:STT_PORT = "9000"
Start-Process -FilePath $py -ArgumentList "$root\tools\local-stack\stt_server.py" -WorkingDirectory $root -WindowStyle Minimized

# TTS — Piper tr_TR
$env:PIPER_VOICE = "$root\tools\local-stack\voices\tr_TR-dfki-medium.onnx"
$env:TTS_PORT = "8020"
Start-Process -FilePath $py -ArgumentList "$root\tools\local-stack\tts_server.py" -WorkingDirectory $root -WindowStyle Minimized

# API + dashboard (loads .env itself)
Start-Process -FilePath "node.exe" -ArgumentList "apps\api\server.js" -WorkingDirectory $root -WindowStyle Minimized

Write-Output "Started STT(9000), TTS(8020), API(8080) as detached windows."
Write-Output "Open http://localhost:8080 once health checks pass."
