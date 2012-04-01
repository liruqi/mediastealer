//--------------------------------------------------------------------
function MediaStealerGateKeeper() {
    this.init();
}
MediaStealerGateKeeper.prototype = {
    MediaStealerobserver: null,
    init: function() {
        window.addEventListener("load", this.enter, false);
        window.addEventListener("unload", this.exit, false);
    },
    enter: function() {
        // register http observer
        this.MediaStealerobserver = new StealerHttpObserver();
        var observerService = Components.classes["@mozilla.org/observer-service;1"]
                           .getService(Components.interfaces.nsIObserverService);
        observerService.addObserver(this.MediaStealerobserver, "http-on-modify-request", false);
        observerService.addObserver(this.MediaStealerobserver, "http-on-examine-response", false);
 
        // global storage
        Application.storage.set("observer", this.MediaStealerobserver);
        Application.storage.set("state", "close");

        // finally, initialize the bottom panel
        Stealer.init();
    },
    exit: function() {
        // unregister http observer
        var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
        observerService.removeObserver(this.MediaStealerobserver, "http-on-modify-request");
        observerService.removeObserver(this.MediaStealerobserver, "http-on-examine-response");
    }
}

var MediaStealer_gatekeeper = new MediaStealerGateKeeper();
//--------------------------------------------------------------------
