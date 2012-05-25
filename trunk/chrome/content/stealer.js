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
            var firstrun = config.firstrun;
            var showStatusbar = config.showStatusbar;
            var useCache = config.useCache;
            //var alwaysConfirm = config.alwaysConfirm;
            var filetypeunknown = config.filetypeunknown;
            var nozerofiles = config.nozerofiles;
            var nosmallfiles = config.nosmallfiles;
            var alwaysaskdownloadfolder = config.alwaysaskdownloadfolder;
            var showToggleStatusbar = config.showToggleStatusbar;
            var automaticdownload = config.automaticdownload;

            this.initStatusbar(showStatusbar, enabled);
            this.initToggleStatusbar(showToggleStatusbar, enabled);

            var MediaStealerenableCheck = document.getElementById("MediaStealerenableCheck");
            var MediaStealershowStatusbarCheck = document.getElementById("MediaStealershowStatusbarCheck");
            var MediaStealercacheCheck = document.getElementById("MediaStealercacheCheck");
            //var MediaStealerconfirmCheck = document.getElementById("MediaStealerconfirmCheck");
            var MediaStealerfiletypeunknownCheck = document.getElementById("MediaStealerfiletypeunknownCheck");
            var MediaStealernosmallfilesCheck = document.getElementById("MediaStealernosmallfilesCheck");
            var MediaStealernozerofilesCheck = document.getElementById("MediaStealernozerofilesCheck");
            var MediaStealeralwaysaskdownloadfolderCheck = document.getElementById("MediaStealeralwaysaskdownloadfolderCheck");
            var MediaStealerToggleCheck = document.getElementById("MediaStealerToggleCheck");
            var MediaStealerAutomaticdownloadCheck = document.getElementById("MediaStealerAutomaticdownloadCheck");

            MediaStealerenableCheck.setAttribute("checked", (enabled ? "true":"false"));
            MediaStealershowStatusbarCheck.setAttribute("checked", (showStatusbar ? "true" : "false"));
            MediaStealercacheCheck.setAttribute("checked", (useCache ? "true" : "false"));
            //MediaStealerconfirmCheck.setAttribute("checked", (alwaysConfirm ? "true" : "false"));
            MediaStealerfiletypeunknownCheck.setAttribute("checked", (filetypeunknown ? "true" : "false"));
            MediaStealernosmallfilesCheck.setAttribute("checked", (nosmallfiles ? "true" : "false"));
            MediaStealernozerofilesCheck.setAttribute("checked", (nozerofiles ? "true" : "false"));
            MediaStealeralwaysaskdownloadfolderCheck.setAttribute("checked", (alwaysaskdownloadfolder ? "true" : "false"));
            MediaStealerToggleCheck.setAttribute("checked", (showToggleStatusbar ? "true" : "false"));
            MediaStealerAutomaticdownloadCheck.setAttribute("checked", (automaticdownload ? "true" : "false"));
            if (firstrun == true)
            {
              var kToolBarID = "nav-bar";
              var kTBItemID = "Media_Stealer_Button";
              var tbElem = document.getElementById(kToolBarID);
              var tbItemElem = document.getElementById(kTBItemID);
              if (tbElem && !tbItemElem)
              {
                var newSet = tbElem.currentSet + "," + kTBItemID;
                tbElem.setAttribute("currentset", newSet);
                tbElem.currentSet = newSet;
                document.persist(kToolBarID, "currentset");   
              }	
              config.firstrun = false;
              stealerConfig.save();              
            }

            document.getElementById("MediaStealerdefaultDir").value = config.defaultDir;

            this.clearTreeitem("MediaStealerrulelist");
            for (var i = 0; i < config.rules.length; i++) {
                var rule = config.rules[i];
                this.createTreeitem("MediaStealerrulelist", rule);
                //if(rule.rtype == "1" && rule.enabled == "true")
                //    document.getElementById("MediaStealervideoCheck").setAttribute("checked", "true");
                //if(rule.rtype == "2" && rule.enabled == "true")
                //    document.getElementById("MediaStealeraudioCheck").setAttribute("checked", "true");
                //if(rule.rtype == "3" && rule.enabled == "true")
                //    document.getElementById("MediaStealerflashCheck").setAttribute("checked", "true");
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
    initToggleStatusbar: function(showToggleStatusbar, enabled) {
        var statusbar_bt = document.getElementById("MediaStealerTogglebar");

        if(showToggleStatusbar) {
            if(enabled) {
                statusbar_bt.image = "chrome://stealer/skin/mediastealer16.png";
                statusbar_bt.setAttribute("tooltiptext", "Toggle Media Stealer");
            } 
            else
            {
                statusbar_bt.image = "chrome://stealer/skin/mediastealer16.png";
                statusbar_bt.setAttribute("tooltiptext", "Toggle Media Stealer");
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
            config.enabled = document.getElementById("MediaStealerenableCheck").checked;
            config.showStatusbar = document.getElementById("MediaStealershowStatusbarCheck").checked;
            config.useCache = document.getElementById("MediaStealercacheCheck").checked;
            //config.alwaysConfirm = document.getElementById("MediaStealerconfirmCheck").checked;
            config.filetypeunknown = document.getElementById("MediaStealerfiletypeunknownCheck").checked;
            config.nozerofiles = document.getElementById("MediaStealernozerofilesCheck").checked;
            config.nosmallfiles = document.getElementById("MediaStealernosmallfilesCheck").checked;
            config.defaultDir = document.getElementById("MediaStealerdefaultDir").value;
            config.alwaysaskdownloadfolder = document.getElementById("MediaStealeralwaysaskdownloadfolderCheck").checked;
            config.showToggleStatusbar = document.getElementById("MediaStealerToggleCheck").checked;  
            config.automaticdownload = document.getElementById("MediaStealerAutomaticdownloadCheck").checked;   

            config.rules = [];
            var list = document.getElementById("MediaStealerrulelist");
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

    //------------------  Task panel (tasklist and popup) -------------------------
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
            cell_file.setAttribute("DownloadID", task.DownloadID);

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
            document.getElementById("MediaStealertasklist").appendChild(item);
        }
        catch(e) {
            //alert("MediaStealerController.addTask:\n"+e.name+": "+e.message);
        }
    },
    setTask: function(index, task) {
        if(index == -1 || !task) return;
        var tasklist = document.getElementById("MediaStealertasklist");
        var treerow = tasklist.childNodes[index].firstChild;

        treerow.childNodes[0].setAttribute("label", task.filename);
        treerow.childNodes[0].setAttribute("file", task.file);
        treerow.childNodes[0].setAttribute("dir", task.dir);
        //treerow.childNodes[0].setAttribute("id", task.id);
        treerow.childNodes[1].setAttribute("label", task.url);
        treerow.childNodes[2].setAttribute("label", task.type);
        treerow.childNodes[3].setAttribute("label", task.size);
        treerow.childNodes[4].setAttribute("mode", "normal");
        treerow.childNodes[4].setAttribute("value", task.curr/task.size*100);
        treerow.childNodes[4].setAttribute("curr", task.curr);
        treerow.childNodes[5].setAttribute("label", task.stat);
        treerow.childNodes[6].setAttribute("label", task.dir);
    },
    findTaskById: function(task) {
        var tasklist = document.getElementById("MediaStealertasklist");
        for(var i = 0; i < tasklist.childNodes.length; i++) {
            var treeitem = tasklist.childNodes[i];
            var treerow = treeitem.firstChild;
            if(treerow.childNodes[0].getAttribute("id") == task.id)
                return i;
        }
        return -1;
    },
    findTaskByFile: function(task) {
        var tasklist = document.getElementById("MediaStealertasklist");
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

    // implementation of the tasklist context menu
    onAbort: function() {
        try {
            var downloadManager = Components.classes["@mozilla.org/download-manager;1"].getService(Components.interfaces.nsIDownloadManager);
            var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
            var title = "Stealer";
            var list = document.getElementById("MediaStealertasklist");
            var Taskcount = list.childElementCount;

            // do the deed
            var temptaskTree = document.getElementById("MediaStealertask-tree");

            var idx = temptaskTree.currentIndex;
            if(idx < 0) return;

            if(idx == Taskcount) return;

            var choice = prompts.confirm(null, title, "Are you sure you want to abort this file and task? This will result in deleting the file and task.");
            if(!choice) return;

            var treeitem = temptaskTree.view.getItemAtIndex(idx);
            var file = treeitem.firstChild.childNodes[0].getAttribute("file");
            var downloadID = treeitem.firstChild.childNodes[0].getAttribute("DownloadID");
            var stat = treeitem.firstChild.childNodes[5].getAttribute("label");

            if (stat == "Transferring" || stat == "Paused")
            {
                downloadManager.cancelDownload(downloadID);
            }
            var fd = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
            fd.initWithPath(file);
            if(fd.exists()) fd.remove(false);
            treeitem.parentNode.removeChild(treeitem);
            temptaskTree.view.selection.select(idx);
            temptaskTree.treeBoxObject.ensureRowIsVisible(temptaskTree.currentIndex);
        }
        catch(e) {
            alert("onAbort:\n"+e.name+": "+e.message);
        }
    },
    onPause: function() {

        try {

            var downloadManager = Components.classes["@mozilla.org/download-manager;1"].getService(Components.interfaces.nsIDownloadManager);
            var list = document.getElementById("MediaStealertasklist");
            var Taskcount = list.childElementCount;

            // do the deed
            var temptaskTree = document.getElementById("MediaStealertask-tree");

            var idx = temptaskTree.currentIndex;
            if(idx < 0) return;

            if(idx == Taskcount) return;

            var treeitem = temptaskTree.view.getItemAtIndex(idx);
            var file = treeitem.firstChild.childNodes[0].getAttribute("file");
            var downloadID = treeitem.firstChild.childNodes[0].getAttribute("DownloadID");
            var stat = treeitem.firstChild.childNodes[5].getAttribute("label");
            treeitem.firstChild.childNodes[5].setAttribute("label", "Paused");
            var resumeButton = document.getElementById("MediaStealerresume");
            var pauseButton = document.getElementById("MediaStealerpause");
            resumeButton.setAttribute("disabled", "false");
            pauseButton.setAttribute("disabled", "true");
            if (stat == "Transferring")
            {
                downloadManager.pauseDownload(downloadID);
            }
        }
        catch(e) {
            alert("onPause:\n"+e.name+": "+e.message);
        }
    },
    onResume: function() {

        try {
            var downloadManager = Components.classes["@mozilla.org/download-manager;1"].getService(Components.interfaces.nsIDownloadManager);
            var list = document.getElementById("MediaStealertasklist");
            var Taskcount = list.childElementCount;

            // do the deed
            var temptaskTree = document.getElementById("MediaStealertask-tree");

            var idx = temptaskTree.currentIndex;
            if(idx < 0) return;
            if(idx == Taskcount) return

            var treeitem = temptaskTree.view.getItemAtIndex(idx);
            var file = treeitem.firstChild.childNodes[0].getAttribute("file");
            var downloadID = treeitem.firstChild.childNodes[0].getAttribute("DownloadID");
            var stat = treeitem.firstChild.childNodes[5].getAttribute("label");
            var resumeButton = document.getElementById("MediaStealerresume");
            var pauseButton = document.getElementById("MediaStealerpause");
            pauseButton.setAttribute("disabled", "false");
            resumeButton.setAttribute("disabled", "true");
            if (stat =="Paused")
            {
                downloadManager.resumeDownload(downloadID);
            }
        }
        catch(e) {
            alert("onResume:\n"+e.name+": "+e.message);
        }
    },
    onDeleteTask: function() {
        try {
            // for prompt
            var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                    .getService(Components.interfaces.nsIPromptService);
            var title = "Stealer";
            var question = "Do you really want to delete this task?";
            var checkstr = "Also remove downloaded file";
            var check = {value: false};
            var list = document.getElementById("MediaStealertasklist");
            var Taskcount = list.childElementCount;

            // do the deed
            var temptaskTree = document.getElementById("MediaStealertask-tree");

            var idx = temptaskTree.currentIndex;
            if(idx < 0) return;
            if(idx == Taskcount) return;

            var result = prompts.confirmCheck(null, title, question, checkstr, check);
            if(!result) return;

            var treeitem = temptaskTree.view.getItemAtIndex(idx);
            var file = treeitem.firstChild.childNodes[0].getAttribute("file");
            var stat = treeitem.firstChild.childNodes[5].getAttribute("label");
            if ((stat == "Finished")||(stat == "Interrupted")||(stat == "Ready to download")) {

                if(check.value) {
                    var fd = Components.classes["@mozilla.org/file/local;1"]
                                       .createInstance(Components.interfaces.nsILocalFile);
                    fd.initWithPath(file);
                    if(fd.exists())
                        fd.remove(false);
                }

                treeitem.parentNode.removeChild(treeitem);
                temptaskTree.view.selection.select(idx);
                temptaskTree.treeBoxObject.ensureRowIsVisible(temptaskTree.currentIndex);
            }
            else {
                alert("Please wait until download is complete");
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
            var question = "Do you really want to delete all the tasks?";
            var checkstr = "Also remove downloaded files";
            var check = {value: false};
            var result = prompts.confirmCheck(null, title, question, checkstr, check);
            if(!result) return;

            // do the deed
            var temptaskTree = document.getElementById("MediaStealertask-tree");
            var list = document.getElementById("MediaStealertasklist");
            var Taskcount = list.childElementCount;
            for (Taskcount; Taskcount > 0; Taskcount--)
            {
                var idx = Taskcount-1;
                var treeitem = temptaskTree.view.getItemAtIndex(idx);
                var file = treeitem.firstChild.childNodes[0].getAttribute("file");
                var stat = treeitem.firstChild.childNodes[5].getAttribute("label");
                if ((stat == "Finished")||(stat == "Interrupted")||(stat == "Ready to download"))
                {
                    if(check.value) {
                    var fd = Components.classes["@mozilla.org/file/local;1"]
                                       .createInstance(Components.interfaces.nsILocalFile);
                    fd.initWithPath(file);
                    if(fd.exists())
                        fd.remove(false);

                    }
                    treeitem.parentNode.removeChild(treeitem);
                    temptaskTree.view.selection.select(idx);
                    temptaskTree.treeBoxObject.ensureRowIsVisible(idx);
                }
            }
        }
        catch(e) {
            //alert("onDeleteAllTasks:\n"+e.name+": "+e.message);
        }
    },
    onOpenFile: function() {
        try {
            var temptaskTree = document.getElementById("MediaStealertask-tree");
            var idx = temptaskTree.currentIndex;
            if(idx < 0) return;

            var treeitem = temptaskTree.view.getItemAtIndex(idx);
            var file = treeitem.firstChild.childNodes[0].getAttribute("file");  // full path
            var stat = treeitem.firstChild.childNodes[5].getAttribute("label"); // status
            if ((stat == "Finished") || (stat == "Interrupted")) {

                var fd = Components.classes["@mozilla.org/file/local;1"]
                                   .createInstance(Components.interfaces.nsILocalFile);
                fd.initWithPath(file);

                try {
                    fd.launch();
                }
                catch(e) {}
            }
            else
            {
                alert("Please wait until download is complete");
            }
        }
        catch(e) {
            //alert("onOpenFolder:\n"+e.name+": "+e.message);
        }
    },
    onOpenFolder: function() {
        try {
            var temptaskTree = document.getElementById("MediaStealertask-tree");
            var idx = temptaskTree.currentIndex;
            var list = document.getElementById("MediaStealertasklist");
            var idx2  = list.childElementCount;
            if((idx2 < 1) || (idx == idx2) || (idx == -1)) {
                var fd = Components.classes["@mozilla.org/file/local;1"]
                                   .createInstance(Components.interfaces.nsILocalFile);
                var tempdownloaddir = stealerConfig.defaultDir;
                fd.initWithPath(tempdownloaddir);

                if( !fd.exists() || !fd.isDirectory()) {
                    var tempdownloaddir = stealerConfig.home.path;
                    fd.initWithPath(tempdownloaddir);
                }
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

                return;
            }

            var treeitem = temptaskTree.view.getItemAtIndex(idx);
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
        catch(e) {
            //alert("onOpenFolder:\n"+e.name+": "+e.message);
        }
    },
    onRenameFile: function() {
        try {
            var temptaskTree = document.getElementById("MediaStealertask-tree");
            var idx = temptaskTree.currentIndex;
            if(idx < 0) return;

            var treeitem = temptaskTree.view.getItemAtIndex(idx);
            var file = treeitem.firstChild.childNodes[0].getAttribute("file");  // full path
            var label = treeitem.firstChild.childNodes[0].getAttribute("label");//filename
            var dir = treeitem.firstChild.childNodes[0].getAttribute("dir");//destinationfolder
            var fd = Components.classes["@mozilla.org/file/local;1"]
                               .createInstance(Components.interfaces.nsILocalFile);
            fd.initWithPath(file);

            var nsIFilePicker = Components.interfaces.nsIFilePicker;
            var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
            fp.init(window, "Please select a folder and enter a filename", nsIFilePicker.modeSave);
            fp.defaultString = label;
            fp.displayDirectory = fd;
            var res = fp.show();
            if (res == nsIFilePicker.returnOK || res == nsIFilePicker.returnReplace) {
                var fileleafname = fp.file.leafName;
                var filepath = fp.file.path;
                var fileleafnamelength = fileleafname.length;
                var filepathlength = filepath.length;
                var fileresult = filepath.substr(0,(filepathlength-fileleafnamelength));

                 // rename rather than move
                if(fd.exists()) fd.moveTo(fp.file.parent, fp.file.leafName);
                treeitem.firstChild.childNodes[0].setAttribute("label", fp.file.leafName);
                var dir  = treeitem.firstChild.childNodes[0].getAttribute("dir"); // path
                treeitem.firstChild.childNodes[0].setAttribute("file", fp.file.path);
                treeitem.firstChild.childNodes[6].setAttribute("label", fileresult);
            }
        }
        catch(e) {
            //alert("onRenameFile:\n"+e.name+": "+e.message);
        }
    },
    onTaskTreeDoubleClick: function(event) {
        if(event.button) return;  // right click

        try {
            var temptaskTree = document.getElementById("MediaStealertask-tree");
            var idx = temptaskTree.currentIndex;
            if(idx < 0) return;

            var treeitem = temptaskTree.view.getItemAtIndex(idx);
            var file = treeitem.firstChild.childNodes[0].getAttribute("file");  // full path
            var stat = treeitem.firstChild.childNodes[5].getAttribute("label"); // status
            if ((stat == "Finished")||(stat == "Interrupted")) {

                var fd = Components.classes["@mozilla.org/file/local;1"].
                            createInstance(Components.interfaces.nsILocalFile);
                fd.initWithPath(file);

                try {
                    fd.launch();
                }
                catch(e) {}
            }
            else
            {
                alert("Please wait until download is complete");
            }

        }
        catch(e) {
            //alert("onOpenFolder:\n"+e.name+": "+e.message);
        }
    },
    onTaskTreeClick: function(event) {
        if(event.button) return; // right click

        try {
            var temptaskTree = document.getElementById("MediaStealertask-tree");
            var idx = temptaskTree.currentIndex;
            if(idx < 0) return;

            var treeitem = temptaskTree.view.getItemAtIndex(idx);
            var resumeButton = document.getElementById("MediaStealerresume");
            var pauseButton = document.getElementById("MediaStealerpause");
            var deleteButton = document.getElementById("MediaStealerdelete");
            var stat = treeitem.firstChild.childNodes[5].getAttribute("label"); // status

            if (stat=="Transferring")
            {
                resumeButton.setAttribute("disabled", "true");
                pauseButton.setAttribute("disabled", "false");
                deleteButton.setAttribute("disabled", "true");
            }
            else if(stat=="Paused")
            {
                deleteButton.setAttribute("disabled", "true");
                resumeButton.setAttribute("disabled", "false");
                pauseButton.setAttribute("disabled", "true");
            }
            else if(stat=="Interrupted")
            {
                deleteButton.setAttribute("enabled", "true");
                resumeButton.setAttribute("disabled", "true");
                pauseButton.setAttribute("disabled", "true");
            }
            else if(stat=="Finished")
            {
                deleteButton.setAttribute("disabled", "false");
                resumeButton.setAttribute("disabled", "true");
                pauseButton.setAttribute("disabled", "true");
            }
        }
        catch(e) {
            //alert("onTaskTreeClick:\n"+e.name+": "+e.message);
        }
    },
    onCopyRow: function() {
        try {
            var temptaskTree = document.getElementById("MediaStealertask-tree");
            var idx = temptaskTree.currentIndex;
            if(idx < 0) return;

            var treerow = temptaskTree.view.getItemAtIndex(idx).firstChild;

            var filename = treerow.childNodes[0].getAttribute("label");
            var url      = treerow.childNodes[1].getAttribute("label");
            var type     = treerow.childNodes[2].getAttribute("label");
            var size     = treerow.childNodes[3].getAttribute("label");
            var curr     = treerow.childNodes[4].getAttribute("curr");
            var stat     = treerow.childNodes[5].getAttribute("label");

            var str = filename+"\t"+url+"\t"+type+"\t"+size+"\t"+curr+"\t"+stat;
            this.toClipboard(str);
        }
        catch(e) {
            //alert("onCopyRow:\n"+e.name+": "+e.message);
        }
    },
    onCopyURL: function() {
        try {
            var temptaskTree = document.getElementById("MediaStealertask-tree");
            var idx = temptaskTree.currentIndex;
            if(idx < 0) return;

            var treerow = temptaskTree.view.getItemAtIndex(idx).firstChild;

            var url = decodeURIComponent(treerow.childNodes[1].getAttribute("label"));

            var str = url;
            this.toClipboard(str);

        }
        catch(e) {
            //alert("onCopyRow:\n"+e.name+": "+e.message);
        }
    },

    onCopyAllRows: function() {
        try {
            var tasklist = document.getElementById("MediaStealertasklist");
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
            var tasklist = document.getElementById("MediaStealertasklist");
            var str = "";
            for(var i = 0; i < tasklist.childNodes.length; i++) {

                var treerow = tasklist.childNodes[i].firstChild;

                var url = decodeURIComponent(treerow.childNodes[1].getAttribute("label"));

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
    //-------------------------------------------------------------------------------

    //------------------------  Option panel  -----------------------------
    onVideoClick: function() {
        var state = document.getElementById("MediaStealervideoCheck").checked;
        var tasklist = document.getElementById("MediaStealerrulelist");
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
        var state = document.getElementById("MediaStealeraudioCheck").checked;
        var tasklist = document.getElementById("MediaStealerrulelist");
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
        var state = document.getElementById("MediaStealerflashCheck").checked;
        var tasklist = document.getElementById("MediaStealerrulelist");
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
    onDirChanged: function() {  // monitor the defaultDir input
        var text = String(document.getElementById("MediaStealerdefaultDir").value);
        if(text.replace(/[ \t]+/g, "") == "")
            alert("Download directory must not be empty!");

    },
    changeDir: function() {  // the Browse button is clicked
        var fp = Components.classes["@mozilla.org/filepicker;1"]
                   .createInstance(Components.interfaces.nsIFilePicker);
        fp.init(window, "Please choose a default download directory:",
                    Components.interfaces.nsIFilePicker.modeGetFolder);
        var ret = fp.show();
        if (ret == Components.interfaces.nsIFilePicker.returnOK) {
            var path = fp.file.path + (fp.file.path[0] == "/" ? "/" : "\\");
            document.getElementById("MediaStealerdefaultDir").value = path;
        }
    },
    //-------------------------------------------------------------------------------

    //------------------  Rule panel (rulelist)  ------------------------
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
            var temp_treeitem_firstChild = treeitem.firstChild;
            // 0        1            2    3             4
            // enabled, description, url, content-type, directory
            this.setCheckbox(treeitem, params["enabled"]);
            temp_treeitem_firstChild.childNodes[1].setAttribute("label", params["des"]);
            temp_treeitem_firstChild.childNodes[2].setAttribute("label", params["url"]);
            temp_treeitem_firstChild.childNodes[3].setAttribute("label", params["ct"]);
            temp_treeitem_firstChild.childNodes[4].setAttribute("label", params["dir"]);
            temp_treeitem_firstChild.setAttribute("rtype", params["rtype"]);
        }
        catch(e) {
            //alert("setTreeitem:\n"+e.name+": "+e.message);
        }
    },
    getTreeitem: function(treeitem) {
        try {
            var temp_treeitem_firstChild = treeitem.firstChild;
            return {
                rtype:      temp_treeitem_firstChild.getAttribute("rtype"),
                enabled:    temp_treeitem_firstChild.childNodes[0].getAttribute("value"),
                des:        temp_treeitem_firstChild.childNodes[1].getAttribute("label"),
                url:        temp_treeitem_firstChild.childNodes[2].getAttribute("label"),
                ct:         temp_treeitem_firstChild.childNodes[3].getAttribute("label"),
                dir:        temp_treeitem_firstChild.childNodes[4].getAttribute("label")
            };
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
        var tempruleTree = document.getElementById("MediaStealerruleTree");
        var idx = tempruleTree.currentIndex;
        //if(idx < 2) {
        //    return;
        //}
        var treeitem = tempruleTree.view.getItemAtIndex(idx);
        if(mode == "edit") {
            this.jumptoDetailWindow(treeitem);
        }
        else if(mode == "delete") {
            treeitem.parentNode.removeChild(treeitem);
            tempruleTree.view.selection.select(idx);
        }
        tempruleTree.treeBoxObject.ensureRowIsVisible(idx);
    },
    moveItem: function(offset) {
        var tempruleTree = document.getElementById("MediaStealerruleTree");
        var idx;
        var idx2;
        if(offset < 0) {
            idx = tempruleTree.currentIndex;
            idx2 = idx + offset;
        }
        else {
            idx2 = tempruleTree.currentIndex;
            idx = idx2 + offset;
        }
        if(idx < 0 || idx2 < 0) {
            return;
        }
        try {
            var treeitem = tempruleTree.view.getItemAtIndex(idx);
            var treeitem2 = tempruleTree.view.getItemAtIndex(idx2);
            var newTreeitem = treeitem.cloneNode(true);
            treeitem2.parentNode.removeChild(treeitem);
            treeitem2.parentNode.insertBefore(newTreeitem, tempruleTree.view.getItemAtIndex(idx2));

        } catch(e) {return;}
        if(offset < 0) {
            tempruleTree.view.selection.select(idx2);
        }
        else {
            tempruleTree.view.selection.select(idx);
        }
        tempruleTree.treeBoxObject.ensureRowIsVisible(currentIndex);
    },
    onTreedblclick: function(event) {
        if(event.button) return; // right click

        var tempruleTree = document.getElementById("MediaStealerruleTree");
        var treeitem = tempruleTree.view.getItemAtIndex(tempruleTree.currentIndex);
        this.jumptoDetailWindow(treeitem);
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
                    this.createTreeitem("MediaStealerrulelist", retParams);
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

        var tempruleTree = document.getElementById("MediaStealerruleTree");
        var row = {}, col = {}, obj = {};
        tempruleTree.treeBoxObject.getCellAt(event.clientX, event.clientY, row, col, obj);
        if(col.value==null || row.value==null || obj.value==null)
            return;
        var treeitem = tempruleTree.view.getItemAtIndex(row.value);
        if(treeitem != null) {
            // update "Delete" button state
            var deleteButton = document.getElementById("MediaStealerdeleteButton");
            var rtype = treeitem.firstChild.getAttribute("rtype");

            if(rtype == "0")
                deleteButton.setAttribute("disabled", "false");
            else
                deleteButton.setAttribute("disabled", "true");

            // update "Move" button state
            var rowcount = tempruleTree.childNodes[1].childNodes.length;
            var upButton = document.getElementById("MediaStealerupButton");
            var downButton = document.getElementById("MediaStealerdownButton");
            if(row.value == 0)
                upButton.setAttribute("disabled", "true");
            else
                upButton.setAttribute("disabled", "false");
            if(row.value == (rowcount-1))
                downButton.setAttribute("disabled", "true");
            else
                downButton.setAttribute("disabled", "false");

            // update checkbox state
            //if(col.value.type == Components.interfaces.nsITreeColumn.TYPE_CHECKBOX)
            //    this.reverseCheckbox(treeitem);
        }

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
            var MediaStealervideoCheck = document.getElementById("MediaStealervideoCheck");
            MediaStealervideoCheck.checked = (value == "true") ? false : true;
        }
        else if(rtype == "2") {
            var MediaStealeraudioCheck = document.getElementById("MediaStealeraudioCheck");
            MediaStealeraudioCheck.checked = (value == "true") ? false : true;
        }
        else if(rtype == "3") {
            var MediaStealerflashCheck = document.getElementById("MediaStealerflashCheck");
            MediaStealerflashCheck.checked = (value == "true") ? false : true;
        }
    },
    onNewButtonClick: function() {
        this.jumptoDetailWindow(null);
    },
    onEditButtonClick: function() {
        this.editRuleList("edit");
    },
    onDeleteButtonClick: function() {
        this.editRuleList("delete");
    },
    //-------------------------------------------------------------------------------

    //---------------------------  Debug panel -------------------------------
    dbgPrint: function(msg) {
        var dbgbox = document.getElementById("stealer-dbgbox");
        dbgbox.value += msg;
    },
    dbgPrintln: function(msg) {
        this.dbgPrint(msg+"\n");
    },
    //-------------------------------------------------------------------------------

    // It is possible to open Media Stealer in a seperate window. Disabled.
    switchState: function(newState) {  // switch between bottom panel and seperate window
        try {
            var oldState = this.getState();
            if(newState == oldState && oldState != "window") return;

            var mediator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                                     .getService(Components.interfaces.nsIWindowMediator);
            var browser = mediator.getMostRecentWindow("navigator:browser");
            var splitter = browser.document.getElementById("stealerPanelSplitter");
            var vbox = browser.document.getElementById("MediaStealerpanel-parent1");
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

            var MediaStealerenableCheck = document.getElementById("MediaStealerenableCheck");
            MediaStealerenableCheck.setAttribute("checked", stealerConfig.enabled ? "true" : "false");
            this.initStatusbar(stealerConfig.showStatusbar, stealerConfig.enabled);
        }
        //else {
        //    Stealer.onToggle();
        //}
        // Right clicking on the status bar of firefox 4 pops up an important context menu.
        // So I comment the `else' branch to disable my event handler.
        // 2011.2.15
    },
    sort: function() {

        try {
            var list = document.getElementById("MediaStealertasklist");
            var temptaskTree = document.getElementById("MediaStealertask-tree");
            var Taskcount = list.childElementCount-1;

            for (Taskcount; Taskcount > -1; Taskcount--)
            {
                var Taskcount2 = Taskcount-1;
                for (Taskcount2; Taskcount2 > -1; Taskcount2--)
                {
                    var treeitem = temptaskTree.view.getItemAtIndex(Taskcount);
                    var curr = parseInt(treeitem.firstChild.childNodes[4].getAttribute("value"));
                    var treeitem2 = temptaskTree.view.getItemAtIndex(Taskcount2);
                    var curr2 = parseInt(treeitem2.firstChild.childNodes[4].getAttribute("value"));

                    if (curr > curr2)
                    {
                        var newTreeitem = treeitem.cloneNode(true);
                        treeitem2.parentNode.removeChild(treeitem);
                        treeitem2.parentNode.insertBefore(newTreeitem, temptaskTree.view.getItemAtIndex(Taskcount-1));
                    }
                }
            }
        }
        catch(e) {
        //   alert("sort:\n"+e.name+": "+e.message);
        }

    },
onDownload: function() {      
   try {
            var downloadManager = Components.classes["@mozilla.org/download-manager;1"].getService(Components.interfaces.nsIDownloadManager);
            var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
            var title = "Stealer";
            var list = document.getElementById("MediaStealertasklist");
            var Taskcount = list.childElementCount;

            // do the deed
            var temptaskTree = document.getElementById("MediaStealertask-tree");

            var idx = temptaskTree.currentIndex;
            if(idx < 0) return;

            if(idx == Taskcount) return;           

            var treeitem = temptaskTree.view.getItemAtIndex(idx);
            var file = treeitem.firstChild.childNodes[0].getAttribute("file");
            var filename = treeitem.firstChild.childNodes[0].getAttribute("label");
            var dir = treeitem.firstChild.childNodes[0].getAttribute("dir");
            var id = treeitem.firstChild.childNodes[0].getAttribute("id");
            var downloadID = treeitem.firstChild.childNodes[0].getAttribute("DownloadID");
            var url = treeitem.firstChild.childNodes[1].getAttribute("label");
            var type = treeitem.firstChild.childNodes[2].getAttribute("label");
            var size = treeitem.firstChild.childNodes[3].getAttribute("label");
            var mode = treeitem.firstChild.childNodes[4].getAttribute("mode");
            var currvalue = treeitem.firstChild.childNodes[4].getAttribute("value");
            var curr = treeitem.firstChild.childNodes[4].getAttribute("curr");
            var stat = treeitem.firstChild.childNodes[5].getAttribute("label");
            var taskdir = treeitem.firstChild.childNodes[6].getAttribute("label");            

            if (stat == "Ready to download")
            {
            var task = new Task();
            task.id = id;
            task.file = file;
            task.dir = dir;
            task.filename = filename;
            task.url = url;
            task.type = type;
            task.size = size;
            task.curr = curr;
            task.stat = stat;
            task.DownloadID = downloadID;

            var file2 = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
            file2.initWithPath(task.file);
            var persist = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Components.interfaces.nsIWebBrowserPersist);
            var nsIWBP = Components.interfaces.nsIWebBrowserPersist;
            var flags = nsIWBP.PERSIST_FLAGS_REPLACE_EXISTING_FILES;
            persist.persistFlags = flags |nsIWBP.PERSIST_FLAGS_BYPASS_CACHE|nsIWBP.PERSIST_FLAGS_CLEANUP_ON_FAILURE
            var IOservice = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService);
            var obj_URI_Source = IOservice.newURI(task.url, null, null);
            var obj_File_Target = IOservice.newFileURI(file2);
            
            var dl = downloadManager.addDownload(downloadManager.DOWNLOAD_TYPE_DOWNLOAD, obj_URI_Source, obj_File_Target, '', null, Math.round(Date.now() * 1000), null, persist);
            var persistListener = new StealerDownloader(Stealer, task);
            downloadManager.addListener(persistListener);
            persist.progressListener = dl;
            persist.saveURI(dl.source, null, null, null, null, dl.targetFile);

            task.curr = 0;
            task.DownloadID = dl.id;
            treeitem.firstChild.childNodes[0].setAttribute("DownloadID", task.DownloadID);
            task.stat = "Transferring"; 
            }
            else if (stat == "Paused")
            {
                downloadManager.resumeDownload(downloadID);
            }
        }
        catch(e) {
            alert("onDownload:\n"+e.name+": "+e.message);
        }

    },
onDownloadAll: function() {      
   try {
            var downloadManager = Components.classes["@mozilla.org/download-manager;1"].getService(Components.interfaces.nsIDownloadManager);
            var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
            var title = "Stealer";
            var list = document.getElementById("MediaStealertasklist");
            var Taskcount = list.childElementCount;

            // do the deed
            var temptaskTree = document.getElementById("MediaStealertask-tree");

            
               
            if(idx < 0) return;

            if(idx == Taskcount) return;             
  
            for (Taskcount; Taskcount > 0; Taskcount--)
            {      
              var idx = Taskcount-1;
              var treeitem = temptaskTree.view.getItemAtIndex(idx);
              var file = treeitem.firstChild.childNodes[0].getAttribute("file");
              var filename = treeitem.firstChild.childNodes[0].getAttribute("label");
              var dir = treeitem.firstChild.childNodes[0].getAttribute("dir");
              var id = treeitem.firstChild.childNodes[0].getAttribute("id");
              var downloadID = treeitem.firstChild.childNodes[0].getAttribute("DownloadID");
              var url = treeitem.firstChild.childNodes[1].getAttribute("label");
              var type = treeitem.firstChild.childNodes[2].getAttribute("label");
              var size = treeitem.firstChild.childNodes[3].getAttribute("label");
              var mode = treeitem.firstChild.childNodes[4].getAttribute("mode");
              var currvalue = treeitem.firstChild.childNodes[4].getAttribute("value");
              var curr = treeitem.firstChild.childNodes[4].getAttribute("curr");
              var stat = treeitem.firstChild.childNodes[5].getAttribute("label");
              var taskdir = treeitem.firstChild.childNodes[6].getAttribute("label");            

              if (stat == "Ready to download")
              {
              var task = new Task();
              task.id = id;
              task.file = file;
              task.dir = dir;
              task.filename = filename;
              task.url = url;
              task.type = type;
              task.size = size;
              task.curr = curr;
              task.stat = stat;
              task.DownloadID = downloadID;

              var file2 = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
              file2.initWithPath(task.file);
              var persist = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Components.interfaces.nsIWebBrowserPersist);
              var nsIWBP = Components.interfaces.nsIWebBrowserPersist;
              var flags = nsIWBP.PERSIST_FLAGS_REPLACE_EXISTING_FILES;
              persist.persistFlags = flags |nsIWBP.PERSIST_FLAGS_BYPASS_CACHE|nsIWBP.PERSIST_FLAGS_CLEANUP_ON_FAILURE
              var IOservice = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService);
              var obj_URI_Source = IOservice.newURI(task.url, null, null);
              var obj_File_Target = IOservice.newFileURI(file2);
            
              var dl = downloadManager.addDownload(downloadManager.DOWNLOAD_TYPE_DOWNLOAD, obj_URI_Source, obj_File_Target, '', null, Math.round(Date.now() * 1000), null, persist);
              var persistListener = new StealerDownloader(Stealer, task);
              downloadManager.addListener(persistListener);
              persist.progressListener = dl;
              persist.saveURI(dl.source, null, null, null, null, dl.targetFile);

              task.curr = 0;
              task.DownloadID = dl.id;
              treeitem.firstChild.childNodes[0].setAttribute("DownloadID", task.DownloadID);
              task.stat = "Transferring"; 
              }
              else if (stat == "Paused")
              {
                  downloadManager.resumeDownload(downloadID);
              }
            }
        }
        catch(e) {
            alert("onDownloadAll:\n"+e.name+": "+e.message);
        }

    },
    //-------------------------------------------------------------------------------

    onAbout: function() {
        var mediator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                .getService(Components.interfaces.nsIWindowMediator);
        var browser = mediator.getMostRecentWindow("navigator:browser");
        openDialog("chrome://stealer/content/about-en.html", "aboutMediaStealer", "chrome,centerscreen,width=1024,height=768,resizable,scrollbars");
    }
}// Stealer

var Stealer = new MediaStealerController();
//--------------------------------------------------------------------
