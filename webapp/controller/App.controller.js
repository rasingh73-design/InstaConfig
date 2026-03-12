sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/StandardListItem"
], function (Controller, JSONModel, MessageToast, MessageBox, StandardListItem) {
    "use strict";

    return Controller.extend("com.ec.expressecm.controller.App", {
        _workbook: null,
        _sheets: [],
        _endpoints: null,
        _uploadQueue: [],
        _results: [],
        _failedRecords: [],
        _totalRecords: 0,
        _processedRecords: 0,
        _currentEntityIndex: 0,
        _currentStep: 1,
        _csrfToken: null,
        _baseUrl: "/odata/v2",
        _batchSize: 50,

        onInit: function () {
            var that = this;
            
            this.getView().setModel(new JSONModel({ fields: [] }), "currentRecordModel");
            this.getView().setModel(new JSONModel({ results: [] }), "resultsModel");
            this.getView().setModel(new JSONModel({ errors: [] }), "errorsModel");

            fetch("./model/endpoints.json")
                .then(function(response) { return response.json(); })
                .then(function(data) {
                    that._endpoints = data;
                    that._log("Endpoints loaded: " + Object.keys(data).length + " mappings");
                })
                .catch(function(err) {
                    that._log("ERROR: Failed to load endpoints");
                });

            this._loadXLSXLibrary();
        },

        _loadXLSXLibrary: function() {
            var that = this;
            if (typeof XLSX === "undefined") {
                var script = document.createElement("script");
                script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
                script.onload = function() {
                    that._log("XLSX library ready");
                };
                document.head.appendChild(script);
            }
        },

        // ===== CSRF TOKEN HANDLING =====
        _fetchCsrfToken: function() {
            var that = this;
            
            return new Promise(function(resolve) {
                fetch(that._baseUrl + "/User?$top=1&$format=json", {
                    method: "GET",
                    headers: {
                        "X-CSRF-Token": "Fetch",
                        "Accept": "application/json"
                    },
                    credentials: "include"
                })
                .then(function(response) {
                    that._csrfToken = response.headers.get("X-CSRF-Token");
                    if (that._csrfToken) {
                        that._log("CSRF Token obtained");
                    } else {
                        that._log("No CSRF token - proceeding anyway");
                    }
                    resolve(that._csrfToken);
                })
                .catch(function(err) {
                    that._log("CSRF fetch error: " + err.message);
                    resolve(null);
                });
            });
        },

        // ===== STEP TRANSITIONS =====
        _showStep: function(stepNum) {
            var that = this;
            var currentCard = this.byId("step" + this._currentStep + "Card");
            var nextCard = this.byId("step" + stepNum + "Card");

            if (currentCard && currentCard.getVisible()) {
                currentCard.addStyleClass("fadeOut");
                setTimeout(function() {
                    currentCard.setVisible(false);
                    currentCard.removeStyleClass("fadeOut");
                    nextCard.addStyleClass("fadeIn");
                    nextCard.setVisible(true);
                    that._currentStep = stepNum;
                }, 300);
            } else {
                nextCard.addStyleClass("fadeIn");
                nextCard.setVisible(true);
                this._currentStep = stepNum;
            }
        },

        onBackToStep1: function() { this._showStep(1); },
        onBackToStep2: function() { this._showStep(2); },

        onGoToStep3: function() {
            var aSelectedItems = this.byId("sheetsList").getSelectedItems();
            if (aSelectedItems.length === 0) {
                MessageToast.show("Please select at least one sheet");
                return;
            }
            this._showStep(3);
        },

        // ===== FILE HANDLING =====
        onFileChange: function (oEvent) {
            var sFileName = oEvent.getParameter("newValue");
            this.byId("parseBtn").setEnabled(!!sFileName);
            if (sFileName) this._log("File: " + sFileName);
        },

        onParseWorkbook: function () {
            var that = this;
            var oFileUploader = this.byId("fileUploader");
            var oDomRef = oFileUploader.getDomRef();
            var oFileInput = oDomRef.querySelector("input[type='file']");
            
            if (!oFileInput || !oFileInput.files || !oFileInput.files.length) {
                MessageToast.show("Please select a file first");
                return;
            }

            var oFile = oFileInput.files[0];
            var oReader = new FileReader();
            this._log("Parsing: " + oFile.name);

            oReader.onload = function (e) {
                try {
                    var data = new Uint8Array(e.target.result);
                    that._workbook = XLSX.read(data, { type: "array" });
                    that._parseSheets();
                    that._showStep(2);
                    MessageToast.show("Parsed " + that._sheets.length + " sheets");
                } catch (err) {
                    MessageBox.error("Parse error: " + err.message);
                }
            };
            oReader.readAsArrayBuffer(oFile);
        },

        _parseSheets: function () {
            var that = this;
            this._sheets = [];
            var oList = this.byId("sheetsList");
            oList.removeAllItems();

            this._workbook.SheetNames.forEach(function (sheetName) {
                var sheetNameLower = sheetName.toLowerCase().replace(/[\s_-]/g, "").replace(/sheet#?/g, "");
                if (sheetNameLower.indexOf("cover") !== -1) return;

                var endpoint = that._findEndpoint(sheetNameLower);
                var recordCount = that._getRecordCount(sheetName);
                var fields = that._getFields(sheetName);

                var sheetInfo = {
                    sheetName: sheetName,
                    entity: endpoint ? endpoint.entity : "Unknown",
                    endpoint: endpoint,
                    recordCount: recordCount,
                    fields: fields
                };
                that._sheets.push(sheetInfo);

                var oItem = new StandardListItem({
                    title: sheetName,
                    description: (endpoint ? endpoint.entity : "No mapping") + " • " + fields.length + " fields",
                    info: recordCount + " rows",
                    infoState: endpoint && recordCount > 0 ? "Success" : "Warning",
                    selected: endpoint !== null && recordCount > 0
                });
                oItem.data("sheetInfo", sheetInfo);
                oList.addItem(oItem);
            });
            this._log("Found " + this._sheets.length + " sheets");
        },

        _findEndpoint: function (sheetNameLower) {
            if (!this._endpoints) return null;
            if (this._endpoints[sheetNameLower]) return this._endpoints[sheetNameLower];
            for (var key in this._endpoints) {
                if (sheetNameLower.indexOf(key) !== -1 || key.indexOf(sheetNameLower) !== -1) {
                    return this._endpoints[key];
                }
            }
            return null;
        },

        _getFields: function (sheetName) {
            var worksheet = this._workbook.Sheets[sheetName];
            if (!worksheet) return [];
            var fields = [];
            var range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
            for (var col = 1; col <= range.e.c; col++) {
                var cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: col })];
                if (cell && cell.v) fields.push(String(cell.v));
            }
            return fields;
        },

        _getRecordCount: function (sheetName) {
            var worksheet = this._workbook.Sheets[sheetName];
            if (!worksheet) return 0;
            var range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
            return Math.max(0, range.e.r - 2);
        },

        _getRecords: function (sheetName) {
            var worksheet = this._workbook.Sheets[sheetName];
            if (!worksheet) return [];
            var fields = this._getFields(sheetName);
            var records = [];
            var range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");

            for (var row = 2; row <= range.e.r; row++) {
                var record = { __rowNum: row + 1 };
                var hasData = false;
                for (var col = 1; col <= range.e.c && (col - 1) < fields.length; col++) {
                    var cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
                    if (cell && cell.v !== undefined && cell.v !== "") {
                        record[fields[col - 1]] = cell.v;
                        hasData = true;
                    }
                }
                if (hasData) records.push(record);
            }
            return records;
        },

        onSelectAll: function () {
            this.byId("sheetsList").getItems().forEach(function (item) { item.setSelected(true); });
        },
        onDeselectAll: function () {
            this.byId("sheetsList").getItems().forEach(function (item) { item.setSelected(false); });
        },

        // ===== BATCH UPLOAD =====
        onStartUpload: function () {
            var that = this;
            var aSelectedItems = this.byId("sheetsList").getSelectedItems();

            this._uploadQueue = [];
            this._results = [];
            this._failedRecords = [];
            this._totalRecords = 0;
            this._processedRecords = 0;
            this._batchSize = parseInt(this.byId("batchSizeInput").getValue()) || 50;

            aSelectedItems.forEach(function (item) {
                var sheetInfo = item.data("sheetInfo");
                if (sheetInfo && sheetInfo.endpoint) {
                    var records = that._getRecords(sheetInfo.sheetName);
                    that._uploadQueue.push({
                        sheetName: sheetInfo.sheetName,
                        entity: sheetInfo.endpoint.entity,
                        description: sheetInfo.endpoint.description,
                        fields: sheetInfo.fields,
                        records: records
                    });
                    that._totalRecords += records.length;
                }
            });

            if (this._uploadQueue.length === 0) {
                MessageToast.show("No valid sheets selected");
                return;
            }

            this._showStep(4);
            this._log("Starting batch upload: " + this._uploadQueue.length + " entities, " + this._totalRecords + " records");
            this._log("Batch size: " + this._batchSize);

            this._fetchCsrfToken().then(function() {
                that._currentEntityIndex = 0;
                that._processNextEntity();
            });
        },

        _processNextEntity: function () {
            var that = this;

            if (this._currentEntityIndex >= this._uploadQueue.length) {
                this._uploadComplete();
                return;
            }

            var entityData = this._uploadQueue[this._currentEntityIndex];
            this._updateProgress(entityData.entity);
            this._log("→ " + entityData.entity + " (" + entityData.records.length + " records)");

            this._uploadEntityBatch(entityData).then(function (result) {
                that._results.push(result);
                that._currentEntityIndex++;
                that._processNextEntity();
            });
        },

        _uploadEntityBatch: function (entityData) {
            var that = this;

            return new Promise(function (resolve) {
                var successCount = 0;
                var failedCount = 0;
                var entityErrors = [];
                var batchIndex = 0;
                var batches = that._createBatches(entityData.records, that._batchSize);

                function processBatch() {
                    if (batchIndex >= batches.length) {
                        resolve({
                            entity: entityData.entity,
                            total: entityData.records.length,
                            success: successCount,
                            failed: failedCount,
                            errors: entityErrors,
                            status: failedCount === 0 ? "Success" : "Partial",
                            statusState: failedCount === 0 ? "Success" : "Warning"
                        });
                        return;
                    }

                    var batch = batches[batchIndex];
                    that._log("  Batch " + (batchIndex + 1) + "/" + batches.length + " (" + batch.length + " records)");

                    // Display first record of batch
                    if (batch.length > 0) {
                        that._displayCurrentRecord(that._processedRecords + 1, batch[0]);
                    }

                    // Build batch request body
                    var batchBody = that._buildBatchBody(entityData.entity, batch, entityData.fields);
                    var batchBoundary = "batch_" + Date.now();

                    var headers = {
                        "Content-Type": "multipart/mixed; boundary=" + batchBoundary,
                        "Accept": "multipart/mixed"
                    };
                    if (that._csrfToken) {
                        headers["X-CSRF-Token"] = that._csrfToken;
                    }

                    fetch(that._baseUrl + "/$batch", {
                        method: "POST",
                        headers: headers,
                        body: batchBody.replace(/batch_boundary/g, batchBoundary),
                        credentials: "include"
                    })
                    .then(function(response) {
                        return response.text().then(function(text) {
                            return { ok: response.ok, status: response.status, statusText: response.statusText, text: text };
                        });
                    })
                    .then(function(result) {
                        // Parse batch response
                        var batchResults = that._parseBatchResponse(result.text, batch, entityData.entity, entityData.fields);
                        
                        batchResults.forEach(function(r, idx) {
                            that._processedRecords++;
                            if (r.success) {
                                successCount++;
                            } else {
                                failedCount++;
                                entityErrors.push(r.error);
                                that._failedRecords.push(r.error);
                            }
                        });

                        that._updateRecordsProgress();
                        batchIndex++;
                        setTimeout(processBatch, 200);
                    })
                    .catch(function(err) {
                        // All records in batch failed
                        batch.forEach(function(record, idx) {
                            that._processedRecords++;
                            failedCount++;
                            var errorDetail = {
                                entity: entityData.entity,
                                recordNum: record.__rowNum || (that._processedRecords),
                                query: "BATCH POST /" + entityData.entity,
                                error: "Network Error: " + err.message,
                                record: record,
                                fields: entityData.fields,
                                httpStatus: 0,
                                responseBody: err.stack || ""
                            };
                            entityErrors.push(errorDetail);
                            that._failedRecords.push(errorDetail);
                        });

                        that._updateRecordsProgress();
                        batchIndex++;
                        setTimeout(processBatch, 200);
                    });
                }

                processBatch();
            });
        },

        _createBatches: function(records, batchSize) {
            var batches = [];
            for (var i = 0; i < records.length; i += batchSize) {
                batches.push(records.slice(i, i + batchSize));
            }
            return batches;
        },

        _buildBatchBody: function(entity, records, fields) {
            var boundary = "batch_boundary";
            var changesetBoundary = "changeset_" + Date.now();
            var body = "";

            // Start batch
            body += "--" + boundary + "\r\n";
            body += "Content-Type: multipart/mixed; boundary=" + changesetBoundary + "\r\n\r\n";

            // Add each record as a changeset entry
            records.forEach(function(record, idx) {
                var payload = { "__metadata": { "uri": entity, "type": "SFOData." + entity } };
                
                for (var key in record) {
                    if (key !== "__rowNum" && record.hasOwnProperty(key)) {
                        payload[key] = record[key];
                    }
                }

                body += "--" + changesetBoundary + "\r\n";
                body += "Content-Type: application/http\r\n";
                body += "Content-Transfer-Encoding: binary\r\n";
                body += "Content-ID: " + (idx + 1) + "\r\n\r\n";
                body += "POST " + entity + " HTTP/1.1\r\n";
                body += "Content-Type: application/json\r\n";
                body += "Accept: application/json\r\n\r\n";
                body += JSON.stringify(payload) + "\r\n";
            });

            // Close changeset and batch
            body += "--" + changesetBoundary + "--\r\n";
            body += "--" + boundary + "--\r\n";

            return body;
        },

        _parseBatchResponse: function(responseText, records, entity, fields) {
            var results = [];
            
            // Simple parsing - look for HTTP status codes in response
            var lines = responseText.split("\n");
            var currentStatus = null;
            var currentBody = "";
            var recordIndex = 0;

            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                
                // Look for HTTP status line
                if (line.match(/^HTTP\/1\.\d\s+(\d{3})/)) {
                    if (currentStatus !== null && recordIndex < records.length) {
                        // Process previous record
                        results.push(this._processRecordResult(
                            currentStatus, currentBody, records[recordIndex], entity, fields, recordIndex
                        ));
                        recordIndex++;
                    }
                    currentStatus = parseInt(line.match(/^HTTP\/1\.\d\s+(\d{3})/)[1]);
                    currentBody = "";
                }
                // Collect response body (JSON)
                else if (line.startsWith("{") || (currentBody && line)) {
                    currentBody += line;
                }
            }

            // Process last record
            if (currentStatus !== null && recordIndex < records.length) {
                results.push(this._processRecordResult(
                    currentStatus, currentBody, records[recordIndex], entity, fields, recordIndex
                ));
                recordIndex++;
            }

            // If we couldn't parse individual responses, assume all succeeded/failed based on overall response
            while (results.length < records.length) {
                var record = records[results.length];
                results.push({
                    success: currentStatus >= 200 && currentStatus < 300,
                    error: currentStatus >= 200 && currentStatus < 300 ? null : {
                        entity: entity,
                        recordNum: record.__rowNum || (results.length + 3),
                        query: "BATCH POST /" + entity,
                        error: currentStatus + " - Batch response parse error",
                        record: record,
                        fields: fields,
                        httpStatus: currentStatus || 0,
                        responseBody: responseText.substring(0, 500)
                    }
                });
            }

            return results;
        },

        _processRecordResult: function(status, body, record, entity, fields, idx) {
            var success = status >= 200 && status < 300;
            
            if (success) {
                return { success: true, error: null };
            }

            var errorMsg = status + " Error";
            try {
                var jsonBody = JSON.parse(body);
                if (jsonBody.error && jsonBody.error.message) {
                    errorMsg = status + ": " + (jsonBody.error.message.value || jsonBody.error.message);
                } else if (jsonBody.message) {
                    errorMsg = status + ": " + jsonBody.message;
                }
            } catch (e) {
                // Body not JSON
            }

            // Build query string for logging
            var queryFields = [];
            for (var key in record) {
                if (key !== "__rowNum" && record.hasOwnProperty(key)) {
                    queryFields.push(key + "='" + String(record[key]).substring(0, 20) + "'");
                }
            }
            var odataQuery = "POST /" + entity + " { " + queryFields.slice(0, 5).join(", ") + "... }";

            return {
                success: false,
                error: {
                    entity: entity,
                    recordNum: record.__rowNum || (idx + 3),
                    query: odataQuery,
                    error: errorMsg,
                    record: record,
                    fields: fields,
                    httpStatus: status,
                    responseBody: body.substring(0, 500)
                }
            };
        },

        _displayCurrentRecord: function (recordNum, record) {
            this.byId("currentRecordNumber").setNumber(recordNum);
            var fields = [];
            for (var key in record) {
                if (key !== "__rowNum" && record.hasOwnProperty(key)) {
                    fields.push({ field: key, value: String(record[key]).substring(0, 50) });
                }
            }
            this.getView().getModel("currentRecordModel").setProperty("/fields", fields.slice(0, 10));
        },

        _updateProgress: function (entity) {
            this.byId("currentEntityStatus").setText(entity);
            var percent = Math.round((this._currentEntityIndex / this._uploadQueue.length) * 100);
            this.byId("overallProgress").setPercentValue(percent);
            this.byId("overallProgress").setDisplayValue((this._currentEntityIndex + 1) + "/" + this._uploadQueue.length);
        },

        _updateRecordsProgress: function () {
            var oText = this.byId("recordsStatus");
            if (oText && oText.setText) {
                oText.setText(this._processedRecords + " / " + this._totalRecords);
            }
        },

        _uploadComplete: function () {
            this.byId("currentEntityStatus").setText("Complete!");
            this.byId("currentEntityStatus").setState("Success");
            this.byId("overallProgress").setPercentValue(100);
            this.byId("overallProgress").setState("Success");

            var totalSuccess = 0, totalFailed = 0;
            this._results.forEach(function (r) {
                totalSuccess += r.success;
                totalFailed += r.failed;
            });

            var oResultStatus = this.byId("resultStatus");
            if (oResultStatus && oResultStatus.setText) {
                oResultStatus.setText(totalSuccess + " records uploaded, " + totalFailed + " failed");
                oResultStatus.setType(totalFailed === 0 ? "Success" : "Warning");
            }
            
            this.getView().getModel("resultsModel").setProperty("/results", this._results);
            
            if (totalFailed > 0) {
                this.byId("downloadFailedBtn").setVisible(true);
                this.byId("errorsPanel").setVisible(true);
                this.getView().getModel("errorsModel").setProperty("/errors", this._failedRecords);
            }
            
            this.byId("resultsContainer").setVisible(true);

            var that = this;
            setTimeout(function() { that._showStep(5); }, 1000);

            this._log("Done: " + totalSuccess + " success, " + totalFailed + " failed");
        },

        onShowEntityErrors: function(oEvent) {
            var oContext = oEvent.getSource().getBindingContext("resultsModel");
            if (oContext) {
                var entityData = oContext.getObject();
                if (entityData.errors && entityData.errors.length > 0) {
                    this.getView().getModel("errorsModel").setProperty("/errors", entityData.errors);
                    this.byId("errorsPanel").setVisible(true);
                }
            }
        },

        onDownloadFailedRecords: function() {
            if (this._failedRecords.length === 0) {
                MessageToast.show("No failed records to download");
                return;
            }

            var groupedByEntity = {};
            this._failedRecords.forEach(function(failure) {
                if (!groupedByEntity[failure.entity]) {
                    groupedByEntity[failure.entity] = { fields: failure.fields, records: [] };
                }
                groupedByEntity[failure.entity].records.push({
                    record: failure.record,
                    error: failure.error,
                    query: failure.query,
                    httpStatus: failure.httpStatus,
                    responseBody: failure.responseBody
                });
            });

            var wb = XLSX.utils.book_new();

            for (var entity in groupedByEntity) {
                var entityData = groupedByEntity[entity];
                var sheetData = [];
                var headerRow = ["Row#"].concat(entityData.fields).concat(["HTTP_STATUS", "ERROR", "ODATA_QUERY", "RESPONSE_BODY"]);
                sheetData.push(headerRow);

                entityData.records.forEach(function(item) {
                    var row = [item.record.__rowNum || ""];
                    entityData.fields.forEach(function(field) { row.push(item.record[field] || ""); });
                    row.push(item.httpStatus || "");
                    row.push(item.error);
                    row.push(item.query);
                    row.push(item.responseBody || "");
                    sheetData.push(row);
                });

                var ws = XLSX.utils.aoa_to_sheet(sheetData);
                var wscols = [{ wch: 6 }];
                entityData.fields.forEach(function() { wscols.push({ wch: 15 }); });
                wscols.push({ wch: 10 }, { wch: 40 }, { wch: 50 }, { wch: 60 });
                ws['!cols'] = wscols;
                XLSX.utils.book_append_sheet(wb, ws, entity.substring(0, 31));
            }

            var summaryData = [["Entity", "Total Failed", "HTTP Status", "First Error"], []];
            for (var ent in groupedByEntity) {
                var records = groupedByEntity[ent].records;
                summaryData.push([ent, records.length, records[0] ? records[0].httpStatus : "", records[0] ? records[0].error : ""]);
            }
            var summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
            summaryWs['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 60 }];
            XLSX.utils.book_append_sheet(wb, summaryWs, "Summary", true);

            var timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
            XLSX.writeFile(wb, "FailedRecords_" + timestamp + ".xlsx");
            MessageToast.show("Downloaded " + this._failedRecords.length + " failed records");
            this._log("Downloaded failed records report");
        },

        onReset: function () {
            this.byId("sheetsList").removeAllItems();
            this.byId("parseBtn").setEnabled(false);
            this.byId("logArea").setValue("");
            this.byId("fileUploader").clear();
            this.byId("errorsPanel").setVisible(false);
            this.byId("downloadFailedBtn").setVisible(false);
            this.byId("resultsContainer").setVisible(false);
            
            this._workbook = null;
            this._sheets = [];
            this._failedRecords = [];
            this._csrfToken = null;
            this._currentStep = 1;
            
            for (var i = 2; i <= 5; i++) {
                this.byId("step" + i + "Card").setVisible(false);
            }
            this.byId("step1Card").setVisible(true);
            this._log("Ready");
        },

        _log: function (message) {
            var oTextArea = this.byId("logArea");
            if (oTextArea) {
                var time = new Date().toLocaleTimeString();
                oTextArea.setValue(oTextArea.getValue() + "[" + time + "] " + message + "\n");
            }
        }
    });
});