const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const nodemailer = require('nodemailer');
const sesTransport = require('nodemailer-ses-transport');
const { stringify } = require('csv-stringify');
const moment = require('moment');

const EMAIL_TO = 'omnidev@bizcloudexperts.com';
const EMAIL_FROM = 'no-reply@omnilogistics.com';

const transporter = nodemailer.createTransport(sesTransport({
  ses: new AWS.SES({
    apiVersion: '2010-12-01'
  })
}));

module.exports.handler = async (event) => {
  const fileName = `failed_records_${moment().format('YYYY-MM-DD')}.csv`;

  const params = {
    TableName: process.env.FAILED_RECORDS,
    FilterExpression: '#Status = :FAILED',
    ExpressionAttributeNames: {
      '#Status': 'Status',
    },
    ExpressionAttributeValues: {
      ':FAILED': 'FAILED',
    },
  };

  try {
    const data = await dynamodb.scan(params).promise();

    if (data.Items.length > 0) {
      const csvData = await new Promise((resolve, reject) => {
        stringify(data.Items, { header: true }, (err, output) => {
          if (err) reject(err);
          else resolve(output);
        });
      });

      const emailParams = {
        from: EMAIL_FROM,
        to: EMAIL_TO,
        subject: `Failed Records Report for Realtime application ${moment().format('YYYY-MM-DD')}`,
        text: `The failed records report has been successfully generated and is attached.`,
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
      return ("success");
    } else {
      console.log('No failed records found.');
    }
  } catch (err) {
    console.error('Error querying DynamoDB, uploading to S3, or sending email:', err);
  }
};
