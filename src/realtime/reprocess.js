// Import necessary AWS SDK and lodash
const AWS = require('aws-sdk');
const _ = require('lodash');

// Initialize DynamoDB DocumentClient (if needed for further processing)
var dynamodb = new AWS.DynamoDB.DocumentClient();

// Handler function
module.exports.handler = async (event) => {
    try {
        // Extract failed records from the event
        const failedRecords = event.failedRecords;

        // Process each record to replace empty or null fields with "null"
        const processedRecords = await Promise.all(failedRecords.map(async (record) => {
            const processedRecord = await processRecord(record);
            console.log('Processed Record:', JSON.stringify(processedRecord, null, 2));
            return processedRecord;
        }));

        // Log the processed records
        console.log('All Processed Records:', JSON.stringify(processedRecords, null, 2));

        // Return the processed records
        return {
            statusCode: 200,
            body: JSON.stringify(processedRecords),
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal Server Error' }),
        };
    }
};

// Function to process a record
const processRecord = async (record) => {
    // Replace empty or null fields with the string "null"
    return _.mapValues(record, value => {
        if (value === '' || value === null || value === undefined) {
            return 'null';
        }
        return value;
    });
};
