//--------------------------------------------------------------------
// Three objects are defined in this file:
//   StealerHttpObserver
//   StealerStreamListener
//   StealerCacheFetcher
//--------------------------------------------------------------------

Task = function(){}
Task.prototype = {
    _id: null,
    _file: null,
    _dir:  null,
    _filename: null,
    _url:  null,
    _type: null,
    _size: null,
    _curr: null,
    _stat: null,

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
        stealerConfig.load();
        if(!stealerConfig.enabled)
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

            var task = new Task();  // file, url, type, size, stat ; dir, xlen

            for (var i = 0; i < stealerConfig.rules.length; i++) {
                var rule = stealerConfig.rules[i];
                if(rule.enabled == "true") {

                    if(rs.match(/20\d/)) {
                        ct = aSubject.getResponseHeader('Content-Type');
                        if(new RegExp(rule.url,"i").exec(uri) && new RegExp(rule.ct,"i").exec(ct)) {
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
            var httpCacheSession;
           
            if(query_cache) {
                if(!stealerConfig.useCache)
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
			var unknown = stealerConfig.filetypeunknown;
			
			if(unknown == true)
                    {						  
						var fileextention = file.charAt(file.length-4) + file.charAt(file.length-3) + file.charAt(file.length-2) + file.charAt(file.length-1);
						
							if ((fileextention != ".swf") && (fileextention != ".flv") && (fileextention != ".mp4") && (fileextention != ".mp3"))
							{			   
							var help = task.filename.substr(0,(task.filename.length-4));							
							help += ".flv"; 							
							task.filename = help;														
							}		
					}	
			task.file = task.dir + task.filename; 
			
			
			var nosmall = stealerConfig.nosmallfiles;
			
			if(nosmall==true && task.size <750000)
			{
				var permission2 = false;
			}
			else
			{
				var permission2 = true;
			}	
			
			//avoid files with zero bytes such as cookies
			var nozero = stealerConfig.nozerofiles;
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
                dir = Components.classes["@mozilla.org/file/local;1"]
                    .createInstance(Components.interfaces.nsILocalFile);
                //alert(task.dir)
                dir.initWithPath(task.dir);
                if( !dir.exists() || !dir.isDirectory() ) {   // if it doesn't exist, set to HOME
                    homeDir =  stealerConfig.home.path + (stealerConfig.home.path[0]=="/" ? "/": "\\");
                    alert("Task directory " + task.dir + "not exist. Change to home directory " + homeDir);
                    stealerConfig.defaultDir = homeDir;
                    task.dir = homeDir;
                    task.file = task.dir + task.filename;
                }
                //end of directory verification

                var choice;
                if(stealerConfig.alwaysConfirm)
                    choice = confirm("Content ["+task.type+"] found\nDo you want to download it to "+task.dir+" ?\n");
                else
                    choice = true;
                if(choice) {
                    var newListener = new StealerStreamListener(this.Stealer, task);
                    httpChannel.QueryInterface(Components.interfaces.nsITraceableChannel);
                    newListener.originalListener = httpChannel.setNewListener(newListener);

                    task.curr = 0;
                    task.stat = "Transferring";
                    this.Stealer.addTask(task);

                    var message = "\n----------  Download started  ----------\n";
                    message    += "  Time: " + new Date().toLocaleString() + "\n";
                    message    += "  File: " + task.file + "\n";
                    message    += "  URL:  " + task.url  + "\n";
                    message    += "  Type: " + task.type + "\n";
                    message    += "  Size: " + task.size + "\n";
                    message    += "  Type: " + "Stream\n";
                    this.Stealer.dbgPrintln(message);
                }
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
        var time = this.getTimestamp();
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

    this.stack = [];           // 数据缓冲栈（非栈）
    this.total = task.size;    // Content-Length
    this.curr = 0;             // 当前已下载的总长度
    this.percent = 0;          // 当前已下载的百分比
    this.curr_stack = 0;       // 当前栈中的数据量

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
                this.task.dir = stealerConfig.defaultDir;
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
                    var choice;
                    if(stealerConfig.alwaysConfirm) {
                        var msg= "[*Cached*] URI: "+this.task.url+"\n==> "+this.task.file+"\nIs it OK?";
                        choice = confirm(msg);
                    }
                    else
                        choice = true;
                    if(choice) {
                        this.task.type = this.content_type;
                        this.task.size = Number(this.content_length);
                        this.task.curr = 0;
                        this.task.stat = "Transferring";
                        this.Stealer.addTask(this.task);
         
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
