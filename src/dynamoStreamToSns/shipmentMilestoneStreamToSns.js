const { processDynamoDBStream } = require("../shared/dataHelper");
const { get } = require("lodash");
const AWS = require("aws-sdk");

module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));

  let updatedRecords = [];
  await Promise.all(
    event.Records.map(async (record) => {
      const newImage = AWS.DynamoDB.Converter.unmarshall(get(record, "dynamodb.NewImage", {}));
      const oldImage = AWS.DynamoDB.Converter.unmarshall(get(record, "dynamodb.OldImage", ""));
      let newRecordUpdateFlag = false;
      if (Object.keys(oldImage).length > 0 && Object.keys(newImage).length > 0) {
        for (const key in oldImage) {
          if (
            oldImage[key] !== newImage[key] &&
            !["UUid", "ProcessState", "InsertedTimeStamp"].includes(key)
          ) {
            console.info(key);
            newRecordUpdateFlag = true;
          }
        }
        if (newRecordUpdateFlag) {
          updatedRecords.push(record);
        }
      } else {
        updatedRecords.push(record);
      }
    })
  );
  event.Records = updatedRecords;

  if (updatedRecords.length === 0) {
    return;
  } else {
    return await processDynamoDBStream(
      event,
      process.env.SNS_TOPIC_ARN,
      process.env.DYNAMO_DB_TABLE,
      "FK_OrderStatusId"
    );
  }
};
