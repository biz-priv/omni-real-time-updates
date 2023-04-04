const AWS = require("aws-sdk");
/**
 * sns publish function
 * @param {*} params
 */
async function snsPublishMessage(params) {
  try {
    const sns = new AWS.SNS({ apiVersion: "2010-03-31" });
    await sns.publish(params).promise();
  } catch (e) {
    console.error(
      "Sns publish message error: ",
      e,
      "\nparams: ",
      JSON.stringify(params)
    );
    throw "SnsPublishMessageError";
  }
}

/**
 * sns notification function
 * it prepare the notification msg
 * @param {*} data
 */
async function sendSNSMessage(data) {
  try {
    const snsParams = {
      TopicArn: process.env.ERROR_NOTIFICATION_SNS_ARN,
      Subject: `IVIA ADDRESS MATCH ERROR NOTIFICATION - ${process.env.STAGE}`,
      Message: `Reason for failure: Address match error \n 
                ErrorMSG:- ${data?.errorMsg ?? ""} \n 
                FK_OrderNo:- ${data?.FK_OrderNo ?? ""} \n 
                Housebill:- ${data?.Housebill ?? ""} \n 
                address1: ${data?.addressStr1 ?? ""} \n 
                address2: ${data?.addressStr2 ?? ""}\n 
                gApiAddressObj1: ${data?.gApiAddressObj1 ?? ""}\n 
                gApiAddressObj2: ${data?.gApiAddressObj2 ?? ""}\n 
                `,
    };
    console.log("snsParams", snsParams);
    await snsPublishMessage(snsParams);
  } catch (error) {
    console.log("error:sendSNSMessage", error);
  }
}

module.exports = { sendSNSMessage };
