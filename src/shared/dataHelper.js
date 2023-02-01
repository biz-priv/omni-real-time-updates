const moment = require("moment-timezone");
const { deleteItem, updateItem } = require("./dynamo");

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
function sortCommonItemsToSingleRow(itemList, primaryKey, uniqueFilterKey) {
  try {
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
  const operationType = item.Op;
  const mappedObj = removeOperational(item, oprerationColumns);
  const dbKey = {
    [primaryKey]: mappedObj[primaryKey],
    ...(sortKey != null ? { [sortKey]: mappedObj[sortKey] } : {}),
  };
  if (operationType === "D") {
    await deleteItem(tableName, dbKey);
  } else {
    /**
     * Edits an existing item's attributes, or adds a new item to the table
     * if it does not already exist by delegating to AWS.DynamoDB.updateItem().
     */
    await updateItem(tableName, dbKey, mappedObj);
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

module.exports = {
  mapCsvDataToJson,
  sortCommonItemsToSingleRow,
  processData,
  prepareBatchFailureObj,
};
