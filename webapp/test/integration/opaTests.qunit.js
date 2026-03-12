/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["com/ec/expressecm/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
