////--------------------------------------------------------------------
function MediaStealerController() {
}
MediaStealerController.prototype = {
    handleEvent: function(event) {
        try {
            var windowType = "MediaStealerMainWindow";
            var mediator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                    .getService(Components.interfaces.nsIWindowMediator);
            var stealerWindow = mediator.getMostRecentWindow(windowType);

            if(event.type == "load") {
                stealerWindow.Stealer.init();
            }
            else if(event.type == "unload") {
                stealerWindow.removeEventListener("load", this, false);
                stealerWindow.removeEventListener("unload", this, false);
            }
        } catch(e) {}
    },
    show: function() {
        var params = "";
        var windowName = "MediaStealer.MainWindow";
        var windowType = "MediaStealerMainWindow";		
        var url = "chrome://stealer/content/window.xul";
        var flags = "width=800,height=600,chrome=yes,centerscreen,resizable";

        try {
            var mediator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                    .getService(Components.interfaces.nsIWindowMediator);
            var thisWindow = mediator.getMostRecentWindow(windowType);
            if(thisWindow)
                thisWindow.focus();
            else {
                thisWindow = window.open(url, windowName, flags, params);
                thisWindow.addEventListener("load", this, false);
                thisWindow.addEventListener("unload", this, false);
            }
        }
        catch(e) {
            //alert("Exception raised in MediaStealerController.show:\n"+e.name+": "+e.message);
        }
    },
    init: function() {
        try {
            var httpObserver = Application.storage.get("observer", null);
            if(httpObserver)
                httpObserver.setController(this);
            else {
                //alert("Media StealerController.init():\nHttpObserver not registered!");
            }

            this.initUI();

            this.dbgPrintln("Media Stealer under ["+window.title+"] initialized.");
        }
        catch(e) {
            this.dbgPrintln("Media Stealer initialization failed!\n"+e.name+": "+e.message);
        }
    },
    initUI: function(xconfig) {
        try {
            var config;
            if(xconfig != null)
                config = xconfig;
            else {
                stealerConfig.load();
                config = stealerConfig;
            }

            var enabled = config.enabled;
            var showStatusbar = config.showStatusbar;
            var useCache = config.useCache;
            var alwaysConfirm = config.alwaysConfirm;
			var filetypeunknown = config.filetypeunknown;
			var nozerofiles = config.nozerofiles;
			var nosmallfiles = config.nosmallfiles;			
			
            this.initStatusbar(showStatusbar, enabled);

            var enableCheck = document.getElementById("enableCheck");
            var showStatusbarCheck = document.getElementById("showStatusbarCheck");
            var cacheCheck = document.getElementById("cacheCheck");
            var confirmCheck = document.getElementById("confirmCheck");
			var filetypeunknownCheck = document.getElementById("filetypeunknownCheck");
			var nosmallfilesCheck = document.getElementById("nosmallfilesCheck");
			var nozerofilesCheck = document.getElementById("nozerofilesCheck");

            enableCheck.setAttribute("checked", (enabled ? "true":"false"));
            showStatusbarCheck.setAttribute("checked", (showStatusbar ? "true" : "false"));
            cacheCheck.setAttribute("checked", (useCache ? "true" : "false"));
            confirmCheck.setAttribute("checked", (alwaysConfirm ? "true" : "false"));
			filetypeunknownCheck.setAttribute("checked", (filetypeunknown ? "true" : "false"));
			nosmallfilesCheck.setAttribute("checked", (nosmallfiles ? "true" : "false"));
			nozerofilesCheck.setAttribute("checked", (nozerofiles ? "true" : "false"));

            document.getElementById("defaultDir").value = config.defaultDir;

            this.clearTreeitem("rulelist");
            for (var i = 0; i < config.rules.length; i++) {
                var rule = config.rules[i];
                this.createTreeitem("rulelist", rule);
                if(rule.rtype == "1" && rule.enabled == "true")
                    document.getElementById("videoCheck").setAttribute("checked", "true");
                if(rule.rtype == "2" && rule.enabled == "true")
                    document.getElementById("audioCheck").setAttribute("checked", "true");
                if(rule.rtype == "3" && rule.enabled == "true")
                    document.getElementById("flashCheck").setAttribute("checked", "true");
            }		
        }
        catch(e) {
            this.dbgPrintln("MediaStealerController.initUI():\n"+e.name+": "+e.message);
        }
    },
    initStatusbar: function(showStatusbar, enabled) {
        var statusbar_bt = document.getElementById("stealerStatusbar");		
		
        if(showStatusbar) {
            if(enabled) {
                statusbar_bt.image = "chrome://stealer/skin/enable.png";
                statusbar_bt.setAttribute("tooltiptext", "Media Stealer enabled");
            }
            else {
                statusbar_bt.image = "chrome://stealer/skin/disable.png";
                statusbar_bt.setAttribute("tooltiptext", "Media Stealer disabled");
            }
        }
        else {
            statusbar_bt.image = "";
            statusbar_bt.setAttribute("tooltiptext", "");
        }
    },	
    save: function(xconfig) {
        try {
            if(xconfig == null)
                stealerConfig = this.collectConfig();
            else {
                stealerConfig = xconfig;
            }
            stealerConfig.save();  //  (*)
        }
        catch(e) {
            //alert("Exception raised in Stealer.save():\n"+e.name+": "+e.message);
        }
    },
    collectConfig: function() {
        try {
            var config = new StealerConfig();
            config.enabled = document.getElementById("enableCheck").checked;
            config.showStatusbar = document.getElementById("showStatusbarCheck").checked;
            config.useCache = document.getElementById("cacheCheck").checked;
            config.alwaysConfirm = document.getElementById("confirmCheck").checked;
			config.filetypeunknown = document.getElementById("filetypeunknownCheck").checked;
			config.nozerofiles = document.getElementById("nozerofilesCheck").checked;
            config.nosmallfiles	= document.getElementById("nosmallfilesCheck").checked;				
            config.defaultDir = document.getElementById("defaultDir").value;
            
            config.rules = [];
            var list = document.getElementById("rulelist");
            if(list.childNodes.length > 0) {
                for(var i = 0; i < list.childNodes.length; i++) {
                    var params = this.getTreeitem(list.childNodes[i]);
                    if(params.rtype != "0")
                        params.dir = config.defaultDir;
                    config.rules.push(params);
                }
            }
            this.dbgPrintln("MediaStealerController.collectConfig:\n"+config);
            return config;
        }
        catch(e) {
            //alert("Exception raised in Stealer.collectConfig():\n"+e.name+": "+e.message);
        }
    },

    //------------------  任务面板（tasklist及其popup）管理 -------------------------
    addTask: function(task) {
        try {
            var cell_file   = document.createElement("treecell");
            var cell_url    = document.createElement("treecell");
            var cell_type   = document.createElement("treecell");
            var cell_size   = document.createElement("treecell");
            var cell_curr   = document.createElement("treecell");
            var cell_stat   = document.createElement("treecell");
            var cell_folder = document.createElement("treecell");

            cell_file.setAttribute("label", task.filename);
            cell_file.setAttribute("file", task.file);
            cell_file.setAttribute("dir", task.dir);
            cell_file.setAttribute("id", task.id);

            cell_url .setAttribute("label", task.url);
            cell_type.setAttribute("label", task.type);
            cell_size.setAttribute("label", task.size);
            cell_curr.setAttribute("mode", "normal");
            cell_curr.setAttribute("value", task.curr/task.size*100);
            cell_curr.setAttribute("curr", task.curr);
            cell_stat.setAttribute("label", task.stat);
            cell_folder.setAttribute("label", task.dir);
         
            var row = document.createElement("treerow");
            row.appendChild(cell_file);
            row.appendChild(cell_url);
            row.appendChild(cell_type);
            row.appendChild(cell_size);
            row.appendChild(cell_curr);
            row.appendChild(cell_stat);
            row.appendChild(cell_folder);
         
            var item = document.createElement("treeitem");
            item.appendChild(row);
            document.getElementById("tasklist").appendChild(item);
        }
        catch(e) {
            //alert("MediaStealerController.addTask:\n"+e.name+": "+e.message);
        }
    },
    setTask: function(index, task) {
        if(index == -1 || !task) return;
        var tasklist = document.getElementById("tasklist");
        var treerow = tasklist.childNodes[index].firstChild;

        treerow.childNodes[0].setAttribute("label", task.filename);
        treerow.childNodes[0].setAttribute("file", task.file);
        treerow.childNodes[0].setAttribute("dir", task.dir);
        //treerow.childNodes[0].setAttribute("id", task.id);
        treerow.childNodes[1].setAttribute("label", decodeURIComponent(task.url));
        treerow.childNodes[2].setAttribute("label", task.type);
        treerow.childNodes[3].setAttribute("label", task.size);
        treerow.childNodes[4].setAttribute("mode", "normal");
        treerow.childNodes[4].setAttribute("value", task.curr/task.size*100);
        treerow.childNodes[4].setAttribute("curr", task.curr);
        treerow.childNodes[5].setAttribute("label", task.stat);
        treerow.childNodes[6].setAttribute("label", task.dir);
    },
    findTaskById: function(task) {
        var tasklist = document.getElementById("tasklist");
        for(var i = 0; i < tasklist.childNodes.length; i++) {
            var treeitem = tasklist.childNodes[i];
            var treerow = treeitem.firstChild;
            if(treerow.childNodes[0].getAttribute("id") == task.id)
                return i;
        }
        return -1;
    },
    findTaskByFile: function(task) {
        var tasklist = document.getElementById("tasklist");
        for(var i = 0; i < tasklist.childNodes.length; i++) {
            var treeitem = tasklist.childNodes[i];
            var treerow = treeitem.firstChild;
            if(treerow.childNodes[0].getAttribute("file") == task.file)
                return i;
        }
        return -1;
    },
    refreshTask: function(task) {
        var index = this.findTaskById(task);
        if(index == -1) {
            //alert("Task not found!");
            return;
        }
        this.setTask(index, task);
    },

    // 以下是任务列表(tasklist)弹出菜单的实现
    onAbort: function() {
    },
    onDeleteTask: function() {
        try {
            // for prompt
            var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                    .getService(Components.interfaces.nsIPromptService);
            var title = "Stealer";
            var question = "Really want to delete this task?";
            var checkstr = "Also remove downloaded file";
            var check = {value: true};
			var list = document.getElementById("tasklist");
			var Taskcount = list.childElementCount;	

            // do the deed
            with(document.getElementById("task-tree")) 
			{				
                var idx = currentIndex;
                if(idx < 0) return;
				
				if(idx == Taskcount) return;

                var result = prompts.confirmCheck(null, title, question, checkstr, check);
                if(!result) return;

                var treeitem = view.getItemAtIndex(idx);
                var file = treeitem.firstChild.childNodes[0].getAttribute("file");
				var stat = treeitem.firstChild.childNodes[5].getAttribute("label");				
				if ((stat == "Finished")||(stat == "Interrupted")) 
				   {

						if(check.value) {
						var fd = Components.classes["@mozilla.org/file/local;1"].
                            createInstance(Components.interfaces.nsILocalFile);
						fd.initWithPath(file);
						if(fd.exists()) fd.remove(false);
										}

						treeitem.parentNode.removeChild(treeitem);
						view.selection.select(idx);
						treeBoxObject.ensureRowIsVisible(currentIndex);
                  }
				else
				 {
				    alert("Please wait until download is complete");
				 }
		  }
        }
        catch(e) {
            alert("onDeleteTask:\n"+e.name+": "+e.message);
        }
    },
    onDeleteAllTask: function() {
        try {
            // for prompt
            var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                    .getService(Components.interfaces.nsIPromptService);
            var title = "Stealer";
            var question = "Really want to delete all the tasks?";
            var checkstr = "Also remove downloaded files";
            var check = {value: false};
            var result = prompts.confirmCheck(null, title, question, checkstr, check);
            if(!result) return;

            // do the deed
			with(document.getElementById("task-tree")) 
			{
            var list = document.getElementById("tasklist");
			var Taskcount = list.childElementCount;					
			for (Taskcount; Taskcount > 0; Taskcount--)	
				{
                var idx = Taskcount-1;				
                var treeitem = view.getItemAtIndex(idx);
				var file = treeitem.firstChild.childNodes[0].getAttribute("file");				
				var stat = treeitem.firstChild.childNodes[5].getAttribute("label");	
					if ((stat == "Finished")||(stat == "Interrupted")) 
					{
						if(check.value) 
						{
						var fd = Components.classes["@mozilla.org/file/local;1"].
                            createInstance(Components.interfaces.nsILocalFile);
						fd.initWithPath(file);
						if(fd.exists()) fd.remove(false);
					
						}
				    treeitem.parentNode.removeChild(treeitem);
                    view.selection.select(idx);
                    treeBoxObject.ensureRowIsVisible(idx);
					}
				}
			}
        }
        catch(e) {
            //alert("onDeleteAllTasks:\n"+e.name+": "+e.message);
        }
    },
    onOpenFile: function() {
        try {
            with(document.getElementById("task-tree")) {
                var idx = currentIndex;
                if(idx < 0) return;

                var treeitem = view.getItemAtIndex(idx);
                var file = treeitem.firstChild.childNodes[0].getAttribute("file");  // full path

                var fd = Components.classes["@mozilla.org/file/local;1"].
                            createInstance(Components.interfaces.nsILocalFile);
                fd.initWithPath(file);

                try {
                    fd.launch();
                }
                catch(e) {}

            }
        }
        catch(e) {
            //alert("onOpenFolder:\n"+e.name+": "+e.message);
        }
    },
    onOpenFolder: function() {
        try {
            with(document.getElementById("task-tree")) {
                var idx = currentIndex;
                if(idx < 0) return;

                var treeitem = view.getItemAtIndex(idx);
                var file = treeitem.firstChild.childNodes[0].getAttribute("file");  // full path

                var fd = Components.classes["@mozilla.org/file/local;1"].
                            createInstance(Components.interfaces.nsILocalFile);
                fd.initWithPath(file);

                try {
                    fd.reveal();
                }
                catch(e) {
                    var parent = fd.parent.QueryInterface(Components.interfaces.nsILocalFile);
                    if(!parent)
                        return;

                    try {
                        parent.launch();
                    } catch(e) {}
                }

            }
        }
        catch(e) {
            //alert("onOpenFolder:\n"+e.name+": "+e.message);
        }
    },
    onRenameFile: function() {
        try {
            with(document.getElementById("task-tree")) {
                var idx = currentIndex;
                if(idx < 0) return;

                var treeitem = view.getItemAtIndex(idx);
                var file = treeitem.firstChild.childNodes[0].getAttribute("file");  // full path

                var fd = Components.classes["@mozilla.org/file/local;1"].
                            createInstance(Components.interfaces.nsILocalFile);
                fd.initWithPath(file);

                var newName = prompt("Please input a new name:");
				//add support to remove illegal characters when rename a file
				littleaid =  newName.replace(/[<>:"\|?*]/g, "");
				newName = littleaid;
                if(fd.exists()) fd.moveTo(null, newName);  // rename rather than move

                treeitem.firstChild.childNodes[0].setAttribute("label", newName);
                var dir  = treeitem.firstChild.childNodes[0].getAttribute("dir"); // path
                treeitem.firstChild.childNodes[0].setAttribute("file", dir+newName);
            }
        }
        catch(e) {
            //alert("onRenameFile:\n"+e.name+": "+e.message);
        }
    },
    onTaskTreeDoubleClick: function(event) {
        if(event.button) return; // 右键
        try {
            with(document.getElementById("task-tree")) {
                var idx = currentIndex;
                if(idx < 0) return;

                var treeitem = view.getItemAtIndex(idx);
                var file = treeitem.firstChild.childNodes[0].getAttribute("file");  // full path

                var fd = Components.classes["@mozilla.org/file/local;1"].
                            createInstance(Components.interfaces.nsILocalFile);
                fd.initWithPath(file);

                try {
                    fd.launch();
                }
                catch(e) {}

            }
        }
        catch(e) {
            //alert("onOpenFolder:\n"+e.name+": "+e.message);
        }
    },
    onCopyRow: function() {
        try {
            with(document.getElementById("task-tree")) {
                var idx = currentIndex;
                if(idx < 0) return;

                var treerow = view.getItemAtIndex(idx).firstChild;

                var filename = treerow.childNodes[0].getAttribute("label");
                var url      = treerow.childNodes[1].getAttribute("label");
                var type     = treerow.childNodes[2].getAttribute("label");
                var size     = treerow.childNodes[3].getAttribute("label");
                var curr     = treerow.childNodes[4].getAttribute("curr");
                var stat     = treerow.childNodes[5].getAttribute("label");

                var str = filename+"\t"+url+"\t"+type+"\t"+size+"\t"+curr+"\t"+stat;
                this.toClipboard(str);
            }
        }
        catch(e) {
            //alert("onCopyRow:\n"+e.name+": "+e.message);
        }
    },
	  onCopyURL: function() {
        try {
            with(document.getElementById("task-tree")) {
                var idx = currentIndex;
                if(idx < 0) return;

                var treerow = view.getItemAtIndex(idx).firstChild;

                var url      = treerow.childNodes[1].getAttribute("label");
               
                var str = url;
                this.toClipboard(str);
            }
        }
        catch(e) {
            //alert("onCopyRow:\n"+e.name+": "+e.message);
        }
    },
	
    onCopyAllRows: function() {
        try {
            var tasklist = document.getElementById("tasklist");
            var str = "";
            for(var i = 0; i < tasklist.childNodes.length; i++) {

                var treerow = tasklist.childNodes[i].firstChild;

                var filename = treerow.childNodes[0].getAttribute("label");
                var url      = treerow.childNodes[1].getAttribute("label");
                var type     = treerow.childNodes[2].getAttribute("label");
                var size     = treerow.childNodes[3].getAttribute("label");
                var curr     = treerow.childNodes[4].getAttribute("curr");
                var stat     = treerow.childNodes[5].getAttribute("label");

                if(i) str += "\n";
                str += filename+"\t"+url+"\t"+type+"\t"+size+"\t"+curr+"\t"+stat;
            }
            if(str != "")
                this.toClipboard(str);
        }
        catch(e) {
            //alert("onCopyAllRows:\n"+e.name+": "+e.message);
        }
    },
	   onCopyAllURLS: function() {
        try {
            var tasklist = document.getElementById("tasklist");
            var str = "";
            for(var i = 0; i < tasklist.childNodes.length; i++) {

                var treerow = tasklist.childNodes[i].firstChild;
                
                var url      = treerow.childNodes[1].getAttribute("label");                

                if(i) str += "\n";
                str += url;
            }
            if(str != "")
                this.toClipboard(str);
        }
        catch(e) {
            //alert("onCopyAllRows:\n"+e.name+": "+e.message);
        }
    },
    toClipboard: function(obj) {
        try {
            const clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
                        .getService(Components.interfaces.nsIClipboardHelper);
			clipboardHelper.copyString(String(obj));
		} catch(e) {}
    },
    //------------------  任务面板（tasklist及其popup）管理 -------------------------
    //-------------------------------------------------------------------------------

    //------------------------  选项面板管理及控件响应  -----------------------------
    onVideoClick: function() {
        var state = document.getElementById("videoCheck").checked; // 得到点击前的状态
        var tasklist = document.getElementById("rulelist");
        for(var i = 0; i < tasklist.childNodes.length; i++) {
            var treeitem = tasklist.childNodes[i];
            if(treeitem.firstChild.getAttribute("rtype") == "1") {
                var params = this.getTreeitem(treeitem);
                params.enabled = (state == true) ? "false" : "true";
                this.setTreeitem(treeitem, params);
                break;
            }
        }
    },
    onAudioClick: function() {
        var state = document.getElementById("audioCheck").checked;
        var tasklist = document.getElementById("rulelist");
        for(var i = 0; i < tasklist.childNodes.length; i++) {
            var treeitem = tasklist.childNodes[i];
            if(treeitem.firstChild.getAttribute("rtype") == "2") {
                var params = this.getTreeitem(treeitem);
                params.enabled = (state == true) ? "false" : "true";
                this.setTreeitem(treeitem, params);
                break;
            }
        }
    },
    onFlashClick: function() {
        var state = document.getElementById("flashCheck").checked;
        var tasklist = document.getElementById("rulelist");
        for(var i = 0; i < tasklist.childNodes.length; i++) {
            var treeitem = tasklist.childNodes[i];
            if(treeitem.firstChild.getAttribute("rtype") == "3") {
                var params = this.getTreeitem(treeitem);
                params.enabled = (state == true) ? "false" : "true";
                this.setTreeitem(treeitem, params);
                break;
            }
        }
    },
    onDirChanged: function() {  // 动态监视defaultDir输入框的变化
        var text = String(document.getElementById("defaultDir").value);
        if(text.replace(/[ \t]+/g, "") == "")
            alert("Download directory must not be empty!");
        
    },
    changeDir: function() {  // 点击“浏览”按钮后的操作
        var fp = Components.classes["@mozilla.org/filepicker;1"]
                   .createInstance(Components.interfaces.nsIFilePicker);
        fp.init(window, "Please choose a default download directory:", 
                    Components.interfaces.nsIFilePicker.modeGetFolder);
        var ret = fp.show();
        if (ret == Components.interfaces.nsIFilePicker.returnOK) {
            var path = fp.file.path + (fp.file.path[0] == "/" ? "/" : "\\");
            document.getElementById("defaultDir").value = path;
        }
    },
    //------------------------  选项面板管理及控件响应  -----------------------------
    //-------------------------------------------------------------------------------

    //------------------  规则面板（rulelist及相关按钮）管理 ------------------------
    createTreeitem: function(listName, params) {
        try {
            var treecell1 = document.createElement("treecell");  // enabled
            var treecell2 = document.createElement("treecell");  // des
            var treecell3 = document.createElement("treecell");  // url
            var treecell4 = document.createElement("treecell");  // ct
            var treecell5 = document.createElement("treecell");  // dir
           
            var treerow = document.createElement("treerow");
            treerow.appendChild(treecell1);
            treerow.appendChild(treecell2);
            treerow.appendChild(treecell3);
            treerow.appendChild(treecell4);
            treerow.appendChild(treecell5);
           
            var treeitem = document.createElement("treeitem");
            treeitem.appendChild(treerow);
           
            this.setTreeitem(treeitem, params);
           
            document.getElementById(listName).appendChild(treeitem);
        }
        catch(e) {
            //alert("createTreeitem:\n"+e.name+": "+e.message);
        }
    },
    setTreeitem: function(treeitem, params) {
        try {
            with(treeitem.firstChild) {
                // 0        1            2    3             4
                // enabled, description, url, content-type, directory
                this.setCheckbox(treeitem, params["enabled"]);
                childNodes[1].setAttribute("label", params["des"]);
                childNodes[2].setAttribute("label", params["url"]);
                childNodes[3].setAttribute("label", params["ct"]);
                childNodes[4].setAttribute("label", params["dir"]);
                setAttribute("rtype", params["rtype"]);
            }
        }
        catch(e) {
            //alert("setTreeitem:\n"+e.name+": "+e.message);
        }
    },
    getTreeitem: function(treeitem) {
        try {
            with(treeitem.firstChild) {
                return {rtype:      getAttribute("rtype"),
                        enabled:    childNodes[0].getAttribute("value"), 
                        des:        childNodes[1].getAttribute("label"),
                        url:        childNodes[2].getAttribute("label"), 
                        ct:         childNodes[3].getAttribute("label"),
                        dir:        childNodes[4].getAttribute("label")}
            }
        }
        catch(e) {
            //alert("getTreeitem:\n"+e.name+": "+e.message);
        }
    },
    clearTreeitem: function(listName) {
        try {
            var list = document.getElementById(listName);
            while(list.hasChildNodes()) {
                list.removeChild(list.firstChild);
            }
        }
        catch(e) {
            //alert("createTreeitem:\n"+e.name+": "+e.message);
        }
    },
    editRuleList: function(mode) {
        with(document.getElementById("ruleTree")) {
            var idx = currentIndex;
            if(idx < 0) {
                return;
            }
            var treeitem = view.getItemAtIndex(idx);
            if(mode == "edit") {
                this.jumptoDetailWindow(treeitem);
            }
            else if(mode == "delete") {
                treeitem.parentNode.removeChild(treeitem);
                view.selection.select(idx);
            }
            treeBoxObject.ensureRowIsVisible(currentIndex);
        }
    },
    moveItem: function(offset) {
        with(document.getElementById("ruleTree")) {
            var idx;
            var idx2;
            if(offset < 0) {
                idx = currentIndex;
                idx2 = idx + offset;
            }
            else {
                idx2 = currentIndex;
                idx = idx2 + offset;
            }
            if(idx < 0 || idx2 < 0) {
                return;
            }
            try {
                var treeitem = view.getItemAtIndex(idx);
                var treeitem2 = view.getItemAtIndex(idx2);
                var newTreeitem = treeitem.cloneNode(true);
                treeitem2.parentNode.removeChild(treeitem);
                treeitem2.parentNode.insertBefore(newTreeitem, view.getItemAtIndex(idx2));
         
            } catch(e) {return;}
            if(offset < 0) {
                view.selection.select(idx2);
            }
            else {
                view.selection.select(idx);
            }
            treeBoxObject.ensureRowIsVisible(currentIndex);
        }
    },
    onTreedblclick: function(event) {
        if(event.button) return; // 右键
        with(document.getElementById("ruleTree")) {
            var treeitem = view.getItemAtIndex(currentIndex);
            this.jumptoDetailWindow(treeitem);
        }
    },
    jumptoDetailWindow: function(treeitem) {
        try {
            var params = {};
            if(treeitem == null)
                params = {rtype:"0", enabled:"true", des:"", url:"", ct:"", dir:stealerConfig.defaultDir};
            else
                params = this.getTreeitem(treeitem);
           
            var retParams = {rtype:params.rtype, enabled:params.enabled, des:"", url:"", ct:"", dir:"", changed:false};
            detailWindow.show(params, retParams);
            if(retParams.changed) {
                if(treeitem == null) {
                    this.createTreeitem("rulelist", retParams);
                }
                else {
                    this.setTreeitem(treeitem, retParams);
                }
            }
        }
        catch(e) {
            //alert("jumptoDetailWindow:\n"+e.name+": "+e.message);
        }
    },
    onTreeclick: function(event) {
        with(document.getElementById("ruleTree")) {
            var row = {}, col = {}, obj = {};
            treeBoxObject.getCellAt(event.clientX, event.clientY, row, col, obj);
            if(col.value==null || row.value==null || obj.value==null)
                return;
            var treeitem = view.getItemAtIndex(row.value);
            if(treeitem != null) {
                // update "Delete" button state
                var deleteButton = document.getElementById("deleteButton");
                var rtype = treeitem.firstChild.getAttribute("rtype");
                if(rtype == "0")
                    deleteButton.setAttribute("disabled", "false");
                else
                    deleteButton.setAttribute("disabled", "true");

                // update "Move" button state
                var rowcount = childNodes[1].childNodes.length;
                var upButton = document.getElementById("upButton");
                var downButton = document.getElementById("downButton");
                if(row.value == 0)
                    upButton.setAttribute("disabled", "true");
                else
                    upButton.setAttribute("disabled", "false");
                if(row.value == (rowcount-1))
                    downButton.setAttribute("disabled", "true");
                else
                    downButton.setAttribute("disabled", "false");

                // update checkbox state
                if(col.value.type == Components.interfaces.nsITreeColumn.TYPE_CHECKBOX)
                    this.reverseCheckbox(treeitem);
            }
        }// with
    },
    setCheckbox: function(treeitem, checked) {
        var checkboxCell = treeitem.firstChild.childNodes[0];
        if(checked == "true") {
            checkboxCell.setAttribute("value", "true");
            checkboxCell.setAttribute("properties", "checked");
        }
        else if(checked == "" || checked == "false") {
            checkboxCell.setAttribute("value", "false");
            checkboxCell.setAttribute("properties", "unchecked");
        }
    },
    reverseCheckbox: function(treeitem) {
        var checkboxCell = treeitem.firstChild.childNodes[0];
        var value = checkboxCell.getAttribute("value");
        if(value == "true") {
            checkboxCell.setAttribute("value", "false");
            checkboxCell.setAttribute("properties", "unchecked");
        }
        else {
            checkboxCell.setAttribute("value", "true");
            checkboxCell.setAttribute("properties", "checked");
        }

        var rtype = treeitem.firstChild.getAttribute("rtype");
        if(rtype == "1") {
            var videoCheck = document.getElementById("videoCheck");
            videoCheck.checked = (value == "true") ? false : true;
        }
        else if(rtype == "2") {
            var audioCheck = document.getElementById("audioCheck");
            audioCheck.checked = (value == "true") ? false : true;
        }
        else if(rtype == "3") {
            var flashCheck = document.getElementById("flashCheck");
            flashCheck.checked = (value == "true") ? false : true;
        }
    },
    onNewButtonClick: function() {
        with(document.getElementById("ruleTree")) {
            this.jumptoDetailWindow(null);
        }
    },
    onEditButtonClick: function() {
        this.editRuleList("edit");
    },
    onDeleteButtonClick: function() {
        this.editRuleList("delete");
    },
    //------------------  规则面板（rulelist及相关按钮）管理 ------------------------
    //-------------------------------------------------------------------------------

    //---------------------------  消息与调试面板管理 -------------------------------
    dbgPrint: function(msg) {
        var dbgbox = document.getElementById("stealer-dbgbox");
        dbgbox.value += msg;
    },
    dbgPrintln: function(msg) {
        this.dbgPrint(msg+"\n");
    },
    //----------------------------  消息与调试面板管理 ------------------------------
    //-------------------------------------------------------------------------------
    switchState: function(newState) {  // 三态切换的唯一途径
        try {
            var oldState = this.getState();
            if(newState == oldState && oldState != "window") return;
         
            var mediator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                                     .getService(Components.interfaces.nsIWindowMediator);
            var browser = mediator.getMostRecentWindow("navigator:browser");
            var splitter = browser.document.getElementById("stealerPanelSplitter");
            var vbox = browser.document.getElementById("panel-parent1");
            var menuitem = browser.document.getElementById("stealer-switch-toggle");

            if(oldState == "close") {
                if(newState == "toggle") {
                    splitter.collapsed = false;
                    vbox.collapsed = false;
                    menuitem.setAttribute("checked", "true");
                }
                else if(newState == "window") {
                    this.show();
                }
            }
            else if(oldState == "toggle") {
                if(newState == "close") {
                    splitter.collapsed = true;
                    vbox.collapsed = true;
                    menuitem.setAttribute("checked", "false");
                }
                else if(newState == "window") {
                    splitter.collapsed = true;
                    vbox.collapsed = true;
                    this.show();
                }
            }
            else if(oldState == "window") {
                var stealerWindow = mediator.getMostRecentWindow("MediaStealerMainWindow");
                if(stealerWindow == null) {
                    this.setState("close");
                    this.switchState(newState);
                }
                if(newState == "close") {
                    stealerWindow.close();
                    menuitem.setAttribute("checked", "false");
                }
                else if(newState == "toggle") {
                    splitter.collapsed = false;
                    vbox.collapsed = false;
                    stealerWindow.close();
                    menuitem.setAttribute("checked", "true");
                }
                else if(newState == "window") {
                    this.show();
                }
            }
            this.setState(newState);
        }
        catch(e) {
            //alert("MediaStealerController.switchState:\n"+e.name+": "+e.message);
        }
    },
    onShow: function() {
        this.switchState("window");
    },
    onToggle: function() {
        var oldState = this.getState();
        if(oldState == "close")
            this.switchState("toggle");
        else if(oldState == "toggle")
            this.switchState("close");
        else if(oldState == "window")
            this.switchState("toggle");
    },
    onDetach: function() {
        var oldState = this.getState();
        if(oldState == "toggle")
            this.switchState("window");
        else if(oldState == "window")
            this.switchState("toggle");
    },
    onApply: function() {
        var config = this.collectConfig();
        this.initUI(config);
        this.save(config);
    },
    onOK: function() {
        this.onApply();
        this.onCancel();
    },
    onCancel: function() {
        this.setState("toggle");
        this.switchState("close");
    },
    getState: function() {
        return Application.storage.get("state", "dummy");
    },
    setState: function(newState) {
        Application.storage.set("state", newState);
    },
    // for the statusbarpanel
    onStatusbarClick: function(event) {
        if(event.button == 0) {
            stealerConfig.load();
            stealerConfig.enabled = !stealerConfig.enabled;
            stealerConfig.save();

            var enableCheck = document.getElementById("enableCheck");
            enableCheck.setAttribute("checked", stealerConfig.enabled ? "true" : "false");
            this.initStatusbar(stealerConfig.showStatusbar, stealerConfig.enabled);
        }
        //else {
        //    Stealer.onToggle();
        //}
        // Right clicking on the status bar of firefox 4 pops up an important context menu.
        // So I comment the `else' branch to disable my event handler.
        // 2011.2.15
    },
    //------------------------  界面状态管理（三态切换） ----------------------------
    //-------------------------------------------------------------------------------

    onAbout: function() {
        var mediator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                .getService(Components.interfaces.nsIWindowMediator);
        var browser = mediator.getMostRecentWindow("navigator:browser");
        openDialog("chrome://stealer/content/about-en.html", "aboutMediaStealer", "chrome,centerscreen,width=800,height=600,resizable");
    }
}// Stealer

var Stealer = new MediaStealerController();
//--------------------------------------------------------------------
