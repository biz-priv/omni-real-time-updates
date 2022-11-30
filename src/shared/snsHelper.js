const AWS = require("aws-sdk");
const sns = new AWS.SNS({ apiVersion: "2010-03-31" });

function snsPublish(event, TopicArn, tableName, MessageAttributes = null) {
  return new Promise(async (resolve, reject) => {
    try {
      const Message = JSON.stringify({
        ...event.Records[0].dynamodb,
        dynamoTableName: tableName,
      });
      const params = {
        Message,
        TopicArn,
        ...(MessageAttributes == null ? {} : { MessageAttributes }),
      };
      //SNS service
      const response = await sns.publish(params).promise();
      console.log("SNS publish:::: ", response);
      resolve("Success");
    } catch (error) {
      console.log("SNSPublishError: ", error);
      resolve("Failed");
    }
  });
}
module.exports = { snsPublish };
