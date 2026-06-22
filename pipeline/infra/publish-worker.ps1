param(
  [Parameter(Mandatory = $true)]
  [string]$Region,

  [Parameter(Mandatory = $true)]
  [string]$RepositoryName,

  [string]$ImageTag = "v1"
)

$ErrorActionPreference = "Stop"
$accountId = aws sts get-caller-identity --query Account --output text
if (-not $accountId) {
  throw "Could not resolve the active AWS account."
}

aws ecr describe-repositories --repository-names $RepositoryName --region $Region 2>$null
if ($LASTEXITCODE -ne 0) {
  aws ecr create-repository `
    --repository-name $RepositoryName `
    --image-scanning-configuration scanOnPush=true `
    --image-tag-mutability IMMUTABLE `
    --region $Region | Out-Null
}

$repositoryUri = "$accountId.dkr.ecr.$Region.amazonaws.com/$RepositoryName"
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin "$accountId.dkr.ecr.$Region.amazonaws.com"
if ($LASTEXITCODE -ne 0) {
  throw "ECR login failed."
}

docker build --pull --tag "${repositoryUri}:${ImageTag}" pipeline/gpu-worker
if ($LASTEXITCODE -ne 0) {
  throw "Worker image build failed."
}

docker push "${repositoryUri}:${ImageTag}"
if ($LASTEXITCODE -ne 0) {
  throw "Worker image push failed."
}

Write-Output "${repositoryUri}:${ImageTag}"
