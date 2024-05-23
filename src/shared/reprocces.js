// Import necessary AWS SDK and lodash
const AWS = require('aws-sdk');
const _ = require('lodash');

// Initialize DynamoDB DocumentClient (if needed for further processing)
var dynamodb = new AWS.DynamoDB.DocumentClient();

// Handler function
module.exports.handler = async (event) => {
    try {
        // Process each record from DynamoDB Stream event
        const processedRecords = await Promise.all(event.Records.map(async (record) => {
            if (record.eventName === 'INSERT') {
                const newImage = AWS.DynamoDB.Converter.unmarshall(record.dynamodb.NewImage);
                return await processRecord(newImage);
            }
        }));

        // Filter out any undefined results (non-INSERT events)
        const validRecords = processedRecords.filter(record => record !== undefined);

        // Log the processed records
        console.log('Processed Records:', JSON.stringify(validRecords, null, 2));

        // Return the processed records
        return {
            statusCode: 200,
            body: JSON.stringify(validRecords),
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
