const { snsPublish } = require("../shared/snsHelper");

module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));
  const TopicArn = process.env.SNS_TOPIC_ARN;
  const tableName = process.env.DYNAMO_DB_TABLE;
  if (event?.Records?.[0]?.eventName === "REMOVE") {
    return "Dynamo REMOVE event";
  }
  return await snsPublish(event, TopicArn, tableName);
};
