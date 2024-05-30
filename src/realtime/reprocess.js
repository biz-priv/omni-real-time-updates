const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const DynamoDB = new AWS.DynamoDB();
const { get } = require('lodash');

module.exports.handler = async (event) => {
    try {
        const result = await DynamoDB.describeTable({ TableName: event.TableName }).promise();
        console.info(':slightly_smiling_face: -> file: index.js:7 -> result:', Array.from(new Set(result.Table.GlobalSecondaryIndexes.map(gsi => gsi.KeySchema).flat().map(schema => schema.AttributeName))));
        
        let requiredFields = Array.from(new Set(result.Table.GlobalSecondaryIndexes.flatMap(gsi => gsi.KeySchema.map(schema => schema.AttributeName))));
        
        const tableNames = get(event, 'sourctable', 'realtime-failed-records');
        console.log(tableNames);

        // Helper function to process a single failed record
        const processRecord = async (failedRecord) => {
            try {
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
                    TableName: tableNames,
                    Item: failedRecord
                };

                await dynamodb.put(params).promise();

                // Update the status to "success"
                failedRecord.status = "success";
            } catch (err) {
                console.error('Error processing record:', err);
                // Update the status to "fail"
                failedRecord.status = "fail";
            }
        };

        // Create an array of promises to process each record
        const processPromises = get(event, 'Records', []).map(async (record) => {
            if (get(record, 'eventName') === 'INSERT' || get(record, 'eventName') === 'MODIFY') {
                const newImage = AWS.DynamoDB.Converter.unmarshall(get(record, 'dynamodb.NewImage'));

                if (get(newImage, 'failedRecord')) {
                    // Process each failed record individually
                    for (const failedRecord of get(newImage, 'failedRecord', [])) {
                        await processRecord(failedRecord);
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
