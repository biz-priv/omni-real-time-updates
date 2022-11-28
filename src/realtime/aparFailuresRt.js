const { fetchDataFromS3 } = require("../shared/s3");
const {
  sortCommonItemsToSingleRow,
  processData,
} = require("../shared/dataHelper");
const { aparFailuresTableMapping } = require("../shared/models");

const tableName = process.env.DYNAMO_DB_TABLE;
const oprerationColumns = ["transact_id", "Op"];
const columnsList = aparFailuresTableMapping.concat(oprerationColumns);
const primaryKey = "FK_OrderNo";
const sortKey = "FK_SeqNo";
const uniqueFilterKey = "transact_id";

module.exports.handler = async (event, context, callback) => {
  try {
    const S3_BUCKET = "omni-wt-rt-updates-dev";
    const KEY = "dbo/tbl_Shipper/20221124-154122277.csv";

    //fetch and convert data to json from s3
    const itemList = await fetchDataFromS3(S3_BUCKET, KEY, columnsList);
    console.log("itemList", itemList.length);

    //sort latest data by {uniqueFilterKey}
    const sortedItemList = sortCommonItemsToSingleRow(
      itemList,
      primaryKey,
      uniqueFilterKey
    );
    console.log("sortedItemList", sortedItemList.length);

    for (let index = 0; index < sortedItemList.length; index++) {
      const element = sortedItemList[index];
      await processData(
        tableName,
        primaryKey,
        sortKey,
        oprerationColumns,
        element
      );
    }

    return true;
  } catch (error) {
    console.error("Error while fetching json files", error);
    return false;
  }
};
