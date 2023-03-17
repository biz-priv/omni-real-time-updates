const consolStopItemsTableMapping = [
    "FK_OrderNo",// Partition key
    "FK_ConsolStopId", // Sort Key
    "InsertedTimeStamp", // Adding Manually to DDB	
  ];
  
  module.exports = consolStopItemsTableMapping;
  