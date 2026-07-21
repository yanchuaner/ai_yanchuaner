param(
  [string]$MainBaseUrl = "http://localhost:3000",
  [string]$OpenWebUiBaseUrl = "http://localhost:3001",
  [string]$AdminUsername = "acceptance-admin",
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
    throw "$Name must target localhost; remote OAuth mutation is intentionally unsupported."
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
  return [pscustomobject]@{ Status = [int]$response.StatusCode; Data = $data }
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
    throw "$Step did not return an OAuth redirect."
  }
}

function Invoke-OidcLogin([string]$Username) {
  $session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
  $mainLogin = Invoke-JsonResponse "POST" "$MainBaseUrl/api/auth/login" @{
    username = $Username
    password = $AcceptancePassword
  } $session @{ Origin = $MainBaseUrl }
  if ($mainLogin.Status -ne 200 -or -not $mainLogin.Data.success) {
    throw "Main-site acceptance login failed for $Username."
  }

  $start = Invoke-NoRedirect "$OpenWebUiBaseUrl/oauth/oidc/login" $session
  Assert-Redirect $start "Open WebUI login start"
  if ($start.Location.GetLeftPart([UriPartial]::Path) -ne "$MainBaseUrl/api/oauth/authorize") {
    throw "Open WebUI does not use the expected main-site authorization endpoint."
  }

  $authorization = Invoke-NoRedirect $start.Location.AbsoluteUri $session
  Assert-Redirect $authorization "Main-site authorization"
  if ($authorization.Location.GetLeftPart([UriPartial]::Path) -ne "$OpenWebUiBaseUrl/oauth/oidc/callback") {
    throw "Main-site authorization returned an unexpected Open WebUI callback target."
  }

  $callback = Invoke-NoRedirect $authorization.Location.AbsoluteUri $session
  Assert-Redirect $callback "Open WebUI callback"
  if ($callback.Location.GetLeftPart([UriPartial]::Path) -ne "$OpenWebUiBaseUrl/auth") {
    throw "Open WebUI callback did not return to its authenticated entry point."
  }

  $self = Invoke-JsonResponse "GET" "$OpenWebUiBaseUrl/api/v1/auths/" $null $session
  if ($self.Status -ne 200 -or [string]::IsNullOrWhiteSpace($self.Data.id)) {
    throw "Open WebUI did not establish an authenticated session for $Username."
  }
  return [pscustomobject]@{ User = $self.Data; Session = $session }
}

if (-not $AllowLocalMutation) {
  throw "Pass -AllowLocalMutation to confirm that this script may create users and OAuth sessions in an isolated local Open WebUI database."
}

$MainBaseUrl = Assert-LocalHttpUrl $MainBaseUrl "MainBaseUrl"
$OpenWebUiBaseUrl = Assert-LocalHttpUrl $OpenWebUiBaseUrl "OpenWebUiBaseUrl"

$config = Invoke-JsonResponse "GET" "$OpenWebUiBaseUrl/api/config"
if ($config.Status -ne 200) { throw "Open WebUI config endpoint is unavailable." }
if ($config.Data.features.enable_signup -ne $false) {
  throw "Open WebUI local signup is still enabled."
}
if ($config.Data.features.enable_login_form -ne $false) {
  throw "Open WebUI local login form is still enabled."
}
if (-not ($config.Data.oauth.providers.PSObject.Properties.Name -contains "oidc")) {
  throw "Open WebUI did not load the main-site OIDC provider."
}

$passwordLogin = Invoke-JsonResponse "POST" "$OpenWebUiBaseUrl/api/v1/auths/signin" @{
  email = "local-auth-check@example.test"
  password = "not-a-password"
}
if ($passwordLogin.Status -ne 403) {
  throw "Open WebUI password authentication is still enabled at the API boundary."
}
$passwordSignup = Invoke-JsonResponse "POST" "$OpenWebUiBaseUrl/api/v1/auths/signup" @{
  name = "Local Auth Check"
  email = "local-signup-check@example.test"
  password = "not-a-password"
  profile_image_url = "/user.png"
}
if ($passwordSignup.Status -ne 403) {
  throw "Open WebUI local signup is still enabled at the API boundary."
}

# A fresh Open WebUI promotes its first OAuth user to admin. The isolated
# instance must therefore be bootstrapped by a trusted main-site admin before
# any member can reach it through a reverse proxy.
$admin = Invoke-OidcLogin $AdminUsername
if ($admin.User.role -ne "admin") {
  throw "The trusted main-site administrator did not receive the Open WebUI admin role. Use a fresh isolated database and log in the administrator first."
}
$oauthConfig = Invoke-JsonResponse "GET" "$OpenWebUiBaseUrl/api/v1/auths/admin/config/oauth" $null $admin.Session
if ($oauthConfig.Status -ne 200 -or $oauthConfig.Data.ENABLE_OAUTH_ROLE_MANAGEMENT -ne $true) {
  throw "Open WebUI OAuth role management is not enabled."
}
if ($oauthConfig.Data.OAUTH_ROLES_CLAIM -ne "role") {
  throw "Open WebUI does not read the trusted main-site role claim."
}
if ($oauthConfig.Data.OAUTH_ALLOWED_ROLES -ne "alumni,student,teacher" -or $oauthConfig.Data.OAUTH_ADMIN_ROLES -ne "admin") {
  throw "Open WebUI OAuth role allowlists do not match the main-site identity contract."
}

$firstAlumni = Invoke-OidcLogin $AlumniUsername
$secondAlumni = Invoke-OidcLogin $AlumniUsername
if ($firstAlumni.User.id -ne $secondAlumni.User.id) {
  throw "Repeated alumni login created or selected a different Open WebUI user."
}
if ($firstAlumni.User.role -ne "user" -or $secondAlumni.User.role -ne "user") {
  throw "Verified alumni did not map to the Open WebUI user role."
}

Write-Output "Open WebUI OIDC callback acceptance passed: administrator bootstrap, alumni identity reuse, role claim enforcement, and local password/signup rejection all passed."
