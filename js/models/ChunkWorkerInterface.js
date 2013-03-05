//Chunk Worker Interface
define(['models/Chunk'], function(Chunk) {
    return Backbone.Model.extend({
        defaults:{
            workerScript: "js/ChunkWorker.js"
        },

        //setup a new worker
        initialize: function() {
            this.worker = new Worker(this.get('workerScript'));
            this.setupPostMessage(this.worker);
            this.worker.postMessage({
                command: "initializeChunk",
                entropy: sjcl.random.randomWords(8)
            });

            //setup the callback handler
            this.worker.onmessage = _.bind(this.callbackHandler, this);
        },

        setupPostMessage: function(worker) {
            var postMessageFunc = worker.webkitPostMessage || worker.postMessage; //try to use webkitPostMessage
            //check to see if browser supports transferable buffers in messages
            var SUPPORTS_TRANSFERS = false;
            try {
                var testAB = new ArrayBuffer(1);
                worker.postMessage({buffer: testAB}, [testAB]);
                if (!testAB.byteLength) { //if there is no byteLength then it was transferred
                    SUPPORTS_TRANSFERS = true;
                }
            } catch(e) {}
            if (SUPPORTS_TRANSFERS) {
                worker.postMessage = postMessageFunc;
            } else {
                worker.postMessage = function(obj) { //ignore the array on the end
                    postMessageFunc(obj);
                };
            }
        },

        //have the ability to call this only when really necessary. Be lazy ;)
        setBuffer: function(callback) {
            this.placedBuffer = true;
            var command = "setBuffer",
                buffer = this.get('buffer');
            this.worker.postMessage({
                command: command,
                arrayBuffer: buffer
            }, [buffer]);

            this.bindSuccess(command, callback);
        },

        bindSuccess: function(command, callback) {
            //Only want this to happen once
            this.on(command + ':success', _.once(function(event) {
                callback(event.data.result);
            }));
        },

        continousBindSuccess: function(command, callback) {
            //Only want this to happen once
            this.on(command + ':success', function(event) {
                callback(event.data.result);
            });
        },

        bindError: function(command, callback) {
            this.on(command + ':error', _.once(callback));
        },

        encryptChunk: function(callback) {
            //Check to see if the worker has a copy of the buffer, if not, give it one
            if (!this.placedBuffer) {
                //todo: arguments.callee is deprecated, pass an actual callback and then have current "callback" be argCallback
                this.setBuffer(_.bind(arguments.callee, this, callback));
                return;
            }


            var command = "encryptChunk";
            this.worker.postMessage({
                command: command
            });

            this.bindSuccess(command, callback);
            
        },

        decryptChunk: function(callback) {
            var command = "decryptChunk";
            this.worker.postMessage({
                command: command
            });
            //it will get an event.data as the parameter
            
            this.bindSuccess(command, callback);
        },

        encodeIVKey: function(callback) {
            var command = "encodeIVKey";
            this.worker.postMessage({
                command: command
            });

            this.bindSuccess(command, callback);
        },

        upload: function(callback) {
            //Check to see if the worker has a copy of the buffer, if not, give it one
            if (!this.placedBuffer) {
                //todo: arguments.callee is deprecated, pass an actual callback and then have current "callback" be argCallback
                this.setBuffer(_.bind(arguments.callee, this, callback));
                return;
            }

            var command = "upload";

            this.worker.postMessage({
                command: command
            });

            //We listen in for the event that will be triggered when the worker is done
            this.bindSuccess(command, callback);

            //If we wanted to account for an error we could do
            this.bindError(command, function(result) {
                console.error('There was an error with the worker: ', result);
            });

        },

        download: function(args, callback) {
            var command = "download";

            this.worker.postMessage({
                command: command,
                linkName: args.linkName,
                linkKey: args.linkKey,
                IVKey: args.IVKey
            });

            //We listen in for the event that will be triggered when the worker is done
            this.bindSuccess(command, _.bind(function(decryptedBuffer) {
                this.set('buffer', decryptedBuffer);
                callback(decryptedBuffer);
            },this));

            //If we wanted to account for an error we could do
            this.bindError(command, function(result) {
                console.error('There was an error with the worker: ', result);
            });
        },

        writeToFile: function(fileSystem, manifestObj, callback) {
            var command = 'writeToFile';

            this.worker.postMessage({
                command: command,
                manifest: manifestObj,
                fileSystem: fileSystem,
                chunkInfo: this.get('chunkInfo')
            });

            //We listen in for the event that will be triggered when the worker is done
            this.bindSuccess(command, callback);

            //If we wanted to account for an error we could do
            this.bindError(command, function(result) {
                console.error('There was an error with the worker', result);
            });
        },

        readData: function() {
            var stringBufferView = new Uint8Array(this.get('buffer'));
            return String.fromCharCode.apply(this,stringBufferView);
        },


        callbackHandler: function(event) {
            if (event.data.command) {
                this.trigger(event.data.command+':'+event.data.status, event);
                console.log('triggered',(event.data.command + ':' + event.data.status));
                console.log('From worker', event.data);
            } else {
                console.log('From worker', event.data);
            }
        },

        terminate: function() {
            if (this.worker) {
                this.worker.terminate();
            }
        },

        //setup a callback to be called when the progress changes
        attachProgressListener: function(callback) {
            var command = "attachProgressListener";

            this.worker.postMessage({
                command: command
            });

            //We listen in for the event that will be triggered when the worker is done
            this.continousBindSuccess(command, callback);

            //If we wanted to account for an error we could do
            this.bindError(command, function(result) {
                console.error('There was an error with the worker in the progress listener', result);
            });
        }
        
    });
});
