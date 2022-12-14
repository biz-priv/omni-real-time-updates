const referencesTableMapping = [
  "PK_ReferenceNo", // Partition Key
  "FK_OrderNo", // Global Index - Partition Key
  "CustomerType",
  "ReferenceNo",
  "FK_RefTypeId",
  "InsertedTimeStamp", // value manually manually
];

module.exports = referencesTableMapping;
