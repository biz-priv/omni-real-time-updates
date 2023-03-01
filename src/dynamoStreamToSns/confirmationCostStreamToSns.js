const { triggerAddressMapping } = require("../shared/addressMapping");
const { processDynamoDBStream } = require("../shared/dataHelper");

module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));
  await processDynamoDBStream(
    event,
    process.env.SNS_TOPIC_ARN,
    process.env.DYNAMO_DB_TABLE
  );

  const tableName = process.env.DYNAMO_DB_TABLE;
  await triggerAddressMapping(tableName, event);
  return "Success";
};
