const { snsPublish } = require("../shared/snsHelper");

module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));
  const TopicArn = process.env.SNS_TOPIC_ARN;

  return await snsPublish(event, TopicArn);
};
