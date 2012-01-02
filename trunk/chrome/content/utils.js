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
    }
}

var stealerConfig = new StealerConfig();
