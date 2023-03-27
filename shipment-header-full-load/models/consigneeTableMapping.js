const consigneeTableMapping = [
  "FK_ConOrderNo", // partition key
  "ConNo",
  "ConAlpha",
  "ConName",
  "ConAddress1",
  "ConAddress2",
  "ConCity",
  "FK_ConState",
  "FK_ConCountry",
  "ConZone",
  "ConZip",
  "ConPhone",
  "ConFax",
  "ConContact",
  "ConRefNo",
  "FK_ConRefTypeId",
  "ConEmail",
  "InsertedTimeStamp", // value manually manually
];

module.exports = consigneeTableMapping;
