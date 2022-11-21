/*! evtrack -- UI module */
(function (window) {

    let document = window.document;

    // mousewheel can even be triggered if no scroll is available or the page is on the top/bottom.
    // it overrides the scroll event. Therefore it is was removed from the standard events.
    const _mouseEvents = "pause mousedown mouseup mousemove mouseover mouseout mouseenter click dblclick ";
    const _touchEvents = "touchstart touchend touchmove ";
    const _keyboardEvents = "keydown keyup keypress ";
    const _documentEvents = "scroll change select submit reset contextmenu cut copy paste";

    // Define default events, as if they were set in `settings` object
    let _docEvents = _mouseEvents + _touchEvents + _keyboardEvents + _documentEvents;

    let _winEvents = "load unload beforeunload blur focus resize error online offline";
    // Convert these event lists to actual array lists
    _docEvents = _docEvents.split(" ");
    _winEvents = _winEvents.split(" ");
    // Save a shortcut for "*" events
    let _allEvents = _docEvents.concat(_winEvents);

    // Arguments separator for the logged data
    let ARGS_SEPARATOR = ', ';
    // This one must match that of save.php (INFSEP)
    let INFO_SEPARATOR = '|||';

    // Unique user ID, assigned by the server
    let _uid = 0;
    // Tracking time, for pollingMs
    let _time = 0;
    // Registered information is: cursorId, timestamp, xpos, ypos, event, xpath, attrs
    let _info = [];

    /**
     * A small lib to track the user activity by listening to browser events.
     * Written in plain 'ol JavaScript. No dependencies. Also works in old browsers.
     * @namespace TrackUI
     * @author Luis Leiva
     * @version 0.3
     * @requires tracklib.js
     * @license Dual licensed under the MIT and GPL licenses.
     */
    let TrackUI = {
        /**
         * Default settings -- can be overridden on init.
         * @see README.md
         * @memberof TrackUI
         */
        settings: {
            // The server where logs will be stored.
            // You MUST specify this.
            postServer: '//my.server.org/save.script',
            // The interval (in seconds) to post data to the server.
            postInterval: 30,
            // Events to be tracked whenever the browser fires them. Default:
            //      mouse-related: "mousedown mouseup mousemove mouseover mouseout click dblclick"
            //      touch-related: "touchstart touchend touchmove"
            //   keyboard-related: "keydown keyup keypress"
            //     window-related: "load unload beforeunload blur focus resize error online offline"
            //             others: "scroll change select submit reset contextmenu cut copy paste"
            // If this property is empty, no events will be tracked.
            // Use space-separated values to indicate multiple events, e.g. "click mousemove touchmove".
            // The "*" wildcard can be used to specify all events.
            // recommended setting for mouse tracking: "mouseover mouseout mouseenter mousedown mouseup".
            regularEvents: '*',
            // Events to be polled, because some events are not always needed (e.g. mousemove).
            // If this property is empty (default value), no events will be polled.
            // Use space-separated values to indicate multiple events, e.g. "mousemove touchmove".
            // The "*" wildcard can be used to specify all events.
            // Events in pollingEvents will override those specified in regularEvents.
            // You can leave regularEvents empty and use only pollingEvents, if need be.
            // recommended setting: "mousemove scroll". Just for those it makes sense to be polled.
            pollingEvents: '',
            // Sampling frequency (in ms) to register events (40ms = 25fps).
            // If set to 0 and polling Events are empty, every single event will be recorded.
            pollingMs: 150,
            // A name that identifies the current task.
            // Useful to filter logs by e.g. tracking campaign ID.
            taskName: 'evtrack',
            treatmentID: '',
            instrumentID: '',
            participantID: '',
            // A custom function to execute on each recording tick.
            callback: null,
            // Whether to dump element attributes together with each recorded event.
            saveAttributes: true,
            // Enable this to display some debug information
            debug: false,
        },
        /**
         * Additional settings for the record of events in regular time steps.
         */
        states: {
            i: 0,
            rec: null,
            paused: false,
            timeout: null,
            coords: {clientX: 0, clientY: 0, pageX: 0, pageY: 0},
            elemXpath: null,
            elemAttrs: null,
            eventName: null,
            scrollSpeed: 0,
            extraInfo: {},
        },
        /**
         * Init method.
         * @memberof TrackUI
         * @param {object} config - Tracking Settings
         * @see TrackUI.settings
         * @return {void}
         */
        record: function (config) {
            _time = new Date().getTime();
            // Override settings
            for (let prop in TrackUI.settings) {
                if (config.hasOwnProperty(prop) && config[prop] !== null) {
                    TrackUI.settings[prop] = config[prop];
                }
            }
            TrackUI.log("Recording starts...", _time, TrackUI.settings);
            TrackUI.addEventListeners();

            if (TrackUI.settings.pollingEvents !== "" && TrackUI.settings.pollingMs > 0) {
                const interval = Math.round(TrackUI.settings.pollingMs);
                TrackUI.rec = setInterval(TrackUI.recMouse, interval);
            }
            setTimeout(function () {
                TrackUI.initNewData(true);
            }, TrackUI.settings.postInterval * 1000);
        },
        /**
         * Pauses recording.
         * The mouse activity is tracked only when the current window has focus.
         */
        pauseRecording: function () {
            TrackUI.states.paused = true;
        },
        /**
         * Resumes recording. The current window gain focus.
         */
        resumeRecording: function () {
            TrackUI.states.paused = false;
        },
        /**
         * Read the state and fills and logs the information.
         */
        readFromState: function (TrackUIRec, timeNow) {
            if (TrackUIRec.elemXpath) {
                TrackUI.fillInfo(
                    timeNow,
                    TrackUIRec.coords.clientX,
                    TrackUIRec.coords.clientY,
                    TrackUIRec.coords.pageX,
                    TrackUIRec.coords.pageY,
                    TrackUIRec.eventName,
                    TrackUIRec.scrollSpeed,
                    TrackUIRec.elemXpath,
                    TrackUIRec.elemAttrs,
                    JSON.stringify(TrackUI.states.extraInfo));
            }
        },
        /**
         * Records mouse data using a regular time interval (TrackUI.pollingMs)
         */
        recMouse: function () {
            const TrackUIRec = TrackUI.states;
            const timeNow = new Date().getTime();
            if (TrackUIRec.paused) {
                return;
            }
            if (TrackUIRec.eventName != null && TrackUIRec.eventName !== 'load') {
                // if a timeout is set, just track until it is over. If no timeout is set, track infinite amount of time
                if (TrackUIRec.timeout) {
                    while (TrackUIRec.i <= TrackUIRec.timeout) {
                        TrackUI.readFromState(TrackUIRec, timeNow);
                    }
                } else {
                    TrackUI.readFromState(TrackUIRec, timeNow);
                }
            }
            //reset event name (in case there is no action/ movement after e.g. a click)
            TrackUIRec.eventName = "pause";
            TrackUIRec.scrollSpeed = 0;
            TrackUIRec.i++;
        },
        /**
         * Register event listeners.
         * @memberof TrackUI
         * @return {void}
         */
        addEventListeners: function () {
            if (TrackUI.settings.regularEvents === '*') {
                TrackUI.addCustomEventListeners(_allEvents);
                TrackUI.settings.regularEvents = _allEvents
            } else {
                TrackUI.log('Settings regular events...');
                TrackUI.settings.regularEvents = TrackUI.settings.regularEvents.split(' ');
                TrackUI.addCustomEventListeners(TrackUI.settings.regularEvents);
            }
            // All events in this set will override those defined in regularEvents
            if (TrackUI.settings.pollingEvents === '*') {
                TrackUI.addCustomEventListeners(_allEvents);
            } else {
                TrackUI.log('Settings polling events...');
                TrackUI.settings.pollingEvents = TrackUI.settings.pollingEvents.split(' ');
                TrackUI.addCustomEventListeners(TrackUI.settings.pollingEvents);
                // if pollingEvents events are set, subtract them from regular events
                TrackUI.settings.regularEvents = TrackUI.settings.regularEvents.filter(item => !TrackUI.settings.pollingEvents.includes(item));
            }

            document.addEventListener('mouseleave', (event) => {
                TrackUI.pauseRecording();
            }, false);
            document.addEventListener('mouseenter', (event) => {
                TrackUI.resumeRecording();
            }, false);

            // Flush data on closing the window/tab
            TrackLib.Events.add(window, 'beforeunload', TrackUI.flush);
            TrackLib.Events.add(window, 'unload', TrackUI.flush);
        },
        /**
         * Register custom event listeners.
         * @memberof TrackUI
         * @param {array} eventList - List of DOM events (strings)
         * @return {void}
         */
        addCustomEventListeners: function (eventList) {
            TrackUI.log('Adding event listeners:', eventList);
            for (let i = 0; i < eventList.length; ++i) {
                let ev = eventList[i];
                if (!ev) continue;
                if (_docEvents.indexOf(ev) > -1) {
                    TrackLib.Events.add(document, ev, TrackUI.docHandler);
                    TrackUI.log('Adding document event:', ev);
                    // This is for IE compatibility, grrr
                    if (document.attachEvent) {
                        // See http://todepoint.com/blog/2008/02/18/windowonblur-strange-behavior-on-browsers/
                        if (ev === 'focus') TrackLib.Events.add(document.body, 'focusin', TrackUI.winHandler);
                        if (ev === 'blur') TrackLib.Events.add(document.body, 'focusout', TrackUI.winHandler);
                    }
                } else if (_winEvents.indexOf(ev) > -1) {
                    TrackLib.Events.add(window, ev, TrackUI.winHandler);
                    TrackUI.log('Adding window event:', ev);
                }
            }
        },
        /**
         * Send data for the first time for a given (new) user.
         * @memberof TrackUI
         * @param {boolean} async - Whether the request should be asynchronous or not
         * @return {void}
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
            data += "&treatmentID="   + encodeURIComponent(TrackUI.settings.treatmentID);
            data += "&instrumentID="   + encodeURIComponent(TrackUI.settings.instrumentID);
            data += "&participantID="   + encodeURIComponent(TrackUI.settings.participantID);
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
         * Set user ID for the current session.
         * @memberof TrackUI
         * @param {object} xhr - XHR response object
         * @return {void}
         */
        setUserId: function (xhr) {
            _uid = xhr.responseText;
            TrackUI.log('setUserId:', _uid);
            if (_uid) {
                setInterval(function () {
                    TrackUI.appendData(true);
                }, TrackUI.settings.postInterval * 1000);
            }
        },
        /**
         * Send data for the same (previous) user.
         * @memberof TrackUI
         * @param {boolean} async - Whether the request should be asynchronous or not
         * @return {void}
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
         * Common sending method with CORS support.
         * @memberof TrackUI
         * @param {object} req - XHR request
         * @return {void}
         */
        send: function (req) {
            req.url = TrackUI.settings.postServer;
            TrackLib.XHR.sendAjaxRequest(req);
        },
        /**
         * Handle document events.
         * @memberof TrackUI
         * @param {object} e - DOM event
         * @return {void}
         */
        docHandler: function (e) {
            if (e.type.indexOf('touch') > -1) {
                TrackUI.touchHandler(e);
            } else {
                TrackUI.eventHandler(e);
            }
        },
        /**
         * Handle window events.
         * @memberof TrackUI
         * @param {object} e - DOM event
         * @return {void}
         */
        winHandler: function (e) {
            TrackUI.eventHandler(e);
        },
        /**
         * Generic callback for event listeners.
         * @memberof TrackUI
         * @param {object} e - DOM event
         * @return {void}
         */
        eventHandler: function (e) {
            e = TrackLib.Events.fix(e);

            if ('isTrusted' in e && !e.isTrusted) return;

            let timeNow = new Date().getTime(),
                eventName = e.type,
                register = true;
            const regularEvents = TrackUI.settings.regularEvents;
            const pollingEvent = (TrackUI.settings.pollingEvents === "*" ? _allEvents : TrackUI.settings.pollingEvents);
            /*if (TrackUI.settings.pollingMs > 0 && pollingEvent.indexOf(eventName) > -1) {
            register = (timeNow - _time >= TrackUI.settings.pollingMs);
            }*/
            // set scroll speed to 0 if no scroll
            if (eventName === "scroll") {
                TrackUI.states.scrollSpeed = checkScrollSpeed();
            } else {
                TrackUI.states.scrollSpeed = 0;
            }
            const TrackUIRec = TrackUI.states;
            let cursorPos = TrackUI.getMousePos(e, TrackUI.states.coords)
                , elemXpath = TrackLib.XPath.getXPath(e.target, false)
                , elemAttrs = TrackUI.settings.saveAttributes ? TrackLib.Util.serializeAttrs(e.target) : '{}'
                , extraInfo = {}
            ;
            // console.log(cursorPos);
            if (typeof TrackUI.settings.callback === 'function') {
                extraInfo = TrackUI.settings.callback(e);
            }

            // for polling events: save occurrence in a state, then read from state in regular time steps
            if (pollingEvent.indexOf(eventName) > -1) {
                // update states, then read states in regular time intervals -> recMouse()
                TrackUIRec.elemXpath = elemXpath;
                TrackUIRec.elemAttrs = elemAttrs;
                TrackUIRec.eventName = eventName;
                TrackUIRec.extraInfo = extraInfo;
                TrackUIRec.coords.pageX = cursorPos.pageX;
                TrackUIRec.coords.pageY = cursorPos.pageY;
                TrackUIRec.coords.clientX = cursorPos.clientX;
                TrackUIRec.coords.clientY = cursorPos.clientY;

            }
            // for all regular events: log events on occurrence
            // log additional document and window events (not in regular timestamps)
            if (elemXpath) {
                if (regularEvents.includes(eventName)) {
                    TrackUI.fillInfo(
                        timeNow,
                        cursorPos.clientX,
                        cursorPos.clientY,
                        cursorPos.pageX,
                        cursorPos.pageY,
                        eventName,
                        TrackUIRec.scrollSpeed,
                        elemXpath,
                        elemAttrs,
                        JSON.stringify(TrackUI.states.extraInfo)
                    );
                }
            }
            _time = timeNow;
        },
        /**
         * Callback for touch event listeners.
         * @memberof TrackUI
         * @param {object} e - DOM event
         * @return {void}
         */
        touchHandler: function (e) {
            e = TrackLib.Events.fix(e);

            if ('isTrusted' in e && !e.isTrusted) return;

            let touches = e.changedTouches; // better
            if (touches) for (let i = 0, touch; i < touches.length; ++i) {
                touch = touches[i];
                touch.type = e.type;
                TrackUI.eventHandler(touch);
            }
        },
        /**
         * Cross-browser way to register the mouse position.
         * @memberof TrackUI
         * @param {object} e - DOM event
         * @param {{clientY: number, clientX: number, pageY: number, pageX: number}} oldCoords
         * @return {{clientY: number, clientX: number, pageY: number, pageX: number}} pos - Coordinates
         */
        getMousePos: function (e, oldCoords) {
            e = TrackLib.Events.fix(e);

            // Important things to keep in mind (!):
            // pageX/pageY are the coordinates in regards to the whole page
            // clientX/clientY are the coordinates according to the current visible section (never exceed screen dim)
            let positionClient = {x: oldCoords.clientX, y: oldCoords.clientY};
            let positionPage = {x: oldCoords.pageX, y: oldCoords.pageY};


            if (e.pageX || e.pageY) {
                positionPage.x = e.pageX;
                positionPage.y = e.pageY;
            }
            // Sometimes the mouse coordinates are negative (e.g., in Opera)
            if (!positionPage.x || positionPage.x < 0) positionPage.x = 0;
            if (!positionPage.y || positionPage.y < 0) positionPage.y = 0;

            // on scroll we just want to update the mouse position in the page
            // an scroll event does not return the clientX/clientY position! So we return the old coordinates
            if (e.type === "scroll") {
                if (typeof window.pageYOffset !== 'undefined') {
                    positionPage.y = window.pageYOffset + oldCoords.clientY;
                }
                if (typeof window.pageXOffset !== 'undefined') {
                    positionPage.x = window.pageXOffset + oldCoords.clientX;
                }
            } else {
                // if the event is is not scroll, we want to update the (client) mouse pos.
                // todo: touch events also deliver coords, but technically it is not a mouse: How to handle this?
                if (e.clientX || e.clientY) {
                    positionClient.x = e.clientX;
                    positionClient.y = e.clientY
                }
            }
            /**
             * @typedef {object} Point
             * @property {number} pageX - The X coordinate of the whole page (can be bigger then the monitor)
             * @property {number} pageY - The Y coordinate of the whole page (can be bigger then the monitor)
             * @property {number} clientX - The X coordinate of the screen section
             * @property {number} clientY - The Y coordinate of the screen section
             */
            return {clientX: positionClient.x, clientY: positionClient.y, pageX: positionPage.x, pageY: positionPage.y};
        },
        /**
         * Fills in a log data row.
         * @param {number} id      Cursor ID
         * @param {number} time    Current timestamp
         * @param {number} posX    Cursor X position
         * @param {number} posY    Cursor Y position
         * @param {string}  event   Related event name
         * @param {string}  xpath   Related element in XPath notation
         * @param {string}  attrs   Serialized node attributes
         * @return void
         */
        fillInfo: function () {
            let args = [].slice.apply(arguments);
            _info.push(args.join(ARGS_SEPARATOR));
            TrackUI.log(args);
        },
        /**
         * Send remaining data (if any) to the backend server.
         * @memberof TrackUI
         * @return {void}
         */
        flush: function () {
            TrackUI.log('Flushing data...');
            let i;
            for (i = 0; i < _docEvents.length; ++i) {
                TrackLib.Events.remove(document, _docEvents[i], TrackUI.docHandler);
            }
            for (i = 0; i < _winEvents.length; ++i) {
                TrackLib.Events.remove(window, _winEvents[i], TrackUI.winHandler);
            }
            // Don't use asynchronous requests here, otherwise this won't work
            // NB: Some browsers disallow sync AJAX requests on page unload
            if (_uid) {
                TrackUI.appendData(false);
            } else {
                TrackUI.initNewData(false);
            }
        },
        /**
         * Show debug information in the JS console.
         * @memberof TrackUI
         * @param {any} args - Any number of arguments // ??
         * @return {void}
         */
        log: function (args) {
            if (TrackUI.settings.debug && typeof console.log === 'function') {
                console.log.apply(console, arguments);
            }
        },

    };

    // Expose
    window.TrackUI = TrackUI;
})(this);
