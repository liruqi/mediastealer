//--------------------------------------------------------------------
// Three objects are defined in this file:
//   StealerHttpObserver
//   StealerStreamListener
//   StealerCacheFetcher
//--------------------------------------------------------------------

function MediaStealerTask() {}
MediaStealerTask.prototype = {
    _id: null,
    _file: null,
    _dir:  null,
    _filename: null,
    _url:  null,
    _type: null,
    _size: null,
    _curr: null,
    _stat: null,
    _DownloadID: null,

    get id() {
        return this._id;
    },
    set id(value) {
        this._id = value;
    },

    get file() {
        return this._file;
    },
    set file(value) {
        this._file = value;
    },

    get dir() {
        return this._dir;
    },
    set dir(value) {
        this._dir = value;
    },

    get filename() {
        return this._filename;
    },
    set filename(value) {
        this._filename = value;
    },

    get url() {
        return this._url;
    },
    set url(value) {
        this._url = value;
    },

    get type() {
        return this._type;
    },
    set type(value) {
        this._type = value;
    },

    get size() {
        return this._size;
    },
    set size(value) {
        this._size = value;
    },

    get curr() {
        return this._curr;
    },
    set curr(value) {
        this._curr = value;
    },

    get stat() {
        return this._stat;
    },
    set stat(value) {
        this._stat = value;
    },

    get DownloadID() {
        return this._DownloadID;
    },
    set DownloadID(value) {
        this._DownloadID = value;
    }
}

