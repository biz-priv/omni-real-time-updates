const AWS = require("aws-sdk");
const axios = require("axios");
// const moment = require("moment-timezone");
const { queryWithPartitionKey, queryWithIndex, putItem } = require("./dynamo");
const { sendSNSMessage } = require("./errorNotificationHelper");
const ddb = new AWS.DynamoDB.DocumentClient({
  region: process.env.REGION,
});

const {
  CONSIGNEE_TABLE,
  CONFIRMATION_COST,
  CONSOL_STOP_HEADERS,
  CONSOL_STOP_ITEMS,
  CONFIRMATION_COST_INDEX_KEY_NAME,
  ADDRESS_MAPPING_TABLE,
  ADDRESS_MAPPING_G_API_KEY,
  SHIPMENT_APAR_TABLE,
  IVIA_VENDOR_ID,
  SHIPMENT_HEADER_TABLE,
} = process.env;

const triggerAddressMapping = async (tableName, event) => {
  try {
    const eventData = event;

    const { tableList, pkv } = await getTablesAndPrimaryKey(
      tableName,
      eventData.Records[0].dynamodb
    );

    for (let index = 0; index < pkv.length; index++) {
      const primaryKeyValue = pkv[index];

      let dataSet = await fetchDataFromTables(tableList, primaryKeyValue);
      console.log("dataSet", JSON.stringify(dataSet));

      const consignee =
        dataSet.consignee.length > 0 ? dataSet.consignee[0] : {};

      const filteredconfirmationCost = dataSet.confirmationCost.filter(
        (e) => e.ConZip === consignee.ConZip
      );

      const confirmationCost =
        filteredconfirmationCost.length > 0 ? filteredconfirmationCost[0] : {};

      const payload = {
        FK_OrderNo: primaryKeyValue,
        cc_con_zip: "0",
        cc_con_address: "0",
        cc_conname: "0",
        csh_constopname: "0",
        csh_con_zip: "0",
        csh_con_address: "0",
        cc_con_google_match: "0",
        csh_con_google_match: "0",
      };

      /**
       * HS or TL
       * cc_conname
       */
      if (
        dataSet.confirmationCost?.[0]?.ConName?.toLowerCase().startsWith(
          "OMNI".toLowerCase()
        ) ||
        dataSet.confirmationCost?.[0]?.ConName?.toLowerCase().startsWith(
          "TEI".toLowerCase()
        )
      ) {
        payload.cc_conname = "1";
      }

      if (
        consignee.hasOwnProperty("ConZip") &&
        confirmationCost.hasOwnProperty("ConZip")
      ) {
        /**
         * HS or TL
         * cc_con_zip
         */
        if (consignee.ConZip === confirmationCost.ConZip) {
          payload.cc_con_zip = "1";

          /**
           * HS or TL
           * cc_con_address
           */
          if (
            consignee.ConAddress1 == confirmationCost.ConAddress1 &&
            consignee.ConAddress2 == confirmationCost.ConAddress2 &&
            consignee.ConCity == confirmationCost.ConCity &&
            consignee.FK_ConState == confirmationCost.FK_ConState &&
            consignee.FK_ConCountry == confirmationCost.FK_ConCountry
          ) {
            payload.cc_con_address = "1";
          } else if (dataSet.shipmentApar.length > 0) {
            //check if we have data on shipmentApar table with  IVIA vendor T19262
            const address1 = `${consignee.ConAddress1}, ${consignee.ConAddress2}, ${consignee.ConCity}, ${consignee.FK_ConState}, ${consignee.FK_ConCountry}, ${consignee.ConZip}`;
            const address2 = `${confirmationCost.ConAddress1}, ${confirmationCost.ConAddress2}, ${confirmationCost.ConCity}, ${confirmationCost.FK_ConState}, ${confirmationCost.FK_ConCountry}, ${confirmationCost.ConZip}`;
            const { checkWithGapi, partialCheckWithGapi } =
              await checkAddressByGoogleApi(address1, address2, dataSet);
            if (checkWithGapi) {
              payload.cc_con_google_match = "1";
            } else if (partialCheckWithGapi) {
              payload.cc_con_google_match = "2";
            }
          }
        }
      }

      for (let index = 0; index < dataSet.consolStopHeaders.length; index++) {
        const cshEle = dataSet.consolStopHeaders[index];
        /**
         * MT
         * csh_constopname
         */
        if (
          cshEle?.ConsolStopName?.toLowerCase().startsWith(
            "OMNI".toLowerCase()
          ) ||
          cshEle?.ConsolStopName?.toLowerCase().startsWith("TEI".toLowerCase())
        ) {
          payload.csh_constopname = "1";
        }
        if (
          consignee.hasOwnProperty("ConZip") &&
          cshEle.hasOwnProperty("ConsolStopZip") &&
          cshEle.ConsolStopPickupOrDelivery === "true"
        ) {
          /**
           * MT
           * csh_con_zip
           */
          if (consignee.ConZip == cshEle.ConsolStopZip) {
            payload.csh_con_zip = "1";
            /**
             * MT
             * csh_con_address
             */
            if (
              consignee.ConAddress1 == cshEle.ConsolStopAddress1 &&
              consignee.ConAddress2 == cshEle.ConsolStopAddress2 &&
              consignee.ConCity == cshEle.ConsolStopCity &&
              consignee.FK_ConState == cshEle.FK_ConsolStopState &&
              consignee.FK_ConCountry == cshEle.FK_ConsolStopCountry
            ) {
              payload.csh_con_address = "1";
            } else if (dataSet.shipmentApar.length > 0) {
              //check if we have data on shipmentApar table with  IVIA vendor T19262
              const address1 = `${consignee.ConAddress1}, ${consignee.ConAddress2}, ${consignee.ConCity}, ${consignee.FK_ConState}, ${consignee.FK_ConCountry}, ${consignee.ConZip}`;
              const address2 = `${cshEle.ConsolStopAddress1}, ${cshEle.ConsolStopAddress2}, ${cshEle.ConsolStopCity}, ${cshEle.FK_ConsolStopState}, ${cshEle.FK_ConsolStopCountry}, ${cshEle.ConsolStopZip}`;

              const { checkWithGapi, partialCheckWithGapi } =
                await checkAddressByGoogleApi(address1, address2, dataSet);
              if (checkWithGapi) {
                payload.csh_con_google_match = "1";
              } else if (partialCheckWithGapi) {
                payload.csh_con_google_match = "2";
              }
            }
          }
        }
      }

      /**
       * if all below fields are empty of confirmationCost then consignee is customer.
       */
      if (
        payload.csh_con_zip != "1" &&
        payload.csh_con_google_match != "1" &&
        dataSet.shipmentApar.length > 0 &&
        ["HS", "TL"].includes(dataSet.shipmentApar[0].FK_ServiceId) &&
        (!confirmationCost.hasOwnProperty("ConZip") ||
          (confirmationCost.ConAddress1.length === 0 &&
            confirmationCost.ConAddress2.length === 0 &&
            confirmationCost.ConCity.length === 0 &&
            confirmationCost.FK_ConState.length === 0 &&
            confirmationCost.FK_ConCountry.length === 0 &&
            confirmationCost.ConZip.length === 0))
      ) {
        payload.cc_con_zip = "1";
        payload.cc_con_address = "1";
      }

      console.log("payload**", payload);
      await putItem(ADDRESS_MAPPING_TABLE, payload);
    }
  } catch (error) {
    console.log("error:triggerAddressMapping", error);
  }
};

