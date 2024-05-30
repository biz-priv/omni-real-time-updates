const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const DynamoDB = new AWS.DynamoDB();
const { get } = require("lodash");
const { updateFailedRecordsTable } = require("../shared/dynamo")


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
  const UniqueID = get(firstRecord,"dynamodb.NewImage.UUid.S", {});
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

    // Helper function to process a single failed record
    const processRecord = async (failedRecord) => {
      try {
        // Check and fill missing fields with "NULL"
        requiredFields.forEach((field) => {
          if (
            !failedRecord.hasOwnProperty(field) ||
            failedRecord[field].trim() === ""
          ) {
            failedRecord[field] = "NULL";
          }
        });

        // Print the updated record
        console.log("Updated record:", JSON.stringify(failedRecord, null, 4));

        // Insert the updated record into the DynamoDB table
        const params = {
          TableName: "realtime-failed-records",
          Item: failedRecord,
        };

        await dynamodb.put(params).promise();
        const Status = ""
        await updateFailedRecordsTable (UniqueID,Status="success");

        // Update the status to "success"

        console.log("Record processed successfully:", failedRecord);
      } catch (err) {
        await updateFailedRecordsTable (UniqueID,Status="fail");
        console.error("Error processing record:", err);
        // Update the status to "fail"
        
   
      }
    };

    // Create an array of promises to process each record
    const processPromises = get(event, "Records", []).map(async (record) => {
      if (
        get(record, "eventName") === "INSERT" ||
        get(record, "eventName") === "MODIFY"
      ) {
        const newImage = AWS.DynamoDB.Converter.unmarshall(
          get(record, "dynamodb.NewImage")
        );

        if (get(newImage, "FailedRecord")) {
          // Process each failed record individually
          await processRecord(newImage.FailedRecord);
        }
      }
    });

    // Wait for all process promises to complete
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
