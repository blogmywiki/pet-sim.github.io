//
// pet2001audio.js
// (c) Norbert Landsteiner 2023-2024, masswerk.at
//
// PET 2001 audio implementation for CB2 sound
// Recieves samples at BASE_FREQU and resamples them to AudioContext resolution.
// Uses either a ScriptProcessorNode or an AudioWorklet to fill playback buffers on demand.
// Resources, apart from a basic gain node, are connected on demand only.
//

var Pet2001Audio = function(_configObj) {

	"use strict";

	var BASE_FREQU		 = 1000000, // 1MHz PET clock
		FRAME_RATE		 = 60.1,	// PET frame rate
		SAMPLE_RATE		 = 44100,	// preset for audio resolution (not used)
		SAMPLE_CF		 = 0.250,	// signals resampled to -SAMPLE_CF ... +SAMPLE_CF
		PLAYBACK_CF		 = 0.8,		// constant factor for gainNode volume
		FX_VOLUME_CF     = 1.0,   // factor by which to amplify output using the wave shaper
		RING_BUFFER_SIZE = 65536,	// (1<<16) size of ring buffer for script processor mode
		MESSAGE_SIZE	 = 128,		// size of data messages for worklet
		WORKLET_PATH	 = 'js2/pet2001audio-worklet.js';

	var preferInlineMode = true,
		sampleBufferSize = 512,
		sampleBuffer,
		signals,
		audioContext = null,
		gainNode = null,
		processor = null,
		petAudioWorklet = null,
		waveShaper = null,
		processorDestination = null,
		audioAvailable = false,
		connected = false,
		playbackCf = PLAYBACK_CF,
		sampleCf = SAMPLE_CF,
		volume = 0,
		signalCursor = 0,
		bufferReadCursor = 0,
		bufferWriteCursor = 0,
		sampleRatio = 0,
		leftoverSignal = 0,
		leftoverFraction = 0,
		samplesAvailable = 0,
		inlineMode = false,
		useWaveShaper = false;

	if (typeof _configObj === 'object' && _configObj.AUDIO_FX !== 'undefined')
		useWaveShaper = !!_configObj.AUDIO_FX;

	var log2 = Math.log2 || function(x) { return Math.log(x) / Math.log(2); };

	function init() {
		var AudioContext = window.AudioContext || window.webkitAudioContext;
		if (AudioContext) {
			try {
				audioContext = new AudioContext({
					//'sampleRate': SAMPLE_RATE,
					'latencyHint': 'interactive'
				});
			}
			catch (e) {
				// older implentations may fail over number of arguments
				audioContext = new AudioContext();
			}
			// create a master gain node
			gainNode = audioContext.createGain?
				audioContext.createGain() : audioContext.createGainNode();
			gainNode.value = 0;
			if (useWaveShaper) {
				// reshape wave for warmer sound and boost bass
				// processor connects to WaveShaper, which is connected to master gain node
				createWaveShaper();
				processorDestination = waveShaper;
			}
			else {
				// processor connects directly to master gain node
				processorDestination = gainNode;
			}
			// set up ratio for resampling and buffer sizes
			sampleRatio = BASE_FREQU / audioContext.sampleRate;
			// set up a store for incoming signals before resampling
			signals = new Float32Array( Math.ceil(sampleRatio) );
			// create either worklet or ScriptProcessorNode, if either is available
			// audio worklet seems to lag...
			if (audioContext.createScriptProcessor && (preferInlineMode || !audioContext.audioWorklet)) createScriptProcessor();
			else if (audioContext.audioWorklet) createAudioWorklet();
			else console.info('PET 2001: audio processing unavailable.');
			// setup done, but nothing is actually connected, set volume to connect
		}
	}

	function reset() {
		bufferWriteCursor = 0;
		signalCursor = 0;
		leftoverSignal = 0;
		leftoverFraction = 0;
		if (inlineMode) {
			samplesAvailable = 0;
			bufferReadCursor = 0;
		}
		else if (petAudioWorklet) petAudioWorklet.port.postMessage({'job': 'reset'});
	}

	function createWaveShaper() {
		waveShaper = audioContext.createWaveShaper();
		waveShaper.curve = createCurve(3, 30, audioContext.sampleRate);
		var biquad = new BiquadFilterNode(audioContext, {
			type: 'lowshelf',
			frequency: 96,
			gain: 0.75,
			channelCount: 1,
			numberOfInputs: 1,
			numberOfOutputs: 1
		});
		waveShaper.connect(biquad);
		biquad.connect(gainNode);
		// the wave shaper adds 'loudness', adjust output levels
		sampleCf = SAMPLE_CF * FX_VOLUME_CF;
		playbackCf = PLAYBACK_CF * FX_VOLUME_CF;
	}

	function createCurve(offset, amount, nSamples) {
		var ofs = typeof offset === "number" && offset? offset : 3,
			k   = typeof amount === "number" && amount? amount : 50,
			n   = typeof nSamples === "number" && nSamples? nSamples : 44100,
			curve = new Float32Array(n),
			k_ofs = k + ofs,
			cf = 20 * Math.PI / 180; // <const> * <rad-to-deg>

		for (var i = 0; i < n; i++) {
			var x = (i * 2) / n - 1;
			curve[i] = (k_ofs * x * cf) / (Math.PI + k * Math.abs(x));
		}
		return curve;
	}

	function createAudioWorklet() {
		// fetch worklet from same directory
		audioContext.audioWorklet.addModule(WORKLET_PATH)
		.then(function() {
			// create AudioWorkletNode
			var options = {
				'numberOfInputs': 0,
				'numberOfOutputs': 1,
				'outputChannelCount': [1]
			};
			try {
				petAudioWorklet = new AudioWorkletNode(audioContext, 'pet2001-audio-processor', options);
			}
			catch(workletError) {
				console.error('PET2001 Audio: could not create AudioWorkletNode.', workletError);
				return;
			}
			processor = petAudioWorklet;
			inlineMode = false;
			sampleBuffer = new Float32Array(MESSAGE_SIZE);
			reset();
			audioAvailable = true;
			console.info('PET 2001 Audio: launched in audio-worklet mode.');
			// if the volume has been set already, connect audio chain by re-setting it
			if (volume) setVolume(volume);
		})
		.catch(function(error) {
			console.error('PET2001 Audio: failed to add worklet module.', error);
		});
	}

	function createScriptProcessor() {
		// set sample buffer size to just below frame rate (512 for 41.1KHz and 48KHz)
		sampleBufferSize = 1 << Math.floor(log2(audioContext.sampleRate / FRAME_RATE));
		var scriptNode = audioContext.createScriptProcessor(sampleBufferSize, 0, 1);
		scriptNode.onaudioprocess = audioProcessHandler;
		processor = scriptNode;
		inlineMode = true;
		sampleBuffer = new Float32Array(RING_BUFFER_SIZE);
		reset();
		audioAvailable = true;
		console.info('PET 2001 Audio: launched in script-processor mode.');
		// if the volume has been set already, connect audio chain by re-setting it
		if (volume) setVolume(volume);
	}

	function audioProcessHandler(event) {
		// callback for ScriptProcessorNode (inline mode)
		// if a full buffer is available, fill output buffer for AudioContext
		// and deduct the amount written from the count of samples available.
		// otherwise fill the buffer with zeros
		var outputBuffer = event.outputBuffer.getChannelData(0),
			outputBufferSize = outputBuffer.length;
		if (samplesAvailable >= outputBufferSize) {
			for (var i = 0; i < outputBufferSize; i++) {
				bufferReadCursor %= RING_BUFFER_SIZE;
				outputBuffer[i] = sampleBuffer[bufferReadCursor++];
			}
			samplesAvailable -= outputBufferSize;
		}
		else {
			for (var i = 0; i < outputBufferSize; i++) outputBuffer[i] = 0;
		}
	}

	function writeSignal(signal) {
		// receives CB2 signals from IO
		if (connected) {
			signals[signalCursor++] = signal;
			if (signalCursor >= sampleRatio) {
				// received an AudioContext pulse worth of signals -> resample.
				// resampled at reduced gain, as signals are at full pulse width
				// signal (0|1) -> sample (0 <= s <= sampleCf)
				var s = leftoverSignal * leftoverFraction,
					ticks = sampleRatio | 0,
					divider = ticks + leftoverFraction,
					frac =	sampleRatio - ticks;
				for (var i = 0; i < ticks; i++) s += signals[i];
				if (frac) {
					// distribute any fractional remainder over samples
					var u = signals[ticks];
					leftoverSignal = u;
					leftoverFraction = 1 - frac;
					s += u * frac;
					divider += frac;
				}
				else {
					leftoverSignal = leftoverFraction = 0;
				}
				signalCursor = 0;
				// buffer the sample
				sampleBuffer[bufferWriteCursor++] = s? sampleCf * s / divider : 0;

				if (inlineMode) {
					// inline mode: wrap around ring buffer
					if (bufferWriteCursor === RING_BUFFER_SIZE) bufferWriteCursor = 0;
					samplesAvailable++;
				}
				else {
					// worklet mode: post the buffer, once it's full
					if (bufferWriteCursor === MESSAGE_SIZE) {
						bufferWriteCursor = 0;
						petAudioWorklet.port.postMessage({'job': 'samples', 'samples': sampleBuffer});
					}
				}
			}
		}
	}

	function resume() {
		if (audioAvailable && audioContext.state === 'suspended') audioContext.resume();
	}

	function suspend() {
		if (audioAvailable && audioContext.state === 'running') {
			audioContext.suspend();
			return true;
		}
		return false;
	}

	function setVolume(v) {
		// sets volume, also manages node connections and resumes from suspended state
		// must be called at least once from user intertive context to unlock audio
		var n = typeof v === 'number'? v : parseFloat(v);
		if (isNaN(n)) return;
		volume = Math.max(0, Math.min(1, n));
		if (audioAvailable) {
			var didReset = false, wasSuspended = audioContext.state === 'suspended';
			gainNode.gain.value = playbackCf * volume;
			if (volume === 0 && connected) {
				// disconnect to reduce load and energy consumption
				processor.disconnect();
				gainNode.disconnect();
				connected = false;
			}
			else if (!connected && volume) {
				reset();
				gainNode.connect(audioContext.destination);
				processor.connect(processorDestination);
				connected = didReset = true;
			}
			if (connected && wasSuspended && volume) {
				if (!didReset) reset();
				resume();
			}
		}
		else if (audioContext && gainNode) {
			// just unlock
			resume();
		}
	}

	// activate/deactivate a wave shaper function
	function setFX(flag) {
		useWaveShaper = !!flag;
		// if alread initialized, reconfigure
		if (audioAvailable) {
			if (useWaveShaper) {
				if (!waveShaper) createWaveShaper();
				processorDestination = waveShaper;
				sampleCf = SAMPLE_CF * FX_VOLUME_CF;
				playbackCf = PLAYBACK_CF * FX_VOLUME_CF;
			}
			else {
				processorDestination = gainNode;
				sampleCf = SAMPLE_CF;
				playbackCf = PLAYBACK_CF;
			}
			gainNode.gain.value = PLAYBACK_CF * volume;
		}
		// if currently running, switch processor destination
		if (connected) {
			processor.disconnect();
			processor.connect(processorDestination);
		}
	}

	function getFX() {
		return useWaveShaper;
	}

	function isAvailable() {
		return audioAvailable;
	}

	function getSate() {
		return audioAvailable? audioContext.state:'';
	}

	function getVolume() {
		return volume;
	}

	function unlock() {
		if (connected) resume();
	}

	init();

	return {
		'reset': reset,
		'resume': resume,
		'suspend': suspend,
		'setVolume': setVolume,
		'getVolume': getVolume,
		'writeSignal': writeSignal,
		'isAvailable': isAvailable,
		'unlock': unlock,
		'getSate': getSate,
		'setFX': setFX,
		'getFX': getFX
	};

};