//--------------------------------------------------------------------
function StealerHttpObserver() {}
StealerHttpObserver.prototype = {
    Stealer: null,
    setController: function(controller) {
        this.Stealer = controller;
    },
    observe: function(aSubject, aTopic, aData) {
        MediastealerConfig.load();
        if(!MediastealerConfig.enabled)
            return;
        if(aTopic == 'http-on-modify-request') {
            aSubject.QueryInterface(Components.interfaces.nsIHttpChannel);
            this.onModifyRequest(aSubject);
        }
        else if (aTopic == 'http-on-examine-response') {
            aSubject.QueryInterface(Components.interfaces.nsIHttpChannel);
            this.onExamineResponse(aSubject);
        }
    },
    onModifyRequest: function(aSubject) {
        // do nothing to requests
    },
    onExamineResponse: function(aSubject) {
        try {
            var rs = aSubject.responseStatus.toString();
            if(rs.match(/[145]\d\d/)) return;

            var rstext = aSubject.responseStatusText;
            var uri = aSubject.URI.asciiSpec;
            var ct, loc, len;
            try { ct  = aSubject.getResponseHeader('Content-Type'); } catch(e) {}
            try { loc = aSubject.getResponseHeader('Location'); } catch(e) {}
            try { len = aSubject.getResponseHeader('Content-Length'); } catch(e) {}

            /*var msg = ";; " + rs + " " + rstext + "\n";
            msg += "   " + uri + "\n";
            if(ct) msg += "   " + ct + "\n";
            this.Stealer.dbgPrintln(msg); */

            var theString = unescape(uri);
            var test1 = theString.indexOf("youtube");
            var test2 = theString.indexOf("range");
            var test3 = theString.indexOf("signature");
            var newString2 = "";
            var testunique = true;
            if (test1 != -1 && test2 != -1)
            {
              var newString = "";
              var counter = theString.length; 
              var testchar = '\u0026';
              var foundchar = false;
              var foundchar2 = false;

              for (counter=0  ; counter <(theString.length+1) ;counter++ ) {

                   if (counter > (test3)) //finds signature
                   {

                    if (theString.charAt(counter) == testchar)
                    {
                       foundchar2 = true;
                    }
                    else if (foundchar2 == false)
                    {
                         newString2 += theString.substring(counter-1, counter);   
                    } 
                  }       
                   if (counter < (test2)) //finds and deletes range information
                   {                     
                     newString += theString.substring(counter-1, counter); 
                   }
                   else if (counter > (test2+5))
                   {
                     if (foundchar == true)
                     {
                     newString += theString.substring(counter-1, counter);   
                     }     
                     else if (theString.charAt(counter) == testchar)
                     {
                        foundchar = true;
                     }    
                   }
              } 

            var signature = Application.storage.get("signature", signature); 
            var url2 = unescape(uri);
            
            if (signature != "Undefined")
            {
              if (url2.indexOf(signature) != -1)
              {
                var testunique = false;
              }
            }
            Application.storage.set("signature", newString2);
              uri = newString;
            }
            //test if there are duplicates
            var temptaskTree = document.getElementById("MediaStealertask-tree");
            var list = document.getElementById("MediaStealertasklist");
            var Taskcount = list.childElementCount;
            for (Taskcount; Taskcount > 0; Taskcount--)
            {
                var idx = Taskcount-1;
                var treeitem = temptaskTree.view.getItemAtIndex(idx);
                var url = treeitem.firstChild.childNodes[1].getAttribute("label"); //url
                var url2 = unescape(url);
                var filesize = treeitem.firstChild.childNodes[3].getAttribute("label");    //filesize
                if (newString2 != "" && (url2.indexOf(newString2) != -1))
                {
                    testunique = false;
                }
                else if (url == uri)
                {
                    testunique = false;
                }
            }

            if (testunique == true)
            {
                var task = new MediaStealerTask();  // file, url, type, size, stat ; dir, xlen

                for (var i = 0; i < MediastealerConfig.rules.length; i++) {
                    var rule = MediastealerConfig.rules[i];
                    if(rule.enabled == "true") {

                        if(rs.match(/20\d/)) {
                            ct = aSubject.getResponseHeader('Content-Type');
                            if(new RegExp(rule.url,"i").exec(uri) && new RegExp(rule.ct,"i").exec(ct))
                            {
                                task.url = uri;
                                task.type = ct;
                                task.size = len;
                                task.dir = rule.dir;
                                this.doTask(task, aSubject, false);
                            }
                        }
                        else if(rs.match(/30[012357]/)) {
                            if(new RegExp(rule.url,"i").exec(loc)) {
                                task.url = loc;
                                task.type = rule.ct;
                                task.dir = rule.dir;
                                this.doTask(task, aSubject, true);
                            }
                        }
                        else if(rs == "304") {
                            if(new RegExp(rule.url,"i").exec(uri)) {
                                task.url = uri;
                                task.type = rule.ct;
                                task.dir = rule.dir;
                                this.doTask(task, aSubject, true);
                            }
                        }
                    }
                }
            }
        } catch(e){}
    },

    getFNfromURI: function(uri) {  // get file name from URI
        var ret = "";
        var segment = uri.split("/");
        if(segment.length > 0) {
            ret = segment[segment.length - 1];
            var pos = ret.indexOf('?');
            if(pos > 0)
            {
                ret = ret.substring(0, pos);
                if(ret.indexOf('&') >= 0)
                    ret = "";   // a stupid choice
            }
            else if(pos == 0)
                ret = "";
        }
        else
            ret = "";
        return ret;
    },

    resolveOriginName: function(aSubject) {
        var originName = "";
        var rs = aSubject.responseStatus;

        //try to retrieve file name from location
        if(rs == "302") {
            try {
                // fetch filename from Location if 302
                var loc = aSubject.getResponseHeader("Location");
                originName = this.getFNfromURI(loc);
            }
            catch(err){}
        }

        if (originName == "") {
            //try to retrieve file name from content-disposition
            try {
                var content = unescape(aSubject.getResponseHeader("content-disposition"));
                var temp = content.split("filename=");
                if (temp.length >= 2)
                    originName = temp[1].replace(/\"/g, "");
            }
            catch(err){}
        }

        if (originName == "") {
            //try to retrieve file name from URI
            originName = this.getFNfromURI(aSubject.URI.asciiSpec);
        }

        originName = unescape(originName);
        return originName;
    },

    doTask: function(task, httpChannel, query_cache) {
        // httpChannel: [xpconnect wrapped nsIHttpChannel]
        // query_cache: boolean, whether need to query cache
        try {
            var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
            var askcheck = {value: true};
            var title = "Media Stealer";
            var checkstr = "Ask every time. Can be (re)activated via Firefox menu or Add-on Bar";
            var httpCacheSession;

            if(query_cache) {
                if(!MediastealerConfig.useCache)
                    return;

                // open cache service
                var cacheService = Components.classes['@mozilla.org/network/cache-service;1']
                                 .getService(Components.interfaces.nsICacheService);
                httpCacheSession = cacheService.createSession('HTTP', 0, true);
                httpCacheSession.doomEntriesIfExpired = false;

                // check whether cache exists
                var cacheExist = false;
                try {
                    var ce = httpCacheSession.openCacheEntry(task.url,
                           Components.interfaces.nsICache.ACCESS_READ, false);
                    ce.close();
                    cacheExist = true;
                }
                catch(err) {
                    if(err.result == Components.results.NS_ERROR_CACHE_KEY_NOT_FOUND)
                        cacheExist = false;
                    else
                        cacheExist = true;
                }
                if(!cacheExist) return;
            }

            task.id = this.make_taskid();
            var originName = this.resolveOriginName(httpChannel);

            var file = this.make_name(originName, task.id);
            task.filename = file;  /////
            task.file = task.dir + task.filename;  ///


            //check extention, gives flv extention when unknown extention is found
            var unknown = MediastealerConfig.filetypeunknown;

            if(unknown == true)
                    {
                        var help_known = false;
                        var fileextention = file.charAt(file.length-3) + file.charAt(file.length-2) + file.charAt(file.length-1);

                        for (var i = 0; i < MediastealerConfig.rules.length; i++)
                        {
                        var rule = MediastealerConfig.rules[i];
                        if(rule.enabled == "true")
                            {
                                var help_ct = (rule.ct);
                                var test = help_ct.indexOf(fileextention);

                                if (test != "-1")
                                {
                                    help_known = true;
                                }
                            }
                        }

                        if (help_known == false)
                            {
                            var help = task.filename.substr(0,(task.filename.length-4));
                            help += ".flv";
                            task.filename = help;
                            }
                    }
            task.file = task.dir + task.filename;


            var nosmall = MediastealerConfig.nosmallfiles;

            if(nosmall==true && task.size <750000)
            {
                var permission2 = false;
            }
            else
            {
                var permission2 = true;
            }

            //avoid files with zero bytes such as cookies
            var nozero = MediastealerConfig.nozerofiles;
            if(nozero==true && task.size ==0)
            {
                var permission = false;
            }
            else
            {
                var permission = true;
            }

            if ((permission==true) && (permission2==true) )
            {
                if(query_cache) {
                    httpCacheSession.asyncOpenCacheEntry(task.url,
                        Components.interfaces.nsICache.ACCESS_READ, new StealerCacheFetcher(this.Stealer, task));
                }
                else {
                    var dir = Components.classes["@mozilla.org/file/local;1"]
                        .createInstance(Components.interfaces.nsILocalFile);

                    dir.initWithPath(task.dir);
                    if( !dir.exists() || !dir.isDirectory() ) {   // if it doesn't exist, set to HOME
                       var stringsBundle = document.getElementById("string-bundle");
                       var taskdirpart1 = stringsBundle.getString('core_taskdirpart1') + " ";
                       var taskdirpart2 = stringsBundle.getString('core_taskdirpart2') + " ";
                        homeDir =  MediastealerConfig.home.path + (MediastealerConfig.home.path[0]=="/" ? "/": "\\");
                        alert(taskdirpart1+" " +task.dir+ taskdirpart2 + " " + homeDir);
                        MediastealerConfig.defaultDir = homeDir;
                        task.dir = homeDir;
                        task.file = task.dir + task.filename;
                    }
                    //end of directory verification

                    //var choice;
                    //if(stealerConfig.alwaysConfirm)
                    //{
                    //    choice = prompts.confirmCheck(null, title, "Content ["+task.type+"] found\nDo you want to download it to "+task.dir+" ?\n", checkstr, askcheck);
                    //}
                    //else
                    //    choice = true;
                    //if(choice) {
                        //old method
                        //var newListener = new StealerStreamListener(this.Stealer, task);
                        //httpChannel.QueryInterface(Components.interfaces.nsITraceableChannel);
                        //newListener.originalListener = httpChannel.setNewListener(newListener);

                        var alwaysaskdownloadfolder = MediastealerConfig.alwaysaskdownloadfolder;

                        if (alwaysaskdownloadfolder == true) 
                        {

                            var stringsBundle = document.getElementById("string-bundle");
                            var askfileandpath = stringsBundle.getString('core_askfileandpath') + " ";
                            var __file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
                            __file.initWithPath(task.dir);

                            var nsIFilePicker = Components.interfaces.nsIFilePicker;
                            var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
                            fp.init(window, askfileandpath, nsIFilePicker.modeSave);
                            fp.defaultString = task.filename;
                            fp.displayDirectory = __file;
                            var res = fp.show();
                            if (res == nsIFilePicker.returnOK || res == nsIFilePicker.returnReplace)
                            {
                                task.file = fp.file.path;
                                task.filename = fp.file.leafName;
                                var fileleafname = fp.file.leafName;
                                var filepath = fp.file.path;
                                var fileleafnamelength = fileleafname.length;
                                var filepathlength = filepath.length;
                                var fileresult = filepath.substr(0,(filepathlength-fileleafnamelength));
                                task.dir = fileresult;
                            }
                            else
                            {
                                return;
                            }
                        }

                        var automaticdownload = MediastealerConfig.automaticdownload;
                        if (automaticdownload)
                        {     
                        //new method
                        var file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
                        file.initWithPath(task.file);
                        var persist = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Components.interfaces.nsIWebBrowserPersist);
                        var nsIWBP = Components.interfaces.nsIWebBrowserPersist;
                        var flags = nsIWBP.PERSIST_FLAGS_REPLACE_EXISTING_FILES;
                        persist.persistFlags = flags |nsIWBP.PERSIST_FLAGS_BYPASS_CACHE|nsIWBP.PERSIST_FLAGS_CLEANUP_ON_FAILURE
                        var IOservice = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService);
                        var obj_URI_Source = IOservice.newURI(task.url, null, null);
                        var obj_File_Target = IOservice.newFileURI(file);
                        var dm = Components.classes['@mozilla.org/download-manager;1'].createInstance(Components.interfaces.nsIDownloadManager);
                        var dl = dm.addDownload(dm.DOWNLOAD_TYPE_DOWNLOAD, obj_URI_Source, obj_File_Target, '', null, Math.round(Date.now() * 1000), null, persist);
                        var persistListener = new StealerDownloader(this.Stealer, task);
                        dm.addListener(persistListener);
                        persist.progressListener = dl;
                        persist.saveURI(dl.source, null, null, null, null, dl.targetFile);

                        task.curr = 0;
                        task.DownloadID = dl.id;
                        task.stat = "Transferring";
                        }
                        else
                        {
                        task.stat = "Ready to download";
                        task.curr = 0;
                        task.DownloadID = -1;
                        }
                        this.Stealer.addTask(task);

                        //var message = "\n----------  Download started  ----------\n";
                        //message    += "  Time: " + new Date().toLocaleString() + "\n";
                        //message    += "  File: " + task.file + "\n";
                        //message    += "  URL:  " + task.url  + "\n";
                        //message    += "  Type: " + task.type + "\n";
                        //message    += "  Size: " + task.size + "\n";
                        //message    += "  DownloadID: "+ task.DownloadID + "\n";
                        //this.Stealer.dbgPrintln(message);
                    
                    //if(!askcheck.value)
                    //{
                   //     stealerConfig.alwaysConfirm = !stealerConfig.alwaysConfirm;
                   //     stealerConfig.save();
                   //     var MediaStealerconfirmCheck = document.getElementById("MediaStealerconfirmCheck");
                   //     MediaStealerconfirmCheck.setAttribute("checked", stealerConfig.alwaysConfirm ? "true" : "false");
                    //}
                }
            }
        }
        catch(e) {
            //alert("StealerHttpObserver.doTask:\n"+e.name+": "+e.message);
        }
    },
    make_name: function(old_name, task_id) {
        var pos = old_name.lastIndexOf(".");
        var ret = "_" + task_id;
        if(pos < 0)
            ret = old_name + ret;
        else {
            var fn = old_name.substring(0, pos);
            var ex = old_name.substring(pos, old_name.length);
            ret = fn + ret + ex;
        }
        return ret;
    },
    make_taskid: function() {
        var time = "MediaStealer"+this.getTimestamp();
        var rand = Math.round(Math.random()*1000);
        return time + "." + rand;
    },
    getTimestamp: function() {
        // return current time in format of 'YYMMDDhhmmss'
        var t = new Date();
        var Y = String(t.getYear() + 1900);
        var M = t.getMonth() + 1;
        M = (M < 10) ? ("0"+String(M)) : String(M);
        var D = t.getDate();
        D = (D < 10) ? ("0"+String(D)) : String(D);
        var h = t.getHours();
        h = (h < 10) ? ("0"+String(h)) : String(h);
        var m = t.getMinutes();
        m = (m < 10) ? ("0"+String(m)) : String(m);
        var s = t.getSeconds();
        s = (s < 10) ? ("0"+String(s)) : String(s);
        return Y + M + D + h + m + s;
    },
    QueryInterface: function (aIID) {
        if (aIID.equals(Components.interfaces.nsIHttpObserver) || aIID.equals(Components.interfaces.nsISupports))
            return this;
        throw Components.results.NS_NOINTERFACE;
    }
}// StealerHttpObserver.prototype

