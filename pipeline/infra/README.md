# AWS GPU Execution Plane

This directory provisions the expensive execution half of the Scene Compiler. The browser and compiler API do not need a GPU. AWS Batch runs the pinned SAM 2.1 and VACE worker only when a branch job is submitted.

## Prerequisites

- An AWS account with an approved `p4de.24xlarge` On-Demand quota in the target region.
- Existing VPC subnets with outbound internet access for the initial model download.
- An ECR repository containing the image from `pipeline/gpu-worker`.
- A principal allowed to create CloudFormation, Batch, IAM, EC2 launch-template, and S3 resources.
- Explicit budget approval. An eight-A100 job is costly even when it runs for only a few hours.

The application submitter does not need infrastructure-admin access after bootstrap. Its steady-state permissions can be limited to:

- `batch:SubmitJob`
- `batch:DescribeJobs`
- `s3:GetObject`
- `s3:PutObject`
- `s3:AbortMultipartUpload`
- `s3:ListBucket`

Scope the S3 permissions to the generated artifact bucket and the `scene-compiler/jobs/*` prefix.

## Build And Push The Worker

Run from the repository root on a machine with Docker and AWS CLI:

```powershell
.\pipeline\infra\publish-worker.ps1 `
  -Region us-east-1 `
  -RepositoryName aiartgames-scene-compiler `
  -ImageTag v1
```

The script prints the immutable ECR image URI required by the stack.

## Deploy AWS Batch

```powershell
.\pipeline\infra\deploy-batch.ps1 `
  -StackName aiartgames-scene-compiler `
  -Region us-east-1 `
  -VpcId vpc-xxxxxxxx `
  -SubnetIds subnet-aaaa,subnet-bbbb `
  -SecurityGroupIds sg-xxxxxxxx `
  -WorkerImage 123456789012.dkr.ecr.us-east-1.amazonaws.com/aiartgames-scene-compiler:v1
```

Copy the three CloudFormation outputs into the variables documented in `pipeline/compiler/.env.example`.

## Review Flow

1. `POST /jobs` submits a manifest.
2. `GET /jobs/:id` follows the AWS Batch state.
3. `GET /jobs/:id/artifact` streams the generated MP4 for human review.
4. `GET /jobs/:id/report` returns the automated final QC report.
5. `POST /jobs/:id/approve` publishes only the system-generated reviewed artifact and updates the game catalog.

The stack scales to zero when idle. The retained S3 bucket is intentionally not deleted with the stack.
