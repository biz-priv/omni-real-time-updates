const { fetchDataFromS3 } = require("../shared/s3");
const {
  sortCommonItemsToSingleRow,
  processData,
  prepareBatchFailureObj,
} = require("../shared/dataHelper");
const { shipmentHeaderTableMapping } = require("../shared/models");

const tableName = process.env.DYNAMO_DB_TABLE;
const oprerationColumns = ["transact_id", "Op"];
const columnsList = shipmentHeaderTableMapping.concat(oprerationColumns);
const primaryKey = "PK_OrderNo";
const sortKey = null;
const uniqueFilterKey = "transact_id";

module.exports.handler = async (event, context, callback) => {
  let sqsEventRecords = [];
  try {
    console.log("event", JSON.stringify(event));
    sqsEventRecords = event.Records;

    const faildSqsItemList = [];

    for (let index = 0; index < sqsEventRecords.length; index++) {
      let sqsItem, sqsBody, s3Data;
      try {
        sqsItem = sqsEventRecords[index];
        sqsBody = JSON.parse(sqsItem.body);
        s3Data = sqsBody.Records[0].s3;
      } catch (error) {
        console.log("error: no s3 event found");
        continue;
      }
      try {
        const S3_BUCKET = s3Data.bucket.name;
        const KEY = s3Data.object.key;

        //fetch and convert data to json from s3
        const itemList = await fetchDataFromS3(S3_BUCKET, KEY, columnsList);

        //sort latest data by {uniqueFilterKey}
        const sortedItemList = sortCommonItemsToSingleRow(
          itemList,
          primaryKey,
          uniqueFilterKey
        );

        for (let index = 0; index < sortedItemList.length; index++) {
          const sortedItem = sortedItemList[index];
          await processData(
            tableName,
            primaryKey,
            sortKey,
            oprerationColumns,
            sortedItem
          );
        }
      } catch (error) {
        console.log("error:mainProcess", error);
        faildSqsItemList.push(sqsItem);
      }
    }
    return prepareBatchFailureObj(faildSqsItemList);
  } catch (error) {
    console.error("Error while fetching json files", error);
    return prepareBatchFailureObj(sqsEventRecords);
  }
};
