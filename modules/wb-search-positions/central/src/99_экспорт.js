/* Экспорт для тестов в Node. В Apps Script `module` не существует, ветка не выполняется. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    posCfg_: posCfg_, posGroup_: posGroup_, posKey_: posKey_, posRu_: posRu_, posTokenInfo_: posTokenInfo_,
    posJamMerge_: posJamMerge_, posJamCall_: posJamCall_, posJamChunk_: posJamChunk_, posCards_: posCards_,
    posSearchPage_: posSearchPage_, posLocate_: posLocate_, posSearchUrl_: posSearchUrl_,
    posResetSearch_: function () { POS_SEARCH_ORDER = null; POS_SEARCH_FAILS = {}; POS_SEARCH_STATS = { requests: 0, failures: 0, skipped: 0 }; },
    posSearchStats_: function () { return POS_SEARCH_STATS; },
    posReadArticles_: posReadArticles_, posArticlesMark_: posArticlesMark_, posJamAppend_: posJamAppend_, posJamRead_: posJamRead_,
    posQueueBuild_: posQueueBuild_, posQueueRead_: posQueueRead_, posQueueFlush_: posQueueFlush_,
    posPrevPositions_: posPrevPositions_, posShift_: posShift_, posWritePositions_: posWritePositions_,
    posHistoryWrite_: posHistoryWrite_, posLog_: posLog_,
    posStart_: posStart_, posStep_: posStep_, posFinalize_: posFinalize_, posStateLoad_: posStateLoad_,
    posIsActive_: posIsActive_, posIsStale_: posIsStale_,
    posSetT0_: function (t) { POS_T0 = t; },
    posSetPause_: function (ms) { POS_SEARCH_PAUSE_MS = ms; },
    posRunAll: posRunAll, posRunSelected: posRunSelected, posDailyTrigger: posDailyTrigger, continueQueue: continueQueue,
    posInstallDailyTrigger: posInstallDailyTrigger, posRemoveDailyTrigger: posRemoveDailyTrigger, posResetRun: posResetRun,
    upgradeSheets: upgradeSheets, posHelp: posHelp, posStatus: posStatus, posCheckConnection: posCheckConnection,
    POS_HEADER: POS_HEADER, POS_ART_HEADER: POS_ART_HEADER, POS_JAM_HEADER: POS_JAM_HEADER, POS_QUEUE_HEADER: POS_QUEUE_HEADER,
    POS_KEYS_LABELS: POS_KEYS_LABELS, POS_STAGE_BUDGET_MS: POS_STAGE_BUDGET_MS
  };
}
