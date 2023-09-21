"use strict";

let _ = require("lodash");
const AWS = require("aws-sdk");
const csv = require("@fast-csv/parse");
const moment = require("moment-timezone");
const tables = require("./models");
AWS.config.update({ region: process.env.REGION });
const fs = require('fs');
const { Parser } = require('json2csv');

const documentClient = new AWS.DynamoDB.DocumentClient();

const S3 = new AWS.S3();

const event = process.env
console.log('Received event:', JSON.stringify(event));
const S3_BUCKET = process.env.S3_BUCKET;
console.log('Received bucket:', S3_BUCKET);

// const S3_BUCKET = process.env.S3_BUCKET;
const S3_BUCKET_PREFIX = process.env.S3_BUCKET_PREFIX;
console.log("received prefix:", S3_BUCKET_PREFIX)

const tableMapping = {
  "omni-wt-rt-apar-failure": tables.aparFailuresTableMapping,
  "omni-wt-rt-consignee": tables.consigneeTableMapping,
  "omni-wt-rt-references": tables.referencesTableMapping,
  "omni-wt-rt-shipment-apar": tables.shipmentAparTableMapping,
  "omni-wt-rt-shipment-header": tables.shipmentHeaderTableMapping,
  "omni-wt-rt-shipment-milestone": tables.shipmentMilestoneTableMapping,
  "omni-wt-rt-shipper": tables.shipperTableMapping,
  "omni-wt-rt-instructions": "ALL",
  "omni-wt-rt-shipment-desc": "ALL",
  "omni-wt-rt-shipment-milestone-detail": "ALL",
  "omni-wt-rt-consol-stop-headers": "ALL",
  "omni-wt-rt-consol-stop-items": "ALL",
  "omni-wt-rt-confirmation-cost": "ALL",
  "omni-wt-rt-zip-codes": "ALL",
  "omni-wt-rt-timezone-master": "ALL",
  "omni-wt-rt-timezone-zip-cr": "ALL",
  "omni-wt-rt-equipment": "ALL",
};

const tableNameMapping = {
  "tbl_APARFailure": "omni-wt-rt-apar-failure",
  "tbl_ConfirmationCost": "omni-wt-rt-confirmation-cost",
  "tbl_Consignee": "omni-wt-rt-consignee",
  "tbl_ConsolStopHeaders": "omni-wt-rt-consol-stop-headers",
  "tbl_ConsolStopItems": "omni-wt-rt-consol-stop-items",
  "tbl_Customers": "omni-wt-rt-customers",
  "tbl_Equipment": "omni-wt-rt-equipment",
  "tbl_Instructions": "omni-wt-rt-instructions",
  "tbl_Milestone": "omni-wt-rt-milestone",
  "tbl_References": "omni-wt-rt-references",
  "tbl_ServiceLevels": "omni-wt-rt-servicelevels",
  "tbl_ShipmentAPAR": "omni-wt-rt-shipment-apar",
  "tbl_ShipmentDesc": "omni-wt-rt-shipment-desc",
  "tbl_ShipmentHeader": "omni-wt-rt-shipment-desc",
  "tbl_ShipmentMilestone": "omni-wt-rt-shipment-milestone",
  "tbl_ShipmentMilestoneDetail": "omni-wt-rt-shipment-milestone-detail",
  "tbl_Shipper": "omni-wt-rt-shipper",
  "tbl_TimeZoneMaster": "omni-wt-rt-timezone-master",
  "tbl_TimeZoneZipCR": "omni-wt-rt-timezone-zip-cr",
  "tbl_TrackingNotes": "omni-wt-rt-tracking-notes",
  "tbl_ZipCodes": "omni-wt-rt-zip-codes"
};

listBucketJsonFiles();
/**
 * Makes a list of all the files available on the respective bucket and executes them one by one.
 * @returns
 */
async function listBucketJsonFiles() {
  console.log("batch process started.")
  const s3Prefix = await getS3Prefix(S3_BUCKET_PREFIX)
  try {
    // const params = {
    //   Bucket: S3_BUCKET,
    //   Delimiter: "/",
    //   Prefix: s3Prefix,
    // };

    // const data = await S3.listObjects(params).promise();
    // console.log("data from list objects", data)

    // if (data && data.Contents && data.Contents.length > 0) {
    //   for (const iterator of data.Contents) {
    //     if (iterator.Key.match(/\.csv$/i)) {
    //       await fetchDataFromS3AndProcessToDynamodbTableInChunck(iterator.Key);
    //     }
    //   }
    // }
    await fetchDataFromS3AndProcessToDynamodbTableInChunck(S3_BUCKET_PREFIX);

    console.info("Process Done");

    return true;
  } catch (error) {
    console.error("Error while fetching json files", error);
    return false;
  }
}

