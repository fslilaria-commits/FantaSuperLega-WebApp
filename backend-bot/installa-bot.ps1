# Installa su questo PC il bot dei dati del Fanta SuperLega (docs/bot-pc.md): un'attività pianificata di Windows che
# ogni giorno lancia backend-bot\aggiorna-dati.js, e se all'ora prevista il PC era spento lo fa appena si riaccende.
# Si lancia dalla cartella della repo clonata apposta per il bot, in PowerShell:
#   powershell -ExecutionPolicy Bypass -File backend-bot\installa-bot.ps1 -Email <indirizzo anonimo di GitHub>
# -SoloControlli: controlla tutto e fa una prova senza installare niente. -Rimuovi: toglie l'attività.
# La chiave di GitHub non passa mai di qui: la chiede Git la prima volta e la tiene la Gestione credenziali di Windows.
[CmdletBinding()]
param(
    [string]$Email,
    [string]$Nome = 'Bot dati FantaSuperLega',
    [string]$Ora = '20:30',
    [switch]$SoloControlli,
    [switch]$Rimuovi
)

$Attivita = 'FantaSuperLega - aggiorna dati'
$Radice = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $PSScriptRoot 'aggiorna-dati.js'

function Passo($testo) { Write-Host "`n== $testo" -ForegroundColor Cyan }
function Ferma($testo) { Write-Host "`nFermato: $testo" -ForegroundColor Red; exit 1 }

if ($Rimuovi) {
    if (Get-ScheduledTask -TaskName $Attivita -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $Attivita -Confirm:$false
        Write-Host "Attività «$Attivita» tolta. La cartella e l'accesso a GitHub restano (docs/bot-pc.md, «Togliere il bot»)."
    } else {
        Write-Host 'Non c''era nessuna attività da togliere.'
    }
    exit 0
}

Passo 'Programmi'
foreach ($p in 'git', 'node', 'npm') {
    if (-not (Get-Command $p -ErrorAction SilentlyContinue)) { Ferma "manca ${p}: installalo (docs/bot-pc.md, passo 1) e riapri PowerShell." }
}
$node = (Get-Command node).Source
$versione = & $node -v
if ([int]($versione.TrimStart('v').Split('.')[0]) -lt 20) { Ferma "serve Node.js 20 o più recente, c'è il $versione." }
Write-Host "$(& git --version), Node.js $versione"

Passo 'Cartella della repo'
$origine = & git -C $Radice remote get-url origin
if (-not $origine -or $origine -notmatch 'github\.com[/:]fslilaria-commits/FantaSuperLega-WebApp') {
    Ferma "$Radice non è una copia della repo FantaSuperLega-WebApp (docs/bot-pc.md, passo 2)."
}
if ($origine -match '^[a-z+]+://[^/]*@') {
    Ferma 'l''indirizzo della repo contiene utente o chiave: rifai la copia con https://github.com/fslilaria-commits/FantaSuperLega-WebApp'
}
# L'accesso salvato da Git vale solo per questa repo, non per gli altri progetti dello stesso account
& git -C $Radice config credential.useHttpPath true
Write-Host $Radice

Passo 'Chi firma i commit dei dati'
if ($Email) {
    & git -C $Radice config user.name $Nome
    & git -C $Radice config user.email $Email
}
$firma = & git -C $Radice config user.email
if (-not $firma) { Ferma 'indica il tuo indirizzo anonimo di GitHub con -Email (docs/bot-pc.md, passo 3).' }
if ($firma -notmatch '@users\.noreply\.github\.com$') {
    Write-Host "Attenzione: $firma non è l'indirizzo anonimo di GitHub e nei commit lo vedranno tutti." -ForegroundColor Yellow
}
Write-Host "$(& git -C $Radice config user.name) <$firma>"

Passo 'Accesso a GitHub (la prima volta si apre il browser per entrare)'
& git -C $Radice push --dry-run origin HEAD:main
if ($LASTEXITCODE -ne 0) {
    Ferma 'GitHub non accetta i dati da questo PC: serve un account con accesso in scrittura alla repo (docs/bot-pc.md, passo 4).'
}

Passo 'Prova completa, senza salvare niente su GitHub (circa un minuto)'
& $node $Script --prova
if ($LASTEXITCODE -ne 0) {
    Write-Host 'La prova ha segnalato dei problemi (vedi sopra). Se dipendono dal sito della Lega, il bot riprova da solo ogni giorno.' -ForegroundColor Yellow
}

if ($SoloControlli) {
    Write-Host "`nControlli finiti: non è stato installato niente." -ForegroundColor Green
    exit 0
}

Passo "Attività pianificata «$Attivita»: ogni giorno alle $Ora"
$comando = "& '$($node.Replace("'", "''"))' '$($Script.Replace("'", "''"))'"
$azione = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command `"$comando`"" -WorkingDirectory $Radice
$quando = New-ScheduledTaskTrigger -Daily -At $Ora
$regole = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$chi = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
try {
    Register-ScheduledTask -TaskName $Attivita -Action $azione -Trigger $quando -Settings $regole -Principal $chi -Force -ErrorAction Stop `
        -Description 'Scarica dal sito della Lega listone, calendario e tabellini del Fanta SuperLega e li salva su GitHub (docs/bot-pc.md).' | Out-Null
} catch {
    Ferma "attività non creata: $($_.Exception.Message)"
}
Write-Host "Fatto. Il bot parte ogni giorno alle $Ora; per lanciarlo subito: Start-ScheduledTask -TaskName '$Attivita'" -ForegroundColor Green
Write-Host "Registro: $env:LOCALAPPDATA\FantaSuperLega-bot\aggiorna-dati.log"
