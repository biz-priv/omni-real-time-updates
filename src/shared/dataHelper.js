const moment = require("moment-timezone");
const {
  deleteItem,
  updateItem,
  getItem,
  addToFailedRecordsTable,
} = require("./dynamo");
const { snsPublish } = require("./snsHelper");
const { get, isEmpty } = require("lodash");
const { v4: uuidv4 } = require("uuid");
const AWS = require("aws-sdk");

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
      // Add code to update uuid and ProcessState here
      if (key === "UUid") {
        newMap["UUid"] = uuidv4();
      }
      if (key === "ProcessState") {
        newMap["ProcessState"] = "Not Processed";
      }
    });
    return newMap;
  } catch (error) {
    console.log("error:mapCsvDataToJson", error);
    throw error;
  }
};
/**
 * soarting records based on primaryKey uniqueFilterKey
 * @param {*} itemList
 * @param {*} primaryKey
 * @param {*} uniqueFilterKey
 * @returns
 */
function sortCommonItemsToSingleRow(
  itemList,
  primaryKey,
  sortKey = null,
  uniqueFilterKey
) {
  try {
    if (sortKey != null) {
      let sortedData = [];
      const grpupByPrimaryKey = itemList.reduce(function (rv, x) {
        (rv[x[primaryKey]] = rv[x[primaryKey]] || []).push(x);
        return rv;
      }, {});
      Object.keys(grpupByPrimaryKey).map((e, i) => {
        const obj = grpupByPrimaryKey[e];

        const grpupBysortKey = obj.reduce(function (rv, x) {
          (rv[x[sortKey]] = rv[x[sortKey]] || []).push(x);
          return rv;
        }, {});
        const skdata = Object.keys(grpupBysortKey).map((e, i) => {
          const objsk = grpupBysortKey[e];
          return objsk.reduce((prev, current) =>
            +prev[uniqueFilterKey] > +current[uniqueFilterKey] ? prev : current
          );
        });

        sortedData = [...sortedData, ...skdata];
      });
      return sortedData;
    } else {
      const grpupByPrimaryKey = itemList.reduce(function (rv, x) {
        (rv[x[primaryKey]] = rv[x[primaryKey]] || []).push(x);
        return rv;
      }, {});
      const sortedData = Object.keys(grpupByPrimaryKey).map((e, i) => {
        const obj = grpupByPrimaryKey[e];

        return obj.reduce((prev, current) =>
          +prev[uniqueFilterKey] > +current[uniqueFilterKey] ? prev : current
        );
      });
      return sortedData;
    }
  } catch (error) {
    console.log("error:sortCommonItemsToSingleRow", error);
    throw error;
  }
}

/**
 * removing unrequired fields from record like oprerationColumns ["transact_id", "Op"]
 * @param {*} item
 * @param {*} oprerationColumns
 * @returns
 */
function removeOperational(item, oprerationColumns) {
  try {
    oprerationColumns.map((e) => {
      delete item[e];
    });
    return item;
  } catch (error) {
    console.log("error:removeOperational", error);
    throw error;
  }
}

/**
 * processing data to dynamoDB
 * if operationType "D" then delete and for others we are updating or creating record
 * @param {*} tableName
 * @param {*} primaryKey
 * @param {*} sortKey
 * @param {*} oprerationColumns
 * @param {*} item
 */
async function processData(
  tableName,
  primaryKey,
  sortKey,
  oprerationColumns,
  item
) {
  try {
    const operationType = item.Op;
    const mappedObj = removeOperational(item, oprerationColumns);
    const dbKey = {
      [primaryKey]: mappedObj[primaryKey],
      ...(sortKey != null ? { [sortKey]: mappedObj[sortKey] } : {}),
    };
    if (operationType === "D") {
      await deleteItem(tableName, dbKey);
    } else {
      const updateFlag = await getUpdateFlag(tableName, dbKey, mappedObj);
      /**
       * Edits an existing item's attributes, or adds a new item to the table
       * if it does not already exist by delegating to AWS.DynamoDB.updateItem().
       */
      if (updateFlag) {
        await updateItem(tableName, dbKey, mappedObj);
      }
    }
  } catch (error) {
    console.log("error:processData", error);
    await addToFailedRecordsTable(item, tableName);
  }
}

/**
 * preparing the payload for sqs of failed sqs events
 * @param {*} data
 * @returns
 */
function prepareBatchFailureObj(data) {
  const batchItemFailures = data.map((e) => ({
    itemIdentifier: e.messageId,
  }));
  console.log("batchItemFailures", batchItemFailures);
  return { batchItemFailures };
}

/**
 * main function for all dynamodb to sns lambdas
 * @param {*} event
 * @param {*} TopicArn
 * @param {*} tableName
 * @param {*} msgAttName
 * @returns
 */
async function processDynamoDBStream(
  event,
  TopicArn,
  tableName,
  msgAttName = null
) {
  try {
    const records = event.Records;
    let messageAttributes = null;
    for (const element of records) {
      try {
        if (!isEmpty(msgAttName) && msgAttName !== "") {
          const newImage = AWS.DynamoDB.Converter.unmarshall(
            get(element, "dynamodb.NewImage")
          );
          // const newImage = element.dynamodb.NewImage;
          if (newImage && newImage[msgAttName]) {
            const msgAttValue = get(newImage, msgAttName, null);

            console.log("msgAttValue", msgAttValue);
            // if msgAttValue is an empty string, set messageAttributes to null
            if (msgAttValue === "" || msgAttValue === null) {
              messageAttributes = null;
            } else {
              messageAttributes = {
                [msgAttName]: {
                  DataType: "String",
                  StringValue: msgAttValue.toString(),
                },
              };
            }
            console.log("messageAttributes", messageAttributes);
          }
        }
        if (
          element.eventName === "REMOVE" &&
          TopicArn.includes("omni-wt-rt-shipment-apar-all-events")
        ) {
          console.log("Dynamo REMOVE event");
          await snsPublish(element, TopicArn, tableName, messageAttributes);
          continue;
        }
        if (element.eventName === "REMOVE") {
          console.log("Dynamo REMOVE event");
          continue;
        }
        await snsPublish(element, TopicArn, tableName, messageAttributes);
      } catch (error) {
        console.log("error:forloop", error);
      }
    }
    return "Success";
  } catch (error) {
    console.log("error", error);
    return "process failed Failed";
  }
}

async function getUpdateFlag(tableName, key, mappedObj) {
  const itemData = await getItem(tableName, key);
  let flag = false;
  console.info("existing Item: ", JSON.stringify(get(itemData, "Item", {})));
  const item = get(itemData, "Item", null);
  if (!item) {
    flag = true;
    return flag;
  }
  console.info("New Item: ", JSON.stringify(mappedObj));

  const keys = Object.keys(mappedObj);
  await Promise.all(
    keys.map((key) => {
      if (!["DMS_TS", "InsertedTimeStamp"].includes(key)) {
        if (item[key] != mappedObj[key]) {
          flag = true;
        }
      }
    })
  );
  console.log("update flag: ", flag);
  return flag;
}

module.exports = {
  mapCsvDataToJson,
  sortCommonItemsToSingleRow,
  processData,
  prepareBatchFailureObj,
  processDynamoDBStream,
};
