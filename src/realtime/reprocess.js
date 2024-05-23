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

const BATCH_SIZE = 25; // Define a reasonable batch size

module.exports.handler = async (event) => {
    try {
        // Define required fields for the records
        const requiredFields = ["ReferenceNo", "CustomerType", "FK_OrderNo", "FK_RefTypeId", "InsertedTimeStamp", "PK_ReferenceNo"];
        const tableName = 'realtime-failed-records';

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
                    TableName: tableName,
                    Item: failedRecord
                };

                return dynamodb.put(params).promise();
            });

            await Promise.all(failedRecordPromises);
        };

        // Create an array of promises to process each record in batches
        const processPromises = [];

        event.Records.forEach((record) => {
            if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
                const newImage = AWS.DynamoDB.Converter.unmarshall(record.dynamodb.NewImage);

                if (newImage.failedRecord) {
                    // Process failed records in batches
                    for (let i = 0; i < newImage.failedRecord.length; i += BATCH_SIZE) {
                        const batch = newImage.failedRecord.slice(i, i + BATCH_SIZE);
                        processPromises.push(processBatch(batch));
                    }
                }
            }
        });

        // Wait for all process promises to complete
        await Promise.all(processPromises);

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



