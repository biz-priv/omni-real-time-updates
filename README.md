# omni-real-time-updates

## Note: Docker steps to be done manually

### Steps to build and push docker image to ecr for shipment header full load

1.  aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin {accountId}.dkr.ecr.us-east-1.amazonaws.com
2.  docker build --platform linux/amd64 -t omni-wt-rt-shipment-header-${env.ENVIRONMENT} .
3.  docker tag omni-wt-rt-shipment-header-${env.ENVIRONMENT}:latest {accountId}.dkr.ecr.us-east-1.amazonaws.com/omni-wt-rt-shipment-header-${env.ENVIRONMENT}:latest
4.  docker push {accountId}.dkr.ecr.us-east-1.amazonaws.com/omni-wt-rt-shipment-header-${env.ENVIRONMENT}:latest

### Install dependencies and packages

    npm i
    cd lambdaLayer/lib/nodejs
    npm i

### Serverless deployent instructions

    serverless --version
    sls deploy -s ${env.ENVIRONMENT}