/**
 * check Value if 1 then don't change
 * @param {*} ddbData
 * @param {*} payload
 * @param {*} fieldName
 * @returns
 */
function checkValue(ddbData, payload, fieldName) {
  return ddbData?.[fieldName] == "1" ? ddbData[fieldName] : payload[fieldName];
}

/**
 * getTablesAndPrimaryKey
 * @param {*} tableName
 * @param {*} dynamoData
 * @returns
 */
async function getTablesAndPrimaryKey(tableName, dynamoData) {
  try {
    const tableList = {
      [CONSIGNEE_TABLE]: {
        PK: "FK_ConOrderNo",
        SK: "",
        sortName: "consignee",
        type: "PRIMARY_KEY",
      },
      [CONFIRMATION_COST]: {
        PK: "PK_ConfirmationNo",
        SK: "FK_OrderNo",
        sortName: "confirmationCost",
        indexKeyColumnName: "FK_OrderNo",
        indexKeyName: CONFIRMATION_COST_INDEX_KEY_NAME, //omni-wt-confirmation-cost-orderNo-index-{stage}
        type: "INDEX",
      },
      [CONSOL_STOP_ITEMS]: {
        PK: "FK_OrderNo",
        SK: "FK_ConsolStopId",
        sortName: "consolStopItems",
        type: "PRIMARY_KEY",
      },
    };

    /**
     * event from consol stop items
     */
    let primaryKeyValue;

    if (CONSOL_STOP_HEADERS === tableName) {
      const consolStopItemData = await queryWithIndex(
        CONSOL_STOP_ITEMS,
        "FK_ConsolStopId-index",
        {
          FK_ConsolStopId: dynamoData.Keys["PK_ConsolStopId"].S,
        }
      );
      if (consolStopItemData.Items.length > 1) {
        primaryKeyValue = consolStopItemData.Items.map((e) => e.FK_OrderNo);
      } else if (consolStopItemData.Items.length === 1) {
        primaryKeyValue = [consolStopItemData.Items[0].FK_OrderNo];
      } else {
        primaryKeyValue = [""];
      }
    } else {
      const data = tableList[tableName];
      primaryKeyValue =
        data.type === "INDEX"
          ? dynamoData.NewImage[data.indexKeyColumnName].S
          : dynamoData.Keys[data.PK].S;

      primaryKeyValue = [primaryKeyValue];
    }

    return { tableList, pkv: primaryKeyValue };
  } catch (error) {
    console.info("error:unable to select table", error);
    console.info("tableName", tableName);
    throw error;
  }
}

