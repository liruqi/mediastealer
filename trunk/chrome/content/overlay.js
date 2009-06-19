//--------------------------------------------------------------------
function StealerGateKeeper() {
    this.init();
}
StealerGateKeeper.prototype = {
    observer: null,
    init: function() {
        window.addEventListener("load", this.enter, false);
        window.addEventListener("unload", this.exit, false);
    },
    enter: function() {
        // register http observer
        this.observer = new HttpObserver();
        var observerService = Components.classes["@mozilla.org/observer-service;1"]
                           .getService(Components.interfaces.nsIObserverService);
        observerService.addObserver(this.observer, "http-on-modify-request", false);
        observerService.addObserver(this.observer, "http-on-examine-response", false);
 
        // global storage
        Application.storage.set("observer", this.observer);
        Application.storage.set("state", "close");

        // finally, initialize the bottom panel
        Stealer.init();
    },
    exit: function() {
        // unregister http observer
        var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
        observerService.removeObserver(this.observer, "http-on-modify-request");
        observerService.removeObserver(this.observer, "http-on-examine-response");
    }
}

var gatekeeper = new StealerGateKeeper();
//--------------------------------------------------------------------
