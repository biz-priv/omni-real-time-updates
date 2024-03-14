const { processDynamoDBStream } = require("../shared/dataHelper");
const { get } = require("lodash");

module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));

  let updatedRecords = [];
  await Promise.all(
    event.Records.map(async (record) => {
      const newImage = get(record, "dynamodb.NewImage", {});
      const oldImage = get(record, "dynamodb.OldImage", "");
      let newRecordUpdateFlag = false;
      if (oldImage !== "" && Object.keys(newImage).length > 0) {
        for (const key in oldImage) {
          if (
            oldImage[key]["S"] !== newImage[key]["S"] &&
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

  if (updatedRecords == []) {
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
