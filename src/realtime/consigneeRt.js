const { fetchDataFromS3 } = require("../shared/s3");
const {
  sortCommonItemsToSingleRow,
  processData,
} = require("../shared/dataHelper");
const { consigneeTableMapping } = require("../shared/models");

const tableName = process.env.DYNAMO_DB_TABLE;
const oprerationColumns = ["transact_id", "Op"];
const columnsList = consigneeTableMapping.concat(oprerationColumns);
const primaryKey = "FK_ConOrderNo";
const sortKey = null;
const uniqueFilterKey = "transact_id";

module.exports.handler = async (event, context, callback) => {
  try {
    // const S3_BUCKET = "omni-wt-rt-updates-dev";
    // const KEY = "dbo/tbl_Consignee/20221124-154122459.csv";

    console.log("event", JSON.stringify(event));
    const sqsEventRecords = event.Records;

    const faildSqsItemList = [];

    for (let index = 0; index < sqsEventRecords.length; index++) {
      const sqsItem = sqsEventRecords[index];
      const sqsBody = JSON.parse(sqsItem.body);
      const s3Data = sqsBody.Records[0].s3;

      try {
        const S3_BUCKET = s3Data.bucket.name;
        const KEY = s3Data.object.key;

        //fetch and convert data to json from s3
        const itemList = await fetchDataFromS3(S3_BUCKET, KEY, columnsList);
        console.log("itemList", itemList.length);

        //sort latest data by {uniqueFilterKey}
        const sortedItemList = sortCommonItemsToSingleRow(
          itemList,
          primaryKey,
          uniqueFilterKey
        );
        console.log("sortedItemList", sortedItemList.length, sortedItemList[0]);

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
    const batchItemFailures = faildSqsItemList.map((e) => ({
      itemIdentifier: e.messageId,
    }));

    console.log("batchItemFailures", batchItemFailures);

    return { batchItemFailures };
  } catch (error) {
    console.error("Error while fetching json files", error);
    return false;
  }
};
