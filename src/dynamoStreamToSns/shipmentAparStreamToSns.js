const { snsPublish } = require("../shared/snsHelper");

module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));
  const TopicArn = process.env.SNS_TOPIC_ARN;
  const tableName = process.env.DYNAMO_DB_TABLE;
  if (event?.Records?.[0]?.eventName === "REMOVE") {
    return "Dynamo REMOVE event";
  }
  const FK_VendorId = event.Records[0].dynamodb.NewImage.FK_VendorId.S;
  console.log("FK_VendorId", FK_VendorId);
  const MessageAttributes = {
    FK_VendorId: {
      DataType: "String",
      StringValue: FK_VendorId.toString(),
    },
  };
  return await snsPublish(event, TopicArn, tableName, MessageAttributes);
};
