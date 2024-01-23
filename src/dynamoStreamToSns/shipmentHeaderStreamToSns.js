const { get } = require("lodash");
const { processDynamoDBStream } = require("../shared/dataHelper");

module.exports.handler = async (event, context, callback) => {
    console.info("event", JSON.stringify(event));
    const records = event.Records;
    const newRecord = { ...event };

    records.map(async (record, index) => {
        const newAcctManager = get(record, "dynamodb.NewImage.AcctManager.S");
        const oldAcctManager = get(record, "dynamodb.OldImage.AcctManager.S", null);

        if (get(record, "eventName") === "MODIFY" && newAcctManager && oldAcctManager === null) {
            console.log("AcctManager. Ignoring the event.");
        newRecord.Records.splice(index, 1);
            return false;
        }

        console.info("dynamodb.NewImage.AcctManager", newAcctManager);
        console.info("dynamodb.OldImage.AcctManager", oldAcctManager);
    });
    console.info("🙂 -> file: shipmentHeaderStreamToSns.js:17 -> newRecord:", JSON.stringify(newRecord));
    return await processDynamoDBStream(event, process.env.SNS_TOPIC_ARN, process.env.DYNAMO_DB_TABLE, "BillNo");
};
