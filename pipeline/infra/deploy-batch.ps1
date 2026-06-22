param(
  [Parameter(Mandatory = $true)]
  [string]$StackName,

  [Parameter(Mandatory = $true)]
  [string]$Region,

  [Parameter(Mandatory = $true)]
  [string]$VpcId,

  [Parameter(Mandatory = $true)]
  [string]$SubnetIds,

  [Parameter(Mandatory = $true)]
  [string]$SecurityGroupIds,

  [Parameter(Mandatory = $true)]
  [string]$WorkerImage
)

$ErrorActionPreference = "Stop"
aws cloudformation deploy `
  --stack-name $StackName `
  --template-file pipeline/infra/aws-batch-gpu.yaml `
  --capabilities CAPABILITY_NAMED_IAM `
  --parameter-overrides `
    "VpcId=$VpcId" `
    "SubnetIds=$SubnetIds" `
    "SecurityGroupIds=$SecurityGroupIds" `
    "WorkerImage=$WorkerImage" `
  --region $Region

if ($LASTEXITCODE -ne 0) {
  throw "CloudFormation deployment failed."
}

aws cloudformation describe-stacks `
  --stack-name $StackName `
  --region $Region `
  --query "Stacks[0].Outputs" `
  --output table
