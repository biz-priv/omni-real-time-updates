const AWS = require("aws-sdk");
const axios = require("axios");
// const moment = require("moment-timezone");
const { queryWithPartitionKey, queryWithIndex, putItem } = require("./dynamo");

const {
  CONSIGNEE_TABLE,
  CONFIRMATION_COST,
  CONSOL_STOP_HEADERS,
  CONSOL_STOP_ITEMS,
  CONFIRMATION_COST_INDEX_KEY_NAME,
  ADDRESS_MAPPING_TABLE,
  ADDRESS_MAPPING_G_API_KEY,
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
      const consolStopHeaders =
        dataSet.consolStopHeaders.length > 0
          ? dataSet.consolStopHeaders[0]
          : {};

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
         * if all below fields are empty of confirmationCost then consignee is customer.
         */
        if (
          confirmationCost.ConAddress1.length === 0 &&
          confirmationCost.ConAddress2.length === 0 &&
          confirmationCost.ConCity.length === 0 &&
          confirmationCost.FK_ConState.length === 0 &&
          confirmationCost.FK_ConCountry.length === 0 &&
          confirmationCost.ConZip.length === 0
        ) {
          payload.cc_con_zip = "1";
          payload.cc_con_address = "1";
        } else {
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
            } else {
              const address1 = `${consignee.ConAddress1}, ${consignee.ConAddress2}, ${consignee.ConCity}, ${consignee.FK_ConState}, ${consignee.FK_ConCountry}, ${consignee.ConZip}`;
              const address2 = `${confirmationCost.ConAddress1}, ${confirmationCost.ConAddress2}, ${confirmationCost.ConCity}, ${confirmationCost.FK_ConState}, ${confirmationCost.FK_ConCountry}, ${confirmationCost.ConZip}`;

              const checkWithGapi = await checkAddressByGoogleApi(
                address1,
                address2
              );
              if (checkWithGapi) {
                payload.cc_con_google_match = "1";
              }
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
            } else {
              const address1 = `${consignee.ConAddress1}, ${consignee.ConAddress2}, ${consignee.ConCity}, ${consignee.FK_ConState}, ${consignee.FK_ConCountry}, ${consignee.ConZip}`;
              const address2 = `${cshEle.ConsolStopAddress1}, ${cshEle.ConsolStopAddress2}, ${cshEle.ConsolStopCity}, ${cshEle.FK_ConsolStopState}, ${cshEle.FK_ConsolStopCountry}, ${cshEle.ConsolStopZip}`;

              const checkWithGapi = await checkAddressByGoogleApi(
                address1,
                address2
              );
              if (checkWithGapi) {
                payload.csh_con_google_match = "1";
              }
            }
          }
        }
      }

      console.log("payload", payload);

      /**
       * fetch data and check for value 1 column
       * only update value 0 columns
       */
      const addressMappingtable = ADDRESS_MAPPING_TABLE;
      const res = await queryWithPartitionKey(addressMappingtable, {
        FK_OrderNo: primaryKeyValue,
      });
      console.log("dynamo:res", res);
      // cc_con_zip: "0",
      //   cc_con_address: "0",
      //   cc_conname: "0",
      //   csh_constopname: "0",
      //   csh_con_zip: "0",
      //   csh_con_address: "0",
      //   cc_con_google_match: "0",
      //   csh_con_google_match: "0",
      // if (res.Items.length > 0) {
      //   const data = res.Items[0];
      //   const newPayload = {
      //     FK_OrderNo: payload.FK_OrderNo,
      //     cc_con_zip: checkValue(data, payload, "cc_con_zip"),
      //     cc_con_address: checkValue(data, payload, "cc_con_address"),
      //     cc_conname: checkValue(data, payload, "cc_conname"),
      //     csh_con_zip: checkValue(data, payload, "csh_con_zip"),
      //     csh_con_address: checkValue(data, payload, "csh_con_address"),
      //     cc_con_google_match: checkValue(data, payload, "cc_con_google_match"),
      //     csh_con_google_match: checkValue(
      //       data,
      //       payload,
      //       "csh_con_google_match"
      //     ),
      //   };
      //   console.log("newPayload", newPayload);
      //   await putItem(addressMappingtable, newPayload);
      // } else {
      await putItem(addressMappingtable, payload);
      // }
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
 */
async function checkAddressByGoogleApi(address1, address2) {
  try {
    const apiKey = ADDRESS_MAPPING_G_API_KEY;
    // console.log("apiKey", apiKey);

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
    // Compare the latitude and longitude of both addresses
    const lat1 = geocode1.data.results[0].geometry.location.lat;
    const lng1 = geocode1.data.results[0].geometry.location.lng;
    const lat2 = geocode2.data.results[0].geometry.location.lat;
    const lng2 = geocode2.data.results[0].geometry.location.lng;
    console.log(lat1);
    console.log(lat2);
    return lat1 === lat2 && lng1 === lng2;
  } catch (error) {
    console.log("checkAddressByGoogleApi:error", error);
    return false;
  }
}

module.exports = {
  triggerAddressMapping,
};
