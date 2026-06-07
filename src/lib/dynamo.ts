// src/lib/dynamo.ts

import { AwsClient } from "aws4fetch";

export type DynamoEnv = {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
};

export function createDynamoClient(env: DynamoEnv): AwsClient {
  return new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
    service: "dynamodb",
  });
}

export function dynamoEndpoint(env: DynamoEnv): string {
  return `https://dynamodb.${env.AWS_REGION}.amazonaws.com/`;
}
