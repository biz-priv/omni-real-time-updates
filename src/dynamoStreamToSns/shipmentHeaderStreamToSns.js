const { snsPublish } = require("../shared/snsHelper");

module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));
  const TopicArn = process.env.SNS_TOPIC_ARN;
  const tableName = process.env.DYNAMO_DB_TABLE;
  if (
    event?.Records &&
    event.Records.length > 0 &&
    event.Records[0].eventName === "REMOVE"
  ) {
    return "Dynamo REMOVE event";
  }
  const BillNo = event.Records[0].dynamodb.NewImage.BillNo.S;
  console.log("BillNo", BillNo);

  const MessageAttributes = {
    BillNo: {
      DataType: "String",
      StringValue: BillNo.toString(),
    },
  };
  return await snsPublish(event, TopicArn, tableName, MessageAttributes);
};
