const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const nodemailer = require("nodemailer");
const sesTransport = require("nodemailer-ses-transport");
const { stringify } = require("csv-stringify");
const moment = require("moment");

const EMAIL_TO = "omnidev@bizcloudexperts.com";
const EMAIL_FROM = "no-reply@omnilogistics.com";

const transporter = nodemailer.createTransport(
  sesTransport({
    ses: new AWS.SES({
      apiVersion: "2010-12-01",
    }),
  })
);


module.exports.handler = async (event) => {
  const startDate = moment().startOf("day").format("YYYY-MM-DD");
  const fileName = `failed_records_${startDate}.csv`;

  try {
    const failedRecords = await fetchAllFailedRecords();
    const failedRecordsCount = failedRecords.length;

    console.log("Fetched failed records:", failedRecordsCount); // Add this line for debugging

    if (failedRecords.length > 0) {
      const csvData = await new Promise((resolve, reject) => {
        stringify(failedRecords, { header: true }, (err, output) => {
          if (err) reject(err);
          else resolve(output);
        });
      });

      const emailParams = {
        from: EMAIL_FROM,
        to: EMAIL_TO,
        subject: `Failed Records Report for Realtime application ${startDate}`,
        text: `The failed records report for ${startDate} has been successfully generated the file is also attached there are total ${failedRecordsCount} records.`,
        attachments: [
          {
            filename: fileName,
            content: csvData,
            contentType: "text/csv",
          },
        ],
      };

      await transporter.sendMail(emailParams);
      console.log("Email sent successfully.");
      return "success";
    } else {
      console.log("No failed records found.");
      return "no failed records";
    }
  } catch (err) {
    console.error(
      "Error querying DynamoDB, generating CSV, or sending email:",
      err
    );
    throw err;
  }
};

async function fetchAllFailedRecords() {
  const params = {
    TableName: process.env.FAILED_RECORDS,
    IndexName: "Status-index", // Replace with the actual name of your GSI
    KeyConditionExpression: "#Status = :FAILED",
    ExpressionAttributeNames: {
      "#Status": "Status",
    },
    ExpressionAttributeValues: {
      ":FAILED": "FAILED",
    },
    Limit: 10000, // Adjust the batch size as per your needs
  };

  let allRecords = [];
  let lastEvaluatedKey = null;

  try {
    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const data = await dynamodb.query(params).promise();
      allRecords = allRecords.concat(data.Items);
      lastEvaluatedKey = data.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } catch (error) {
    console.error("Query failed:", error);
    throw error;
  }

  return allRecords;
}