/**
 * fetchDataFromTables
 * @param {*} tableList
 * @param {*} primaryKeyValue
 * @returns
 */
async function fetchDataFromTables(tableList, primaryKeyValue) {
  try {
    const data = await Promise.all(
      Object.keys(tableList).map(async (e) => {
        const tableName = e;
        const ele = tableList[tableName];
        let data = [];

        if (ele.type === "INDEX") {
          data = await queryWithIndex(tableName, ele.indexKeyName, {
            [ele.indexKeyColumnName]: primaryKeyValue,
          });
        } else {
          data = await queryWithPartitionKey(tableName, {
            [ele.PK]: primaryKeyValue,
          });
        }

        return { [ele.sortName]: data.Items };
      })
    );
    const newObj = {};
    data.map((e) => {
      const objKey = Object.keys(e)[0];
      newObj[objKey] = e[objKey];
    });

    //fetch consolStopHeaders
    let consolStopHeaderData = [];
    for (let index = 0; index < newObj.consolStopItems.length; index++) {
      const element = newObj.consolStopItems[index];
      const data = await queryWithPartitionKey(CONSOL_STOP_HEADERS, {
        PK_ConsolStopId: element.FK_ConsolStopId,
      });
      consolStopHeaderData = [
        ...consolStopHeaderData,
        ...data.Items.filter((e) => e.ConsolStopPickupOrDelivery === "true"),
      ];
    }
    newObj["consolStopHeaders"] = consolStopHeaderData;

    /**
     * get data from shipmentAPAR table based on IVIA vendor.
     */
    const sapparams = {
      TableName: SHIPMENT_APAR_TABLE,
      KeyConditionExpression: "FK_OrderNo = :FK_OrderNo and SeqNo < :SeqNo",
      FilterExpression: "FK_VendorId IN (:FK_VendorId1, :FK_VendorId2)",
      ExpressionAttributeValues: {
        ":FK_VendorId1": IVIA_VENDOR_ID.toString(),
        ":FK_VendorId2": 'LIVELOGI',
        ":SeqNo": "9999",
        ":FK_OrderNo": primaryKeyValue.toString(),
      },
    };

    const shipmentApar = await ddb.query(sapparams).promise();
    console.log("shipmentApar.Items", shipmentApar.Items);
    newObj["shipmentApar"] = shipmentApar.Items;

    /**
     * get data from shipment-header table based on IVIA vendor.
     */
    const shParam = {
      TableName: SHIPMENT_HEADER_TABLE,
      KeyConditionExpression: "PK_OrderNo = :PK_OrderNo",
      ExpressionAttributeValues: {
        ":PK_OrderNo": primaryKeyValue.toString(),
      },
    };

    const shipmentHeader = await ddb.query(shParam).promise();
    console.log("shipmentHeader.Items", shipmentHeader.Items);
    newObj["shipmentHeader"] = shipmentHeader.Items;
    return newObj;
  } catch (error) {
    console.log("error:fetchDataFromTables", error);
  }
}

