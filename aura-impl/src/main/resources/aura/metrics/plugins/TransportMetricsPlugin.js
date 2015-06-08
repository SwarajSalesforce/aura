/*
 * Copyright (C) 2013 salesforce.com, inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/*jslint sub: true */
/**
 * @description Transport metrics plugin
 * @constructor
 */
var TransportMetricsPlugin = function TransportMetricsPlugin(config) {
    this.config = config;
    this.counter = 1;
    this["enabled"] = true;
};

TransportMetricsPlugin.NAME = "transport";
TransportMetricsPlugin.prototype = {
    initialize: function (metricsService) {
        this.collector = metricsService;
        if (this["enabled"]) {
            this.bind(metricsService);
        }
    },
    enable: function () {
        if (!this["enabled"]) {
            this["enabled"] = true;
            this.bind(this.collector);
        }
    },
    disable: function () {
        if (this["enabled"]) {
            this["enabled"] = false;
            this.unbind(this.collector);
        }
    },
    sendOverride : function (/* config, auraXHR, actions, method, options */) {
        var config = Array.prototype.shift.apply(arguments);
        var auraXHR = arguments[0];
        var options = arguments[4];
        var ret = config["fn"].apply(config["scope"], arguments);
        if (ret) {
            var startMark = this.collector["markStart"](TransportMetricsPlugin.NAME, 'request');
            var actionDefs = [];
            for (var id in auraXHR.actions) {
                if (auraXHR.actions.hasOwnProperty(id)) {
                    actionDefs.push(auraXHR.actions[id].getDef() + '[' + id + ']');
                }
            }
            auraXHR.marker = this.counter++;
            startMark["context"] = {
                "aura.num"      : auraXHR.marker,
                "requestLength" : auraXHR.length,
                "actionDefs"    : actionDefs,
                "requestId"     : options && options["requestId"]
            };
        }
        return ret;
    },
    receiveOverride : function(/* config, auraXHR */) {
        var config = Array.prototype.shift.apply(arguments);
        var auraXHR = arguments[0];
        var endMark = this.collector["markEnd"](TransportMetricsPlugin.NAME, "request");
        endMark["context"] = {
            "aura.num"       : auraXHR.marker,
            "status"         : auraXHR.request.status,
            "statusText"     : auraXHR.request.statusText,
            "responseLength" : auraXHR.request.responseText.length
        };
        return config["fn"].apply(config["scope"], arguments);
    },
    bind: function (metricsService) {
        $A.installOverride("ClientService.send", this.sendOverride, this);
        $A.installOverride("ClientService.receive", this.receiveOverride, this);
    },
    //#if {"excludeModes" : ["PRODUCTION"]}
    postProcess: function (transportMarks) {
        var procesedMarks = [];
        var queue = {};
        for (var i = 0; i < transportMarks.length; i++) {
            var id = transportMarks[i]["context"]["aura.num"];
            var phase = transportMarks[i]["phase"];
            if (phase === 'stamp') {
                procesedMarks.push(transportMarks[i]);
            } else if (phase === 'start') {
                queue[id] = transportMarks[i];
            } else if (phase === 'end' && queue[id]){
                var mark = $A.util.apply({}, queue[id], true, true);
                mark["context"]  = $A.util.apply(mark["context"], transportMarks[i]["context"]);
                mark["duration"] = transportMarks[i]["ts"] - mark["ts"];
                mark["phase"]    = 'processed';
                procesedMarks.push(mark);
                delete queue[id];
            }
        }
        return procesedMarks;
    },
    // #end
    unbind: function (metricsService) {
        $A.uninstallOverride("ClientService.send", this.sendOverride);
        $A.uninstallOverride("ClientService.receive", this.receiveOverride);
    }
};

// Exposing symbols/methods for Google Closure
var p = TransportMetricsPlugin.prototype;

exp(p,
    "initialize",  p.initialize,
    "enable",      p.enable,
    "disable",     p.disable,
    "postProcess", p.postProcess
);

$A.metricsService.registerPlugin({
    "name"   : TransportMetricsPlugin.NAME,
    "plugin" : TransportMetricsPlugin
});
