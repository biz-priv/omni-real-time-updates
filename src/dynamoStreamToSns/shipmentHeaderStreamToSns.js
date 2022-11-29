const AWS = require("aws-sdk");
const sns = new AWS.SNS({ apiVersion: "2010-03-31" });

module.exports.handler = async (event, context, callback) => {
  console.info("event", event);
  await snsPublish(event);

  return {};
};

function snsPublish(event) {
  return new Promise(async (resolve, reject) => {
    try {
      const TopicArn =
        "arn:aws:sns:us-east-1:332281781429:omni-wt-rt-shipment-header-dev";
      const params = {
        Message: JSON.stringify(item),
        TopicArn,
        MessageAttributes: {
          BillNo: {
            DataType: "String",
            StringValue: item.customer_id.toString(),
          },
          data: {},
        },
      };
      //SNS service
      const response = await sns.publish(params).promise();
      console.log("SNS publish:::: ", response);
      resolve(1);
    } catch (error) {
      console.log("SNSPublishError: ", error);
      reject(error);
    }
  });
}
