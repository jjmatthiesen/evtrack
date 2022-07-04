# evtrack (reg-TS)

This is a forked and modified version of [evtrack](https://github.com/luileito/evtrack)
by [Luis Leiva](https://github.com/luileito/).


This tracker distinguishes between regular and polling events. 
While **regular events** are recorded when they happen (e.g. useful for clicks), 
**polling events** will read from a state in a given time interval 
(``pollingMs``).

## Changes made in the forked version:

### 1. regular time steps for recursive machine learning models
Events giving in pollingEvents, are now tracked in regular time steps. 
So the recording is not just triggered on "mouse move" but happens continuously. 

This results in a repetition of the same coordinates, which 
enables likewise a more detailed recording of pauses.
Multiple recursive machine learning models require regular time steps, so we do not have to interpolate.


### 2. Multiple coordinates for mouse position
This version records two different parameter settings for recording mouse coordinates.

`clientX`/ `clientY`: Coordinates describing the position of the mouse cursor 
according to the client window of the user's screen.
Coordinates are (0|0) in the top left corner of the window.

`pageX`/ `pageY`: Coordinates describing the position of the mouse cursor
according to the position of the whole page. 
Coordinates include the scroll offset, e.g. they can be (0|500) 
if the cursor rests in the top left corner, but the page is scrolled down.

The value of `pageX`/ `pageY` will be calculated anew on a scroll event. 
Since the scroll event does *not* include the current mouse position, 
the coordinates saved in the state manager is used for calculation.

### 3. State manager
Mouse events are recorded and stored in TrackUI.states.
The state can be requested at any time and will give an update of the cursor's current state.


### 4. Scroll speed
Scroll speed is now also recorded. 
It is recommended to also request the scroll speed in regular time steps 
so that the information is connected to the mouse position.


## How To Use

*Todo: minified versions are not compiled yet. Please use the unminified version for now.*

* For web pages:
  Just add `load.js` to your page (e.g. inside `<head>` element or right before the closing `</body>` tag) and configure tracking options.

* For browser extensions:
  Add `tracklib.js` and `trackui.js` (in this order) to your `manifest.json` (or similar) and configure tracking options.


It is recommended to track mouse coordinates with following settings:

### Recommended settings for mouse tracking:

Captures mouseover, mouseout, mouseenter, mousedown and mouseup whenever they happen.

Mousemove and scroll are requested in regular time steps (every 40 ms = 25 fps).

```javascript
<script src="/path/to/load.js"></script>
<script>
(function(){

    TrackUI.record({
        // Remember to point to save.php (or similar) to write the log files.
        postServer: "path/to/save.php",
        regularEvents: "mouseover mouseout mouseenter mousedown mouseup",
        pollingEvents: "mousemove scroll",
        // equals 25 fps
        pollingMs: 40
    });

})();
</script>
```

### Track with default configurations:
Capture [any](https://github.com/jayflyaway/evtrack/blob/master/js/src/trackui.js#L8) browser event whenever it happens.

```javascript
<script src="/path/to/load.js"></script>
<script>
(function(){

  TrackUI.record({
    // Remember to point to save.php (or similar) to write the log files.
    postServer: "/path/to/save.php"
  });

})();
</script>
```

## Default tracking settings

The `settings` object has the following defaults:

```javascript
TrackUI.record({
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
  // Enable this to display some debug information
  debug: false
})
```

### Result

For each browsed page, you'll have in the `logs` directory the following files:

1. A space-delimited CSV-like file with 8 columns.
2. An XML file with some metadata.

#### CSV file example

```csv
timeNow clientX clientY pageX pageY eventName scrollSpeed elemXpath elemAttrs extraInfo
1656919678671    413    464    413    1051    "mousemove"    0    "/html/body"    "{\"BODY\":{\"class\":\"none\",\"style\":\"height: 2000px; width: 2000px\"}}"    {}

```
Where:
* The `timestamp` column indicates the timestamp of the event, with millisecond precision.
* The `clientX` and `clientY` columns indicate the `x` and `y` position of the cursor, in respect of the screen.
* The `pageX` and `pageY` columns indicate the `x` and `y` position of the cursor, in respect of the whole page. 
  Note that the coordinates are the same if the page is not scrollable.
  If mouse events are not polled, these values are `0` on  events that do *not* relate to any mouse event (e.g. `load` or `blur`).
  If events are polled it will report the coordinates from the previous time step.
* The `eventNmae` column indicates the browser's event name.
* The `elemXpath` column indicates the target element that relates to the event, [in XPath notation](https://en.wikipedia.org/wiki/XPath).
* The `elemAttrs` column indicates the element attributes, if any.
* The `extraInfo` column is populated with the result of the `callback` setting you've set.


----

---- original evtrack README -----
https://github.com/luileito/evtrack/#readme

