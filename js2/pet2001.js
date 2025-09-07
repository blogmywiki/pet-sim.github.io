//
// based on an implementation by Thomas Skibo:
//  pet2001.js, pet2001hw.js
//
// Copyright (c) 2012,2014 Thomas Skibo.
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions
// are met:
// 1. Redistributions of source code must retain the above copyright
//	  notice, this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright
//	  notice, this list of conditions and the following disclaimer in the
//	  documentation and/or other materials provided with the distribution.
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
// Unified hardware representation and interface
// Reorganized and (partially) rewritten by Norbert Landsteiner 2017-2023.
//

function Pet2001(_controller, _videoContext, _keyboard, _config) {

	"use strict";
	
	// default values, probably overwritten by _config
	var VIDRAM_ADDR =   0x8000,
		VIDRAM_TOP =    0x8FFF,
		VIDRAM_SIZE =   0x0400,
		IO_ADDR =       0xE800,
		IO_SIZE =       0x0800,
		IO_TOP =        0xEFFF,
		ROM_BASE_ADDR = 0x9000,
		MAX_RAM_SIZE =  0x8000,
		MAX_ROM_SIZE =  0x7000;

	// components
	var video =         new Pet2001Video(_videoContext, _config),
		audio =         _config && _config.USE_AUDIO? new Pet2001Audio(_config) : null,
		cpu =           new Cpu6502(this),
		io =            new PetIO(this),
		ieee =          new PetIEEE(),
		keyboard =      _keyboard,
		ram =           new Uint8Array(MAX_RAM_SIZE),
		rom =           new Uint8Array(MAX_ROM_SIZE),
		romMap = [];

	// sizes and settings, probably owerwritten by _config
	var ramSize =      8192,    // 8K
		romAddr =      0x10000, // empty low rom, adjusted by writeRom()
		romTop =       0,
		videoMask =    (VIDRAM_SIZE - 1) | 0, // initial size, may be reset
		romVers =      2,
		halted =       false;

	// perform setup tasks
	(function() {
		// parse config
		if (typeof _config === 'object') {
			for (var p in _config) {
				switch (p) {
					case 'ROM_VERSION':
						romVers = _config[p]; break;
					case 'VIDRAM_SIZE':
						VIDRAM_SIZE = _config[p];
						videoMask = (VIDRAM_SIZE - 1) | 0;
						break;
					case 'RAM_SIZE':
						ramSize = _config[p]; break;
					case 'IO_ADDR':
						// PET 2001N (dynamic board) IO base address:
						// - jumper S: E800 (normal)
						// - jumper R: 8800 (never used)
						if ((_config[p] === 0xE800 || _config[p] === 0x8800) && _config[p] !== IO_ADDR) {
							IO_ADDR  = _config[p];
							IO_TOP = IO_ADDR + IO_SIZE -1;
						}
						break;
				}
			}
		}
		// adjust video RAM top according to IO addr.
		if (VIDRAM_TOP >= IO_ADDR) VIDRAM_TOP = IO_ADDR - 1;
		else VIDRAM_TOP = VIDRAM_ADDR + 0x0fff;
		// interconnect components
		var bus = {
			'io': io,
			'ieee': ieee,
			'video': video,
			'audio': audio,
			'keyboard': keyboard,
			'controller': _controller
		};
		io.connect(bus);
		ieee.connect(bus);
		keyboard.connect(bus);
	})();
	
	// public properties and methods

	this.irq_signal = 0;
	this.nmi_signal = 0;
	this.cpuJammed = false;

	this.reset = function() {
		halted = false;
		io.reset();
		cpu.reset();
		if (audio) audio.reset();
		keyboard.reset();
		this.cpuJammed = false;
		this.irq_signal = 0;
		this.nmi_signal = 0;
		for (var i = 0; i < MAX_RAM_SIZE; i++) ram[i] = 0x44;
	};

	this.cycle = function(clockTicks) {
		var instrComplete = true,
			extraCycles = 0;
		for (var i = 0; i < clockTicks || !instrComplete; i++) {
			io.cycle();
			instrComplete = cpu.cycle();
			if (i >= clockTicks) extraCycles++;
			if (instrComplete && (halted || this.cpuJammed)) return -1;
		}
		return extraCycles;
	};

	this.halt = function(flag) {
		halted = !!flag;
	};

	this.getRamSize = function() { return ramSize; };
	this.getRomAddr = function() { return romAddr; };
	this.getIOAddr = function() { return IO_ADDR; };
	this.getIOSize = function() { return IO_SIZE; };
	this.getIOTop = function() { return IO_TOP; };
	this.getVideoAddr = function() { return VIDRAM_ADDR; };
	this.getVideoTop = function() { return VIDRAM_TOP; };

	this.setRomVers = function(_vers, noreset, initial) {
		var vers = parseInt(_vers,10),
			isBusiness = _vers.indexOf('b') > -1;
		if (vers == 3) vers = 2;
		var versionString = '' + vers + (isBusiness? 'b': ''),
			romSet = PetRoms.sets[versionString];
		if (romSet) {
			var prevAddr = romAddr,
				wasBusiness = keyboard.isBusinessMode();
			romVers = vers;
			if (vers == 4 || isBusiness) {
				this.setCharsetVersion('NEW', true);
			}
			else if (initial && typeof _config === 'object' && typeof _config.CHARROM_VERSION !== 'undefined') {
				this.setCharsetVersion(_config.CHARROM_VERSION, true);
			}
			else {
				this.setCharsetVersion('OLD', true);
			}
			romAddr = 0x10000;
			romMap = [];
			for (var i=0; i<romSet.length; i++) {
				var rom = romSet[i],
					bin = PetRoms.bins[rom.bin];
				this.writeRom(bin, rom.addr);
			}
			if (romAddr !== prevAddr || wasBusiness !== isBusiness) noreset = false;
			keyboard.setBusinessMode(isBusiness, vers);
			if (!noreset && !initial) this.reset();
		}
	};

	this.getRomVers = function() { return romVers; };

	this.setCharsetVersion = function(version, hotSwap) {
		video.setCharsetVersion(version, hotSwap);
		keyboard.setCharsetVersion(version);
	}

	//install option ROM or overwrite current configuration
	this.installRom = function(addr, data) {
		var prevLowAddr = romAddr,
			endAddr = this.writeRom(data, addr);
		if (endAddr && endAddr < prevLowAddr) { // fill gap
			for (var i = endAddr + 1; i < prevLowAddr; i++) rom[i - ROM_BASE_ADDR] = i >> 8;
		}
		return endAddr;
	};

	// write rom data at given address (address and size are normalized to multiples of 0x800)
	// checks range and adjusts rom address pointers as neccessary
	// returns end address >= 0x9000 for success or 0 for failure (not a viable range)
	this.writeRom = function(data, addr) {
		var	startAddr = Math.floor(addr / 0x800) * 0x800,
			size = Math.floor((data.length + 0x7f) / 0x800) * 0x800, // account for common short-falling of images
			endAddr = startAddr + size - 1;
		if (endAddr > 0xffff) {
			size -= endAddr - 0xffff;
			endAddr = 0xffff;
		}
		if (startAddr < endAddr && startAddr >= ROM_BASE_ADDR) { 
			if (startAddr < romAddr) romAddr = startAddr;
			if (endAddr > romTop) romTop = endAddr;
			for (var i = 0; i < size; i++) rom[startAddr - ROM_BASE_ADDR + i] =
				typeof data[i] !== 'undefined'? data[i] : 0xAA;
			for (var i = startAddr; i < endAddr; i += 0x800) romMap[i]=true;
			return endAddr;
		}
		return 0;
	};

	this.isRom = function(addr) {
		return !!romMap[addr & 0xF800];
	};

	this.setRamSize = function(size, noreset) {
		ramSize = size;
		if (!noreset) this.reset();
	};

	this.readRam = function(addr, data, len) {
		for (var i = 0; i < len; i++)
			data[i] = ram[addr + i];
	};

	this.writeRam = function(addr, data, len) {
		for (var i = 0; i < len; i++)
			ram[addr + i] = data[i];
	};

	this.read = function(addr) {
		if (addr < ramSize)
			return ram[addr];
		if (addr >= IO_ADDR && addr <= IO_TOP)
			return io.read(addr);
		if (addr >= romAddr && addr <= romTop)
			return rom[addr - ROM_BASE_ADDR];
		if (addr >= VIDRAM_ADDR && addr <= VIDRAM_TOP)
			return video.vidram[(addr - VIDRAM_ADDR) & videoMask];
		// return hi-byte off addr. for unconnected locations
		return (addr >> 8) & 0xff;
	};

	this.write = function(addr, d8) {
		if (addr < ramSize)
			ram[addr] = d8;
		else if (addr >= VIDRAM_ADDR && addr < VIDRAM_TOP)
			video.write((addr - VIDRAM_ADDR) & videoMask, d8);
		else if (addr >= IO_ADDR && addr <= IO_TOP)
			io.write(addr, d8);
	};

	this.readRange = function(addr, data, len) {
		for (var i = 0; i < len; i++)
			data[i] = this.read(addr + i) | 0;
	};

	/* like read, but does not affect I/O state */
	this.dump = function(addr) {
		if (addr < ramSize)
			return ram[addr];
		if (addr >= IO_ADDR && addr <= IO_TOP)
			return io.dump(addr);
		if (addr >= romAddr && addr <= romTop)
			return rom[addr - ROM_BASE_ADDR];
		if (addr >= VIDRAM_ADDR && addr <= VIDRAM_TOP)
			return video.vidram[(addr - VIDRAM_ADDR) & videoMask];
		return (addr >> 8) & 0xff;
	};

	this.dumpRange = function(addr, data, len) {
		for (var i = 0; i < len; i++)
			data[i] = this.dump(addr + i) | 0;
	};

	this.getJamData = cpu.getJamData;
	this.getCPULog = cpu.getLog;
	this.getCPUStatus = cpu.getStatus;
	this.getVideoStatus = video.getStatus;
	this.attachDebugger = cpu.attachDebugger;
	this.setRegister = cpu.setRegister;
	this.getRegister = cpu.getRegister;
	this.setFlag = cpu.setFlag;
	this.getFlag = cpu.getFlag;

	this.setKeyrows = io.setKeyrows;
	this.setSNESAdapter = io.setSNESAdapter;
	this.resetSNESAdapter = io.resetSNESAdapter;
	this.setDRAin = io.setDRAin;

	this.ieeeLoadData = ieee.ieeeLoadData;
	this.ieeeResetLoadData = ieee.resetLoadData;

	// direct access for controller
	this.video=video;
	this.audio=audio;

	// initialize the hardware
	this.setRomVers(romVers, true, true);
	this.reset();
}
