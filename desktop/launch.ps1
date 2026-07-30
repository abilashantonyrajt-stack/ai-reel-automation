$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pyw = "C:\Users\abila\AppData\Local\Programs\Python\Python314\pythonw.exe"
if (-not (Test-Path $pyw)) { $pyw = "pythonw.exe" }
Start-Process -WindowStyle Hidden -FilePath $pyw -ArgumentList "$projectDir\main.py" -WorkingDirectory $projectDir
