const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const DynamoDB = new AWS.DynamoDB();
const { get } = require("lodash");
const { snsPublishMessage } = require("../shared/errorNotificationHelper");
const { v4: uuidv4 } = require("uuid");

module.exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));
  try {
    const processPromises = get(event, "Records", []).map(async (record) => {
      if (
        get(record, "eventName") === "INSERT" ||
        get(record, "eventName") === "MODIFY"
      ) {
        const newImage = AWS.DynamoDB.Converter.unmarshall(
          get(record, "dynamodb.NewImage")
        );

        const sourceTable = get(newImage, "Sourcetable", "default-table-name");
        console.log("SourceTable:", sourceTable);

        const UniqueID = get(newImage, "UUid", "");
        console.log("UniqueID:", UniqueID);

        if (get(newImage, "FailedRecord")) {
          await processRecord(newImage.FailedRecord, sourceTable, UniqueID);
        }
      }
    });

    await Promise.all(processPromises);

    return {
      statusCode: 200,
      body: JSON.stringify(
        "Processed and inserted DynamoDB stream records successfully"
      ),
    };
  } catch (error) {
    console.error("Handler error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify(
        "An error occurred while processing and inserting DynamoDB stream records"
      ),
    };
  }
};

async function Requiredfields(sourceTable) {
  const result = await DynamoDB.describeTable({
    TableName: sourceTable,
  }).promise();

  let requiredFields = [];

  // Get the partition key and sort key from the main table schema
  requiredFields = get(result, 'Table.KeySchema', []).map(schema => schema.AttributeName);

  const gsiIndexes = get(result, 'Table.GlobalSecondaryIndexes', []);
  
  if (gsiIndexes.length > 0) {
    // Add fields from GSIs
    const gsiFields = gsiIndexes.flatMap(gsi =>
      get(gsi, 'KeySchema', []).map(schema => schema.AttributeName)
    );
    requiredFields = Array.from(new Set([...requiredFields, ...gsiFields]));
    console.info("Required fields from GSIs:", gsiFields);
  } else {
    console.info("No GlobalSecondaryIndexes found in table description.");
  }

  console.info("Total required fields:", requiredFields);
  return requiredFields;
}

async function processRecord(failedRecord, sourceTable, UniqueID) {
  try {
    let requiredFields = await Requiredfields(sourceTable);
    requiredFields.forEach((field) => {
      if (
        !failedRecord.hasOwnProperty(field) ||
        failedRecord[field].trim() === "" ||
        failedRecord[field].trim().toLowerCase() === "null"
      ) {
        failedRecord[field] = uuidv4();
      }
    });

    console.log("Updated record:", JSON.stringify(failedRecord, null, 4));

    const params = {
      TableName: sourceTable,
      Item: failedRecord,
    };

    await dynamodb.put(params).promise();

    let Status = "SUCCESS";
    await updateFailedRecordsTable(UniqueID, failedRecord, sourceTable, Status, {});

    console.log("Record processed successfully:", failedRecord);
  } catch (err) {
    const snsParams = {
      TopicArn: process.env.ERROR_SNS_TOPIC_ARN,
      Subject: "An Error occurred while reprocessing failed record",
      Message: JSON.stringify({ failedRecord, error: err.message }),
    };
    await snsPublishMessage(snsParams);

    let Status = "FAILED";
    await updateFailedRecordsTable(UniqueID, failedRecord, sourceTable, Status, err.message);
    console.error("Error processing record:", err);
  }
}

async function updateFailedRecordsTable(
  UniqueID,
  failedRecord,
  sourceTable,
  Status,
  errorMessage
) {
  try {
    const params = {
      TableName: process.env.FAILED_RECORDS,
      Item: {
        UUid: UniqueID,
        Sourcetable: sourceTable,
        FailedRecord: failedRecord,
        Status: Status,
        ErrorMessage: errorMessage,
        Timestamp: new Date().toISOString(),
      },
    };
    await dynamodb.put(params).promise();
    console.log("Failed record has been reprocessed:", UniqueID);
  } catch (error) {
    console.log("Error adding failed record to DynamoDB:", error);
  }
}
