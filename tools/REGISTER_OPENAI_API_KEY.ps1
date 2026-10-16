$ErrorActionPreference = 'Stop'
Write-Host ''
Write-Host 'TAKY OpenAI API Key registration' -ForegroundColor Cyan
Write-Host 'The key is not written to a file and will not be echoed.' -ForegroundColor DarkGray
$secure = Read-Host 'OpenAI API Key' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  if ([string]::IsNullOrWhiteSpace($key) -or -not $key.StartsWith('sk-')) {
    throw 'OPENAI_API_KEY_FORMAT_INVALID'
  }
  [Environment]::SetEnvironmentVariable('OPENAI_API_KEY', $key, 'User')
  $env:OPENAI_API_KEY = $key
  Write-Host 'OPENAI_API_KEY registered for this Windows user.' -ForegroundColor Green
  Write-Host 'New CLI processes can now use it.' -ForegroundColor Green
} finally {
  if ($ptr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
  Remove-Variable key -ErrorAction SilentlyContinue
}
Write-Host ''
Read-Host 'Press Enter to close'
