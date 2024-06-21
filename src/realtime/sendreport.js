const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const nodemailer = require('nodemailer');
const sesTransport = require('nodemailer-ses-transport');
const csv = require('csv-stringify');
const moment = require('moment');

const BUCKET_NAME = 'realtimefailedreports';
const EMAIL_TO = 'ajitesh.narra@bizcloudexperts.com';
const EMAIL_FROM = process.env.EMAIL_FROM;

const transporter = nodemailer.createTransport(sesTransport({
  ses: new AWS.SES({
    apiVersion: '2010-12-01'
  })
}));

module.exports.handler = async (event) => {
  const startDate = moment().subtract(1, 'days').startOf('day').format('YYYY-MM-DD');
  console.log("startdate"+startDate);
  const endDate = moment().startOf('day').format('YYYY-MM-DD');
  const fileName = `failed_records_${startDate}.csv`;

  const params = {
    TableName: process.env.FAILED_RECORDS,
    FilterExpression: '#status = :failed AND #created_at BETWEEN :start_date AND :end_date',
    ExpressionAttributeNames: {
      '#Status': 'Status',
      '#Timestamp': 'Timestamp',
    },
    ExpressionAttributeValues: {
      ':Failed': 'Failed',
      ':start_date': startDate,
      ':end_date': endDate,
    },
  };

  try {
    const data = await dynamodb.scan(params).promise();

    if (data.Items.length > 0) {
      const csvData = await new Promise((resolve, reject) => {
        csv(data.Items, { header: true }, (err, output) => {
          if (err) reject(err);
          else resolve(output);
        });
      });

      const s3Params = {
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: csvData,
        ContentType: 'text/csv',
      };

      await s3.putObject(s3Params).promise();
      console.log('File uploaded successfully.');

      const emailParams = {
        from: EMAIL_FROM,
        to: EMAIL_TO,
        subject: `Failed Records Report for ${startDate}`,
        text: `The failed records report for ${startDate} has been successfully generated and uploaded to the S3 bucket. The file is also attached.`,
        attachments: [
          {
            filename: fileName,
            content: csvData,
            contentType: 'text/csv'
          }
        ]
      };

      await transporter.sendMail(emailParams);
      console.log('Email sent successfully.');
    } else {
      console.log('No failed records found for the previous day.');
    }
  } catch (err) {
    console.error('Error querying DynamoDB, uploading to S3, or sending email:', err);
  }
};
 
