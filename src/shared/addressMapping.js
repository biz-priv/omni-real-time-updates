const AWS = require("aws-sdk");
const moment = require("moment-timezone");
const { queryWithPartitionKey, queryWithIndex, putItem } = require("./dynamo");

const {
  CONSIGNEE_TABLE,
  CONFIRMATION_COST,
  CONSOL_STOP_HEADERS,
  CONSOL_STOP_ITEMS,
  CONFIRMATION_COST_INDEX_KEY_NAME,
  ADDRESS_MAPPING_TABLE,
} = process.env;
const triggerAddressMapping = async (tableName, event) => {
  try {
    const eventData = event;

    const { tableList, primaryKeyValue } = await getTablesAndPrimaryKey(
      tableName,
      eventData.Records[0].dynamodb
    );

    let dataSet = await fetchDataFromTables(tableList, primaryKeyValue);
    console.log("dataSet", JSON.stringify(dataSet));

    const consignee = dataSet.consignee.length > 0 ? dataSet.consignee[0] : {};
    const consolStopHeaders =
      dataSet.consolStopHeaders.length > 0 ? dataSet.consolStopHeaders[0] : {};

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
      csh_con_zip: "0",
      csh_con_address: "0",
      cc_con_google_match: "--",
      //   InsertedTimeStamp: moment
      //     .tz("America/Chicago")
      //     .format("YYYY:MM:DD HH:mm:ss")
      //     .toString(),
    };

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
      }

      /**
       * HS or TL
       * cc_con_address
       */
      if (
        consignee.ConAddress1 == confirmationCost.ConAddress1 &&
        consignee.ConAddress2 == confirmationCost.ConAddress2 &&
        consignee.ConCity == confirmationCost.ConCity &&
        consignee.FK_ConState == confirmationCost.FK_ConState &&
        consignee.FK_ConCountry == confirmationCost.FK_ConCountry &&
        consignee.ConZip == confirmationCost.ConZip
      ) {
        payload.cc_con_address = "1";
      }

      /**
       * HS or TL
       * cc_conname
       */
      if (
        confirmationCost?.ConName?.toLowerCase().startsWith(
          "Omni".toLowerCase()
        ) ||
        confirmationCost?.ConName?.toLowerCase().startsWith("TEI".toLowerCase())
      ) {
        payload.cc_conname = "1";
      }
    }

    if (
      consignee.hasOwnProperty("ConZip") &&
      consolStopHeaders.hasOwnProperty("ConsolStopZip")
    ) {
      /**
       * MT
       * csh_con_zip
       */
      if (
        consolStopHeaders.ConsolStopPickupOrDelivery === "true" &&
        consolStopHeaders.ConsolStopZip === consignee.ConZip
      ) {
        payload.csh_con_zip = "1";
      }

      /**
       * MT
       * csh_con_address
       */
      if (
        consolStopHeaders.ConsolStopPickupOrDelivery === "true" &&
        consignee.ConAddress1 == consolStopHeaders.ConsolStopAddress1 &&
        consignee.ConAddress2 == consolStopHeaders.ConsolStopAddress2 &&
        consignee.ConCity == consolStopHeaders.ConsolStopCity &&
        consignee.FK_ConState == consolStopHeaders.FK_ConsolStopState &&
        consignee.FK_ConCountry == consolStopHeaders.FK_ConsolStopCountry &&
        consignee.ConZip == consolStopHeaders.ConsolStopZip
      ) {
        payload.csh_con_address = "1";
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
    if (res.Items.length > 0) {
      const data = res.Items[0];
      const newPayload = {
        FK_OrderNo: payload.FK_OrderNo,
        cc_con_zip: checkValue(data, payload, "cc_con_zip"),
        cc_con_address: checkValue(data, payload, "cc_con_address"),
        cc_conname: checkValue(data, payload, "cc_conname"),
        csh_con_zip: checkValue(data, payload, "csh_con_zip"),
        csh_con_address: checkValue(data, payload, "csh_con_address"),
        cc_con_google_match: "--",
      };
      console.log("newPayload", newPayload);
      await putItem(addressMappingtable, newPayload);
    } else {
      await putItem(addressMappingtable, payload);
    }
  } catch (error) {
    console.log("error:triggerAddressMapping", error);
  }
};

/**
 * checkValue
 * @param {*} ddbData
 * @param {*} payload
 * @param {*} fieldName
 * @returns
 */
function checkValue(ddbData, payload, fieldName) {
  return ddbData[fieldName] == "1" ? ddbData[fieldName] : payload[fieldName];
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
      primaryKeyValue =
        consolStopItemData.Items.length > 0
          ? consolStopItemData.Items[0].FK_OrderNo
          : "";
    } else {
      const data = tableList[tableName];
      primaryKeyValue =
        data.type === "INDEX"
          ? dynamoData.NewImage[data.indexKeyColumnName].S
          : dynamoData.Keys[data.PK].S;
    }

    return { tableList, primaryKeyValue };
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

module.exports = {
  triggerAddressMapping,
};
