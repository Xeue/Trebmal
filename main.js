/* eslint-disable no-undef */
import express from 'express';
import cors from 'cors';
import {Server as _Server} from 'xeue-webserver';
import {Logs as _Logs} from 'xeue-logs';
import {Config as _Config} from 'xeue-config';
import {Shell as _Shell} from 'xeue-shell';
import path from 'path';
import {fileURLToPath} from 'url';
import ejs from 'ejs';
import readline from 'readline';

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const {version} = require('./package.json')
const gstreamer = require('gstreamer-superficial');

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const Logs = new _Logs(false, 'CreditsLogging', __dirname, 'D', false)
const config = new _Config(Logs)
const webServer = new _Server(expressRoutes, Logs, version, config)
const Shell = new _Shell(Logs, 'PLAYER', 'D');
let record, play, ring1, ring2
let ring1ringing = false
let ring2ringing = false;

{ /* Config setup */
	Logs.printHeader('Trebmal')

	config.default('port', 8080)
	config.default('installName', 'Ardross')
	config.default('debugLineNum', false)
	config.default('loggingLevel', 'D')
	config.default('createLogFile', true)

	config.require('port')
	config.require('installName', [], 'Name of the site, this appears in the tab in browser')
	config.require('loggingLevel', ['A','D','W','E'], 'What level of logs should be recorded (A)ll (D)ebug (W)arning (E)rror')
	config.require('createLogFile', [true, false], 'Generate log file')

	if (!await config.fromFile(__dirname + '/config.conf')) {
		await config.fromCLI(__dirname + '/config.conf')
	}

	Logs.setConf({
		'createLogFile': config.get('createLogFile'),
		'logsFileName': 'TrebmalLogging',
		'configLocation': __dirname,
		'loggingLevel': config.get('loggingLevel'),
		'debugLineNum': config.get('debugLineNum')
    })

	config.userInput(async (command)=>{
		switch (command) {
		case 'config':
			await config.fromCLI(__dirname + '/config.conf')
			Logs.setConf({
				'createLogFile': config.get('createLogFile'),
				'logsFileName': 'TrebmalLogging',
				'configLocation': __dirname,
				'loggingLevel': config.get('loggingLevel'),
				'debugLineNum': config.get('debugLineNum')
            })
			return true
		}
	})

	Logs.log('Running version: v'+version, ['H', 'SERVER', Logs.g])
	webServer.start(config.get('port'))
	Logs.log(`Trebmal can be accessed at http://localhost:${config.get('port')}`, ['C', 'SERVER', Logs.g])
	config.print()
}

const sinks = getSinks().filter(sink => sink.api == 'wasapi');
const sources = getSources().filter(sink => sink.api == 'wasapi');
Logs.log('Please select output for Ring 1');
const ring1sink = await select(sinks, 0);
Logs.log('Please select output for Ring 2');
const ring2sink = await select(sinks, 0);

Logs.log('Please select input for audio to be reversed');
const recordSrc = await select(sources, 0);
Logs.log('Sources all selected');

function expressRoutes(app) {
	app.set('views', __dirname + '/views')
	app.set('view engine', 'ejs')
	app.use(cors())
	app.use(express.json())
	app.use(express.static('public'))
	app.use(express.urlencoded({ extended: true }))

    app.get('/startRing1', (request, response) =>doRing1(response));
    app.get('/startRing2', (request, response) =>doRing2(response));
    app.get('/stopRing1', (request, response) =>stopRing1(response));
    app.get('/stopRing2', (request, response) =>stopRing2(response));
    app.get('/stopRingAll', (request, response) =>stopRingAll(response));

    app.get('/startRecord', (request, response) =>{ 
        record = new gstreamer.Pipeline(`${sources[recordSrc].api}src device="${sources[recordSrc].id}" ! audioconvert ! audioresample ! wavenc ! filesink location=reverseaudio.wav`);
        record.play();
        response.send('Started Recording');
        Logs.log('Started recording')
    })

    app.get('/startPlay', (request, response) =>{
        try {Shell.run(`taskkill /pid ${play.execProcess.pid} /T /F`)} catch (error) {Logs.log('Process already killed')}
        play = Shell.process(`ffplay -autoexit -f lavfi amovie=reverseaudio.wav,areverse`, true);
        response.send('Started Playing');
        Logs.log('Started playing')
    })

    app.get('/stopRecord', (request, response) =>{ 
        try {
            record.stop();
            Logs.log('Stopped recording')
        } catch (error) {
            Logs.error('Issue stopping', error);
        }
        response.send('Recording Stopped');
    })

    app.get('/stopPlay', (request, response) =>{ 
        try {
            try {Shell.run(`taskkill /f /im ffplay.exe`)} catch (error) {Logs.log('Process already killed')}
            play.kill();
            Logs.log('Stopped playing')
        } catch (error) {
            
        }
        response.send('Playing Stopped');
    })
}

