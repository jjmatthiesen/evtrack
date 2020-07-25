/*! evtrack -- UI module */
(function(window){

  var checkScrollSpeed = (function(settings){
    settings = settings || {};

    var lastPos, newPos, timer, delta,
        delay = settings.delay || 50; // in "ms" (higher means lower fidelity )

    function clear() {
      lastPos = null;
      delta = 0;
    }

    clear();

    return function(){
      newPos = window.scrollY;
      if ( lastPos != null ){ // && newPos < maxScroll
        delta = newPos -  lastPos;
      }
      lastPos = newPos;
      clearTimeout(timer);
      timer = setTimeout(clear, delay);
      return delta;
    };
  })();
  var document = window.document;
// pause event, if no movement or other action happen
// -> since we using regular timestamps, we also track, when no movement is happen. Then the action is set to pause.
  const _pauseEvent = "pause ";
  const _mouseEvents = "mousedown mouseup mousemove mouseover mouseout mousewheel mouseenter click dblclick ";
  const _touchEvents = "touchstart touchend touchmove ";
  const _keyboardEvents = "keydown keyup keypress ";
  const _documentEvents = "scroll change select submit reset contextmenu cut copy paste ";

// Define default events, as if they were set in `settings` object
  var _docEvents  = _pauseEvent + _mouseEvents + _touchEvents + _keyboardEvents + _documentEvents;

  var _winEvents  = "load unload beforeunload blur focus resize error online offline";
// Convert these event lists to actual array lists
  _docEvents = _docEvents.split(" ");
  _winEvents = _winEvents.split(" ");
// Save a shortcut for "*" events
  var _allEvents = _docEvents.concat(_winEvents);
//make array of events globally accessible
  document._allEvents = _allEvents;

  var ARGS_SEPARATOR = " "    // Arguments separator for the logged data
      , INFO_SEPARATOR = "|||"  // This one must match that of save.php (INFSEP)
  ;

  var _uid  = 0  // Unique user ID, assigned by the server
      , _time = 0  // Tracking time, for pollingMs
      , _info = [] // Registered information is: cursorId, timestamp, xpos, ypos, event, xpath, attrs
  ;

  /**
   * A small lib to track the user activity by listening to browser events.
   * @author Luis Leiva
   * @version 0.2
   * @requires tracklib.js
   * @license Dual licensed under the MIT and GPL licenses.
   */
  var TrackUI = {
    /**
     * Default settings -- can be overridden on init.
     */
    settings: {
      // The server where logs will be stored.
      postServer: "//my.server.org/save.script",
      // The interval (in seconds) to post data to the server.
      postInterval: 30,
      // Events to be tracked whenever the browser fires them. Default:
      //      mouse-related: "mousedown mouseup mousemove mouseover mouseout mousewheel click dblclick"
      //      touch-related: "touchstart touchend touchmove"
      //   keyboard-related: "keydown keyup keypress"
      //     window-related: "load unload beforeunload blur focus resize error online offline"
      //             others: "scroll change select submit reset contextmenu cut copy paste"
      // If this property is empty, no events will be tracked.
      // Use space-separated values to indicate multiple events, e.g. "click mousemove touchmove".
      // The "*" wildcard can be used to specify all events.
      regularEvents: "*",
      // Events to be polled, because some events are not always needed (e.g. mousemove).
      // If this property is empty (default value), no events will be polled.
      // Use space-separated values to indicate multiple events, e.g. "mousemove touchmove".
      // The "*" wildcard can be used to specify all events.
      // Events in pollingEvents will override those specified in regularEvents.
      // You can leave regularEvents empty and use only pollingEvents, if need be.
      pollingEvents: "",
      // Sampling frequency (in ms) to register events.
      // If set to 0, every single event will be recorded.
      pollingMs: 150,
      // A name that identifies the current task.
      // Useful to filter logs by e.g. tracking campaign ID.
      taskName: "evtrack",
      // A custom function to execute on each recording tick.
      callback: null,
      // Whether to dump element attributes together with each recorded event.
      saveAttributes: true,
      // Main layout content diagramation; a.k.a 'how page content flows'. XXX: Actually not used.
      // Possible values are the following ones:
      //   "left" (fixed), "right" (fixed), "center" (fixed and centered), or "liquid" (adaptable, default behavior).
      layoutType: "liquid",
      // Enable this to display some debug information
      debug: false
    },
    /**
     * Additional settings for the record of events.
     */
    states: {
      i: 0,
      rec: null,
      paused: false,
      timeout: null,
      clicked: false,
      coords: { x:0, y:0 },
      elemXpath: null,
      elemAttrs: null,
      eventName: null,
      scrollSpeed: 0,
      lastPos: undefined,
      newPos: undefined,
      delta: undefined
    },
    /**
     * Init method. Registers event listeners. Set initial coordinates.
     * @param {object} config  Tracking Settings
     * @return void
     */
    record: function(config) {
      _time = new Date().getTime();
      // Override settings
      for (var prop in TrackUI.settings) {
        if (config.hasOwnProperty(prop) && config[prop] !== null) {
          TrackUI.settings[prop] = config[prop];
        }
      }
      TrackUI.log("Recording starts...", _time, TrackUI.settings);
      TrackUI.addEventListeners();
      const interval = Math.round(TrackUI.settings.pollingMs);
      TrackUI.rec   = setInterval(TrackUI.recMouse, interval);
      const onMove = function(e) {
        if (e.touches) { e = e.touches[0] || e.targetTouches[0]; }
        TrackUI.getMousePos(e);
        TrackUI.findElement(e); // elements hovered
      };
      setTimeout(function(){
        TrackUI.initNewData(true);
      }, TrackUI.settings.postInterval*1000);
    },
    /**
     * Pauses recording.
     * The mouse activity is tracked only when the current window has focus.
     */
    pauseRecording: function()
    {
      TrackUI.states.paused = true;
    },
    /**
     * Resumes recording. The current window gain focus.
     */
    resumeRecording: function()
    {
      TrackUI.states.paused = false;
    },
    /**
     * Records mouse data using a regular time interval (TrackUI.pollingMs)
     */
    recMouse: function() {
      const TrackUIRec = TrackUI.states;
      const timeNow  = new Date().getTime();
      if (TrackUIRec.paused) {
        return;
      }
      if(TrackUIRec.eventName != null && TrackUIRec.eventName != 'load') {
        let eventID = _allEvents.indexOf(TrackUIRec.eventName);
        // if a timeout is set, just track until it is over. If no timeout is set, track infinite amount of time
        if(TrackUIRec.timeout) {
          while (TrackUIRec.i <= TrackUIRec.timeout) {
            TrackUI.fillInfo(timeNow, TrackUIRec.coords.x, TrackUIRec.coords.y, TrackUIRec.clicked, eventID, TrackUIRec.scrollSpeed, TrackUIRec.elemXpath, TrackUIRec.elemAttrs);
          }
        } else {
          TrackUI.fillInfo(timeNow, TrackUIRec.coords.x, TrackUIRec.coords.y, TrackUIRec.clicked, eventID, TrackUIRec.scrollSpeed, TrackUIRec.elemXpath, TrackUIRec.elemAttrs);
        }
      }
      //reset event name (in case there is no action/ movement after e.g. a click)
      TrackUIRec.eventName = "pause";
      TrackUIRec.i++ ;
    },
    /**
     * Adds required event listeners.
     * @return void
     */
    addEventListeners: function() {
      if (TrackUI.settings.regularEvents == "*") {
        TrackUI.addCustomEventListeners(_allEvents);
      } else {
        TrackUI.log("Settings regular events...");
        TrackUI.settings.regularEvents = TrackUI.settings.regularEvents.split(" ");
        TrackUI.addCustomEventListeners(TrackUI.settings.regularEvents);
      }
      // All events in this set will override those defined in regularEvents
      if (TrackUI.settings.pollingEvents == "*") {
        TrackUI.addCustomEventListeners(_allEvents);
      } else {
        TrackUI.log("Settings polling events...");
        TrackUI.settings.pollingEvents = TrackUI.settings.pollingEvents.split(" ");
        TrackUI.addCustomEventListeners(TrackUI.settings.pollingEvents);
      }
      document.addEventListener('keydown', (event) => {
        const keyName = event.key;
        if (keyName === "End") {
          if (TrackUI.states.paused) {
            TrackUI.resumeRecording();
          } else {
            TrackUI.pauseRecording();
          }
        }
      }, false);
      document.addEventListener('mouseleave', (event) => {
        TrackUI.pauseRecording();
      },false);
      document.addEventListener('mouseenter', (event) => {
        TrackUI.resumeRecording();
      },false);

      window.addEventListener('scroll', (event) => {
        TrackUI.states.scrollSpeed = checkScrollSpeed();
        //console.log(TrackUI.states.scrollSpeed);
      }, false);

      // Flush data on closing the window/tab
      var unload = (typeof window.onbeforeunload === 'function') ? "beforeunload" : "unload";
      TrackLib.Events.add(window, unload, TrackUI.flush);
    },
    /**
     * Adds custom event listeners.
     * @return void
     */
    addCustomEventListeners: function(eventList) {
      TrackUI.log("Adding event listeners:", eventList);
      for (var i = 0; i < eventList.length; ++i) {
        var ev = eventList[i];
        if (!ev) continue;
        if (_docEvents.indexOf(ev) > -1) {
          TrackLib.Events.add(document, ev, TrackUI.docHandler);
          TrackUI.log("Adding document event:", ev);
          // This is for IE compatibility, grrr
          if (document.attachEvent) {
            // See http://todepoint.com/blog/2008/02/18/windowonblur-strange-behavior-on-browsers/
            if (ev === "focus") TrackLib.Events.add(document.body, "focusin", TrackUI.winHandler);
            if (ev === "blur") TrackLib.Events.add(document.body, "focusout", TrackUI.winHandler);
          }
        } else if (_winEvents.indexOf(ev) > -1) {
          TrackLib.Events.add(window, ev, TrackUI.winHandler);
          TrackUI.log("Adding window event:", ev);
        }
      }
    },
    /**
     * Sets data for the first time for a given user.
     * @param {boolean} async  Whether the request should be asynchronous or not
     * @return void
     */
    initNewData: function(async) {
      var win = TrackLib.Dimension.getWindowSize(),
          doc = TrackLib.Dimension.getDocumentSize(),
          data  = "url="      + encodeURIComponent(window.location.href);
      data += "&screenw=" + screen.width;
      data += "&screenh=" + screen.height;
      data += "&winw="    + win.width;
      data += "&winh="    + win.height;
      data += "&docw="    + doc.width;
      data += "&doch="    + doc.height;
      data += "&info="    + encodeURIComponent(_info.join(INFO_SEPARATOR));
      data += "&task="    + encodeURIComponent(TrackUI.settings.taskName);
      //data += "&layout="  + TrackUI.settings.layoutType;
      //data += "&cookies=" + document.cookie;
      data += "&action="  + "init";
      // Send request
      TrackUI.send({
        async:    async,
        postdata: data,
        callback: TrackUI.setUserId
      });
      // Clean up
      _info = [];
    },
    /**
     * Sets the user ID, to append data for the same session.
     * @param {string} response  XHR response object
     * @return void
     */
    setUserId: function(xhr) {
      _uid = parseInt(xhr.responseText);
      TrackUI.log("setUserId:", _uid);
      if (_uid) {
        setInterval(function(){
          TrackUI.appendData(true);
        }, TrackUI.settings.postInterval*1000);
      }
    },
    /**
     * Continues saving data for the same (previous) user.
     * @param {boolean} async  Whether the request should be asynchronous or not
     * @return void
     */
    appendData: function(async) {
      TrackUI.log("appendUserDataTo:", _uid);
      var data  = "uid="     + _uid;
      data += "&info="   + encodeURIComponent(_info.join(INFO_SEPARATOR));
      data += "&action=" + "append";
      // Send request
      TrackUI.send({
        async:    async,
        postdata: data
      });
      // Clean up
      _info = [];
    },
    /**
     * A common sending method with CORS support.
     * @param {object} req  Ajax request
     * @return void
     */
    send: function(req) {
      req.url = TrackUI.settings.postServer;
      TrackLib.XHR.sendAjaxRequest(req);
    },
    /**
     * Handles document events.
     * @param {object} e  Event
     * @return void
     */
    docHandler: function(e) {
      if (e.type.indexOf("touch") > -1) {
        TrackUI.touchHandler(e);
      } else {
        TrackUI.eventHandler(e);
      }
    },
    /**
     * Handles window events.
     * @param {object} e  Event
     * @return void
     */
    winHandler: function(e) {
      TrackUI.eventHandler(e);
    },
    /**
     * Generic callback for event listeners.
     * @param {object} e  Event
     * @return void
     */
    eventHandler: function(e) {
      e = TrackLib.Events.fix(e);

      var timeNow  = new Date().getTime()
          , eventName = e.type
          , register = true
      ;
      if (TrackUI.settings.pollingMs > 0 && TrackUI.settings.pollingEvents.indexOf(eventName) > -1) {
        register = (timeNow - _time >= TrackUI.settings.pollingMs);
      }
      // set scroll speed to 0 if no scroll
      if(eventName == "scroll") {
        TrackUI.states.scrollSpeed = checkScrollSpeed();
      } else {
        TrackUI.states.scrollSpeed = 0;
      }
      if (register) {
        const TrackUIRec = TrackUI.states;
        let eventID = _allEvents.indexOf(TrackUIRec.eventName);
        let cursorPos = TrackUI.getMousePos(e)
            , elemXpath = TrackLib.XPath.getXPath(e.target)
            , elemAttrs = TrackUI.settings.saveAttributes ? TrackLib.Util.serializeAttrs(e.target) : '{}'
            , extraInfo = {}
        ;
        if (typeof TrackUI.settings.callback === 'function') {
          extraInfo = TrackUI.settings.callback(e);
        }
        if (TrackUI.settings.pollingEvents.indexOf(eventName) > -1) {
          // update states, then read states in regular time intervals -> recMouse()
          TrackUIRec.coords.x = cursorPos.x;
          TrackUIRec.coords.y = cursorPos.y;
          TrackUIRec.elemXpath = elemXpath;
          TrackUIRec.elemAttrs = elemAttrs;
          if (eventName === 'mousedown') {
            TrackUIRec.clicked = true;
          } else {
            TrackUIRec.clicked = false;
          }
          TrackUIRec.eventName = eventName;
        }
        // log additional document and window events (not in regular timestamps
        if (_documentEvents.includes(eventName) || _winEvents.includes(eventName)) {
          TrackUI.fillInfo(timeNow, cursorPos.x, cursorPos.y, false , eventID, TrackUIRec.scrollSpeed, elemXpath, elemAttrs);
          _time = timeNow;
        }
      }
    },
    /**
     * Callback for touch event listeners.
     * @param {object} e  Event
     * @return void
     */
    touchHandler: function(e) {
      e = TrackLib.Events.fix(e);

      var touches = e.changedTouches; // better
      if (touches) for (var i = 0, touch; i < touches.length; ++i) {
        touch = touches[i];
        touch.type = e.type;
        TrackUI.eventHandler(touch);
      }
    },
    /**
     * Cross-browser way to register the mouse position.
     * @param {object} e  Event
     * @return {object} Coordinates
     *   @config {int} x Horizontal component
     *   @config {int} y Vertical component
     */
    getMousePos: function(e) {
      e = TrackLib.Events.fix(e);

      var cx = 0, cy = 0;
      if (e.pageX || e.pageY) {
        cx = e.pageX;
        cy = e.pageY;
      } else if (e.clientX || e.clientY) {
        cx = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
        cy = e.clientY + document.body.scrollTop  + document.documentElement.scrollTop;
      }
      // Sometimes the mouse coordinates are negative (e.g., in Opera)
      if (!cx || cx < 0) cx = 0;
      if (!cy || cy < 0) cy = 0;

      return { x:cx, y:cy };
    },
    /**
     * Fills in a log data row.
     * @param {integer} id      Cursor ID
     * @param {integer} time    Current timestamp
     * @param {integer} posX    Cursor X position
     * @param {integer} posY    Cursor Y position
     * @param {string}  event   Related event name
     * @param {string}  xpath   Related element in XPath notation
     * @param {string}  attrs   Serialized node attributes
     * @return void
     */
    fillInfo: function() {
      var args = [].slice.apply(arguments);
      _info.push( args.join(ARGS_SEPARATOR) );
      TrackUI.log(args);
    },
    /**
     * Transmit remaining (if any) data to server.
     * @param {object} e  Event
     * @return void
     */
    flush: function(e) {
      TrackUI.log("Flushing data...", _uid);
      var i;
      for (i = 0; i < _docEvents.length; ++i) {
        TrackLib.Events.remove(document, _docEvents[i], TrackUI.docHandler);
      }
      for (i = 0; i < _winEvents.length; ++i) {
        TrackLib.Events.remove(window, _winEvents[i], TrackUI.winHandler);
      }
      // Don't use asynchronous requests here, otherwise this won't work
      if (_uid) {
        TrackUI.appendData(false);
      } else {
        TrackUI.initNewData(false);
      }
    },

    log: function() {
      if (TrackUI.settings.debug && typeof console.log === 'function') {
        console.log.apply(console, arguments);
      }
    }

  };

// Expose
  window.TrackUI = TrackUI;

})(this);
