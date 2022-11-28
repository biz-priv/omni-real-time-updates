const AWS = require("aws-sdk");
const csv = require("@fast-csv/parse");
const { mapCsvDataToJson } = require("./dataHelper");
const S3 = new AWS.S3();

async function fetchDataFromS3(Bucket, Key, columnsList) {
  return new Promise(async (resolve, reject) => {
    try {
      let item = [];
      const streamGzipFile = S3.getObject({
        Bucket,
        Key,
      }).createReadStream();

      streamGzipFile
        .pipe(csv.parse({ headers: true }))
        .on("data", (data) => {
          if (data == "") {
            index++;
            console.info(`No data from file: ${data}`);
          } else {
            item.push(mapCsvDataToJson(data, columnsList));
          }
        })
        .on("error", function (data) {
          console.error(`Got an error: ${data}`);
          reject(false);
        })
        .on("end", async () => {
          resolve(item);
        });
    } catch (error) {
      console.error("Error while reading data line by line", error);
      reject(false);
    }
  });
}

module.exports = { fetchDataFromS3 };