function removeEnv(table) {
  const arr = table.split("-");
  arr.pop();
  return arr.join("-");
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
      newMap[key] = parseData[key] ? parseData[key].toString() : "";
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
  console.log("inside fetchDataFromS3")
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
              const tableRows = tableMapping[tableNameMapping[sqlTableName]];
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
  console.log("inside fetchDataFromS3AndProcessToDynamodbTableInChunck")
  try {
    let skip = 0;
    let process = true;

    const sqlTableName = await getSqlTableName(S3_BUCKET_PREFIX)
    console.log("table Name", tableNameMapping[sqlTableName])
    console.log("table columns", tableMapping[tableNameMapping[sqlTableName]])
    while (process === true) {
      let data = await fetchDataFromS3(key, skip, process, sqlTableName);
      console.log("data from s3 csv file", JSON.stringify(data))

      if (!data) {
        return false;
      }
      let recordsArray = _.chunk(data.recordsArray, 1000);

      for (const iterator of recordsArray) {
        await processFeedDataEnhc1(iterator, sqlTableName);
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

/**
 * preparing the array with proper payload of 20 records at a time for dynamoDB
 * @param {*} recordsArray
 * @returns
 */
async function processFeedData(recordsArray) {
  try {
    const allJsonData = recordsArray.reduce((accumulator, currentValue) => {
      if (currentValue) {
        return accumulator.concat({
          PutRequest: { Item: currentValue },
        });
      }
      return accumulator;
    }, []);

    if (allJsonData.length === 0) {
      return true;
    }

    const chunkArray = _.chunk(allJsonData, 20);

    for (let index = 0; index < chunkArray.length; index++) {
      const element = chunkArray[index];
      await writeDataToDyanmodbTable(element);
    }
    return true;
  } catch (error) {
    console.error("Error while processing feed data", error);
    return false;
  }
}

/**
 * inserting data to dynamoDB
 * if failes to write or update then making a list and process again
 * @param {*} element
 * @returns
 */
async function writeDataToDyanmodbTable(element) {
  try {
    let dynamoDBParams = {
      RequestItems: {
        [TABLE_NAME]: element,
      },
    };

    let writeItemData = await documentClient
      .batchWrite(dynamoDBParams)
      .promise();

    while (Object.keys(writeItemData.UnprocessedItems).length !== 0) {
      const rewriteItemParam = {
        RequestItems: writeItemData.UnprocessedItems,
      };
      writeItemData = await documentClient
        .batchWrite(rewriteItemParam)
        .promise();
    }
    return true;
  } catch (error) {
    console.error("Error while processing data in chunck", error);
    if (error.code && error.code === "ThrottlingException" && error.retryable) {
      await waitForFurtherProcess();
      await writeDataToDyanmodbTable(element);
    }
    return false;
  }
}

/**
 * creating a delay between the dynamodb process.
 * @returns
 */
async function waitForFurtherProcess() {
  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      console.info("waitin for 5 sec");
      resolve("done");
    }, 5000);
  });
}


async function processFeedDataEnhc(recordsArray, sqlTableName) {
  console.log("records array", recordsArray)
  try {

    // Extract the keys (headers) from the first object
    const headers = Object.keys(recordsArray[0]);

    // Create a CSV string with headers and rows
    const csvData = [headers.join(','), ...recordsArray.map(obj => headers.map(key => obj[key]).join(','))].join('\n');

    fs.writeFileSync('data.csv', csvData, 'utf-8');

    const params = {
      Bucket: S3_BUCKET,
      //   Key: `dbo/${sqlTableName}/fullLoad-${moment
      //     .tz("America/Chicago")
      //     .format("YYYY:MM:DDTHH:mm:ss")}.csv`,
      //   Body: fs.readFileSync('data.csv'),
      // };
      Key: `dbo/tbl_TimeZoneMaster/fullLoad-${moment
        .tz("America/Chicago")
        .format("YYYY:MM:DDTHH:mm:ss")}.csv`,
      Body: fs.readFileSync('data.csv'),
    };
    console.log("params to upload file in s3: ", params)
    // return true
    const uploadResponse = await S3.upload(params).promise();
    console.log('File uploaded to S3:', uploadResponse.Location);

    // Optionally, delete the local file
    fs.unlinkSync('data.csv');
  } catch (error) {
    console.error('Error:', error);
  }

}

async function getSqlTableName(S3_BUCKET_PREFIX) {
  const pathArray = S3_BUCKET_PREFIX.split("/")
  console.log(`/${pathArray[2]}/`)
  return pathArray[2]
}

async function getS3Prefix(S3_BUCKET_PREFIX) {
  const pathArray = S3_BUCKET_PREFIX.split("/")
  pathArray.pop();
  // console.log("s3 path: ", `${pathArray.join("/")}/`)
  return `${pathArray.join("/")}/`;
}

async function processFeedDataEnhc1(recordsArray, sqlTableName) {
  console.log("records array", JSON.stringify(recordsArray))
  try {

    const fields = Object.keys(recordsArray[0]);
    const json2csvParser = new Parser({ fields });
    const csvData = json2csvParser.parse(recordsArray);
    console.log("csvData: ", JSON.stringify(csvData))

    const params = {
      Bucket: S3_BUCKET,
      // Key: `dbo/${sqlTableName}/fullLoad-${moment
      //   .tz("America/Chicago")
      //   .format("YYYY:MM:DDTHH:mm:ss")}.csv`,
      Key: `dbo/tbl_TimeZoneMaster/fullLoad-${moment
        .tz("America/Chicago")
        .format("YYYY:MM:DDTHH:mm:ss")}.csv`,
      Body: csvData,
      ContentType: 'text/csv',
    };
    console.log("params to upload file in s3: ", JSON.stringify(params))

    const response = await S3.upload(params).promise();
    console.log(`CSV data uploaded to S3 at: ${response.Location}`);

    return true;
  } catch (error) {
    console.error('Error:', error);
  }

}