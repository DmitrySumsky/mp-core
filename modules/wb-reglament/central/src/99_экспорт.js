// Для тестов в Node. В Apps Script `module` не существует — блок не выполняется.
if (typeof module !== 'undefined') {
  module.exports = Object.assign(module.exports || {}, {
    rgTokenInfo_: rgTokenInfo_, rgPickBarcode_: rgPickBarcode_, rgNewCards_: rgNewCards_,
    rgNextAction_: rgNextAction_, rgParseStamp_: rgParseStamp_, rgWindow_: rgWindow_,
    rgCheckConnection: rgCheckConnection, rgAddNewItems: rgAddNewItems, rgStatus: rgStatus,
    rgHelp: rgHelp, upgradeSheets: upgradeSheets, rgInstallTriggers: rgInstallTriggers,
    wbBuildWbDataRows_: wbBuildWbDataRows_, wbBuildSkuRows_: wbBuildSkuRows_
  });
}