function doRing1(response) {
    if (ring2ringing) {
        ring1ringing = false;
        ring2ringing = false;
        stopRing1();
        stopRing2();
    } else {
        if (ring1ringing) return response.send('Already ringing 1');
        ring1ringing = true;
        response.send('Started Ringer 1');
        ring1 = Shell.process(`gst-launch-1.0 filesrc location=ring.wav ! wavparse ! audioconvert ! audioresample ! ${sinks[ring1sink].api}sink device="${sinks[ring1sink].id}"`, true);
        ring1.on('exit', ()=>{
            if (ring1ringing) doRing1();
        })
    }
}

function doRing2(response) {
    if (ring1ringing) {
        ring1ringing = false;
        ring2ringing = false;
        stopRing1();
        stopRing2();
    } else {
        if (ring2ringing) return response.send('Already ringing 2');
        ring2ringing = true;
        response.send('Started Ringer 2');
        ring2 = Shell.process(`gst-launch-1.0 filesrc location=ring.wav ! wavparse ! audioconvert ! audioresample ! ${sinks[ring2sink].api}sink device="${sinks[ring2sink].id}"`, true);
        ring2.on('exit', ()=>{
            if (ring2ringing) doRing2();
        })
    }
}

function stopRing1(response) {
    ring1ringing = false;
    try {
        ring1.kill();
    } catch (error) {
        Logs.log('Ring 1 already stopped');
    }
    response.send('Stopped Ringer 1')
}

function stopRing2(response) {
    ring2ringing = false;
    try {
        ring2.kill();
    } catch (error) {
        Logs.log('Ring 2 already stopped');
    }
    response.send('Stopped Ringer 2')
}

function stopRingAll(response) {
    ring1ringing = false;
    ring2ringing = false;
    try {
        ring1.kill();
    } catch (error) {
        Logs.log('Ring 1 already stopped');
    }
    try {
        ring2.kill();
    } catch (error) {
        Logs.log('Ring 2 already stopped');
    }
    response.send('Stopped Ringers')
}

function getSinks() {
    const stdout = Shell.runSync(`gst-device-monitor-1.0 -i Audio/Sink`);
    const devices = stdout.split('Device found:')
    const sinks = [];
    devices.forEach(device => {
        let deviceData = device.split(/\r?\n/);
        deviceData = deviceData.filter(dev => {
            if (['name', 'device.api', 'device.strid', 'device.id', 'device.guid'].some(element => dev.includes(element))) return true
            else return false;
        });
        device = {};
        if (deviceData.length < 1) return;
        device.name = deviceData[0].split(': ')[1]
        device.api = deviceData[1].split('= ')[1]
        device.id = deviceData[2].split('= ')[1]
        sinks.push(device);
    })
    return sinks;
}

function getSources() {
    const stdout = Shell.runSync(`gst-device-monitor-1.0 -i Audio/Source`);
    const devices = stdout.split('Device found:')
    const sources = [];
    devices.forEach(device => {
        let deviceData = device.split(/\r?\n/);
        deviceData = deviceData.filter(dev => {
            if (['name', 'device.api', 'device.strid', 'device.id', 'device.guid'].some(element => dev.includes(element))) return true
            else return false;
        });
        device = {};
        if (deviceData.length < 1) return;
        device.name = deviceData[0].split(': ')[1]
        device.api = deviceData[1].split('= ')[1]
        device.id = deviceData[2].split('= ')[1]
        sources.push(device);
    })
    return sources;
}

function select(object, current) {
    const [list, listPretty] = [Object.keys(object), object.map(item => item.name)];

    let selected = list.indexOf(current);
    if (selected == -1) {
        selected = list.indexOf(String(current));
    }

    const printSelected = (moveCursor = true) => {
        let options = [];
        list.forEach((option, index) => {
            let colour = '';
            switch (option) {
            case true:
            case 'true':
                colour = Logs.g;
                break;
            case false:
            case 'false':
                colour = Logs.r;
                break;
            case undefined:
            case null:
                colour = Logs.y;
                break;
            }
            const text = listPretty[option];
            if (index == selected) {
                options.push(`${Logs.reset}${Logs.underline}${colour}${text}${Logs.reset}${Logs.dim}`);
            } else {
                options.push(`${Logs.dim}${colour}${text}`);
            }
        });
        if (moveCursor) readline.moveCursor(process.stdout, 0, -1*options.length);
        options.forEach(option => {
            console.log(option);
        })
    };

    printSelected(false);
    return new Promise(resolve => {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('keypress', (ch, key) => {
            switch (key.name) {
            case 'down':
            case 'right': //Right
                if (selected < list.length - 1) {
                    selected++;
                    printSelected();
                }
                break;
            case 'up':
            case 'left': //Left
                if (selected > 0) {
                    selected--;
                    printSelected();
                }
                break;
            case 'return': {//Enter
                process.stdin.removeAllListeners('keypress');
                process.stdin.setRawMode(false);
                readline.moveCursor(process.stdout, 0, -1);
                readline.clearLine(process.stdout, 1);
                const text = listPretty[list[selected]];
                console.log('Data Entered: '+text);
                let ret = list[selected] === 'true' ? true : list[selected];
                ret = list[selected] === 'false' ? false : ret;
                resolve(ret);
                break;
            }
            default:
                break;
            }
        });
    });
}