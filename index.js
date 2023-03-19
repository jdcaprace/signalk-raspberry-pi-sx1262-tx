/*
 * Copyright 2023 Jean-David Caprace <jd.caprace@gmail.com>
 *
 * Add the MIT license
 */

const spawner = require('child_process').spawn;

//To obtain the SignalK paths
const signalkSchema = require('@signalk/signalk-schema')
const Bacon = require('baconjs')
const relevantKeys = Object.keys(signalkSchema.metadata)
  .filter(s => s.indexOf('/vessels/*') >= 0)
  .map(s => s.replace('/vessels/*', '').replace(/\//g, '.').replace(/RegExp/g, '*').substring(1)).sort()

module.exports = function (app) {
  let timer = null
  let plugin = {}

  plugin.id = 'signalk-raspberry-pi-sx1262-tx'
  plugin.name = 'Raspberry-Pi sx1262-tx'
  plugin.description = 'sx1262 to send SignalK path values by LoRa'

  plugin.schema = {
    type: 'object',
    properties: {
      messagesendingrate: {
        title: "This is the message sending rate.",
        description: 'in seconds',
        type: 'number',
        default: 60
      },
      //TODO: include params
      //usbdevicepath: {
      //  type: 'string',
      //  title: 'USB device path',
      //  description: 'Example: /dev/ttyUSB0 (USB) or /dev/ttyS0 (Serial)',
      //  default: '/dev/ttyS0',
      //},
      positionskpath: {
        type: 'string',
        title: 'Signal K path of the gps navigation position (latitude,longitude).',
        default: 'navigation.position',
      },
      params: {
        type: "array",
        title: "SignalK path",
        description: 'Path of the data to be sent by satellite comunication',
        items: {
          type: "object",
          required: ['enable','skpath'],
          properties: {
            enable: {
              type: 'boolean',
              title: 'Enable this signalK path',
              default: false
            },
            skpath: {
              type: 'string',
              title: 'SignalK path',
              description: 'This is used to extract the value of the field you want to send with LoRa. Support only numbers and alarm states of the signalk.zones plugin at the moment.',
              default: 'environment.outside.temperature'
            }
          }
        },
      },
    }
  }

  var unsubscribes = [];

  plugin.start = function (options) {
    
    function buildingpayloadmessage(){
      //Creating the payload of the message to be sent to the satellite
      //Format will be CSV as: Name; DateTime; lat; long; P1; P2; P3; ...
      
      //Shipid  
      var shipid = app.getSelfPath('name');
      //console.log('Shipid: ', shipid);

      //Date Time
      var today = new Date();
      var DD = String(today.getDate()).padStart(2, '0');
      var MM = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
      var YYYY = today.getFullYear();
      var hh = today.getHours();
      var mm = today.getMinutes();
      var ss = today.getSeconds();
      today = YYYY + MM + DD + hh + mm + ss;
      //console.log('Date-Time: ', today);

      //First parameter is the position
      let tpv = {};
      var toprint = '';
      //let uuid = app.getSelfPath('uuid');
      //console.log('uuid: ',uuid);
      //let posi = app.getSelfPath('navigation.position');
      //console.log('posi: ',posi);

      if(app.getSelfPath(options.positionskpath)){
        //console.log('Entering in positionskpath.');
        if(!tpv.sk1) tpv.sk1 = {};
        tpv.sk1.value = app.getSelfPath(options.positionskpath).value;
        //if(typeof tpv.sk1.value == 'number'){tpv.sk1.value = tpv.sk1.value.toFixed(3);}
        
          if(options.positionskpath.includes('navigation.position')){
            tpv.sk1.value = app.getSelfPath(options.positionskpath).value;
            var pos = JSON.parse(JSON.stringify(tpv.sk1.value));
            //console.log("Position: ",pos);
            
            //If gps position not found return 999
            var lat = '999';
            var long = '999';
            tpv.sk1.value = lat + ";" + long;
            
            if(pos.longitude !== null && pos.latitude !== null){
              lat = String(pos.latitude.toFixed(8));
              long = String(pos.longitude.toFixed(8));
              tpv.sk1.value = lat + ";" + long;
            }
            toprint = tpv.sk1.value;
          }
        //tpv.sk1.timestamp =  Date.parse(app.getSelfPath(options.positionskpath).timestamp);
        //console.log('Lat and Long: ', toprint);
      }

      //If there is some aditional parameters to sent ...
      //console.log('options length: ',options.params.length.toString());
      var addpayload = '';
      if (options.params && options.params.length > 0){
        options.params.forEach(param => {
          //app.debug(param);
          if (param.enable == true){
            if (app.getSelfPath(param.skpath) && app.getSelfPath(param.skpath).value !== null){
              //If the field is numeric.
              if(typeof app.getSelfPath(param.skpath).value == 'number'){
                addpayload = addpayload + ';' + String(app.getSelfPath(param.skpath).value.toFixed(2));
              }
              //console.log('Payload: ', addpayload);
            }
          }
        })
      }
      var message = shipid + ';' + today + ';' + toprint + addpayload;
      console.log('Payload message: ', message);
      return message;
    }//End of constructing the message.
  	 
    function sendingmessage(){
      console.log('Enter in sendingmessage.');
      txtmessage = buildingpayloadmessage();
      console.log('txtmessage to be send: ', txtmessage);
      const python_process = spawner('python3', ['./tx.py', txtmessage]);
      console.log('After the call of Python');
      python_process.stdout.on('data', (data) => {
        console.log('Data received from python script:', data.toString());
      });
    }

    function repeatsendingmessage(){
      //console.log('Enter in repeatsendingmessage.');
      sendingmessage();
      setTimeout(repeatsendingmessage, options.messagesendingrate * 1000);
    }
    
    repeatsendingmessage();
    //timer = setInterval(buildingpayloadmessage, 1000 * 5);
  }

 
  plugin.stop = function () {
    app.debug('Plugin stopped');
    if(timer){
      clearInterval(timer);
      timeout = null;
    }

    unsubscribes.forEach(f => f())
    unsubscribes = []
  }

  return plugin;
}
