const AWS = require("aws-sdk");
const sns = new AWS.SNS({ apiVersion: "2010-03-31" });

module.exports.handler = async (event, context, callback) => {
  console.info("event", JSON.stringify(event));
  console.log("BillNo", event.Records[0].dynamodb.NewImage.BillNo.S);
  const NewImage = event.Records[0].dynamodb.NewImage;
  // const BillNo = event.Records[0].dynamodb.NewImage.BillNo;
  const BillNo = "22531";
  
  await snsPublish(NewImage, BillNo);

  return {};
};

function snsPublish(NewImage, BillNo) {
  return new Promise(async (resolve, reject) => {
    try {
      const TopicArn =
        "arn:aws:sns:us-east-1:332281781429:omni-wt-rt-shipment-header-dev";
      const params = {
        Message: JSON.stringify(NewImage),
        TopicArn,
        MessageAttributes: {
          BillNo: {
            DataType: "String",
            StringValue: BillNo.toString(),
          },
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
