const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const DynamoDB = new AWS.DynamoDB();
const { get } = require("lodash");
const { snsPublishMessage } = require("../shared/errorNotificationHelper");

module.exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  // Extract and print the SourceTable attribute from the event
  const firstRecord = get(event, "Records[0]", {});
  const sourceTable = get(
    firstRecord,
    "dynamodb.NewImage.Sourcetable.S",
    "default-table-name"
  );
  console.log("SourceTable:", sourceTable);

  const uuid = get(event, "Records[0]", {});
  const UniqueID = get(uuid, "dynamodb.NewImage.UUid.S", "");
  console.log("UniqueID:", UniqueID);

  try {
    const result = await DynamoDB.describeTable({
      TableName: sourceTable,
    }).promise();

    let requiredFields = [];
    if (result.Table.GlobalSecondaryIndexes) {
      requiredFields = Array.from(
        new Set(
          result.Table.GlobalSecondaryIndexes.flatMap((gsi) =>
            gsi.KeySchema.map((schema) => schema.AttributeName)
          )
        )
      );
      console.info("Required fields from GSIs:", requiredFields);
    } else {
      console.info("No GlobalSecondaryIndexes found in table description.");
    }

    const processRecord = async (failedRecord) => {
      try {
        requiredFields.forEach((field) => {
          if (
            !failedRecord.hasOwnProperty(field) ||
            failedRecord[field].trim() === "" ||
            failedRecord[field].trim().toLowerCase() === "null"
          ) {
            failedRecord[field] = "NULL";
          }
        });

        console.log("Updated record:", JSON.stringify(failedRecord, null, 4));

        const params = {
          TableName: sourceTable,
          Item: failedRecord,
        };

        await dynamodb.put(params).promise();

        let Status = "Success";
        await updateFailedRecordsTable(
          UniqueID,
          failedRecord,
          sourceTable,
          Status
        );

        console.log("Record processed successfully:", failedRecord);
      } catch (err) {
        const snsParams = {
          TopicArn:
            "arn:aws:sns:us-east-1:332281781429:omni-error-notification-topic-dev",
          Subject: "An Error occurred while reprocessing failed record",
          Message: JSON.stringify({ failedRecord, error: err.message }),
        };
        await snsPublishMessage(snsParams);

        let Status = "Fail";
        await updateFailedRecordsTable(
          UniqueID,
          failedRecord,
          sourceTable,
          Status
        );
        console.error("Error processing record:", err);
      }
    };

    const processPromises = get(event, "Records", []).map(async (record) => {
      if (
        get(record, "eventName") === "INSERT" ||
        get(record, "eventName") === "MODIFY"
      ) {
        const newImage = AWS.DynamoDB.Converter.unmarshall(
          get(record, "dynamodb.NewImage")
        );

        if (get(newImage, "FailedRecord")) {
          // Fetch the existing status
          const statusResult = await dynamodb
            .get({
              TableName: "omni-realtime-failed-records-dev",
              Key: { UUid: UniqueID },
            })
            .promise();

          const existingStatus = get(statusResult, "Item.Status", "");

          // Skip processing if the status is "Success"
          if (existingStatus !== "Success") {
            await processRecord(newImage.FailedRecord);
          } else {
            console.log(
              `Skipping record with UniqueID ${UniqueID} as it is already marked as Success.`
            );
          }
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

async function updateFailedRecordsTable(
  UniqueID,
  failedRecord,
  sourceTable,
  Status
) {
  try {
    const params = {
      TableName: process.env.Failed_Records,
      Item: {
        UUid: UniqueID,
        Sourcetable: sourceTable,
        FailedRecord: failedRecord,
        Status: Status,
      },
    };
    await dynamodb.put(params).promise();
    console.log("Failed record has been reprocessed:", UniqueID);
  } catch (error) {
    console.log("Error adding failed record to DynamoDB:", error);
  }
}
