// const AWS = require('aws-sdk');
// const dynamodb = new AWS.DynamoDB.DocumentClient();

// exports.handler = async (event) => {
//     try {
//         // Define required fields for the records
//         const requiredFields = ["ReferenceNo", "CustomerType", "FK_OrderNo", "FK_RefTypeId", "InsertedTimeStamp", "PK_ReferenceNo"];
//         const tableName = 'realtime-failed-records';//NEED TO ADD ENV OF TABLE.

//         // Create an array of promises to process each record
//         const promises = event.Records.map(async (record) => {
//             if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
//                 const newImage = AWS.DynamoDB.Converter.unmarshall(record.dynamodb.NewImage);
                
//                 // Check if 'failedRecord' array exists in the new image
//                 if (newImage.failedRecord) {
//                     // Create an array of promises to process each failed record
//                     const failedRecordPromises = newImage.failedRecord.map(async (failedRecord) => {
//                         // Check and fill missing fields with "A"
//                         requiredFields.forEach((field) => {
//                             if (!failedRecord.hasOwnProperty(field) || failedRecord[field].trim() === "") {
//                                 failedRecord[field] = "NULL";
//                             }
//                         });

//                         // Print the updated record
//                         console.log(JSON.stringify(failedRecord, null, 4));

//                         // Insert the updated record into the DynamoDB table
//                         const params = {
//                             TableName: tableName,
//                             Item: failedRecord
//                         };

//                         return dynamodb.put(params).promise();
//                     });

//                     // Wait for all failedRecordPromises to complete
//                     await Promise.all(failedRecordPromises);
//                 }
//             }
//         });

//         // Wait for all promises to complete
//         await Promise.all(promises);

//         return {
//             statusCode: 200,
//             body: JSON.stringify('Processed and inserted DynamoDB stream records successfully')
//         };
//     } catch (error) {
//         console.error(error);
//         return {
//             statusCode: 500,
//             body: JSON.stringify('An error occurred while processing and inserting DynamoDB stream records')
//         };
//     }
// };

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { get } = require('lodash');

const BATCH_SIZE = 25; // Define a reasonable batch size

module.exports.handler = async (event) => {
    try {
        // Define required fields for the records
        const requiredFields = ["ReferenceNo", "CustomerType", "FK_OrderNo", "FK_RefTypeId", "InsertedTimeStamp", "PK_ReferenceNo"];
        const tableName = get(event,'sourcetable');
        console.log(tableName)

        // Helper function to process a batch of failed records
        const processBatch = async (batch) => {
            const failedRecordPromises = batch.map(async (failedRecord) => {
                // Check and fill missing fields with "NULL"
                requiredFields.forEach((field) => {
                    if (!failedRecord.hasOwnProperty(field) || failedRecord[field].trim() === "") {
                        failedRecord[field] = "NULL";
                    }
                });

                // Print the updated record
                console.log(JSON.stringify(failedRecord, null, 4));

                // Insert the updated record into the DynamoDB table
                const params = {
                    TableName: "realtime-failed-records",
                    Item: failedRecord
                };

                return dynamodb.put(params).promise();
            });

            await Promise.all(failedRecordPromises);

        };


        get(event,'Records',[]).forEach(async (record) => {
            if (get(record,'eventName') === 'INSERT' || get('record'.eventName) === 'MODIFY') {
                const newImage = AWS.DynamoDB.Converter.unmarshall(get(record, 'dynamodb.NewImage'));

                if (get(newImage,'failedRecord')) {
                    // Process failed records in batches
                    for (let i = 0; i < get(newImage,'failedRecord.length'); i += BATCH_SIZE) {
                        const batch = get(newImage,'failedRecord').slice(i, i + BATCH_SIZE);
                        await processBatch(batch);
                    }
                }
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify('Processed and inserted DynamoDB stream records successfully')
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify('An error occurred while processing and inserting DynamoDB stream records')
        };
    }
};



