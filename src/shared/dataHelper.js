const moment = require("moment-timezone");
const { deleteItem, updateItem, getItem } = require("./dynamo");
const { snsPublish } = require("./snsHelper");

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
function processDynamoDBStream(event, TopicArn, tableName, msgAttName = null) {
  return new Promise(async (resolve, reject) => {
    try {
      const records = event.Records;
      let messageAttributes = null;
      for (let index = 0; index < records.length; index++) {
        try {
          const element = records[index];
          if (element.eventName === "REMOVE") {
            console.log("Dynamo REMOVE event");
            continue;
          }
          if (msgAttName != null) {
            const msgAttValue = element.dynamodb.NewImage[msgAttName].S;
            console.log("msgAttValue", msgAttValue);
            messageAttributes = {
              [msgAttName]: {
                DataType: "String",
                StringValue: msgAttValue.toString(),
              },
            };
            console.log("messageAttributes", messageAttributes);
          }
          await snsPublish(element, TopicArn, tableName, messageAttributes);
        } catch (error) {
          console.log("error:forloop", error);
        }
      }
      resolve("Success");
    } catch (error) {
      console.log("error", error);
      resolve("process failed Failed");
    }
  });
}


async function getUpdateFlag(tableName, key, mappedObj) {
  const itemData = await getItem(tableName, key);
  let flag = false
  console.info("existing Item: ", JSON.stringify(get(itemData, "Item", {})))
  const item = get(itemData, "Item", null);
  if(!item){
    flag = true;
    return flag;
  }
  console.info("New Item: ", JSON.stringify(mappedObj))
  // const existingItem = itemData.Item;
  // const newData = mappedObj;
  // delete existingItem["InsertedTimeStamp"];
  // delete newData["DMS_TS"];
  // delete existingItem[e];
  // delete newData[e];
  // const flag = isEqual(itemData.Item, mappedObj);
  // console.info(flag)
  const keys = Object.keys(mappedObj);
  await Promise.all(keys.map((key) => {
    if (!["DMS_TS", "InsertedTimeStamp"].includes(key)) {
      if (item[key] != mappedObj[key]) {
        flag = true;
      }
    }
  }))
  console.log("update flag: ", flag)
  return flag;
}

module.exports = {
  mapCsvDataToJson,
  sortCommonItemsToSingleRow,
  processData,
  prepareBatchFailureObj,
  processDynamoDBStream,
};
