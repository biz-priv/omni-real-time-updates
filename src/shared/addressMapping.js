const AWS = require("aws-sdk");
const moment = require("moment-timezone");
const { queryWithPartitionKey, queryWithIndex, putItem } = require("./dynamo");

const {
  SHIPMENT_APAR_TABLE,
  SHIPMENT_HEADER_TABLE,
  SHIPMENT_DESC_TABLE,
  CONSIGNEE_TABLE,
  CONFIRMATION_COST,
  CONSOL_STOP_HEADERS,
  CONSOL_STOP_ITEMS,
  CONFIRMATION_COST_INDEX_KEY_NAME,
} = process.env;
const triggerAddressMapping = async (tableName, event) => {
  try {
    const eventData = event;

    const { tableList, primaryKeyValue } = getTablesAndPrimaryKey(
      tableName,
      eventData.Records[0].dynamodb
    );
    let dataSet = await fetchDataFromTables(tableList, primaryKeyValue);
    console.log("dataSet", JSON.stringify(dataSet));
    dataSet[tableList[tableName].sortName] = [
      AWS.DynamoDB.Converter.unmarshall(eventData.Records[0].dynamodb.NewImage),
    ];
    // const shipmentApar =
    //   dataSet.shipmentApar.length > 0 ? dataSet.shipmentApar[0] : {};
    // const shipmentHeader =
    //   dataSet.shipmentHeader.length > 0 ? dataSet.shipmentHeader[0] : {};
    // const shipmentDesc =
    //   dataSet.shipmentDesc.length > 0 ? dataSet.shipmentDesc[0] : {};
    // const consolStopItems =
    //   dataSet.consolStopItems.length > 0 ? dataSet.consolStopItems[0] : {};

    const consignee = dataSet.consignee.length > 0 ? dataSet.consignee[0] : {};
    const confirmationCost =
      dataSet.confirmationCost.length > 0 ? dataSet.confirmationCost[0] : {};

    const consolStopHeaders =
      dataSet.consolStopHeaders.length > 0 ? dataSet.consolStopHeaders[0] : {};

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

    /**
     * HS or TL
     * cc_con_zip
     */
    console.log("", consignee.ConZip, confirmationCost.ConZip);
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
      confirmationCost.ConName.toLowerCase().startsWith("Omni".toLowerCase()) ||
      confirmationCost.ConName.toLowerCase().startsWith("TEI".toLowerCase())
    ) {
      payload.cc_conname = "1";
    }

    /**
     * MT
     * csh_con_zip
     */
    if (
      consolStopHeaders.ConsolStopPickupOrDelivery === "true" &&
      consignee.ConZip == consolStopHeaders.ConZip
    ) {
      payload.csh_con_zip = "1";
    }

    /**
     * MT
     * csh_con_address
     */
    if (
      consolStopHeaders.ConsolStopPickupOrDelivery === "true" &&
      consignee.ConAddress1 == consolStopHeaders.ConAddress1 &&
      consignee.ConAddress2 == consolStopHeaders.ConAddress2 &&
      consignee.ConCity == consolStopHeaders.ConCity &&
      consignee.FK_ConState == consolStopHeaders.FK_ConState &&
      consignee.FK_ConCountry == consolStopHeaders.FK_ConCountry &&
      consignee.ConZip == consolStopHeaders.ConZip
    ) {
      payload.csh_con_address = "1";
    }

    console.log("payload", payload);
    /**
     * fetch data and check for value 1 column
     * only update value 0 columns
     */
    const addressMappingtable = "omni-wt-address-mapping-" + process.env.STAGE;
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
function getTablesAndPrimaryKey(tableName, dynamoData) {
  try {
    const tableList = {
      [SHIPMENT_APAR_TABLE]: {
        PK: "FK_OrderNo",
        SK: "SeqNo",
        sortName: "shipmentApar",
        type: "PRIMARY_KEY",
      },
      [SHIPMENT_HEADER_TABLE]: {
        PK: "PK_OrderNo",
        SK: "",
        sortName: "shipmentHeader",
        type: "PRIMARY_KEY",
      },
      [SHIPMENT_DESC_TABLE]: {
        PK: "FK_OrderNo",
        SK: "SeqNo",
        sortName: "shipmentDesc",
        type: "PRIMARY_KEY",
      },
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

    const data = tableList[tableName];
    const primaryKeyValue =
      data.type === "INDEX"
        ? dynamoData.NewImage[data.indexKeyColumnName].S
        : dynamoData.Keys[data.PK].S;

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
      consolStopHeaderData = [...consolStopHeaderData, ...data.Items];
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
