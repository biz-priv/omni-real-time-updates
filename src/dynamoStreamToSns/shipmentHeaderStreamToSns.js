const AWS = require("aws-sdk");
const batch = new AWS.Batch({ apiVersion: "2016-08-10" });

module.exports.handler = async (event, context, callback) => {
  console.info("event", event);
  return {};
};
