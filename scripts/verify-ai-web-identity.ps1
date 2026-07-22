param(
  [string]$MainBaseUrl = "http://localhost:3000",
  [string]$AiWebBaseUrl = "http://localhost:3002",
  [string]$ClientId = "ai-web-yanchuaner",
  [string]$AlumniUsername = "acceptance-alumni",
  [string]$AcceptancePassword = "AcceptancePass!2026",
  [string]$Model = "deepseek-chat",
  [string]$ExpectedContent = "Yanchuaner autonomous AI model path passed.",
  [string]$ControlDbContainer = "yanchuaner-phase1-api-control-db-1",
  [switch]$VerifyModelPath,
  [switch]$AllowLocalMutation
)

$ErrorActionPreference = "Stop"

function Assert-LocalHttpUrl([string]$Value, [string]$Name) {
  try {
    $uri = [Uri]$Value
  } catch {
    throw "$Name must be an absolute localhost URL."
  }
  if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne "http") {
    throw "$Name must use HTTP in the isolated local environment."
  }
  if ($uri.Host -notin @("localhost", "127.0.0.1", "::1")) {
    throw "$Name must target localhost; remote identity mutation is intentionally unsupported."
  }
  return $uri.GetLeftPart([UriPartial]::Authority).TrimEnd("/")
}

function Invoke-JsonResponse(
  [string]$Method,
  [string]$Uri,
  [object]$Body = $null,
  [Microsoft.PowerShell.Commands.WebRequestSession]$Session = $null,
  [hashtable]$Headers = @{}
) {
  $parameters = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    SkipHttpErrorCheck = $true
    TimeoutSec = 30
  }
  if ($null -ne $Session) { $parameters.WebSession = $Session }
  if ($null -ne $Body) {
    $parameters.ContentType = "application/json"
    $parameters.Body = $Body | ConvertTo-Json -Depth 8 -Compress
  }
  $response = Invoke-WebRequest @parameters
  $data = $null
  if (-not [string]::IsNullOrWhiteSpace($response.Content)) {
    try { $data = $response.Content | ConvertFrom-Json } catch {}
  }
  return [pscustomobject]@{ Status = [int]$response.StatusCode; Data = $data; Content = $response.Content }
}

