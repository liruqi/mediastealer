//--------------------------------------------------------------------
var detailWindow = {
    show: function(params, retParams) {
        this.openWindow("stealer.detailWindow", "chrome://stealer/content/editor.xul", 
                "modal,chrome=yes,centerscreen", params, retParams);
    },
    openWindow: function(windowName, url, flags, params, retParams) {
        var windowsMediator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                        .getService(Components.interfaces.nsIWindowMediator);
        var thisWindow = windowsMediator.getMostRecentWindow(windowName);
        if (thisWindow) {
            thisWindow.focus();
        }
        else {
            thisWindow = window.openDialog(url, windowName, flags, params, retParams);
        }
        return thisWindow;
    },
    init: function() {
        var des = window.arguments[0]["des"];
        if(des == "")
            des = "new rule";
        document.getElementById("editDes").value = des;

        var url = window.arguments[0]["url"];
        if(url == "")
            url = "http://";
        document.getElementById("editUrl").value = url;

        document.getElementById("editCt").value = window.arguments[0]["ct"];

        var dir = window.arguments[0]["dir"];
        var dirbox = document.getElementById("labelDir");
        dirbox.setAttribute("value", dir);
        if(window.arguments[0]["rtype"] != "0") {
            dirbox.setAttribute("readonly", "true");
            document.getElementById("modiry-tip").setAttribute("style", "font-weight:bold");
            document.getElementById("configButton").setAttribute("disabled", "true");
        }
    },
    save: function() {
        var des = document.getElementById("editDes").value;
        var url = document.getElementById("editUrl").value;
        var ct = document.getElementById("editCt").value;
        var dir = document.getElementById("labelDir").value;
        
        if (des == "") {
            alert("Plase give a description to this rule!");
            return false;
        }

        if(url == "" && ct == "") {
            alert('Either URL or Content-Type must be set!');
            return false;
        }
        
        if (dir =="") {
            alert("Please choose a storage path for this rule!");
            return false;
        }
        
        window.arguments[1]["des"] = des;
        window.arguments[1]["url"] = url;
        window.arguments[1]["ct"]  = ct;
        window.arguments[1]["dir"] = dir;
        window.arguments[1]["changed"] = true;
        return true;
    },
    config: function() {
        var fp = Components.classes["@mozilla.org/filepicker;1"]
                   .createInstance(Components.interfaces.nsIFilePicker);
        fp.init(window, "Please select a directory for saving downloaded files", Components.interfaces.nsIFilePicker.modeGetFolder);
        var ret = fp.show();
        if (ret == Components.interfaces.nsIFilePicker.returnOK)
            document.getElementById("labelDir").value = fp.file.path + "\\";
    }
}// detailWindow
//--------------------------------------------------------------------
