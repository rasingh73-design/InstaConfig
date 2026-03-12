/*global QUnit*/

sap.ui.define([
	"com/ec/expressecm/controller/expressecv.controller"
], function (Controller) {
	"use strict";

	QUnit.module("expressecv Controller");

	QUnit.test("I should test the expressecv controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
