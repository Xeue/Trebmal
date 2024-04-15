/* eslint-disable no-undef */
import express from 'express'
import cors from 'cors'
import {Server as _Server} from 'xeue-webserver'
import {Logs as _Logs} from 'xeue-logs'
import {Config as _Config} from 'xeue-config'
import {Shell as _Shell} from 'xeue-shell'
import path from 'path'
import {fileURLToPath} from 'url'
import ejs from 'ejs'

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const {version} = require('./package.json')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ring1sink = '{7577463C-D621-47B5-8666-143724DAFED6}';
const ring2sink = '{7577463C-D621-47B5-8666-143724DAFED6}';
//const recordSink = '{0.0.1.00000000}.{7980168d-fbba-467c-b39f-b560f0274eaa}';
const recordSink = '{0.0.1.00000000}.{a6770a86-c8f7-4090-9fce-4f49f1e93ac4}';

const Logs = new _Logs(false, 'CreditsLogging', __dirname, 'W', false)
const config = new _Config(Logs)
const webServer = new _Server(expressRoutes, Logs, version, config)
const Shell = new _Shell(Logs, 'PLAYER', 'D', 'cmd.exe');
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

	Logs.setConf(
		config.get('createLogFile'),
		'TrebmalLogging',
		__dirname,
		config.get('loggingLevel'),
		config.get('debugLineNum')
	)

	config.userInput(async (command)=>{
		switch (command) {
		case 'config':
			await config.fromCLI(__dirname + '/config.conf')
			Logs.setConf(
				config.get('createLogFile'),
				'TrebmalLogging',
				__dirname,
				config.get('loggingLevel'),
				config.get('debugLineNum')
			)
			return true
		}
	})

	Logs.log('Running version: v'+version, ['H', 'SERVER', Logs.g])
	webServer.start(config.get('port'))
	Logs.log(`Trebmal can be accessed at http://localhost:${config.get('port')}`, ['C', 'SERVER', Logs.g])
	config.print()
}

function expressRoutes(app) {
	app.set('views', __dirname + '/views')
	app.set('view engine', 'ejs')
	app.use(cors())
	app.use(express.json())
	app.use(express.static('public'))
	app.use(express.urlencoded({ extended: true }))

    app.get('/startRing1', (request, response) =>{ 
        doRing1();
        ring1ringing = true;
        response.send('Started Ringer 1');
    })

    app.get('/startRing2', (request, response) =>{ 
        doRing2();
        ring2ringing = true;
        response.send('Started Ringer 2');
    })

    app.get('/startRecord', (request, response) =>{ 
        record = Shell.process(`gst-launch-1.0 wasapisrc device="${recordSink}" ! audioconvert ! audioresample ! wavenc ! filesink location=reverseaudio.wav`, true);
        response.send('Started Recording');
        Logs.log('Started recording')
    })

    app.get('/startPlay', (request, response) =>{ 
        play = Shell.process(`ffplay -f lavfi amovie=reverseaudio.wav,areverse1`);
        response.send('Started Playing');
        Logs.log('Started playing')
    })

    app.get('/stopRing1', (request, response) =>{ 
        ring1ringing = false;
        try {
            ring1.kill();
        } catch (error) {
            
        }
        response.send('Stopped Ringer 1')
    })

    app.get('/stopRing2', (request, response) =>{ 
        ring2ringing = false;
        try {
            ring2.kill();
        } catch (error) {
            
        }
        response.send('Stopped Ringer 2')
    })

    app.get('/stopRecord', (request, response) =>{ 
        try {
            record.kill();
            Logs.log('Stopped recording')
        } catch (error) {
            
        }
        response.send('Recording Stopped');
    })

    app.get('/stopPlay', (request, response) =>{ 
        try {
            play.kill();
            Logs.log('Stopped playing')
        } catch (error) {
            
        }
        response.send('Playing Stopped');
    })
}

function doRing1() {
    ring1 = Shell.process(`gst-launch-1.0 filesrc location=ring.wav ! wavparse ! audioconvert ! audioresample ! directsoundsink device="${ring1sink}"`, true);
    ring1.on('exit', ()=>{
        if (ring1ringing) doRing1();
    })
}

function doRing2() {
    ring2 = Shell.process(`gst-launch-1.0 filesrc location=ring.wav ! wavparse ! audioconvert ! audioresample ! directsoundsink device="${ring2sink}"`, true);
    ring2.on('exit', ()=>{
        if (ring1ringing) doRing2();
    })
}