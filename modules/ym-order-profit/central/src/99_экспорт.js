/* Экспорт для тестов в Node. В Apps Script `module` не существует, ветка не выполняется. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    YOP: YOP, YOP_SH: YOP_SH, YOP_DAYS_HEAD: YOP_DAYS_HEAD, YOP_DETAIL_HEAD: YOP_DETAIL_HEAD, YOP_UNIT_HEAD: YOP_UNIT_HEAD,
    yopAddDays_: yopAddDays_, yopItems_: yopItems_, yopForecast_: yopForecast_, yopCoefficients_: yopCoefficients_,
    yopFactDay_: yopFactDay_, yopUnitRows_: yopUnitRows_, yopBidNow_: yopBidNow_, yopCogsOf_: yopCogsOf_, yopSkuNorm_: yopSkuNorm_, yopTariffs_: yopTariffs_, yopFilterTake_: yopFilterTake_, yopFilterPut_: yopFilterPut_, yopUnitCalc_: yopUnitCalc_, yopManualTariff_: yopManualTariff_,
    yopSettings_: yopSettings_, yopKeys_: yopKeys_, yopCogs_: yopCogs_, yopCogsValues_: yopCogsValues_, yopCogsFormula_: yopCogsFormula_,
    yopAddServices_: yopAddServices_, yopOrderRecord_: yopOrderRecord_, yopCollectCabinet_: yopCollectCabinet_,
    yopCollectUnitData_: yopCollectUnitData_, yopWriteDay_: yopWriteDay_, yopWriteUnit_: yopWriteUnit_,
    yopRebuildDays_: yopRebuildDays_, yopUpdateFacts_: yopUpdateFacts_, yopNextAction_: yopNextAction_,
    yopRunYesterday: yopRunYesterday, yopRefreshUnit: yopRefreshUnit, yopDailyTrigger: yopDailyTrigger, continueQueue: continueQueue,
    yopRecalcSheets: yopRecalcSheets, yopRebuildHistory: yopRebuildHistory, yopResetRun: yopResetRun,
    yopTriggerOn: yopTriggerOn, yopTriggerOff: yopTriggerOff,
    yopUndoServiceDay_: yopUndoServiceDay_, yopSvcDaysToFetch_: yopSvcDaysToFetch_, yopCollectServices_: yopCollectServices_,
    yopUpdateDayCosts_: yopUpdateDayCosts_, yopForecastAll_: yopForecastAll_, yopCol_: yopCol_,
    yopFx_: yopFx_, yopSepReset_: function () { YOP_SEP_ = null; },
    yopHelp: yopHelp, yopStatus: yopStatus, yopCheckConnection: yopCheckConnection, upgradeSheets: upgradeSheets
  };
}