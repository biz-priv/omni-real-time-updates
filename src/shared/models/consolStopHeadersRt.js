const consolStopHeadersTableMapping = [
    "PK_ConsolStopId", // Partition Key
    "ConsolDeliveryAgent",
    "ConsolPreventStatusUpdates",
    "ConsolStopAddress1",
    "ConsolStopAddress2",
    "ConsolStopArea",
    "ConsolStopCity",
    "ConsolStopContact",
    "ConsolStopCustomerVendorLookupData",
    "ConsolStopCustomerVendorLookupState",
    "ConsolStopDate",
    "ConsolStopEmail",
    "ConsolStopETADateTime",
    "ConsolStopFax",
    "ConsolStopName",
    "ConsolStopNotes",
    "ConsolStopNumber",
    "ConsolStopPhone",
    "ConsolStopPickupOrDelivery",
    "ConsolStopTimeBegin",
    "ConsolStopTimeEnd",
    "ConsolStopZip",
    "FK_ConsolNo",
    "FK_ConsolStopAirport",
    "FK_ConsolStopCountry",
    "FK_ConsolStopState",
    "InsertedTimeStamp", // Adding Manually to DDB
];

module.exports = consolStopHeadersTableMapping;