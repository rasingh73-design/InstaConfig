sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/VBox",
    "sap/m/Text",
    "sap/m/BusyDialog"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Button, Label, Input, VBox, Text, BusyDialog) {
    "use strict";

    return Controller.extend("com.ec.expressecm.controller.OnboardingSetup", {
        _currentStep: 1,
        _busyDialog: null,
        _aiConfig: null,

        onInit: function () {
            var oSetupModel = new JSONModel({
                company: {
                    name: "",
                    country: "",
                    countryDisplay: "",
                    industry: "",
                    industryDisplay: "",
                    employeeCount: ""
                },
                employees: [],
                employeeCount: 0,
                managerOptions: []
            });
            this.getView().setModel(oSetupModel, "setupModel");

            // Load XLSX library
            this._loadXLSXLibrary();

            // Country and Industry display mappings
            this._countryMap = {
                "US": "🇺🇸 United States",
                "GB": "🇬🇧 United Kingdom",
                "DE": "🇩🇪 Germany",
                "FR": "🇫🇷 France",
                "CA": "🇨🇦 Canada",
                "AU": "🇦🇺 Australia",
                "JP": "🇯🇵 Japan",
                "IN": "🇮🇳 India",
                "BR": "🇧🇷 Brazil",
                "MX": "🇲🇽 Mexico",
                "SG": "🇸🇬 Singapore",
                "NL": "🇳🇱 Netherlands"
            };

            this._industryMap = {
                "technology": "💻 Technology",
                "healthcare": "🏥 Healthcare",
                "finance": "🏦 Finance & Banking",
                "retail": "🛒 Retail",
                "manufacturing": "🏭 Manufacturing",
                "education": "🎓 Education",
                "hospitality": "🏨 Hospitality",
                "consulting": "📊 Consulting",
                "sales": "📈 General Sales",
                "logistics": "🚚 Logistics",
                "media": "🎬 Media & Entertainment",
                "energy": "⚡ Energy"
            };

            // Load AI configuration for genAI destination
            this._loadAIConfig();
        },

        _loadXLSXLibrary: function() {
            if (typeof XLSX === "undefined") {
                var script = document.createElement("script");
                script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
                document.head.appendChild(script);
            }
        },

        _loadAIConfig: function() {
            // AI Core is accessed via dynamic destination pattern
            // The destination handles OAuth automatically via BTP destination service
            // Using dynamic_dest pattern: /dynamic_dest/{destinationName}/{path}
            this._aiConfig = {
                // Dynamic destination path - routed through xs-app.json
                destinationName: "genai-dest",
                baseUrl: "/dynamic_dest/genai-dest",
                resourceGroup: "default"
            };
        },

        // ===== STEP TRANSITIONS =====
        _showStep: function(stepNum) {
            var that = this;
            var currentCard = this.byId("setupStep" + this._currentStep + "Card");
            var nextCard = this.byId("setupStep" + stepNum + "Card");

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

        onGoToStep2: function() {
            var oModel = this.getView().getModel("setupModel");
            var company = oModel.getProperty("/company");

            // Validate step 1
            if (!company.name || !company.country || !company.industry || !company.employeeCount) {
                MessageToast.show("Please fill in all required fields");
                return;
            }

            // Update display values
            oModel.setProperty("/company/countryDisplay", this._countryMap[company.country] || company.country);
            oModel.setProperty("/company/industryDisplay", this._industryMap[company.industry] || company.industry);

            this._showStep(2);
        },

        onBackToStep1: function() {
            this._showStep(1);
        },

        onGoToStep3: function() {
            var oModel = this.getView().getModel("setupModel");
            var employees = oModel.getProperty("/employees");

            if (employees.length === 0) {
                MessageToast.show("Please add at least one employee");
                return;
            }

            // Update employee count
            oModel.setProperty("/employeeCount", employees.length);

            this._showStep(3);
        },

        onBackToStep2: function() {
            this._showStep(2);
        },

        // ===== EMPLOYEE MANAGEMENT =====
        onAddEmployee: function() {
            var oModel = this.getView().getModel("setupModel");
            var employees = oModel.getProperty("/employees");
            var company = oModel.getProperty("/company");
            var domain = company.name ? company.name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com" : "company.com";

            employees.push({
                userId: "EMP" + String(employees.length + 1).padStart(5, "0"),
                firstName: "",
                lastName: "",
                email: "",
                jobTitle: "",
                manager: "",
                domain: domain
            });

            oModel.setProperty("/employees", employees);
            this._updateManagerOptions();
        },

        onDeleteEmployee: function(oEvent) {
            var oModel = this.getView().getModel("setupModel");
            var oContext = oEvent.getSource().getBindingContext("setupModel");
            var sPath = oContext.getPath();
            var index = parseInt(sPath.split("/").pop());
            
            var employees = oModel.getProperty("/employees");
            employees.splice(index, 1);
            oModel.setProperty("/employees", employees);
            this._updateManagerOptions();
        },

        _updateManagerOptions: function() {
            var oModel = this.getView().getModel("setupModel");
            var employees = oModel.getProperty("/employees");
            var options = employees.filter(function(emp) {
                return emp.firstName && emp.lastName;
            }).map(function(emp) {
                return {
                    key: emp.userId,
                    text: emp.firstName + " " + emp.lastName
                };
            });
            oModel.setProperty("/managerOptions", options);
        },

        // ===== IMPORT FUNCTIONS =====
        onImportCSV: function() {
            var oUploader = this.byId("csvUploader");
            oUploader.getDomRef().querySelector("input[type='file']").click();
        },

        onImportExcel: function() {
            var oUploader = this.byId("excelUploader");
            oUploader.getDomRef().querySelector("input[type='file']").click();
        },

        onCSVFileSelected: function(oEvent) {
            var that = this;
            var oFile = oEvent.getParameter("files")[0];
            if (!oFile) return;

            var reader = new FileReader();
            reader.onload = function(e) {
                that._parseCSVData(e.target.result);
            };
            reader.readAsText(oFile);
        },

        onExcelFileSelected: function(oEvent) {
            var that = this;
            var oFile = oEvent.getParameter("files")[0];
            if (!oFile) return;

            var reader = new FileReader();
            reader.onload = function(e) {
                var data = new Uint8Array(e.target.result);
                var workbook = XLSX.read(data, { type: "array" });
                var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                var csvData = XLSX.utils.sheet_to_csv(firstSheet);
                that._parseCSVData(csvData);
            };
            reader.readAsArrayBuffer(oFile);
        },

        _parseCSVData: function(csvText) {
            var oModel = this.getView().getModel("setupModel");
            var company = oModel.getProperty("/company");
            var domain = company.name ? company.name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com" : "company.com";
            var employees = oModel.getProperty("/employees");

            var lines = csvText.split("\n");
            var headers = lines[0].toLowerCase().split(",").map(function(h) { return h.trim(); });

            for (var i = 1; i < lines.length; i++) {
                var values = lines[i].split(",").map(function(v) { return v.trim(); });
                if (values.length < 2 || !values[0]) continue;

                var emp = {
                    userId: "EMP" + String(employees.length + 1).padStart(5, "0"),
                    firstName: values[headers.indexOf("firstname")] || values[headers.indexOf("first name")] || values[0] || "",
                    lastName: values[headers.indexOf("lastname")] || values[headers.indexOf("last name")] || values[1] || "",
                    email: values[headers.indexOf("email")] || "",
                    jobTitle: values[headers.indexOf("jobtitle")] || values[headers.indexOf("job title")] || values[headers.indexOf("title")] || "",
                    manager: "",
                    domain: domain
                };

                if (!emp.email && emp.firstName && emp.lastName) {
                    emp.email = emp.firstName.toLowerCase() + "." + emp.lastName.toLowerCase() + "@" + domain;
                }

                employees.push(emp);
            }

            oModel.setProperty("/employees", employees);
            this._updateManagerOptions();
            MessageToast.show("Imported " + (lines.length - 1) + " employees");
        },

        // ===== AI GENERATION =====
        onGenerateWithAI: function() {
            var that = this;
            var oModel = this.getView().getModel("setupModel");
            var company = oModel.getProperty("/company");

            var oDialog = new Dialog({
                title: "Generate Employees with AI",
                content: [
                    new VBox({
                        class: "sapUiSmallMargin",
                        items: [
                            new Text({ text: "How many employees would you like to generate?" }),
                            new Text({ text: "Based on: " + company.name + " (" + this._industryMap[company.industry] + ")", class: "sapUiTinyMarginTop" }),
                            new Input({
                                id: "aiEmployeeCount",
                                type: "Number",
                                value: "10",
                                width: "100%",
                                class: "sapUiSmallMarginTop"
                            })
                        ]
                    })
                ],
                beginButton: new Button({
                    text: "Generate",
                    type: "Emphasized",
                    press: function() {
                        var count = parseInt(sap.ui.getCore().byId("aiEmployeeCount").getValue()) || 10;
                        oDialog.close();
                        that._generateEmployeesWithAI(count);
                    }
                }),
                endButton: new Button({
                    text: "Cancel",
                    press: function() { oDialog.close(); }
                }),
                afterClose: function() { oDialog.destroy(); }
            });

            oDialog.open();
        },

        _generateEmployeesWithAI: function(count) {
            var that = this;
            var oModel = this.getView().getModel("setupModel");
            var company = oModel.getProperty("/company");

            this._showBusyDialog("Generating employees with AI...");

            // Check if AI config is available
            if (!this._aiConfig || !this._aiConfig.baseUrl) {
                this._hideBusyDialog();
                MessageBox.error("AI configuration not available. Please check your genAI destination setup.");
                return;
            }

            this._callAIService(count, company)
                .then(function(employees) {
                    that._hideBusyDialog();
                    that._addGeneratedEmployees(employees);
                    MessageToast.show("Generated " + employees.length + " employees with AI");
                })
                .catch(function(err) {
                    that._hideBusyDialog();
                    console.error("AI generation failed:", err);
                    MessageBox.error(
                        "AI generation failed: " + err.message + "\n\nPlease check:\n" +
                        "1. genai-dest destination is configured correctly\n" +
                        "2. Deployment ID is valid\n" +
                        "3. OAuth credentials are correct",
                        { title: "AI Generation Error" }
                    );
                });
        },

        _callAIService: function(count, company) {
            var that = this;
            return new Promise(function(resolve, reject) {
                if (!that._aiConfig || !that._aiConfig.baseUrl) {
                    reject(new Error("AI configuration not available"));
                    return;
                }

                var prompt = that._buildAIPrompt(count, company);
                // Use genai destination path with ORCHESTRATION format
                // Changed from /chat/completions to /v2/completion (orchestration API)
                var endpoint = that._aiConfig.baseUrl + "/inference/deployments/da1068f8a530837a/v2/completion";
                
                console.log("[AI] Calling orchestration endpoint:", endpoint);
                
                // Prepare messages array
                var messages = [
                    {
                        role: "system",
                        content: "You are an HR data generator. Generate realistic employee data in JSON format. Return only valid JSON array with no additional text."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ];
                
                // Use SAP AI Core Orchestration format
                fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "AI-Resource-Group": that._aiConfig.resourceGroup || "default"
                    },
                    body: JSON.stringify({
                        config: {
                            modules: {
                                prompt_templating: {
                                    model: {
                                        name: "anthropic--claude-4.6-sonnet",
                                        params: {
                                            max_tokens: 4000,
                                            temperature: 0.7
                                        }
                                    },
                                    prompt: {
                                        template: messages
                                    }
                                }
                            }
                        }
                    })
                })
                .then(function(response) {
                    console.log("[AI] Response status:", response.status, response.statusText);
                    
                    // Get response text first to debug
                    return response.text().then(function(text) {
                        console.log("[AI] Response body preview:", text.substring(0, 200));
                        
                        if (!response.ok) {
                            // Try to extract error message from response
                            var errorMsg = "AI API error: " + response.status + " " + response.statusText;
                            try {
                                var errorJson = JSON.parse(text);
                                if (errorJson.error && errorJson.error.message) {
                                    errorMsg = errorJson.error.message;
                                } else if (errorJson.message) {
                                    errorMsg = errorJson.message;
                                }
                            } catch (e) {
                                // Response is not JSON (likely HTML error page)
                                if (text.includes("<!DOCTYPE") || text.includes("<html")) {
                                    errorMsg = "Received HTML instead of JSON - check OAuth/proxy configuration";
                                }
                            }
                            throw new Error(errorMsg);
                        }
                        
                        // Try to parse as JSON
                        try {
                            return JSON.parse(text);
                        } catch (e) {
                            throw new Error("Invalid JSON response from AI Core");
                        }
                    });
                })
                .then(function(data) {
                    console.log("[AI] Parsed response:", data);
                    
                    // Handle orchestration response format
                    // Response can be in: data.final_result.choices[0].message.content (new orchestration format)
                    // or data.orchestration_result.choices[0].message.content
                    // or data.choices[0].message.content
                    var content = 
                        (data.final_result && data.final_result.choices && data.final_result.choices[0] && data.final_result.choices[0].message && data.final_result.choices[0].message.content) ||
                        (data.orchestration_result && data.orchestration_result.choices && data.orchestration_result.choices[0] && data.orchestration_result.choices[0].message && data.orchestration_result.choices[0].message.content) ||
                        (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
                    
                    if (content) {
                        console.log("[AI] AI response content:", content.substring(0, 200));
                        try {
                            // Claude wraps JSON in markdown code blocks: ```json ... ```
                            // First try to extract from markdown code block
                            var codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                            if (codeBlockMatch) {
                                content = codeBlockMatch[1];
                                console.log("[AI] Extracted from markdown code block");
                            }
                            
                            // Now extract the JSON array
                            var jsonMatch = content.match(/\[[\s\S]*\]/);
                            if (jsonMatch) {
                                var employees = JSON.parse(jsonMatch[0]);
                                console.log("[AI] Parsed employees:", employees.length);
                                resolve(employees);
                            } else {
                                reject(new Error("AI response does not contain a JSON array"));
                            }
                        } catch (e) {
                            reject(new Error("Failed to parse AI response JSON: " + e.message));
                        }
                    } else {
                        reject(new Error("Empty response from AI - no choices returned"));
                    }
                })
                .catch(function(err) {
                    console.error("[AI] Error:", err);
                    reject(err);
                });
            });
        },

        _buildAIPrompt: function(count, company) {
            return "Generate " + count + " realistic employee records for a company with the following details:\n" +
                "- Company Name: " + company.name + "\n" +
                "- Industry: " + this._industryMap[company.industry] + "\n" +
                "- Country: " + this._countryMap[company.country] + "\n\n" +
                "For each employee, provide:\n" +
                "- firstName: realistic first name appropriate for the country\n" +
                "- lastName: realistic last name appropriate for the country\n" +
                "- email: format as firstname.lastname@" + company.name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com\n" +
                "- jobTitle: realistic job title for this industry\n" +
                "- department: appropriate department name\n" +
                "- managerId: empty string for executives, or reference to another employee for others\n\n" +
                "Include a mix of:\n" +
                "- 1-2 executives (CEO, CTO, CFO, etc.)\n" +
                "- Several managers\n" +
                "- Individual contributors\n\n" +
                "Return ONLY a valid JSON array, no additional text.";
        },

        _generateLocalEmployees: function(count, company) {
            var employees = [];
            var domain = company.name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";

            // Industry-specific job titles
            var jobTitles = this._getJobTitlesForIndustry(company.industry);
            var firstNames = this._getNamesForCountry(company.country, "first");
            var lastNames = this._getNamesForCountry(company.country, "last");

            // Generate CEO first
            var ceo = this._createEmployee(employees.length, firstNames, lastNames, domain, "CEO", "");
            employees.push(ceo);

            // Generate executives
            var execCount = Math.min(3, Math.floor(count * 0.1));
            var execTitles = ["CTO", "CFO", "COO", "VP Engineering", "VP Sales"];
            for (var i = 0; i < execCount && employees.length < count; i++) {
                var exec = this._createEmployee(employees.length, firstNames, lastNames, domain, execTitles[i], ceo.userId);
                employees.push(exec);
            }

            // Generate managers and individual contributors
            while (employees.length < count) {
                var isManager = employees.length < count * 0.3;
                var manager = employees[Math.floor(Math.random() * Math.min(employees.length, execCount + 1))];
                var title = isManager ? 
                    jobTitles.managers[Math.floor(Math.random() * jobTitles.managers.length)] :
                    jobTitles.individual[Math.floor(Math.random() * jobTitles.individual.length)];
                
                var emp = this._createEmployee(employees.length, firstNames, lastNames, domain, title, manager.userId);
                employees.push(emp);
            }

            this._addGeneratedEmployees(employees);
            MessageToast.show("Generated " + count + " employees");
        },

        _createEmployee: function(index, firstNames, lastNames, domain, jobTitle, managerId) {
            var firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
            var lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
            return {
                userId: "EMP" + String(index + 1).padStart(5, "0"),
                firstName: firstName,
                lastName: lastName,
                email: firstName.toLowerCase() + "." + lastName.toLowerCase() + "@" + domain,
                jobTitle: jobTitle,
                manager: managerId,
                domain: domain
            };
        },

        _getJobTitlesForIndustry: function(industry) {
            var titles = {
                technology: {
                    managers: ["Engineering Manager", "Product Manager", "Tech Lead", "Development Manager", "QA Manager"],
                    individual: ["Software Engineer", "Senior Developer", "DevOps Engineer", "Data Scientist", "UX Designer", "Product Designer", "QA Engineer", "Frontend Developer", "Backend Developer", "Full Stack Developer"]
                },
                healthcare: {
                    managers: ["Medical Director", "Nursing Manager", "Department Head", "Clinical Manager", "Operations Manager"],
                    individual: ["Physician", "Registered Nurse", "Medical Technician", "Healthcare Administrator", "Clinical Coordinator", "Medical Assistant", "Lab Technician", "Pharmacist"]
                },
                finance: {
                    managers: ["Portfolio Manager", "Risk Manager", "Branch Manager", "Compliance Director", "Trading Manager"],
                    individual: ["Financial Analyst", "Investment Banker", "Accountant", "Risk Analyst", "Loan Officer", "Compliance Officer", "Trader", "Auditor"]
                },
                retail: {
                    managers: ["Store Manager", "Regional Manager", "Merchandising Manager", "Operations Manager", "Sales Manager"],
                    individual: ["Sales Associate", "Visual Merchandiser", "Inventory Specialist", "Customer Service Rep", "Cashier", "Stock Associate", "Buyer"]
                },
                manufacturing: {
                    managers: ["Plant Manager", "Production Manager", "Quality Manager", "Maintenance Manager", "Supply Chain Manager"],
                    individual: ["Production Engineer", "Quality Inspector", "Machine Operator", "Maintenance Technician", "Supply Chain Analyst", "Process Engineer", "Safety Coordinator"]
                },
                sales: {
                    managers: ["Sales Director", "Regional Sales Manager", "Account Manager", "Business Development Manager"],
                    individual: ["Sales Representative", "Account Executive", "Business Development Rep", "Sales Coordinator", "Inside Sales Rep", "Territory Manager"]
                },
                consulting: {
                    managers: ["Engagement Manager", "Practice Lead", "Principal Consultant", "Project Manager"],
                    individual: ["Senior Consultant", "Consultant", "Business Analyst", "Strategy Analyst", "Associate Consultant", "Research Analyst"]
                }
            };
            return titles[industry] || titles.technology;
        },

        _getNamesForCountry: function(country, type) {
            var names = {
                US: {
                    first: ["James", "John", "Robert", "Michael", "William", "David", "Mary", "Patricia", "Jennifer", "Linda", "Elizabeth", "Sarah", "Jessica", "Emily", "Ashley"],
                    last: ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Anderson", "Taylor", "Thomas", "Moore", "Jackson"]
                },
                GB: {
                    first: ["Oliver", "George", "Harry", "Jack", "Jacob", "Noah", "Amelia", "Olivia", "Emily", "Isla", "Ava", "Sophie", "Grace", "Mia", "Ella"],
                    last: ["Smith", "Jones", "Williams", "Taylor", "Brown", "Davies", "Evans", "Wilson", "Thomas", "Roberts", "Johnson", "Lewis", "Walker", "Robinson", "Wood"]
                },
                DE: {
                    first: ["Lukas", "Leon", "Maximilian", "Felix", "Paul", "Jonas", "Emma", "Hannah", "Mia", "Sofia", "Anna", "Lea", "Lena", "Marie", "Laura"],
                    last: ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann", "Koch", "Bauer", "Richter", "Klein", "Wolf"]
                },
                IN: {
                    first: ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Reyansh", "Aadhya", "Ananya", "Pari", "Aanya", "Diya", "Saanvi", "Myra", "Ishita", "Priya"],
                    last: ["Sharma", "Patel", "Singh", "Kumar", "Gupta", "Reddy", "Rao", "Verma", "Joshi", "Iyer", "Nair", "Menon", "Pillai", "Desai", "Shah"]
                }
            };
            var countryNames = names[country] || names.US;
            return type === "first" ? countryNames.first : countryNames.last;
        },

        _addGeneratedEmployees: function(employees) {
            var oModel = this.getView().getModel("setupModel");
            var existingEmployees = oModel.getProperty("/employees");
            var company = oModel.getProperty("/company");
            var domain = company.name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";

            employees.forEach(function(emp, idx) {
                existingEmployees.push({
                    userId: emp.userId || "EMP" + String(existingEmployees.length + 1).padStart(5, "0"),
                    firstName: emp.firstName,
                    lastName: emp.lastName,
                    email: emp.email || (emp.firstName.toLowerCase() + "." + emp.lastName.toLowerCase() + "@" + domain),
                    jobTitle: emp.jobTitle,
                    manager: emp.manager || emp.managerId || "",
                    domain: domain
                });
            });

            oModel.setProperty("/employees", existingEmployees);
            oModel.setProperty("/employeeCount", existingEmployees.length);
            this._updateManagerOptions();
        },

        // ===== WORKBOOK GENERATION =====
        onDownloadWorkbook: function() {
            this._generateAndDownloadWorkbook(false);
        },

        onCreateHRSystem: function() {
            var that = this;
            MessageBox.confirm(
                "This will create your HR system with the configured employees. Continue?",
                {
                    title: "Create HR System",
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    emphasizedAction: MessageBox.Action.YES,
                    onClose: function(oAction) {
                        if (oAction === MessageBox.Action.YES) {
                            that._generateAndDownloadWorkbook(true);
                        }
                    }
                }
            );
        },

        _generateAndDownloadWorkbook: function(navigateToUpload) {
            var that = this;
            var oModel = this.getView().getModel("setupModel");
            var company = oModel.getProperty("/company");
            var employees = oModel.getProperty("/employees");

            this._showBusyDialog("Generating workbook...");

            setTimeout(function() {
                try {
                    var wb = XLSX.utils.book_new();

                    // Generate worksheets for each entity
                    that._addLegalEntitySheet(wb, company);
                    that._addGeozoneSheet(wb, company);
                    that._addLocationSheet(wb, company);
                    that._addCostCenterSheet(wb, company);
                    that._addDepartmentSheet(wb, company, employees);
                    that._addPositionSheet(wb, company, employees);
                    that._addBasicInfoSheet(wb, employees);
                    that._addPersonInfoSheet(wb, employees);
                    that._addEmploymentInfoSheet(wb, employees);
                    that._addPersonalInfoSheet(wb, employees);
                    that._addJobInformationSheet(wb, company, employees);
                    that._addEmailSheet(wb, employees);
                    that._addPhoneSheet(wb, employees);
                    that._addCompensationSheet(wb, employees);

                    if (navigateToUpload) {
                        // Store workbook in component for App view to use
                        that.getOwnerComponent().setModel(new JSONModel({
                            workbook: wb,
                            companyName: company.name,
                            employeeCount: employees.length,
                            generatedAt: new Date().toISOString()
                        }), "preloadedWorkbook");
                        
                        that._hideBusyDialog();
                        MessageToast.show("Workbook generated! Loading upload screen...");

                        // Navigate to App view (upload functionality)
                        setTimeout(function() {
                            that.getOwnerComponent().getRouter().navTo("RouteApp");
                        }, 300);
                    } else {
                        // Download the workbook
                        var timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
                        XLSX.writeFile(wb, "OnboardingWorkbook_" + company.name.replace(/[^a-z0-9]/gi, "_") + "_" + timestamp + ".xlsx");

                        that._hideBusyDialog();
                        MessageToast.show("Workbook generated successfully!");
                    }
                } catch (err) {
                    that._hideBusyDialog();
                    MessageBox.error("Error generating workbook: " + err.message);
                }
            }, 500);
        },

        // ===== WORKSHEET GENERATORS =====
        _addLegalEntitySheet: function(wb, company) {
            var data = [
                ["", "externalCode", "name", "country", "defaultCurrency", "status", "startDate"],
                ["", company.name.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, ""), company.name, company.country, this._getCurrencyForCountry(company.country), "A", this._formatDate(new Date())]
            ];
            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "LegalEntity");
        },

        _addGeozoneSheet: function(wb, company) {
            var data = [
                ["", "externalCode", "name", "status", "startDate"],
                ["", company.country + "_ZONE", company.country + " Region", "A", this._formatDate(new Date())]
            ];
            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Geozone");
        },

        _addLocationSheet: function(wb, company) {
            var data = [
                ["", "externalCode", "name", "country", "timezone", "status", "startDate"],
                ["", "HQ_" + company.country, company.name + " Headquarters", company.country, this._getTimezoneForCountry(company.country), "A", this._formatDate(new Date())]
            ];
            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Location");
        },

        _addCostCenterSheet: function(wb, company) {
            var companyCode = company.name.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, "");
            var data = [
                ["", "externalCode", "name", "legalEntity", "status", "startDate"],
                ["", "CC_CORP", "Corporate", companyCode, "A", this._formatDate(new Date())],
                ["", "CC_ENG", "Engineering", companyCode, "A", this._formatDate(new Date())],
                ["", "CC_SALES", "Sales", companyCode, "A", this._formatDate(new Date())],
                ["", "CC_HR", "Human Resources", companyCode, "A", this._formatDate(new Date())],
                ["", "CC_FIN", "Finance", companyCode, "A", this._formatDate(new Date())]
            ];
            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "CostCenter");
        },

        _addDepartmentSheet: function(wb, company, employees) {
            var companyCode = company.name.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, "");
            var departments = this._extractDepartments(employees, company);
            var data = [["", "externalCode", "name", "legalEntity", "costCenter", "status", "startDate"]];
            
            departments.forEach(function(dept) {
                data.push(["", dept.code, dept.name, companyCode, dept.costCenter, "A", this._formatDate(new Date())]);
            }, this);

            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Department");
        },

        _addPositionSheet: function(wb, company, employees) {
            var companyCode = company.name.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, "");
            var data = [["", "code", "jobTitle", "company", "department", "costCenter", "location", "status", "effectiveStartDate"]];
            
            employees.forEach(function(emp, idx) {
                var dept = this._getDepartmentForJobTitle(emp.jobTitle);
                data.push([
                    "",
                    "POS" + String(idx + 1).padStart(5, "0"),
                    emp.jobTitle,
                    companyCode,
                    dept.code,
                    dept.costCenter,
                    "HQ_" + company.country,
                    "A",
                    this._formatDate(new Date())
                ]);
            }, this);

            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Position");
        },

        _addBasicInfoSheet: function(wb, employees) {
            var data = [["", "userId", "username", "firstName", "lastName", "email", "status", "hireDate"]];
            
            employees.forEach(function(emp) {
                data.push([
                    "",
                    emp.userId,
                    emp.email.split("@")[0],
                    emp.firstName,
                    emp.lastName,
                    emp.email,
                    "A",
                    this._formatDate(new Date())
                ]);
            }, this);

            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "BasicInfo");
        },

        _addPersonInfoSheet: function(wb, employees) {
            var data = [["", "personIdExternal", "dateOfBirth", "countryOfBirth", "startDate"]];
            
            employees.forEach(function(emp) {
                data.push([
                    "",
                    emp.userId,
                    this._generateBirthDate(),
                    "US",
                    this._formatDate(new Date())
                ]);
            }, this);

            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "PersonInfo");
        },

        _addEmploymentInfoSheet: function(wb, employees) {
            var data = [["", "personIdExternal", "userId", "startDate", "employmentType"]];
            
            employees.forEach(function(emp) {
                data.push([
                    "",
                    emp.userId,
                    emp.userId,
                    this._formatDate(new Date()),
                    "Regular"
                ]);
            }, this);

            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "EmploymentInfo");
        },

        _addPersonalInfoSheet: function(wb, employees) {
            var data = [["", "personIdExternal", "firstName", "lastName", "gender", "startDate"]];
            
            employees.forEach(function(emp) {
                data.push([
                    "",
                    emp.userId,
                    emp.firstName,
                    emp.lastName,
                    this._guessGender(emp.firstName),
                    this._formatDate(new Date())
                ]);
            }, this);

            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "PersonalInfo");
        },

        _addJobInformationSheet: function(wb, company, employees) {
            var companyCode = company.name.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, "");
            var data = [["", "userId", "seqNumber", "jobTitle", "position", "company", "department", "costCenter", "managerId", "startDate"]];
            
            employees.forEach(function(emp, idx) {
                var dept = this._getDepartmentForJobTitle(emp.jobTitle);
                data.push([
                    "",
                    emp.userId,
                    "1",
                    emp.jobTitle,
                    "POS" + String(idx + 1).padStart(5, "0"),
                    companyCode,
                    dept.code,
                    dept.costCenter,
                    emp.manager || "",
                    this._formatDate(new Date())
                ]);
            }, this);

            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "JobInformation");
        },

        _addEmailSheet: function(wb, employees) {
            var data = [["", "personIdExternal", "emailType", "emailAddress", "isPrimary", "startDate"]];
            
            employees.forEach(function(emp) {
                data.push([
                    "",
                    emp.userId,
                    "B",
                    emp.email,
                    "true",
                    this._formatDate(new Date())
                ]);
            }, this);

            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Email");
        },

        _addPhoneSheet: function(wb, employees) {
            var data = [["", "personIdExternal", "phoneType", "phoneNumber", "isPrimary", "startDate"]];
            
            employees.forEach(function(emp) {
                data.push([
                    "",
                    emp.userId,
                    "B",
                    this._generatePhoneNumber(),
                    "true",
                    this._formatDate(new Date())
                ]);
            }, this);

            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Phone");
        },

        _addCompensationSheet: function(wb, employees) {
            var data = [["", "userId", "seqNumber", "payGrade", "payType", "annualSalary", "currencyCode", "startDate"]];
            
            employees.forEach(function(emp, idx) {
                var salary = this._generateSalaryForRole(emp.jobTitle);
                data.push([
                    "",
                    emp.userId,
                    "1",
                    "GRADE_" + (Math.floor(idx / 5) + 1),
                    "Salary",
                    salary,
                    "USD",
                    this._formatDate(new Date())
                ]);
            }, this);

            var ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Comp");
        },

        // ===== HELPER FUNCTIONS =====
        _formatDate: function(date) {
            return date.toISOString().split("T")[0];
        },

        _getCurrencyForCountry: function(country) {
            var currencies = { US: "USD", GB: "GBP", DE: "EUR", FR: "EUR", CA: "CAD", AU: "AUD", JP: "JPY", IN: "INR", BR: "BRL", MX: "MXN", SG: "SGD", NL: "EUR" };
            return currencies[country] || "USD";
        },

        _getTimezoneForCountry: function(country) {
            var timezones = { US: "America/New_York", GB: "Europe/London", DE: "Europe/Berlin", FR: "Europe/Paris", CA: "America/Toronto", AU: "Australia/Sydney", JP: "Asia/Tokyo", IN: "Asia/Kolkata", BR: "America/Sao_Paulo", MX: "America/Mexico_City", SG: "Asia/Singapore", NL: "Europe/Amsterdam" };
            return timezones[country] || "UTC";
        },

        _extractDepartments: function(employees, company) {
            var depts = [
                { code: "DEPT_EXEC", name: "Executive", costCenter: "CC_CORP" },
                { code: "DEPT_ENG", name: "Engineering", costCenter: "CC_ENG" },
                { code: "DEPT_SALES", name: "Sales", costCenter: "CC_SALES" },
                { code: "DEPT_HR", name: "Human Resources", costCenter: "CC_HR" },
                { code: "DEPT_FIN", name: "Finance", costCenter: "CC_FIN" },
                { code: "DEPT_OPS", name: "Operations", costCenter: "CC_CORP" },
                { code: "DEPT_MKT", name: "Marketing", costCenter: "CC_SALES" }
            ];
            return depts;
        },

        _getDepartmentForJobTitle: function(jobTitle) {
            var title = jobTitle.toLowerCase();
            if (title.includes("ceo") || title.includes("cto") || title.includes("cfo") || title.includes("coo") || title.includes("vp") || title.includes("president")) {
                return { code: "DEPT_EXEC", costCenter: "CC_CORP" };
            } else if (title.includes("engineer") || title.includes("developer") || title.includes("architect") || title.includes("devops") || title.includes("qa") || title.includes("tech")) {
                return { code: "DEPT_ENG", costCenter: "CC_ENG" };
            } else if (title.includes("sales") || title.includes("account") || title.includes("business development")) {
                return { code: "DEPT_SALES", costCenter: "CC_SALES" };
            } else if (title.includes("hr") || title.includes("human") || title.includes("recruit") || title.includes("talent")) {
                return { code: "DEPT_HR", costCenter: "CC_HR" };
            } else if (title.includes("financ") || title.includes("account") || title.includes("audit")) {
                return { code: "DEPT_FIN", costCenter: "CC_FIN" };
            } else if (title.includes("market") || title.includes("brand") || title.includes("content")) {
                return { code: "DEPT_MKT", costCenter: "CC_SALES" };
            }
            return { code: "DEPT_OPS", costCenter: "CC_CORP" };
        },

        _generateBirthDate: function() {
            var year = 1960 + Math.floor(Math.random() * 35);
            var month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
            var day = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
            return year + "-" + month + "-" + day;
        },

        _generatePhoneNumber: function() {
            return "+1" + String(Math.floor(Math.random() * 9000000000) + 1000000000);
        },

        _generateSalaryForRole: function(jobTitle) {
            var title = jobTitle.toLowerCase();
            if (title.includes("ceo")) return 350000;
            if (title.includes("cto") || title.includes("cfo") || title.includes("coo")) return 280000;
            if (title.includes("vp") || title.includes("president")) return 220000;
            if (title.includes("director")) return 180000;
            if (title.includes("manager") || title.includes("lead")) return 140000;
            if (title.includes("senior")) return 120000;
            return 80000 + Math.floor(Math.random() * 30000);
        },

        _guessGender: function(firstName) {
            var femaleNames = ["Mary", "Patricia", "Jennifer", "Linda", "Elizabeth", "Sarah", "Jessica", "Emily", "Ashley", "Amelia", "Olivia", "Isla", "Ava", "Sophie", "Grace", "Mia", "Ella", "Emma", "Hannah", "Sofia", "Anna", "Lea", "Lena", "Marie", "Laura", "Aadhya", "Ananya", "Pari", "Aanya", "Diya", "Saanvi", "Myra", "Ishita", "Priya"];
            return femaleNames.includes(firstName) ? "F" : "M";
        },

        _showBusyDialog: function(text) {
            if (!this._busyDialog) {
                this._busyDialog = new BusyDialog({ text: text });
            } else {
                this._busyDialog.setText(text);
            }
            this._busyDialog.open();
        },

        _hideBusyDialog: function() {
            if (this._busyDialog) {
                this._busyDialog.close();
            }
        }
    });
});