/**
 * check address by google api
 * @param {*} address1
 * @param {*} address2
 * @returns
 * NOTE:- need a ssm parameter for google api url
 */
async function checkAddressByGoogleApi(address1, address2, dataset) {
  let checkWithGapi = false,
    partialCheckWithGapi = false;

  try {
    const apiKey = ADDRESS_MAPPING_G_API_KEY;

    // Get geocode data for address1
    const geocode1 = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address1
      )}&key=${apiKey}`
    );
    console.log("geocode1", geocode1);
    if (geocode1.data.status !== "OK") {
      throw new Error(`Unable to geocode ${address1}`);
    }
    // Get geocode data for address2
    const geocode2 = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address2
      )}&key=${apiKey}`
    );
    console.log("geocode2", geocode2);
    if (geocode2.data.status !== "OK") {
      throw new Error(`Unable to geocode ${address2}`);
    }
    console.log("geocode1", JSON.stringify(geocode1.data.results));
    console.log("geocode2", JSON.stringify(geocode2.data.results));

    const adType1 = geocode1.data?.results?.[0]?.geometry?.location_type;
    const adType2 = geocode2.data?.results?.[0]?.geometry?.location_type;
    /**
     * check if distance is under 50 meters
     */
    if (adType1 == "ROOFTOP" && adType2 == "ROOFTOP") {
      const coords1 = geocode1.data?.results?.[0]?.geometry?.location;
      const coords2 = geocode2.data?.results?.[0]?.geometry?.location;

      // Calculate the distance between the coordinates (in meters)
      checkWithGapi = getDistance(coords1, coords2);
    } else {
      partialCheckWithGapi = true;

      const housebill =
        dataset.shipmentHeader.length > 0
          ? dataset.shipmentHeader[0]?.Housebill
          : "";

      const payload = {
        errorMsg: `Unable to locate address.  Please correct in worldtrak for Housebill - "${housebill}" | `,
        FK_OrderNo: dataset.shipmentApar[0].FK_OrderNo,
        Housebill: housebill,
      };
      let addressArr = [];
      if (adType1 != "ROOFTOP") {
        addressArr = [...addressArr, address1];
      }
      if (adType2 != "ROOFTOP") {
        addressArr = [...addressArr, address2];
      }
      payload.errorMsg =
        payload.errorMsg + " " + addressArr.join(" \nand ") + ".";

      payload.errorAddress = addressArr.join(" \nand ");

      console.log("payloadSNS", payload);

      /**
       * send notification
       */
      await sendSNSMessage(payload);
    }

    return { checkWithGapi, partialCheckWithGapi };
  } catch (error) {
    console.log("checkAddressByGoogleApi:error", error);
    return { checkWithGapi, partialCheckWithGapi };
  }
}

function getDistance(coords1, coords2) {
  try {
    const earthRadius = 6371000; // Radius of the earth in meters
    const lat1 = toRadians(coords1.lat);
    const lat2 = toRadians(coords2.lat);
    const deltaLat = toRadians(coords2.lat - coords1.lat);
    const deltaLng = toRadians(coords2.lng - coords1.lng);

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = earthRadius * c;
    return distance <= 50;
  } catch (error) {
    console.log("error:getDistance", error);
    return false;
  }
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

module.exports = {
  triggerAddressMapping,
};
