"use strict";

let _ = require("lodash");
const AWS = require("aws-sdk");
const csv = require("@fast-csv/parse");
const moment = require("moment-timezone");
const tables = require("./models");
AWS.config.update({ region: process.env.REGION });

const documentClient = new AWS.DynamoDB.DocumentClient();

const S3 = new AWS.S3();

const S3_BUCKET = process.env.S3_BUCKET;
const S3_BUCKET_PREFIX = process.env.S3_BUCKET_PREFIX;
const TABLE_NAME = process.env.TARGET_TABLE;

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
};

listBucketJsonFiles();

async function listBucketJsonFiles() {
  try {
    const params = {
      Bucket: S3_BUCKET,
      Delimiter: "/",
      Prefix: S3_BUCKET_PREFIX,
    };

    const data = await S3.listObjects(params).promise();

    if (data && data.Contents && data.Contents.length > 0) {
      for (const iterator of data.Contents) {
        if (iterator.Key.match(/\.csv$/i)) {
          await fetchDataFromS3AndProcessToDynamodbTableInChunck(iterator.Key);
        }
      }
    }

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

const mapCsvDataToJson = (data, mapArray) => {
  try {
    const parseData = JSON.parse(JSON.stringify(data));
    let newMap = {};
    let columnsList = [];
    if (mapArray === "ALL") {
      columnsList = Object.keys(parseData);
      columnsList.push("InsertedTimeStamp");
    } else {
      columnsList = mapArray;
    }
    console.log("columnsList", columnsList);
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

async function fetchDataFromS3(Key, skip, process) {
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
              const tableRows = tableMapping[removeEnv(TABLE_NAME)];
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

async function fetchDataFromS3AndProcessToDynamodbTableInChunck(key) {
  try {
    let skip = 0;
    let process = true;

    while (process === true) {
      let data = await fetchDataFromS3(key, skip, process);

      if (!data) {
        return false;
      }
      let recordsArray = _.chunk(data.recordsArray, 1000);

      for (const iterator of recordsArray) {
        await processFeedData(iterator);
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

async function waitForFurtherProcess() {
  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      console.info("waitin for 5 sec");
      resolve("done");
    }, 5000);
  });
}
