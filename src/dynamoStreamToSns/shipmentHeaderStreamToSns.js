const { snsPublish } = require("../shared/snsHelper");

module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));
  const TopicArn = process.env.SNS_TOPIC_ARN;
  const BillNo = event.Records[0].dynamodb.NewImage.BillNo.S;
  console.log("BillNo", BillNo);
  const tableName = process.env.DYNAMO_DB_TABLE;

  const MessageAttributes = {
    BillNo: {
      DataType: "String",
      StringValue: BillNo.toString(),
    },
  };
  return await snsPublish(event, TopicArn, tableName, MessageAttributes);
};
