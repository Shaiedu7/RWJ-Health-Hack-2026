import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table,
  TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";

export const TABLE_NAME = "twinverse-event-patients";
export const STACK_NAME = "TwinVersePatients";
export const ACCOUNT = "977659666193";
export const REGION = "us-west-2";

export class PatientsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const patients = new Table(this, "Patients", {
      tableName: TABLE_NAME,
      partitionKey: { name: "PK", type: AttributeType.STRING },
      sortKey: { name: "SK", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.DEFAULT,
      removalPolicy: RemovalPolicy.RETAIN,
      deletionProtection: true,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    patients.addGlobalSecondaryIndex({
      indexName: "OwnerIndex",
      partitionKey: { name: "ownerIndexPK", type: AttributeType.STRING },
      sortKey: { name: "ownerIndexSK", type: AttributeType.STRING },
      projectionType: ProjectionType.INCLUDE,
      nonKeyAttributes: [
        "patientId",
        "displayName",
        "status",
        "draftRevision",
        "updatedAt",
        "scopeId",
        "ownerFacultyId",
      ],
    });
    patients.addGlobalSecondaryIndex({
      indexName: "PublishedCatalogueIndex",
      partitionKey: { name: "catalogueIndexPK", type: AttributeType.STRING },
      sortKey: { name: "catalogueIndexSK", type: AttributeType.STRING },
      projectionType: ProjectionType.INCLUDE,
      nonKeyAttributes: [
        "patientId",
        "publicTitle",
        "publicTeaser",
        "currentPublishedVersionId",
        "publishedAt",
      ],
    });

    new CfnOutput(this, "PatientsTableName", { value: patients.tableName });
    new CfnOutput(this, "PatientsTableArn", { value: patients.tableArn });
  }
}
