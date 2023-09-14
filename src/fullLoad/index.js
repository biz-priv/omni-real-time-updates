"use strict";
const AWS = require("aws-sdk");
const batch = new AWS.Batch({ apiVersion: "2016-08-10" });

exports.shipmentHeaderBatchTrigger = async (event, context, callback) => {
  try {
    console.info("Event from fullLoadBatchTrigger", event);

    let data = JSON.parse(event.body);

    const params = {
      jobDefinition: data.job_definition,
      jobName: data.job_name,
      jobQueue: data.job_queue,
      containerOverrides: {
        environment: [
          {
            name: "S3_BUCKET",
            value: data.s3_bucket,
          },
          {
            name: "S3_BUCKET_PREFIX",
            value: data.s3_bucket_prefix,
          },
          {
            name: "TARGET_TABLE",
            value: data.dynamodb_table,
          },
          {
            name: "REGION",
            value: process.env.REGION,
          },
        ],
      },
    };

    console.info("params", JSON.stringify(params))
    
    const batchData = await submitBatchJob(params);

    console.info("batchData", batchData);

    const response = {
      statusCode: 200,
      body: JSON.stringify({
        message: `Batch process submitted successfully!`,
      }),
    };

    return callback(null, response);
  } catch (error) {
    console.error("Error while processing data", error);

    const response = {
      statusCode: 400,
      body: JSON.stringify({
        message: `Error while submitting batch process.`,
      }),
    };

    return callback(null, response);
  }
};

async function submitBatchJob(params) {
  try {
      return new Promise(async (resolve, reject) => {
          batch.submitJob(params, function (err, data) {
              if (err) {
                  console.error(err, err.stack);
                  return reject(err);
              } else {
                  console.info(data);
                  return resolve(data);
              }
          });
      })
  }
  catch (e) {
      console.error("Error while submitting Batch Job: ", e, "\nparams: ", JSON.stringify(params));
      throw e;
  }
}




/**
 * starts all the batch job full load for all the dynamo db functions.
 * @returns
 */
async function doFullLoadInOneRun() {
  const batchJobListJson = `../shared/fullLoadTriggerList/batch-job-payloads-${process.env.STAGE}.json`;
  const dataArr = require(batchJobListJson);
  for (let index = 0; index < dataArr.length; index++) {
    const data = dataArr[index];
    try {
      console.info("Event from fullLoadBatchTrigger", event);

      // let data = JSON.parse(event.body);

      const params = {
        jobDefinition: data.job_definition,
        jobName: data.job_name,
        jobQueue: data.job_queue,
        containerOverrides: {
          environment: [
            {
              name: "S3_BUCKET",
              value: data.s3_bucket,
            },
            {
              name: "S3_BUCKET_PREFIX",
              value: data.s3_bucket_prefix,
            },
            {
              name: "TARGET_TABLE",
              value: data.dynamodb_table,
            },
            {
              name: "REGION",
              value: process.env.REGION,
            },
          ],
        },
      };

      const batchData = await submitBatchJob(params);

      console.info("batchData", batchData);

      const response = {
        statusCode: 200,
        body: JSON.stringify({
          message: `Batch process submitted successfully!`,
        }),
      };

      // return callback(null, response);
    } catch (error) {
      console.error("Error while processing data", error);

      const response = {
        statusCode: 400,
        body: JSON.stringify({
          message: `Error while submitting batch process.`,
        }),
      };

      // return callback(null, response);
    }
  }
  return "success";
}
