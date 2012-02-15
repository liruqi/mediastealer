//--------------------------------------------------------------------
// Objects defined in this file:
//   stealerConfig: important
//--------------------------------------------------------------------




function StealerConfig() {
    this.enabled = true;
    this.showStatusbar = true;
    this.useCache = true;
    this.alwaysConfirm = true;
    this.defaultDir = "";
	this.filetypeunknown = true;
 	this.nosmallfiles = true;
 	this.nozerofiles = true;	
    this.rules = [];
    this.home = Components.classes["@mozilla.org/file/directory_service;1"]
                               .getService(Components.interfaces.nsIProperties)
                               .get("Home", Components.interfaces.nsIFile);
}

StealerConfig.prototype = {
    load: function() {
        try{
			var stealerPrefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
			var stealerBranch = stealerPrefs.getBranch("extensions.stealer.");
			stealerBranch.QueryInterface(Components.interfaces.nsIPrefBranch2);
            this.defaultDir = unescape(stealerBranch.getCharPref("defaultDir"));
            if(this.defaultDir == "") {
                this.defaultDir = this.home.path + (this.home.path[0]=="/" ? "/": "\\")
            }

            this.enabled = stealerBranch.getBoolPref("enabled");
            this.showStatusbar = stealerBranch.getBoolPref("showStatusbar");
            this.useCache = stealerBranch.getBoolPref("useCache");
            this.alwaysConfirm = stealerBranch.getBoolPref("alwaysConfirm");			
			this.filetypeunknown = stealerBranch.getBoolPref("filetypeunknown");	
			this.nosmallfiles = stealerBranch.getBoolPref("nosmallfiles");
			this.nozerofiles = stealerBranch.getBoolPref("nozerofiles");		
			
			
            this.rules = JSON.parse(stealerBranch.getCharPref("rulesJSON"));			
            for(var i = 0; i < this.rules.length; i++) {
                this.rules[i]["dir"] = unescape(this.rules[i]["dir"]);
                if(this.rules[i]["rtype"] > 0 && this.rules[i]["dir"] == "") {
                    this.rules[i]["dir"] = this.defaultDir;
                }
            }
        }
        catch(e) {
            //alert("stealerConfig.load:\n"+e.name+": "+e.message);
        }
    },
    save: function() {
        try {
			var stealerPrefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
			var stealerBranch = stealerPrefs.getBranch("extensions.stealer.");
			stealerBranch.QueryInterface(Components.interfaces.nsIPrefBranch2);	
			
            stealerBranch.setCharPref("defaultDir", escape(this.defaultDir));

            stealerBranch.setBoolPref("enabled", this.enabled);
            stealerBranch.setBoolPref("showStatusbar", this.showStatusbar);
            stealerBranch.setBoolPref("useCache", this.useCache);
            stealerBranch.setBoolPref("alwaysConfirm", this.alwaysConfirm);
			stealerBranch.setBoolPref("filetypeunknown", this.filetypeunknown);
			stealerBranch.setBoolPref("nozerofiles", this.nozerofiles);
			stealerBranch.setBoolPref("nosmallfiles", this.nosmallfiles);			

            var rules = [];
            for(var i = 0; i < this.rules.length; i++) {
                var rule = {};
                rule.rtype   = this.rules[i].rtype;
                rule.enabled = this.rules[i].enabled;
                rule.des     = this.rules[i].des;
                rule.url     = this.rules[i].url;
                rule.ct      = this.rules[i].ct;
                rule.dir     = escape(this.rules[i].dir);
                rules.push(rule);
            }
            stealerBranch.setCharPref("rulesJSON", JSON.stringify(rules));
        }
        catch(e) {
            //alert(e);
        }
    },
    clearRules: function(){
        this.rules = [];
    },
    appendRule: function(rule) {
        this.rules.push(rule);
    },
    getRuleStr: function(rule) {
        var str = "[HttpFilter Rule: ";
        str += (rule.enabled == "true") ? "enabled" : "disabled";
        str += ", " + rule.des;
        str += ", " + rule.url;
        str += ", " + rule.ct;
        str += ", " + rule.dir;
        str += "]";
        return str;
    },
    toString: function() {
        var str = "[stealerConfig: ";
        str += this.enabled ? "enabled" : "disabled";
        str += ", " + (this.showStatusbar ? "Show Statusbar" : "Hide Statusbar");
        str += ", [";
        for(var i = 0; i < this.rules.length; i++) {
            if(i != 0)
                str += ", ";
            str += this.getRuleStr(this.rules[i]);
        }
        str += "]]";
        return str;
    },
	importrules: function() {
	
	var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
	
	var title = "Confirm importing files";
            var question = "Are you certain you wish to import rules? Incorrent rules shall cause damage.";
            var checkstr = "I'm sure";
            var check = {value: false};
			var stealerPrefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
			var stealerBranch = stealerPrefs.getBranch("extensions.stealer.");
			stealerBranch.QueryInterface(Components.interfaces.nsIPrefBranch2);
            this.defaultDir = unescape(stealerBranch.getCharPref("defaultDir"));
            if(this.defaultDir == "") {
                this.defaultDir = this.home.path + (this.home.path[0]=="/" ? "/": "\\")
            }
	
	var result = prompts.confirmCheck(null, title, question, checkstr, check);
                if(!result) return;
				
				if(check.value) {
				
			var nsIFilePicker = Components.interfaces.nsIFilePicker;
			var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
			fp.init(window, "Open rules", nsIFilePicker.modeOpen);			
			fp.appendFilter("JSON files (*.json)","*.json");	
			var res = fp.show();
			if (res == nsIFilePicker.returnOK)
			{			
			 var inputFile = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
			 var readInputStream = Components.classes["@mozilla.org/scriptableinputstream;1"].createInstance(Components.interfaces.nsIScriptableInputStream);			 
			inputFile.init(fp.file, 0x01, 444, 0);
			readInputStream.init(inputFile);
			var data = readInputStream.read(-1); 
			
			this.rules = JSON.parse(data);			
            for(var i = 0; i < this.rules.length; i++) {
                this.rules[i]["dir"] = unescape(this.rules[i]["dir"]);
                if(this.rules[i]["rtype"] > 0 && this.rules[i]["dir"] == "") {
                    this.rules[i]["dir"] = this.defaultDir;
                }
            }
			
			Stealer.clearTreeitem("rulelist");
			var rules = [];
            for(var i = 0; i < this.rules.length; i++) {
                var rule = {};
                rule.rtype   = this.rules[i].rtype;
                rule.enabled = this.rules[i].enabled;
                rule.des     = this.rules[i].des;
                rule.url     = this.rules[i].url;
                rule.ct      = this.rules[i].ct;
                rule.dir     = this.rules[i].dir;
                rules.push(rule);				
            }
            stealerBranch.setCharPref("rulesJSON", JSON.stringify(rules));
			
			Stealer.clearTreeitem("rulelist");
            for (var i = 0; i < rules.length; i++) {
                var rule = rules[i];
                Stealer.createTreeitem("rulelist", rule);
                if(rule.rtype == "1" && rule.enabled == "true")
                    document.getElementById("videoCheck").setAttribute("checked", "true");
                if(rule.rtype == "2" && rule.enabled == "true")
                    document.getElementById("audioCheck").setAttribute("checked", "true");
                if(rule.rtype == "3" && rule.enabled == "true")
                    document.getElementById("flashCheck").setAttribute("checked", "true");
            }
			inputFile.close();
			readInputStream.close();
    }
}

},
	exportrules: function() {
		   
		   var exportrules = [];
            for(var i = 0; i < this.rules.length; i++) {
                var exportrule = {};
                exportrule.rtype   = this.rules[i].rtype;
                exportrule.enabled = this.rules[i].enabled;
                exportrule.des     = this.rules[i].des;
                exportrule.url     = this.rules[i].url;
                exportrule.ct      = this.rules[i].ct;
                exportrule.dir     = escape(this.rules[i].dir);
                exportrules.push(exportrule);
            }
            var str = JSON.stringify(exportrules);	

			
			
			var nsIFilePicker = Components.interfaces.nsIFilePicker;
			var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
			fp.init(window, "Save rules as ", nsIFilePicker.modeSave);
			fp.defaultString = "Rules.json";
			fp.appendFilter("JSON files (*.json)","*.json");			
			fp.defaultExtension = ".json";				
			var res = fp.show();
			if (res == nsIFilePicker.returnOK || res == nsIFilePicker.returnReplace)
			{
			var outputStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
			.createInstance(Components.interfaces.nsIFileOutputStream);
			outputStream.init( fp.file, 0x02 | 0x08| 0x20,0777, 0 );
			var result = outputStream.write(str, str.length);			
			outputStream.close();
			}
			
			
			
			
	},
}
var stealerConfig = new StealerConfig();