//--------------------------------------------------------------------
function StealerStreamListener(stealer, task) {
    this.Stealer = stealer;
    this.task = task;

    this.stack = [];           // data trunk (buffer) list
    this.total = task.size;    // Content-Length
    this.curr = 0;             // total bytes of received data
    this.percent = 0;          // percentage of received data
    this.curr_stack = 0;       // bytes of data in `stack'

    this.originalListener = null;
}

StealerStreamListener.prototype = {

    onDataAvailable: function(request, context, inputStream, offset, count) {
        try {
            //this.Stealer.dbgPrintln("onDataAvailable: "+request+", "+context+", "+offset+", "+count);
            var binaryInputStream = Components.classes["@mozilla.org/binaryinputstream;1"]
                    .createInstance(Components.interfaces.nsIBinaryInputStream);
            binaryInputStream.setInputStream(inputStream);

            var storageStream = Components.classes["@mozilla.org/storagestream;1"]
                    .createInstance(Components.interfaces.nsIStorageStream);
            storageStream.init(8192, count, null);

            var binaryOutputStream = Components.classes["@mozilla.org/binaryoutputstream;1"]
                    .createInstance(Components.interfaces.nsIBinaryOutputStream);
            binaryOutputStream.setOutputStream(storageStream.getOutputStream(0));

            // Copy received data as they come.
            var data = binaryInputStream.readBytes(count);
            this.stack.push(data);
            this.curr += count;
            this.curr_stack += count;

            // for originalListener
            binaryOutputStream.writeBytes(data, count);
            this.originalListener.onDataAvailable(request, context,
                        storageStream.newInputStream(0), offset, count);

            // update task if necessary
            if(this.curr * 100 >= this.percent * this.total) {
                this.task.curr = this.curr;
                this.Stealer.refreshTask(this.task);
                this.percent++;
            }

            // flush stack if it grows too big
            if(this.curr_stack > 0x400000) {    // 4 megabytes
                var stack_cnt = this.stack.length;
                for(var i = 0; i < stack_cnt; i++) {
                    var data = this.stack[i];
                    this.bstream.writeBytes(data, data.length);
                }
                this.stack = [];
                this.curr_stack = 0;
            }
        }
        catch(e) {
            //alert('onDataAvailable:\n'+e.name+": "+e.message);
        }
    },

    onStartRequest: function(request, context) {
        try {

            this.fd = Components.classes["@mozilla.org/file/local;1"]
                          .createInstance(Components.interfaces.nsILocalFile);
            try {
                this.fd.initWithPath(this.task.file);
            }
            catch(e) {
                this.task.dir = MediastealerConfig.defaultDir;
                this.task.filename = "~damnedfilename";
                this.task.file = this.task.dir + this.task.filename;
                this.fd.initWithPath(this.task.file);
            }

            this.stream = Components.classes["@mozilla.org/network/safe-file-output-stream;1"]
                           .createInstance(Components.interfaces.nsIFileOutputStream);
            this.stream.init(this.fd, -1, -1, 0);

            this.bstream = Components.classes["@mozilla.org/binaryoutputstream;1"]
                          .createInstance(Components.interfaces.nsIBinaryOutputStream);
            this.bstream.setOutputStream(this.stream);

            this.originalListener.onStartRequest(request, context);
        }
        catch(e) {
            alert('onStartRequest:\n'+e.name+": "+e.message);
        }
    },

    onStopRequest: function(request, context, statusCode) {
        try {
            for(var i = 0; i < this.stack.length; i++)
                this.bstream.writeBytes(this.stack[i], this.stack[i].length);

            if (this.stream instanceof Components.interfaces.nsISafeOutputStream)
                this.stream.finish();
            else
                this.stream.close();

            if(this.curr < this.total) {
                this.task.stat = "Interrupted";
                this.Stealer.dbgPrintln("Download interrupted: "+this.curr+" bytes");
            }
            else {
                this.task.stat = "Finished";
                var msg = "File: " + this.task.file + "\n";
                msg += "Time: " + new Date().toLocaleString() + "\n";
                msg += "**********  Download finished  **********\n";
                this.Stealer.dbgPrintln(msg);
            }
            this.task.curr = this.curr;
            this.Stealer.refreshTask(this.task);

            this.originalListener.onStopRequest(request, context, statusCode);
            }
        catch(e) {
            //alert('onStartRequest:\n'+e.name+": "+e.message);
        }
    },

    QueryInterface: function (aIID) {
        if (aIID.equals(Components.interfaces.nsIStreamListener) || aIID.equals(Components.interfaces.nsISupports))
            return this;
        throw Components.results.NS_NOINTERFACE;
    }
}// StealerStreamListener.prototype

