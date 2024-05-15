const { fetchDataFromS3 } = require("../shared/s3");
const {
  sortCommonItemsToSingleRow,
  processData,
  prepareBatchFailureObj,
} = require("../shared/dataHelper");
const { referencesTableMapping } = require("../shared/models");

const tableName = process.env.DYNAMO_DB_TABLE;
const oprerationColumns = ["transact_id", "Op"];
const columnsList = referencesTableMapping.concat(oprerationColumns);
const primaryKey = "PK_ReferenceNo";
const sortKey = null;
const uniqueFilterKey = "transact_id";

const { snsPublishMessage } = require("../shared/errorNotificationHelper");

module.exports.handler = async (event, context, callback) => {
  let sqsEventRecords = [];
  try {
    console.log("event", JSON.stringify(event));
    sqsEventRecords = event.Records;

    const faildSqsItemList = [];
    //looping for all the records
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

        //sort latest data by primaryKey anduniqueFilterKey
        const sortedItemList = sortCommonItemsToSingleRow(
          itemList,
          primaryKey,
          sortKey,
          uniqueFilterKey
        );
        // processing all the recored one by one
        for (let index = 0; index < sortedItemList.length; index++) {
          const sortedItem = sortedItemList[index];
          await processData(
            tableName,
            primaryKey,
            sortKey,
            oprerationColumns,
            sortedItem,
            faildSqsItemList
          );
        }
        if (faildSqsItemList.length > 0) {
          console.log("error:mainProcess", faildSqsItemList);
          const snsParams = {
            TopicArn: process.env.ERROR_NOTIFICATION_SNS_ARN,
            Subject: `An Error occured in realtime updates ${context.funtionName}`,
            Message: JSON.stringify(faildSqsItemList) 
             // Example message, you can customize this
          };
          await snsPublishMessage(snsParams);
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
