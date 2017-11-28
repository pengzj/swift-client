/**
 * Created by francis.peng on 11/14/17.
 */
(function () {
    var Protocol = window.protocol;

    var ByteArray = Uint8Array;

    var root = window;

    var heartbeatInterval = 5 * 1000
    var heartbeatTimeout = 2 * heartbeatInterval;


    /**
     * Initialize a new `Emitter`.
     *
     * @api public
     */

    function Emitter(obj) {
        if (obj) return mixin(obj);
    }

    /**
     * Mixin the emitter properties.
     *
     * @param {Object} obj
     * @return {Object}
     * @api private
     */

    function mixin(obj) {
        for (var key in Emitter.prototype) {
            obj[key] = Emitter.prototype[key];
        }
        return obj;
    }

    /**
     * Listen on the given `event` with `fn`.
     *
     * @param {String} event
     * @param {Function} fn
     * @return {Emitter}
     * @api public
     */

    Emitter.prototype.on = function(event, fn){
        this._callbacks = this._callbacks || {};
        (this._callbacks[event] = this._callbacks[event] || [])
            .push(fn);
        return this;
    };

    /**
     * Adds an `event` listener that will be invoked a single
     * time then automatically removed.
     *
     * @param {String} event
     * @param {Function} fn
     * @return {Emitter}
     * @api public
     */

    Emitter.prototype.once = function(event, fn){
        var self = this;
        this._callbacks = this._callbacks || {};

        function on() {
            self.off(event, on);
            fn.apply(this, arguments);
        }

        fn._off = on;
        this.on(event, on);
        return this;
    };

    /**
     * Remove the given callback for `event` or all
     * registered callbacks.
     *
     * @param {String} event
     * @param {Function} fn
     * @return {Emitter}
     * @api public
     */

    Emitter.prototype.off =
        Emitter.prototype.removeListener =
            Emitter.prototype.removeAllListeners = function(event, fn){
                this._callbacks = this._callbacks || {};

                // all
                if (0 == arguments.length) {
                    this._callbacks = {};
                    return this;
                }

                // specific event
                var callbacks = this._callbacks[event];
                if (!callbacks) return this;

                // remove all handlers
                if (1 == arguments.length) {
                    delete this._callbacks[event];
                    return this;
                }

                // remove specific handler
                var i = index(callbacks, fn._off || fn);
                if (~i) callbacks.splice(i, 1);
                return this;
            };

    /**
     * Emit `event` with the given args.
     *
     * @param {String} event
     * @param {Mixed} ...
     * @return {Emitter}
     */

    Emitter.prototype.emit = function(event){
        this._callbacks = this._callbacks || {};
        var args = [].slice.call(arguments, 1)
            , callbacks = this._callbacks[event];

        if (callbacks) {
            callbacks = callbacks.slice(0);
            for (var i = 0, len = callbacks.length; i < len; ++i) {
                callbacks[i].apply(this, args);
            }
        }

        return this;
    };

    /**
     * Return array of callbacks for `event`.
     *
     * @param {String} event
     * @return {Array}
     * @api public
     */

    Emitter.prototype.listeners = function(event){
        this._callbacks = this._callbacks || {};
        return this._callbacks[event] || [];
    };

    /**
     * Check if this emitter has `event` handlers.
     *
     * @param {String} event
     * @return {Boolean}
     * @api public
     */

    Emitter.prototype.hasListeners = function(event){
        return !! this.listeners(event).length;
    };


    var Swift = Object.create(Emitter.prototype); // object extend from object
    root.Swift = Swift;
    Swift.dict = {};
    Swift.abbrs = {};


    Swift.newClient =function () {
        return new Client();
    };

    function Client() {
        this.socket = null;

        this.callbacks = {};
        this.reqId = 0;
        this.nextheartbeatTimeout = 0;
        this.heartbeatId = 0;
        this.heartbeatTimeoutId = 0;
    }

    Client.prototype.connect = function (host, port) {
        this.socket = new WebSocket("ws://" + host + ":" + port);
        this.socket.binaryType = 'arraybuffer';
        this.socket.onopen = onopen.bind({container: this});
        this.socket.onmessage = onmessage.bind({container: this});
        this.socket.onclose = onclose.bind({container: this});
        this.socket.onerror = onerror.bind({container: this});
    };

    Client.prototype.request = function (route, param, cb) {
        this.reqId++;
        var routeId = Swift.dict[route];
        if(routeId == undefined) {
            console.error(route + " not exists in dist");
            return;
        }
        param = param ? param : {};
        var data = Protocol.encode(Protocol.TYPE_DATA_REQUEST, Protocol.Message.encode(this.reqId, routeId, JSON.stringify(param)))
        this.socket.send(data)
        this.callbacks[this.reqId] = cb
    };

    Client.prototype.notify = function (route, param) {
        var routeId = this.dict[route];
        if(routeId == undefined) {
            console.error(route + " not exists in dist");
            return;
        }
        var data = Protocol.encode(Protocol.TYPE_DATA_NOTIFY, Protocol.Message.encode(0, routeId, JSON.stringify(param)));
        this.socket.send(data)
    };

    Client.prototype.disconnect = function () {
        this.socket.close();
        if(this.heartbeatId) {
            clearTimeout(this.heartbeatId);
        }
        this.socket = null;
    };


    var onopen = function () {
        //to do decide whether we need to handshake again
        var container = this.container;
        var data = Protocol.encode(Protocol.TYPE_HANDSHAKE, new ByteArray(0))
        container.socket.send(data);

        heartbeat(container)
    };

    var onmessage = function (event) {
        var buffer = new ByteArray(event.data)
        var container = this.container;

        //do with more than one data
        var totalLength = buffer.length;
        var offset = 0;
        while (offset < totalLength) {
            var obj = Protocol.decode(buffer);
            switch (obj.type) {
                case Protocol.TYPE_HANDSHAKE_ACK:
                    handshake(container, obj.body)
                    break;
                case Protocol.TYPE_HEARTBEAT:
                    heartbeat(container, obj.body)
                    break;
                case Protocol.TYPE_DATA_RESPONSE:
                    onData(container, obj.body)
                    break;
                case Protocol.TYPE_DATA_PUSH:
                    onPush(container, obj.body)
                    break;
                case Protocol.TYPE_KICK:
                    onKick(container, obj.body)
                    break;
            }

            offset = offset + Protocol.getHeadLength() + Protocol.getBodyLength(buffer)
            buffer = buffer.slice(offset)
        }
    };

    var onclose = function (event) {
        Swift.emit("close")
        console.error("close socket: ", event)
    };

    var onerror = function (event) {
        Swift.emit('io-error')
        console.error("io-error: ", event)
    };


    function handshake(container, data) {
        var data = Protocol.Message.decode(data);
        var body = JSON.parse(data.body);

        body.forEach(function (route) {
           Swift.dict[route.Name] = route.Id;
           Swift.abbrs[route.Id] = route.Name;
        });

        console.log("handshake", body)
    }

    function heartbeat(container, data) {
        var obj = Protocol.encode(Protocol.TYPE_HEARTBEAT, []);

        container.socket.send(obj)

        container.nextheartbeatTimeout = Date.now() + heartbeatTimeout;

        container.heartbeatTimeoutId = setTimeout(heartbeatTimeoutCB.bind({container: container}), heartbeatInterval )
    }
    
    function heartbeatTimeoutCB() {
        var container = this.container;
        if(Date.now() > container.nextheartbeatTimeout) {
            console.error("heartbeat timeout")
            Swift.emit("heartbeat timeout");
            container.disconnect();
            return;
        }
        container.nextheartbeatTimeout = Date.now() + heartbeatTimeout;
        container.heartbeatTimeoutId = setTimeout(heartbeatTimeoutCB.bind({container: this.container}), heartbeatInterval);
    }

    function onPush(container, data) {
        var data = Protocol.Message.decode(data);

        var routeId = data.routeId;

        try {
            var body = JSON.parse(data.body)
        } catch (e) {
                body = data.body
        }

        var routeName = Swift.abbrs[routeId]
        if(routeName) {
            Swift.emit(routeName, body)
        } else {
            console.error(routeId + " not exists in address")
        }
    }

    function onData(container, data) {
        var data = Protocol.Message.decode(data);
        var msgId = data.msgId;
        var body = JSON.parse(data.body)

        var cb = container.callbacks[msgId]
        delete container.callbacks[msgId]

        if(!cb) {
            return;
        }
        cb(body)
    }

    function onKick(container, data) {
        Swift.emit("kick", data)
    }

})();