function StealerDownloader(stealer, task) {
    this.Stealer = stealer;
    this.task = task;

    this.stack = [];           // data trunk (buffer) list
    this.total = task.size;    // Content-Length
    this.curr = 0;             // total bytes of received data
    this.percent = 0;          // percentage of received data
    this.curr_stack = 0;       // bytes of data in `stack'

    this.originalListener = null;
}

StealerDownloader.prototype = {
    QueryInterface : function(aIID)
    {
        if(aIID.equals(Components.interfaces.Components.interfaces.nsIDownloadProgressListener))
            return this;
        throw Components.results.NS_NOINTERFACE;
    },

    init : function()
    {
    },

    destroy : function()
    {
    },

    onProgressChange : function (aWebProgress, aRequest,
                       aCurSelfProgress, aMaxSelfProgress,
                       aCurTotalProgress, aMaxTotalProgress, aDownload)
    {
        if (aDownload.id == this.task.DownloadID)
        {
            this.task.stat = "Transferring";
            this.curr = aDownload.amountTransferred;
            this.task.curr = aDownload.amountTransferred;
            this.task.size = aDownload.size;
            this.Stealer.refreshTask(this.task);
        }
    },

    onDownloadStateChange: function(aState, aDownload)
    {
        if (aDownload.id == this.task.DownloadID)
        {
            if (aDownload.state == 7 || aDownload.state == 1)
            {
                this.total = this.task.size;
                this.curr = this.total;
                this.task.curr = this.total;
                this.task.stat = "Finished";
                this.task.DownloadID = -1;
                this.Stealer.refreshTask(this.task);
                var autoclear = MediastealerConfig.autoclear;
                if (autoclear == true)
                this.Stealer.autoclear();
            }
        }
    },

    onStateChange : function(aWebProgress, aRequest, aStateFlags, aStatus, aDownload)
    {
        if (aDownload.id == this.task.DownloadID)
        {
            var downloadManager = Components.classes["@mozilla.org/download-manager;1"].getService(Components.interfaces.nsIDownloadManager);
            if (aDownload.state == 4)
            {
                this.task.stat = "Paused";
                this.Stealer.refreshTask(this.task);
            }
            else if (aDownload.state == 3 || aDownload.state == 2)  //something went terribly wrong
            {
                this.task.stat = "Interrupted";
                this.DownloadID = -1;
                this.Stealer.refreshTask(this.task);
            }
        }
    },

    onStatusChange : function(aWebProgress, aRequest, aStatus, aMessage, aDownload)
    {
        if (aDownload.id == this.task.DownloadID)
            {
                this.task.stat = "Interrupted";
                this.Stealer.refreshTask(this.task);
            }
    },

    onSecurityChange : function(aWebProgress, aRequest, aState)
    {
    }
}
//--------------------------------------------------------------------
function StealerCacheFetcher(stealer, task) {
    this.Stealer = stealer;
    this.task = task;
}
StealerCacheFetcher.prototype = {
    onCacheEntryAvailable: function(descriptor, accessGranted, status) {
        try {
            if(descriptor != null) {
                var head = descriptor.getMetaDataElement("response-head");
                head.match(new RegExp(/Content-Type: (.*)(\n)?/i));
                this.content_type = RegExp.$1;
                head.match(new RegExp(/Content-Length: (.*)(\n)?/i));
                this.content_length = RegExp.$1;

                if(new RegExp(this.task.type, "i").exec(this.content_type)) {
                    //var choice;
                    //if(stealerConfig.alwaysConfirm) {
                        var msg= "[*Cached*] URI: "+this.task.url+"\n==> "+this.task.file+"\nIs it OK?";
                        choice = confirm(msg);
                        if(!choice) return;
                    //}
                    //else
                   //     choice = true;
                    //if(choice) {
                        this.task.type = this.content_type;
                        this.task.size = Number(this.content_length);
                        this.task.curr = 0;
                        this.task.stat = "Transferring";
                        this.Stealer.addTask(this.task);
                        this.task.DownloadID = -1;
                        var message = "\n----------  Download started  ----------\n";
                        message    += "  Time: " + new Date().toLocaleString() + "\n";
                        message    += "  File: " + this.task.file + "\n";
                        message    += "  URL:  " + this.task.url  + "\n";
                        message    += "  Type: " + this.task.type + "\n";
                        message    += "  Size: " + this.task.size + "\n";
                        message    += "  Type: " + "Cached\n";
                        this.Stealer.dbgPrintln(message);

                        this.fetch(descriptor);  // fetch it!
                    
                }
            }
        }
        catch(e) {
            //alert('onCacheEntryAvailable:\n'+e.name+': '+e.message);
        }
    },
    fetch: function(descriptor) {
        //set up for output file
        var fd = Components.classes["@mozilla.org/file/local;1"]
                        .createInstance(Components.interfaces.nsILocalFile);
        fd.initWithPath(this.task.file);

        var outStream = Components.classes["@mozilla.org/network/safe-file-output-stream;1"]
                  .createInstance(Components.interfaces.nsIFileOutputStream);
        outStream.init(fd, -1, -1, 0);
        var bstream = Components.classes["@mozilla.org/binaryoutputstream;1"]
                   .createInstance(Components.interfaces.nsIBinaryOutputStream);
        bstream.setOutputStream(outStream);

        //set up for input file
        var inStream = descriptor.openInputStream(0);
        var bInStream = Components.classes["@mozilla.org/binaryinputstream;1"]
                   .createInstance(Components.interfaces.nsIBinaryInputStream);
        bInStream.setInputStream(inStream);

        var data = bInStream.readBytes(bInStream.available());
        bstream.writeBytes(data, data.length);

        inStream.close();
        if (outStream instanceof Components.interfaces.nsISafeOutputStream)
            outStream.finish();
        else
            outStream.close();

        this.task.curr = this.task.size;
        this.task.stat = "Finished";
        this.Stealer.refreshTask(this.task);
        this.Stealer.dbgPrintln("File: " + this.task.file);
        this.Stealer.dbgPrintln("Time: " + new Date().toLocaleString());
        this.Stealer.dbgPrintln("**********  Download finished  **********\n");
    },
    QueryInterface: function(aIID) {
        if(aIID.equals(Components.interfaces.nsICacheListener) || aIID.equals(Components.interfaces.nsISupports))
            return this;
        throw Components.results.NS_NOINTERFACE;
    }
}// StealerCacheFetcher.prototype
//--------------------------------------------------------------------
