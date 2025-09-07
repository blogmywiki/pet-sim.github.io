//
// Copyright (c) 2014 Thomas Skibo.
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions
// are met:
// 1. Redistributions of source code must retain the above copyright
//	notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright
//	notice, this list of conditions and the following disclaimer in the
//	documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY AUTHOR AND CONTRIBUTORS ``AS IS'' AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED.	IN NO EVENT SHALL AUTHOR OR CONTRIBUTORS BE LIABLE
// FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
// DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
// OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
// HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
// LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
// OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
// SUCH DAMAGE.
//
// pet2001video.js
//
// Modified by Norbert Landsteiner (NL), 2107-2023
//

function Pet2001Video(_videoContext, _config) {

	"use strict";

	var videoRamSize = typeof _config === 'object' && _config.VIDRAM_SIZE?
		_config.VIDRAM_SIZE:0x8000;

	var ctx = _videoContext,
		vidram = new Uint8Array(videoRamSize),
		byteMap = new Uint8Array(8000);
	this.vidram = vidram;

	var VIDEO_ON  = 3840,
		VIDEO_OFF = VIDEO_ON + 64 * 200,
		VCYCLE0   = VIDEO_ON + 23;

	var MARGIN = 5,
		WIDTH = 320*2,
		HEIGHT = 200*2,
		colorSets = {
			'white': {
				r: 0xf1,
				g: 0xf5,
				b: 0xf9,
				blur: 2,
				blurHot: 2,
				blurR: 0xa5,
				blurG: 0xdc,
				blurB: 0xf1,
				blurA: 0.908,
				blurAHot: 0.908,
				bgA: 0,
				bgR: 0,
				bgB: 0,
				imgCoordX: 3,
				imgCoordY: 3,
				imgCoordBlurX: 3,
				imgCoordBlurY: 11,
				label: 'white'
			},
			'green': {
				r: 0x80,
				g: 0xff,
				b: 0xca,
				blur: 2,
				blurHot: 2,
				blurR: 0x30,
				blurG: 0xce,
				blurB: 0x84,
				blurA: 0.911025,
				blurAHot: 0.911012,
				bgA: 0,
				bgR: 0,
				bgB: 0,
				imgCoordX: 11,
				imgCoordY: 3,
				imgCoordBlurX: 11,
				imgCoordBlurY: 11,
				label: 'green'
			},
			'ink': {
				r: 0x04,
				g: 0x04,
				b: 0x04,
				blur: 2,
				blurHot: 2,
				blurR: 0xa5,
				blurG: 0xcc,
				blurB: 0xd1,
				blurA: 0.908,
				blurAHot: 0.86,
				bgR: 0xf1,
				bgG: 0xf5,
				bgB: 0xf9,
				imgCoordX: -1,
				imgCoordY: -1,
				imgCoordBlurX: -1,
				imgCoordBlurY: -1,
				label: 'ink'
			},
		},
		CLEAR_SHORT_PERSISTENCE = 0.355,
		CLEAR_LONG_PERSISTENCE =  0.158,
		FLICKER = false,
		screenColor = colorSets['green'],
		hotMode = false;


	if (typeof _config === 'object') {
		if (_config.SCREEN_COLOR && colorSets[_config.SCREEN_COLOR])
			screenColor = colorSets[_config.SCREEN_COLOR];
		if (_config.PERSISTENCE)
			hotMode = _config.PERSISTENCE == 'long';
	}

	// jpg img inluding an embeded color profile for managed screen colors
	var colorsetSrc = 'data:image/jpeg;base64,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';

	var romSets = {
			'OLD': 1,
			'NEW': 2,
			'JA': 3,
			'ALT': 4
		};


	var displayWidth = WIDTH+2*MARGIN,
		displayHeight = HEIGHT+2*MARGIN,
		maxPixel = displayWidth*displayHeight*4,
		rowOffset = 4*WIDTH,
		lineOffset = rowOffset*2,
		pOffset1 = 4,
		pOffset2 = rowOffset,
		pOffset3 = rowOffset+4,
		buffer, bufferCtx, bufferData, pixels,
		charset = PetRoms.petCharRom1,
		charsetTag = 'rom1',
		romSet = romSets.OLD,
		blank = false,
		blank_delay = 0,
		R, G, B,
		bgR, bgG, bgB,
		clearAlpha,
		videoCycle = 0;

	// video and color setup (NL 2017)
	(function init() {
		var canvas=ctx.canvas;
		canvas.style.backgroundColor='#000';
		canvas.style.width=displayWidth+'px';
		canvas.style.height=displayHeight+'px';
		//canvas.mozOpaque=true;
		canvas.width=displayWidth;
		canvas.height=displayHeight;
		buffer=document.createElement('canvas');
		buffer.width=WIDTH;
		buffer.height=HEIGHT;
		bufferCtx=buffer.getContext('2d');
		bufferData=bufferCtx.getImageData(0,0, WIDTH, HEIGHT);
		pixels=bufferData.data;
		clearAlpha = hotMode? CLEAR_LONG_PERSISTENCE : CLEAR_SHORT_PERSISTENCE;
		getManagedColors();
		updateColors();
	})();

	function getManagedColors() {
		var img, update;

		function imgHandler() {
			// extract managed colors from image
			// and mix them by weight (cw) with generic monitor colors
			var cw = 8,
				cf = cw + 1,
				canvas = document.createElement('canvas'),
				w = canvas.width = img.width,
				h = canvas.height = img.height;
			if (!w || !h) return;
			var ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0);
			var d = ctx.getImageData(0, 0, w, h).data,
				confIntrvl = 0.25;
			for (var clr in colorSets) {
				var c = colorSets[clr],
					p1 = c.imgCoordY*w*4 + c.imgCoordX*4,
					p2 = c.imgCoordBlurY*w*4 + c.imgCoordBlurX*4,
					matchedClr = false, matchedBlur = false;
				if (p1 >= 0) {
					var r = d[p1] | 0,
						g = d[p1+1] | 0,
						b = d[p1+2] | 0;
					if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
						var dr = Math.abs(c.r-r)/c.r,
							dg = Math.abs(c.g-g)/c.g,
							db = Math.abs(c.b-b)/c.g;
						if (dr < confIntrvl && dg < confIntrvl && db < confIntrvl) {
							c.r = (c.r + r*cw) / cf;
							c.g = (c.g + g*cw) / cf;
							c.b = (c.b + b*cw) / cf;
							matchedClr = true;
						}
					}
				}
				if (p2 >= 0) {
					var r = d[p2] | 0,
						g = d[p2+1] | 0,
						b = d[p2+2] | 0;
					if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
						var dr = Math.abs(c.blurR-r)/c.blurR,
							dg = Math.abs(c.blurG-g)/c.blurG,
							db = Math.abs(c.blurB-b)/c.blurB;
						if (dr < confIntrvl && dg < confIntrvl && db < confIntrvl) {
							c.blurR = (c.blurR + r*cw) / cf;
							c.blurG = (c.blurG + g*cw) / cf;
							c.blurB = (c.blurB + b*cw) / cf;
							matchedBlur = true;
						}
					}
				}
				if ((p1 >= 0 && !matchedClr) || (p2 >= 0 && !matchedBlur)) console.info('PET 2001: failed to calibrate color values for "'+clr+'". (browser restrictions?)');
			}
			if (update) updateColors();
		}

		if (typeof colorsetSrc === 'string') {
			img = new Image();
			img.src = colorsetSrc;
			update = !img.complete;
			if (img.complete) imgHandler();
			else img.onload = imgHandler;
		}
	}

	this.setColor = function(clr) {
		if (typeof clr === 'string') {
			var c = colorSets[clr.toLowerCase()];
			if (c) {
				screenColor = c;
				updateColors();
			}
		}
	};

	this.getColor = function() { return screenColor.label; }

	function updateColors() {
		R = screenColor.r;
		G = screenColor.g;
		B = screenColor.b;
		bgR = screenColor.bgR || 0;
		bgG = screenColor.bgG || 0;
		bgB = screenColor.bgB || 0;
		ctx.fillStyle='rgba('+bgR+','+bgG+','+bgB+',1)';
		ctx.fillRect(0,0, displayWidth, displayHeight);
		setBlur();
		ctx.shadowOffsetX=0;
		ctx.shadowOffsetY=0;
		blankScreen();
		resetScreen();
	}

	function setBlur() {
		clearAlpha = hotMode? CLEAR_LONG_PERSISTENCE : CLEAR_SHORT_PERSISTENCE;
		if (ctx) {
			ctx.fillStyle='rgba('+bgR+','+bgG+','+bgB+','+clearAlpha+')';
			ctx.shadowColor = 'rgba('
				+screenColor.blurR+','
				+screenColor.blurG+','
				+screenColor.blurB+','
				+(hotMode? screenColor.blurAHot:screenColor.blurA)+')';
		}
	}

	function resetScreen() {
		ctx.fillRect(0, 0, displayWidth, displayHeight);
		for (var i=0; i<maxPixel; i+=4) {
			pixels[i] = R;
			pixels[i+1] = G;
			pixels[i+2] = B;
			pixels[i+3] = 0;
		}
		for (var i=0, l=byteMap.length; i<l; i++) byteMap[i] = 0;
	}

	this.cycle = function(video_cycle) {
		videoCycle = video_cycle;
		if (blank_delay > 0 && --blank_delay == 0) blank = true;

		if (video_cycle == 0) updateVideo(); // refresh rendered image
		if (video_cycle < VCYCLE0 || video_cycle >= VIDEO_OFF) return;	// blanked

		var raster = video_cycle - VIDEO_ON,
			col = (raster & 0x3f) - 24;
		if (col < 0) return;

		var cdata,
			line = raster >> 6,
			addr = line * 40 + col,
			vbyte = vidram[col + (line >> 3) * 40];

		if (blank) cdata = 0;
		else {
			cdata = charset[((vbyte & 0x7f) << 3) | (line & 0x07)];
			if (vbyte & 0x80) cdata ^= 0xff;
		}

		if (cdata != byteMap[addr]) {
			byteMap[addr] = cdata;
			// draw it, p: top-left pixel, alpha value
			var p = line * lineOffset + col * 64 + 3;
			for (var x = 0; x < 8; x++) {
				if (((cdata << x) & 0x80) != 0) {
					pixels[p]		   = 212; // x,		y
					pixels[p+pOffset1] = 234; // x + 1, y
					pixels[p+pOffset2] =  55; // x,		y + 1
					pixels[p+pOffset3] =  75; // x + 1, y + 1
				}
				else {
					pixels[p]		   = 0;
					pixels[p+pOffset1] = 0;
					pixels[p+pOffset2] = 0;
					pixels[p+pOffset3] = 0;
				}
				p += 8; // advance by 2 pixels to the right
			}
		}
	};

	function updateVideo() {
		bufferCtx.putImageData(bufferData, 0, 0);
		ctx.shadowBlur=0;
		ctx.fillRect(0,0, displayWidth, displayHeight);
		ctx.shadowBlur= hotMode? screenColor.blurHot : screenColor.blur;
		if (FLICKER || hotMode) ctx.globalAlpha=0.989+0.011*Math.random();
		ctx.drawImage(buffer, 0, 0, WIDTH, HEIGHT, MARGIN, MARGIN, WIDTH, HEIGHT);
		ctx.globalAlpha=1;
	}
	this.update = updateVideo;

	// Blank screen
	function blankScreen() {
		ctx.fillRect(0, 0, displayWidth, displayHeight);
		for (var i=0; i<maxPixel; i+=4) {
			pixels[i] = R;
			pixels[i+1] = G;
			pixels[i+2] = B;
			pixels[i+3] = 0;
		}
	}

	// Write to video ram.
	this.write = function(addr, d8) {
		vidram[addr] = d8;
	};

	// Read from video ram.
	this.read = function(addr) {
		return vidram[addr];
	};

	// Called in response to change in blanking signal.
	// Blanking of the screen is delayed by 20ms to avoid flickering
	// during scrolling.  (It takes 18,000 cycles to scroll the screen.)
	this.setVideoBlank = function(flag) {
		if (!blank && flag)
			blank_delay = 20000;
		else {
			if (!flag) blank_delay = 0;
			blank = !!flag;
		}
	};

	// Called in response to character set signal change.
	this.setCharset = function(mixedCaseFlag) {
		if (romSet == romSets.NEW && mixedCaseFlag) {
			var baseset = PetRoms.charRom2, i=0, j, m;
			charset = new Uint8Array(baseset.length);
			for (j =      0, m =      8; j <m; j++) charset[i++] = baseset[j];
			for (j = 0x41*8, m = 0x5b*8; j <m; j++) charset[i++] = baseset[j];
			for (j = 0x1b*8, m = 0x41*8; j <m; j++) charset[i++] = baseset[j];
			for (j =      8, m = 0x1b*8; j <m; j++) charset[i++] = baseset[j];
			for (j = 0x5b*8, m = 0x80*8; j <m; j++) charset[i++] = baseset[j];
		}
		else if (romSet == romSets.JA) {
			charset = mixedCaseFlag ? PetRoms.charRomJa2 : PetRoms.charRomJa1;
		}
		else if (romSet == romSets.ALT) {
			charset = mixedCaseFlag ? PetRoms.charRomAlt2 : PetRoms.charRomAlt1;
		}
		else {
			charset = mixedCaseFlag ? PetRoms.charRom2 : PetRoms.charRom1;
		}
		charsetTag = mixedCaseFlag ? 'rom2' : 'rom1';
	};

	// Switch character ROM version
	this.setCharsetVersion = function(version, hotSwap) {
		var versionTag = (''+version).toUpperCase(),
			mixedCase = charsetTag == 'rom2',
			currRomSet = romSet;
		if (romSets[versionTag]) {
			romSet = romSets[versionTag];
			if (hotSwap && (currRomSet != romSet || mixedCase)) this.setCharset(mixedCase);
		}
	};

	this.isNewCharRom = function() {
		return romSet == romSets.NEW;
	};

	this.isJapaneseCharRom = function() {
		return romSet == romSets.JA;
	};

	this.isAltCharRom = function() {
		return romSet == romSets.ALT;
	};

	this.getCharsetTag = function() {
		return charsetTag;
	};

	this.useLongPersitence = function(flag) {
		hotMode = !!flag;
		setBlur();
	};

	this.isLongPersitence = function() {
		return hotMode;
	};

	this.exportImage = function(includeMargins) {
		var canvas = ctx.canvas;
		if (!canvas || !canvas.toDataURL) return null;
		if (includeMargins) {
			return canvas.toDataURL('image/png');
		}
		else {
			var tBuffer = document.createElement('canvas');
			tBuffer.width = WIDTH;
			tBuffer.height = HEIGHT;
			tBuffer.getContext('2d').drawImage(canvas, MARGIN, MARGIN, WIDTH, HEIGHT, 0, 0, WIDTH, HEIGHT);
			return tBuffer.toDataURL('image/png');
		}
	};

	this.exportHardCopy = function(rasterSize, dotSize) {
		/*
		  emulated printer raster-size (int): 1 <= rasterSize <= 3 (not too big for UI)
		  emulated printer dot-size (float): 1 <= dotSize <= rasterSize
		  raster-size defaults to 2,
		  dot-size defaults to 1.25 (at 2px raster-size)
		*/
		var rs = (!rasterSize || isNaN(rasterSize))? 2 :
				Math.max(1, Math.min(3, Math.round(rasterSize))),
			ds = (!dotSize || isNaN(dotSize))? Math.max(1, 1.25 * rs/2):
				Math.max(1, Math.min(rs, dotSize)),
			blockWidth = 8 * rs,
			w = 320 * rs,
			h = 200 * rs,
			tBuffer = document.createElement('canvas'),
			tCtx = tBuffer.getContext('2d');
		tBuffer.width = w;
		tBuffer.height = h;
		tCtx.fillStyle = '#fff';
		tCtx.fillRect(0, 0, w, h);
		//tCtx.fillStyle = '#000';
		//tCtx.shadowColor = 'rgba(0,0,0, 0.1)';
		tCtx.fillStyle = 'rgb(11,8,12)';
		tCtx.shadowColor = 'rgba(11,8,12, 0.1)';
		tCtx.shadowBlur = 1;
		var rowJitter = [], ribbonInk = [], needleImpact = [], needleAlignment = [];
		for (var i = 0; i < 8; i++) {
			rowJitter[i] = 0.65 * Math.random();
			needleImpact[i] = 'rgba(0,0,0,' + (0.1 + Math.random() * 0.2) + ')';
			needleAlignment[i] = 0.4 * (Math.random() - 0.5);
		}
		var lineFlags = [];
		for (var i = 0; i < 128; i++) ribbonInk[i] = 0.4 * Math.random() - 0.1;
		for (var row = 0; row < 25; row++) {
			var rowDx = 0.3 * (Math.random() - 0.5), rowEmpty = true;
			for (var col = 0; col < 40; col++) {
				var d8 = vidram[row * 40 + col],
					romAddr = (d8 & 0x7f) * 8,
					px = col * blockWidth,
					py = row * blockWidth,
					jx = (row * 24 + col * 8) % 120;
				if (d8 != 0x20) rowEmpty = false;
				for (var y = 0; y < 8; y++) {
					var bits = charset[romAddr++], rowjitter = rowJitter[y], smudge = Math.random() * 0.075;
					if ((d8 & 0x80) != 0) bits ^= 0xff;
					for (var x = 0; x < 8; x++) {
						if (((bits << x) & 0x80) != 0) {
							tCtx.globalAlpha = 0.65 + 0.35 * Math.random() * (rowjitter + ribbonInk[jx + x]);
							tCtx.shadowColor = needleImpact[(y + Math.floor(Math.random() * 2)) % 8];
							tCtx.fillRect(px + x * rs + rowDx, py + y * rs + needleAlignment[y], ds, ds + smudge);
						}
					}
				}
			}
			lineFlags.push(!rowEmpty);
		}
		// compensate for tint
		var pBuffer = document.createElement('canvas'),
			pCtx = pBuffer.getContext('2d');
		pBuffer.width = w;
		pBuffer.height = h;
		pCtx.drawImage(tBuffer,0,0);
		pCtx.globalCompositeOperation = 'multiply';
		pCtx.globalAlpha = 0.025;
		pCtx.drawImage(tBuffer,0,0);
		return { 'img': pBuffer.toDataURL('image/png'), 'lineFlags': lineFlags };
	};

	this.getSnapshot = function() {
		return Array.from(vidram);
	};

	this.getStatus = function(flagNextCycle) {
		var vc = flagNextCycle? (videoCycle + 1) % 16640 : videoCycle,
			vb = vc < VIDEO_ON || vc >= VIDEO_OFF,
			vr = vc - VIDEO_ON,
			l = vr >> 6,
			c = (vr & 0x3f) - 24,
			r = vb? 0:l >> 3,
			s = 'line '+l;
		if (vb) s += ' (V-BLANK)';
		else s += ' (row '+r+' '+(1+(l&7))+'/8, '+(c < 0? 'H-BLANK '+c+'/24':'col '+c) + ')';
		return s;
	};

}