function Invoke-NoRedirect(
  [string]$Uri,
  [Microsoft.PowerShell.Commands.WebRequestSession]$Session
) {
  $handler = [System.Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect = $false
  $handler.CookieContainer = $Session.Cookies
  $client = [System.Net.Http.HttpClient]::new($handler)
  $response = $null
  try {
    $response = $client.GetAsync($Uri).GetAwaiter().GetResult()
    $location = $response.Headers.Location
    if ($null -ne $location -and -not $location.IsAbsoluteUri) {
      $location = [Uri]::new([Uri]$Uri, $location)
    }
    return [pscustomobject]@{
      Status = [int]$response.StatusCode
      Location = $location
    }
  } finally {
    if ($null -ne $response) { $response.Dispose() }
    $client.Dispose()
    $handler.Dispose()
  }
}

function Assert-Redirect([object]$Response, [string]$Step) {
  if ($Response.Status -notin @(302, 303, 307, 308) -or $null -eq $Response.Location) {
    throw "$Step did not return the expected redirect."
  }
}

function Invoke-AiWebLogin {
  $session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
  $mainLogin = Invoke-JsonResponse "POST" "$MainBaseUrl/api/auth/login" @{
    username = $AlumniUsername
    password = $AcceptancePassword
  } $session @{ Origin = $MainBaseUrl }
  if ($mainLogin.Status -ne 200 -or -not $mainLogin.Data.success) {
    throw "Main-site acceptance login failed."
  }

  $start = Invoke-NoRedirect "$AiWebBaseUrl/api/auth/login" $session
  Assert-Redirect $start "AI Web login start"
  if ($start.Location.GetLeftPart([UriPartial]::Path) -ne "$MainBaseUrl/api/oauth/authorize") {
    throw "AI Web does not use the expected main-site authorization endpoint."
  }
  $authorizationQuery = [System.Web.HttpUtility]::ParseQueryString($start.Location.Query)
  if ($authorizationQuery["client_id"] -ne $ClientId) {
    throw "AI Web is not using its isolated OIDC client ID."
  }
  if ($authorizationQuery["redirect_uri"] -ne "$AiWebBaseUrl/api/auth/callback") {
    throw "AI Web did not request its exact registered callback."
  }
  if ($authorizationQuery["code_challenge_method"] -ne "S256" -or
      [string]::IsNullOrWhiteSpace($authorizationQuery["code_challenge"]) -or
      [string]::IsNullOrWhiteSpace($authorizationQuery["state"]) -or
      [string]::IsNullOrWhiteSpace($authorizationQuery["nonce"])) {
    throw "AI Web authorization is missing PKCE, state, or nonce."
  }

  $authorization = Invoke-NoRedirect $start.Location.AbsoluteUri $session
  Assert-Redirect $authorization "Main-site authorization"
  if ($authorization.Location.GetLeftPart([UriPartial]::Path) -ne "$AiWebBaseUrl/api/auth/callback") {
    throw "Main-site authorization returned an unexpected AI Web callback target."
  }

  $callback = Invoke-NoRedirect $authorization.Location.AbsoluteUri $session
  Assert-Redirect $callback "AI Web callback and YanCore exchange"
  if ($callback.Location.GetLeftPart([UriPartial]::Path) -ne "$AiWebBaseUrl/") {
    throw "AI Web callback did not establish the application session."
  }

  $sessionResult = Invoke-JsonResponse "GET" "$AiWebBaseUrl/api/session" $null $session
  if ($sessionResult.Status -ne 200 -or $sessionResult.Data.authenticated -ne $true) {
    throw "AI Web did not expose an authenticated session summary."
  }
  return [pscustomobject]@{ Data = $sessionResult.Data; Raw = $sessionResult.Content; WebSession = $session }
}

if (-not $AllowLocalMutation) {
  throw "Pass -AllowLocalMutation to confirm that this script may create YanCore grants, short-lived application keys, and audit records in an isolated local database."
}

$MainBaseUrl = Assert-LocalHttpUrl $MainBaseUrl "MainBaseUrl"
$AiWebBaseUrl = Assert-LocalHttpUrl $AiWebBaseUrl "AiWebBaseUrl"

$health = Invoke-JsonResponse "GET" "$AiWebBaseUrl/api/health"
if ($health.Status -ne 200 -or $health.Data.status -ne "ok") {
  throw "AI Web health endpoint is unavailable."
}
$anonymous = Invoke-JsonResponse "GET" "$AiWebBaseUrl/api/session"
if ($anonymous.Status -ne 401 -or $anonymous.Data.authenticated -ne $false) {
  throw "AI Web anonymous session boundary is not closed."
}

$first = Invoke-AiWebLogin
$second = Invoke-AiWebLogin
if ($first.Data.identity.sub -ne $second.Data.identity.sub -or
    $first.Data.subject.userId -ne $second.Data.subject.userId) {
  throw "Repeated AI Web login did not reuse the same main-site and API subject."
}
if ($first.Data.identity.role -ne "alumni" -or
    $first.Data.subject.application -ne "ai-web" -or
    $first.Data.subject.audience -ne "yanchuaner-ai" -or
    $first.Data.subject.scopes -ne "chat:read chat:write") {
  throw "AI Web session does not match the YanCore identity contract."
}
if (-not ($first.Data.models -contains "gpt-4.1-mini") -or
    -not ($first.Data.models -contains "deepseek-chat") -or
    $first.Data.sessionQuotaUnits -ne 50000) {
  throw "AI Web application key policy does not match the configured models and budget."
}
$remainingLifetime = [int64]$first.Data.expiresAt - [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
if ($remainingLifetime -le 0 -or $remainingLifetime -gt 900) {
  throw "AI Web application session lifetime is outside the 15-minute policy."
}
if ($first.Raw -match "sk-yc_" -or $first.Raw -match '"grant"') {
  throw "AI Web session response exposed an application key or subject grant."
}

if ($VerifyModelPath) {
  $active = $second
  if ($ControlDbContainer -notmatch '^yanchuaner-[a-z0-9-]+-control-db-1$') {
    throw "ControlDbContainer must name an isolated local Yanchuaner control database container."
  }
  if (-not ($active.Data.models -contains $Model)) {
    throw "The requested acceptance model is outside the application session policy."
  }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is required to verify the local immutable ledger and usage record."
  }
  $chatBody = @{ model = $Model; messages = @(@{ role = "user"; content = "Return the deterministic acceptance response." }) } | ConvertTo-Json -Depth 8 -Compress
  $staleChat = Invoke-WebRequest -Method Post -Uri "$AiWebBaseUrl/api/chat/completions" `
    -WebSession $first.WebSession -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 `
    -Headers @{ Origin = $AiWebBaseUrl; Accept = "text/event-stream" } -Body $chatBody
  if ($staleChat.StatusCode -ne 401) {
    throw "The previous AI Web application key remained usable after session rotation."
  }
  $chat = Invoke-WebRequest -Method Post -Uri "$AiWebBaseUrl/api/chat/completions" `
    -WebSession $active.WebSession -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 120 `
    -Headers @{ Origin = $AiWebBaseUrl; Accept = "text/event-stream" } `
    -Body $chatBody
  if ($chat.StatusCode -ne 200 -or -not ([string]$chat.Headers["Content-Type"]).StartsWith("text/event-stream")) {
    throw "Autonomous AI Web did not return a successful SSE model response."
  }
  if ($chat.Content -notmatch [regex]::Escape($ExpectedContent) -or $chat.Content -notmatch 'data: \[DONE\]') {
    throw "The deterministic SSE response was incomplete."
  }
  if ($chat.Content -match 'sk-[A-Za-z0-9_-]{12,}' -or $chat.Content -match '"grant"') {
    throw "The model response exposed an application key or subject grant."
  }
  $requestId = ([string]$chat.Headers["X-Request-ID"]).Trim()
  if ($requestId -notmatch '^[A-Za-z0-9._:-]{8,128}$') {
    throw "The model response did not expose a safe request ID for ledger correlation."
  }
  $sql = @"
SELECT json_build_object(
  'log_user_id', l.user_id,
  'token_user_id', t.user_id,
  'token_name', t.name,
  'key_hash_enabled', t.key_hash_enabled,
  'model_name', l.model_name,
  'log_quota', l.quota,
  'token_used_quota', t.used_quota,
  'ledger_count', (SELECT COUNT(*) FROM quota_ledger_entries q WHERE q.request_id = l.request_id),
  'ledger_amount', (SELECT COALESCE(SUM(q.amount), 0) FROM quota_ledger_entries q WHERE q.request_id = l.request_id),
  'public_benefit_settlements', (SELECT COUNT(*) FROM quota_ledger_entries q WHERE q.request_id = l.request_id AND q.entry_type = 'settlement' AND q.funding_source = 'public_benefit')
)::text
FROM logs l
JOIN tokens t ON t.id = l.token_id
WHERE l.request_id = '$requestId' AND l.model_name <> ''
ORDER BY l.id DESC
LIMIT 1;
"@
  $evidence = $null
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    $databaseEvidence = & docker exec $ControlDbContainer psql -U new_api -d new_api -Atc $sql
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($databaseEvidence)) {
      throw "No correlated local usage and ledger evidence was found."
    }
    $evidence = $databaseEvidence | ConvertFrom-Json
    if ([int64]$evidence.token_used_quota -ge [int64]$evidence.log_quota) { break }
    Start-Sleep -Milliseconds 200
  }
  $activeUserId = [int64]$active.Data.subject.userId
  $logUserId = [int64]$evidence.log_user_id
  $tokenUserId = [int64]$evidence.token_user_id
  $logQuota = [int64]$evidence.log_quota
  $tokenUsedQuota = [int64]$evidence.token_used_quota
  $ledgerCount = [int64]$evidence.ledger_count
  $ledgerAmount = [int64]$evidence.ledger_amount
  $publicBenefitSettlements = [int64]$evidence.public_benefit_settlements
  $failedEvidence = @()
  if ($logUserId -ne $activeUserId) { $failedEvidence += "log user" }
  if ($tokenUserId -ne $activeUserId) { $failedEvidence += "token user" }
  if (-not ([string]$evidence.token_name).StartsWith("yancore:ai-web:session:")) { $failedEvidence += "token name" }
  if ([bool]$evidence.key_hash_enabled -ne $true) { $failedEvidence += "key hash" }
  if ($evidence.model_name -ne $Model) { $failedEvidence += "model" }
  if ($logQuota -le 0) { $failedEvidence += "log quota" }
  if ($tokenUsedQuota -lt $logQuota) { $failedEvidence += "token quota ($tokenUsedQuota < $logQuota)" }
  if ($ledgerCount -lt 1) { $failedEvidence += "ledger count" }
  if ($publicBenefitSettlements -ne 1) { $failedEvidence += "settlement count" }
  if ($ledgerAmount -ne (-1 * $logQuota)) { $failedEvidence += "ledger amount" }
  if ($failedEvidence.Count -gt 0) {
    throw "The usage and ledger evidence is inconsistent: $($failedEvidence -join ', ')."
  }
  Write-Output "Autonomous AI Web model-path acceptance passed: previous-key revocation, SSE response, request ID, user attribution, hashed application key, usage log, and immutable public-benefit settlement all passed."
} else {
  Write-Output "Autonomous AI Web identity acceptance passed: isolated OIDC client, PKCE callback, YanCore subject reuse, bounded application session, and browser-secret isolation all passed."
}
