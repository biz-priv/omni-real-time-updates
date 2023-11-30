"use strict";

let _ = require("lodash");
const AWS = require("aws-sdk");
const csv = require("@fast-csv/parse");
const moment = require("moment-timezone");
const tables = require("./models");
AWS.config.update({ region: process.env.REGION });
const { Parser } = require('json2csv');
const S3 = new AWS.S3();

const event = process.env
console.info('Received event:', JSON.stringify(event));
const S3_BUCKET = process.env.S3_BUCKET;
const S3_BUCKET_PREFIX = process.env.S3_BUCKET_PREFIX;


const tableColumnMapping = {
  "tbl_APARFailure": tables.aparFailuresTableMapping,
  "tbl_ConfirmationCost": "ALL",
  "tbl_Consignee": tables.consigneeTableMapping,
  "tbl_ConsolStopHeaders": "ALL",
  "tbl_ConsolStopItems": "ALL",
  "tbl_Customers": tables.customerTableMapping,
  "tbl_Equipment": "ALL",
  "tbl_Instructions": "ALL",
  "tbl_Milestone": "ALL",
  "tbl_References": tables.referencesTableMapping,
  "tbl_ServiceLevels": "ALL",
  "tbl_ShipmentAPAR": tables.shipmentAparTableMapping,
  "tbl_ShipmentDesc": "ALL",
  "tbl_ShipmentFile": "ALL",
  "tbl_ShipmentHeader": tables.shipmentHeaderTableMapping,
  "tbl_ShipmentMilestone": tables.shipmentMilestoneTableMapping,
  "tbl_ShipmentMilestoneDetail": "ALL",
  "tbl_Shipper": tables.shipperTableMapping,
  "tbl_TimeZoneMaster": "ALL",
  "tbl_TimeZoneZipCR": "ALL",
  "tbl_TrackingNotes": "ALL",
  "tbl_ZipCodes": "ALL",
  "tbl_ImportMAWB": tables.importMawbTableMapping,
  "tbl_ShipmentAirImport": tables.shipmentAirImportMapping,
  "tbl_ShipmentOceanImport": tables.shipmentOceanImportMapping,
  "tbl_RateFile": "ALL",
};

listBucketJsonFiles();
/**
 * Makes a list of all the files available on the respective bucket and executes them one by one.
 * @returns
 */
async function listBucketJsonFiles() {
  try {

    await fetchDataFromS3AndProcessToDynamodbTableInChunck(S3_BUCKET_PREFIX);

    console.info("Process Done");

    return true;
  } catch (error) {
    console.error("Error while fetching json files", error);
    return false;
  }
}

/**
 * mapping s3 csv data to json so that we can insert it to dynamo db
 * @param {*} data
 * @param {*} mapArray
 * @returns
 */
const mapCsvDataToJson = (data, mapArray) => {
  try {
    const parseData = JSON.parse(JSON.stringify(data));
    let newMap = {};
    let columnsList = [];
    //if we are picking all the columns from source table then "ALL" or we are selecting the columns from tableMapping
    if (mapArray === "ALL") {
      columnsList = Object.keys(parseData);
      columnsList.push("InsertedTimeStamp");
    } else {
      columnsList = mapArray;
    }
    columnsList.map((key) => {
      newMap[key] = parseData[key] ? parseData[key].toString().trim() : "";
      if (key === "InsertedTimeStamp") {
        newMap["InsertedTimeStamp"] = moment
          .tz("America/Chicago")
          .format("YYYY:MM:DD HH:mm:ss")
          .toString();
      }
    });
    return newMap;
  } catch (error) {
    console.info("error:mapCsvDataToJson", error);
    throw error;
  }
};

/**
 * Fetching data from s3 using s3 createReadStream and storing then into an array.
 * @param {*} Key
 * @param {*} skip
 * @param {*} process
 * @returns
 */
async function fetchDataFromS3(Key, skip, process, sqlTableName) {
  return new Promise(async (resolve, reject) => {
    try {
      let item = [];
      let index = 0;
      let limit = 50000;
      process = false;

      const streamGzipFile = S3.getObject({
        Bucket: S3_BUCKET,
        Key: Key,
      }).createReadStream();

      streamGzipFile
        .pipe(csv.parse({ headers: true }))
        .on("data", (data) => {
          if (data == "") {
            console.info(`No data from file: ${data}`);
          } else {
            if (index >= skip) {
              const tableRows = tableColumnMapping[sqlTableName];
              item.push(mapCsvDataToJson(data, tableRows));
              if (item.length === limit) {
                console.info("skip", skip);
                console.info("data", index);

                process = true;
                skip = skip + limit;
                console.info("item", item.length);
                streamGzipFile.destroy();
                resolve({
                  recordsArray: item,
                  skip: skip,
                  process: process,
                });
              }
            }
            index++;
          }
        })
        .on("error", function (data) {
          console.error(`Got an error: ${data}`);
          resolve(false);
        })
        .on("end", async () => {
          resolve({
            recordsArray: item,
            skip: skip,
            process: false,
          });
        });
    } catch (error) {
      console.error("Error while reading data line by line", error);
      resolve(false);
    }
  });
}

/**
 * deviding and preparing data to process on dynamoDB
 * @param {*} key
 * @returns
 */
async function fetchDataFromS3AndProcessToDynamodbTableInChunck(key) {
  try {
    let skip = 0;
    let process = true;

    const sqlTableName = await getSqlTableName(S3_BUCKET_PREFIX)
    console.info("table column names: ", tableColumnMapping[sqlTableName])
    while (process === true) {
      let data = await fetchDataFromS3(key, skip, process, sqlTableName);
      console.info("count of data from s3 csv file", data.recordsArray.length)

      if (!data) {
        return false;
      }
      let recordsArray = _.chunk(data.recordsArray, 1000);

      for (const iterator of recordsArray) {
        await processFeedData(iterator, sqlTableName);
      }

      skip = data.skip;
      process = data.process;
    }

    return true;
  } catch (error) {
    console.error(
      "Error while fetching or processing data from s3 to dynamo",
      error
    );
    return false;
  }
}


async function getSqlTableName(S3_BUCKET_PREFIX) {
  const pathArray = S3_BUCKET_PREFIX.split("/")
  return pathArray[2]
}

async function processFeedData(recordsArray, sqlTableName) {
  console.info("records array: ", JSON.stringify(recordsArray))
  try {

    const fields = Object.keys(recordsArray[0]);
    const json2csvParser = new Parser({ fields });
    const csvData = json2csvParser.parse(recordsArray);

    const params = {
      Bucket: S3_BUCKET,
      Key: `dbo/${sqlTableName}/fullLoad-${moment
        .tz("America/Chicago")
        .format("YYYYMMDD-HHmmss-SSS")}.csv`,
      Body: csvData,
      ContentType: 'text/csv',
    };
    console.info("params to upload file in s3: ", JSON.stringify(params))

    const response = await S3.upload(params).promise();
    console.info(`CSV data uploaded to S3 at: ${response.Location}`);

    return true;
  } catch (error) {
    console.error('Error:', error);
  }

}