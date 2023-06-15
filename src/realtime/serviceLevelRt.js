const { fetchDataFromS3 } = require("../shared/s3");
const {
  sortCommonItemsToSingleRow,
  processData,
  prepareBatchFailureObj,
} = require("../shared/dataHelper");

const tableName = process.env.DYNAMO_DB_TABLE;
const oprerationColumns = ["transact_id", "Op"];
const columnsList = "ALL";
const primaryKey = "service_level_id";
const sortKey = "service_level_description";
const uniqueFilterKey = "transact_id";

module.exports.handler = async (event, context, callback) => {
  let sqsEventRecords = [];
  try {
    console.log("event", JSON.stringify(event));
    sqsEventRecords = event.Records;

    const faildSqsItemList = [];
    for (let i = 0; i < sqsEventRecords.length; i++) {
      let sqsItem, sqsBody, s3Data;
      try {
        sqsItem = sqsEventRecords[i];
        sqsBody = JSON.parse(sqsItem.body);
        s3Data = sqsBody.Records[0].s3;
      } catch (error) {
        console.log("error: no s3 event found");
        continue;
      }

      try {
        const S3_BUCKET = s3Data.bucket.name;
        const KEY = s3Data.object.key;

        const itemList = await fetchDataFromS3(S3_BUCKET, KEY, columnsList);

        const sortedItemList = sortCommonItemsToSingleRow(
          itemList,
          primaryKey,
          sortKey,
          uniqueFilterKey
        );
        for (let i = 0; i < sortedItemList.length; i++) {
          const sortedItem = sortedItemList[i];
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
