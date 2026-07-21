param(
  [string]$MainBaseUrl = "http://localhost:3000",
  [string]$AiWebBaseUrl = "http://localhost:3002",
  [string]$ClientId = "ai-web-yanchuaner",
  [string]$AlumniUsername = "acceptance-alumni",
  [string]$AcceptancePassword = "AcceptancePass!2026",
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
  return [pscustomobject]@{ Data = $sessionResult.Data; Raw = $sessionResult.Content }
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

Write-Output "Autonomous AI Web identity acceptance passed: isolated OIDC client, PKCE callback, YanCore subject reuse, bounded application session, and browser-secret isolation all passed."
