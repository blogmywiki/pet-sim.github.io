//
// was: pet2001main.js
// Copyright (c) 2014 Thomas Skibo.
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
////
//
// is: pet2001ctrl.js
// Rewritten and extended (c) 2017-2024 Norbert Landsteiner
// (additional rights, above disclaimer applies)
//

var petCtrl = (function() {

	"use strict";

	// start configuration

	var config = {
		VIDRAM_SIZE:      0x0400,
		RAM_SIZE:         0x2000, //8K: 0x2000, 16k: 0x4000, 32k: 0x8000 
		ROM_VERSION:         '2',
		SCREEN_COLOR:    'white',
		KEYBOARD_REPEAT:    true,
		USE_AUDIO:          true
	};

	// basic emulation

	var controllerObj =     {},  //"this"
		pet2001 =           null,
		petRefreshHandle =  null,
		petKeys =           new PetKeys('petKeyboard'),
		lastUpdate =        0,
		oldRomLoadRunFlag = false,
		cpuJammed =         false,
		$debugger =         null,
		getTicks =          // a function to return ticks in ms
			window.performance? function() { return performance.now(); } :
			Date.now? Date.now : function() { return new Date().getTime(); };

	function getSysConfig() {
		return {
			'IO_ADDR':    pet2001.getIOAddr(),
			'IO_TOP':     pet2001.getIOTop(),
			'VIDEO_ADDR': pet2001.getVideoAddr(),
			'VIDEO_TOP':  pet2001.getVideoTop()
		};
	}

	function petRefreshFunc() {
		if (cpuJammed) return;
		var now = getTicks(),
			dt = lastUpdate? now - lastUpdate:17,
			cycles = Math.round(dt * 1000);
		if (cycles >= 4160) {
			readJoystick();
			var extraCycles = pet2001.cycle(cycles);
			if (pet2001.cpuJammed) {
				cpuJammed = true;
				showJamInfo();
				return;
			}
			if (extraCycles < 0) return;
			lastUpdate = now + extraCycles/1000;
		}
		petRefreshHandle = requestAnimationFrame(petRefreshFunc);
	}

	function run() {
		if (typeof Pet2001Audio !== 'function') config.USE_AUDIO = false;
		var petVideoContext = document.getElementById(UIids.screenCanvas).getContext("2d");
		setPixelAspectRatio(proportionalPixels);
		pet2001 = new Pet2001(controllerObj, petVideoContext, petKeys, config);
		PetUtils.setSysConfig(getSysConfig());
		adjustKeyboardControls();
		enableJoysticks();
		lastUpdate = getTicks();
		petRefreshHandle = requestAnimationFrame(petRefreshFunc);
		if (config.USE_AUDIO) {
			document.getElementById(UIids.touchClickTarget).addEventListener('click', unlockAudio, false);
		}
		window.addEventListener('unload', function() {
			if (petRefreshHandle) cancelAnimationFrame(petRefreshHandle);
		}, false);
	}

//// extended controls start here (N.L.) ////

	// UI and control

	var UIids = {
			'screenCanvas': 'petScreenCanvas',
			'dragAndDropTarget': 'petScreen',
			'kbdFocusTarget': 'petScreen',
			'touchClickTarget': 'petScreen',
			'screenCtxMenuTarget': 'petScreen',
			'CS2001LabelsParent': 'petScreen',
			'keyboardElement': 'petKeyboard',
			'CS2001Labels': 'cs2001labels',
			'btnPause': 'btnPause',
			'selectRom': 'menuRom',
			'selectRam': 'menuRam',
			'selectScreenColor': 'menuScreenColor',
			'selectKeyRepeat': 'menuKeyRepeat',
			'fileLabel': 'mountedFile',
			'fileUpload': 'fileInput',
			'fileTempUpload': 'fileTempInput',
			'fileIcon': 'fileIcon',
			'downloadLink': 'downloadLinkPane',
			'downloadLinkParent': 'downloadLinkParent',
			'downloadLinkMessage': 'downloadLinkMessage',
			'directLink': 'directLinkPane',
			'directLinkParent': 'directLinkParent',
			'directLinkMessage': 'directLinkMessage',
			'dialogRenumber': 'renumberDialog',
			'dialogRenumberLineNumber': 'renumberDialogLineNumber',
			'dialogRenumberStep': 'renumberDialogStep',
			'dialogRenumberMessage': 'renumberDialogMessage',
			'dialogTextExport': 'textExport',
			'dialogTextExportContent': 'textExportContent',
			'dialogTextExportTextarea': 'textExportClipboard',
			'dialogTextExportTitle': 'textExportTitle',
			'dialogTextExportMemCtrl': 'memExportCtrl',
			'dialogTextExportEscapeCtrl': 'textExportEscapeCtrl',
			'dialogTextExportCbxEscapeHex': 'textExportCbxEscapeHex',
			'dialogTextExportCbxEscapeLabels': 'textExportCbxEscapeLabels',
			'dialogTextExportMemSelectMode': 'memExportType',
			'dialogTextExportMemStart': 'memExportStart',
			'dialogTextExportMemEnd': 'memExportEnd',
			'dialogTextExportCaseCtrl': 'textExportCaseCtrl',
			'dialogTextExportCbxLowerCase': 'textExportCbxLowerCase',
			'dialogSrcExport': 'srcExport',
			'dialogSrcExportContent': 'srcExportContent',
			'dialogSrcExportTextarea': 'srcExportClipboard',
			'dialogSrcExportLineNumber': 'srcExportLineNumber',
			'dialogSrcExportStep': 'srcExportLineStep',
			'dialogSrcExportCbxUpperCase': 'srcExportCbxUpperCase',
			'dialogSrcExportCbxTrim': 'srcExportCbxTrim',
			'dialogSrcExportSelectEscapeFormat': 'srcExportEscapeFormat',
			'dialogUrlExport': 'urlExport',
			'dialogUrlExportContent': 'urlExportContent',
			'dialogUrlExportTitle': 'urlExportTitle',
			'dialogUrlExportCtrl': 'urlExportCtrl',
			'dialogUrlExportSelectEncoding': 'urlExportEncodingSelect',
			'dialogUrlExportSelectFormat': 'urlExportFormatSelect',
			'dialogUrlExportCbxList': 'urlExportCbxList',
			'dialogUrlExportCbxAutoRun': 'urlExportCbxAutorun',
			'dialogUrlExportLinkPane': 'urlExportLinkPane',
			'dialogImgExport': 'imgExport',
			'dialogImgExportContent': 'imgExportContent',
			'dialogImgExportImgWrapper': 'imgExportImgWrapper',
			'dialogImgExportDownloadBtn': 'imageDownloadBtn',
			'dialogTextImport': 'textImport',
			'dialogTextImportContent': 'textImportContent',
			'dialogTextImportTextarea': 'textImportClipboard',
			'dialogTextImportTitle': 'textImportTitle',
			'dialogDirectory': 'directoryDialog',
			'dialogDirectoryTitle': 'directoryTitle',
			'dialogDirectoryList': 'directoryList',
			'dialogDirectorySelectRam': 'directoryRamSelect',
			'dialogDirectoryCbxAsBasic': 'directoryCbxAsBasic',
			'dialogDirectoryCbxAutoRun': 'directoryCbxAutorun',
			'btnDiskDirectory': 'btnDiskDirectory',
			'btnTapeDirector': 'btnTapeDirectory',
			'dialogConfirm': 'confirmDialog',
			'dialogConfirmText': 'confirmDialogText',
			'dialogConfirmBtnOK': 'confirmDialogBtnOK',
			'dialogConfirmBtnCancel': 'confirmDialogBtnCancel',
			'dialogPrompt': 'promptDialog',
			'dialogPromptText': 'promptDialogText',
			'dialogPromptInput': 'promptDialogInput',
			'dialogPromptBtnOK': 'promptialogBtnOK',
			'dialogPromptBtnCancel': 'promptDialogBtnCancel',
			'dialogInfo': 'infoDialog',
			'dialogInfoTitle': 'infoDialogTitle',
			'dialogInfoText': 'infoDialogText',
			'dialogInfoBtnClose': 'infoDialogBtnClose',
			'dialogInfoBtnOption': 'infoDialogBtnOption',
			'dialogMountFile': 'mountDialog',
			'dialogMountTempFile': 'mountTempDialog',
			'dialogMountTempFileDropZone': 'mountTempDialogDropZone',
			'dialogAsmListing': 'asmListing',
			'dialogAsmMessage': 'asmListingMessage',
			'dialogAsmClipboard': 'asmClipboard',
			'dialogAsmCbxAdjustPointers': 'asmCbxAdjustPointers',
			'dialogAsmCbxReset': 'asmCbxReset',
			'dialogJoystick': 'joystickDialog',
			'formJoystick': 'joystickForm',
			'iconJoystick': 'joystickSettings',
			'kbdJoystickIndicator': 'kbdJoyStickIndicator',
			'virtualKeypadBtn': 'virtualKeypadBtn',
			'keypadIndicator': 'keypadIndicator',
			'checkboxClickCursor': 'cbxClickCursor',
			'labelClickCursor': 'labelClickCursor',
			'soundVolumeRange': 'soundVolume',
			'soundCbxOnOff': 'soundCbxOnOff',
			'soundCbxFX': 'soundCbxFX',
			'soundCtrl': 'soundCtrl',
			'dialogHardcopy': 'hardcopyDialog',
			'dialogHardcopyContent': 'hardcopyContent',
			'dialogHardcopyBody': 'paperBody',
			'dialogHardcopyPaper': 'printPaper',
			'dialogHardcopyPrintHead': 'printHead',
			'dialogHardcopyPrintMask': 'printMask',
			'dialogHardcopyDownloadBtn': 'hardcopyDownloadBtn',
			'dialogMemoryMap': 'memoryMap',
			'dialogMemoryMapContent': 'memoryMapContent',
			'dialogMemoryMapImgWrapper': 'memoryMapImgWrapper',
			'dialogMemoryMapDownloadBtn': 'memoryMapDownloadBtn',
			'dialogDebugBreakpoint': 'debugBreakpointDialog',
			'dialogDebugBreakpointInputBP': 'debugBreakpointDialogInput',
			'dialogDebugBreakpointInputBracketFrom': 'debugBreakpointDialogBracketFrom',
			'dialogDebugBreakpointInputBracketTo': 'debugBreakpointDialogBracketTo',
			'dialogDebugBreakpointInputBracketRadioEnter': 'debugBreakpointTypeEnter',
			'dialogDebugBreakpointTabBP': 'debugBreakpointTabBreakpoint',
			'dialogDebugBreakpointTabBracket': 'debugBreakpointTabBreakpoint',
			'memoryMapOverlay': 'memoryMapOverlay',
			'prgLibraryBtn': 'btnPrgLibrary',
			'prgLibrary': 'prgLibrary',
			'prgLibraryIframe': 'prgLibraryContent',
			'demoPane': 'demoPane',
			'help': 'petHelp',
			'helpContent': 'petHelpContent'
		},
		UIclasses = {
			'dragdrop': 'dragdrop',
			'directoryListFileName': 'directoryListName',
			'directoryListFileSize': 'directoryListSize',
			'directoryListFileType': 'directoryListType',
			'directoryListItem': 'directoryListItem',
			'directoryListItemOdd': 'directoryListItemOdd',
			'directoryListItemEven': 'directoryListItemEven',
			'screenCtxMenu': 'petCtxMenu',
			'screenCtxMenuSeparator': 'petCtxMenuSeparator',
			'screenCtxMenuGroupSeparator': 'petCtxMenuSeparator group',
			'screenCtxMenuHasCheckmark': 'hasCheckmark',
			'screenCtxMenuChecked': 'checked',
			'screenCtxMenuHasRadio': 'hasRadio',
			'ctxMenuShield': 'petCtxMenuShield',
			'asmDialogBaseClass': 'dialog'
		},
		UIstrings = {
			'resume': 'Resume',
			'pause': ' Pause ',
			'renumberMsgMinLineNumber': 'Please enter a positive line number.',
			'renumberMsgMinStep': 'Please enter a positive number of steps.',
			'renumberMsgMaxLineNumber': 'Highest valid line number is 63999.',
			'renumberMsgMaxStep': 'Highest valid step is 1000.',
			'exportMsgNoPrg': 'No program found.',
			'listingNoPrgFound': '-- no program found --',
			'listingNoVarsFound': '-- no variables found --',
			'exportTitleProgramHexDump': 'Program Hex-Dump',
			'exportTitleProgramDisas': 'Program Disassembly',
			'exportTitleBasicEscapedListing': 'Escaped BASIC Listing',
			'exportTitleBasicPortableListing': 'Portable BASIC Listing (PETSCII special characters as CHR$())',
			'exportTitleScreenDump': 'Screen Contents',
			'exportTitleBasicVariables': 'BASIC Variables (as in memory)',
			'urlExportTitleScreen': 'Export Screen-URL',
			'urlExportTitleBasic': 'Export BASIC Program as URL',
			'urlExportMsgRightClickToCopy': '(right-click link to copy)',
			'directoryListTitleT64': 'Tape Contents',
			'directoryListTitleDisk': 'Disk',
			'dialogReset': 'Reset and load &amp; run the mounted file?',
			'oldRomLoaded': 'Loaded.',
			'fileExceedsMemSize': 'File size exceeds available memory. Please adjust the RAM size before loading this file. Available RAM {{ram}}, required {{required}}.',
			'pasteConfirm': 'Transfer clipboard text to PET?',
			'pasteTitle': 'Paste',
			'fileNone': 'File: none.'
		},
		forcedBasicLoadDriveString = '8',
		configDefaults,
		NTSCPixelAspect = 0.912,
		proportionalPixels = false,
		helpLoaded = false,
		virtualKeypadActive = false;
	
	var romSocketAddr = {
			'H1': 0xC000,
			'H2': 0xD000,
			'H3': 0xE000,
			'H4': 0xF000,
			'H5': 0xC800,
			'H6': 0xD800,
			'H7': 0xF800,
			'D3': 0x9000,
			'D4': 0xA000,
			'D5': 0xB000,
			'D6': 0xC000,
			'D7': 0xD000,
			'D8': 0xE000,
			'D9': 0xF000,
			'UD3': 0x9000,
			'UD4': 0xA000,
			'UD5': 0xB000,
			'UD6': 0xC000,
			'UD7': 0xD000,
			'UD8': 0xE000,
			'UD9': 0xF000,
			'UD10': 0xB000,
			'UD11': 0xA000,
			'UD12': 0x9000
		};

	function adjustMenus() {
		if (typeof config === 'object') {
			if (typeof config.ROM_VERSION !== 'undefined') adjustSelect(UIids.selectRom, config.ROM_VERSION);
			if (typeof config.RAM_SIZE !== 'undefined') adjustSelect(UIids.selectRam, Math.floor(config.RAM_SIZE/1024));
			if (typeof config.KEYBOARD_REPEAT !== 'undefined') adjustSelect(UIids.selectKeyRepeat, '' + config.KEYBOARD_REPEAT);
			if (typeof config.SCREEN_COLOR !== 'undefined') adjustSelect(UIids.selectScreenColor, config.SCREEN_COLOR);
		}
		adjustKeyboardControls();
	}

	function refocus(element) {
		if (element && element.blur) element.blur();
		var kbdEl = document.getElementById(UIids.kbdFocusTarget);
		if (kbdEl && kbdEl.focus) kbdEl.focus();
	}

	function enableUI() {
		setKeyRepeat(config.KEYBOARD_REPEAT);
		petKeys.listen();
		window.addEventListener('paste', systemPasteListener, false);
		enableDragAndDropLoader(document.getElementById(UIids.dragAndDropTarget));
		if (config.USE_AUDIO) {
			var cbx = document.getElementById(UIids.soundCbxOnOff);
			if (cbx) {
				cbx.checked = false;
				cbx.addEventListener('change', soundToggleHandler, false);
			}
			cbx = document.getElementById(UIids.soundCbxFX);
			if (cbx) {
				cbx.checked = !!config.AUDIO_FX;
				cbx.addEventListener('change', soundFxHandler, false);
			}
			var range = document.getElementById(UIids.soundVolumeRange);
			if (range) {
				range.value = 0;
				range.addEventListener('change', soundVolumeHandler, false);
				range.addEventListener('input', soundVolumeHandler, false);
			}
		}
		createContextMenus();
		enableVisibilityChangeDetection();
	}

	function enableDebugger(flagActive) {
		if ($debugger) {
			$debugger.enable(flagActive);
		}
		else if (flagActive) debuggerSetup();
	}

	function debuggerSetup() {
		if (!$debugger) {
			$debugger = new PetDebugger(pet2001, {
				'pause': pause,
				'showPromptDialog': showPromptDialog,
				'showInfoDialog': showInfoDialog,
				'showCtxMenu': showCtxMenu,
				'showMemoryMap': showMemoryMap,
				'showCPULog': showCPULog,
				'showBreakpointDialog': showBreakpointDialog,
				'running': isRunning
			}, getSysConfig());
			pet2001.attachDebugger($debugger);
			$debugger.setup();
		}
	}

	function resetButton(flagToConfig) {
		if (flagToConfig) {
			for (var p in configDefaults) config[p] = configDefaults[p];
			resetToConfig(true);
			if (history.pushState && (window.location.search.length > 1 || window.location.hash.length > 1) && document.title.indexOf('(') > 0) history.pushState({}, document.title, window.location.pathname);
			setTitle();
		}
		else {
			reset();
			petKeys.reset(true);
			adjustSelect(UIids.selectKeyRepeat, 'true');
		}
	}

	function resetToConfig(manual) {
		pause(true);
		if (typeof config.KEYBOARD_REPEAT !== 'undefined') setKeyRepeat(config.KEYBOARD_REPEAT);
		if (typeof config.SCREEN_COLOR !== 'undefined') setColor(config.SCREEN_COLOR);
		if (typeof config.RAM_SIZE !== 'undefined') pet2001.setRamSize(config.RAM_SIZE, true);
		if (typeof config.ROM_VERSION !== 'undefined') pet2001.setRomVers(config.ROM_VERSION, true);
		if (manual && typeof config.CHARROM_VERSION !== 'undefined') pet2001.setCharsetVersion(config.CHARROM_VERSION, true);
		adjustMenus();
		setHeaderIcon();
		reset();
	}

	function showJamInfo() {
		var jamData = pet2001.getJamData();
		showErrorDialog('CPU JAMMED',
			'The CPU encountered an illegal "JAM"/"KILL" instruction and is unresponsive. Please reset the virtual PET.\n'
			+ ' \n'
			+ 'Jammed at address: $' + (0x10000 | jamData.address).toString(16).substring(1).toUpperCase()
			+ ', instruction code: $' + (0x100 | jamData.instruction).toString(16).substring(1).toUpperCase() + '.',
			jamInfoCallback,
			'Show CPU Log'
		);
	}

	function jamInfoCallback(arg) {
		if (arg) showCPULog();
	}

	function reset() {
		oldRomLoadRunFlag = false;
		lastUpdate = 0;
		pet2001.reset();
		hideCS2001Labels();
		setFileActivityIndicator(false);
		kbdJoystick.reset();
		GamepadManager.reset();
		autoTypeReset();
		if (cpuJammed) {
			cancelAnimationFrame(petRefreshHandle);
			petRefreshHandle = null;
			cpuJammed = false;
		}
		pause(false);
	}

	function pause(flag, flagInternal, ignoreDebugger) {
		var running = petRefreshHandle != null,
			noFlag = typeof flag === 'undefined';
		if ((noFlag && running) || flag == true) {
			if (running) {
				cancelAnimationFrame(petRefreshHandle);
				petRefreshHandle = null;
				if (config.USE_AUDIO) pet2001.audio.suspend();
				petKeys.disable(true);
				if (!ignoreDebugger && $debugger && $debugger.runLevel > 0) $debugger.update();
			}
			lastUpdate = 0;
			if (!flagInternal) document.getElementById(UIids.btnPause).value = UIstrings.resume;
		}
		else if ((noFlag && !running) || flag === false) {
			lastUpdate = 0;
			if (!running) {
				petRefreshHandle = window.requestAnimationFrame(petRefreshFunc);
				if (config.USE_AUDIO) {
					//pet2001.audio.reset();
					pet2001.audio.resume();
				}
				petKeys.disable(false);
			}
			if (!ignoreDebugger && $debugger && $debugger.runLevel > 0) $debugger.resume();
			if (!flagInternal) document.getElementById(UIids.btnPause).value = UIstrings.pause;
		}
		petKeys.release();
		return running; // were we running?
	}

	function romSelection() {
		var vers = document.getElementById(UIids.selectRom).value;
		pet2001.setRomVers(vers);
		adjustKeyboardControls();
		setHeaderIcon();
	}

	function ramsizeSelection() {
		var size = document.getElementById(UIids.selectRam).value;
		pet2001.setRamSize(parseInt(size,10) * 1024);
	}

	function setColor(clr) {
		pet2001.video.setColor(clr);
	}

	function setKeyRepeat(v) {
		var repeat = (typeof v === 'string')? v.toLowerCase() === 'true':Boolean(v);
		petKeys.setKeyRepeat(repeat);
		adjustKeyboardControls();
	}

	function setKeyboardIcons(editModeFlag) {
		var el = document.getElementById('virtualKeypadBtn');
		if (el) el.setAttribute('disabled', !!editModeFlag);
		var jstIcon = document.getElementById(UIids.iconJoystick),
			kpdIcon = document.getElementById(UIids.virtualKeypadBtn);
		if (editModeFlag) {
			if (jstIcon) jstIcon.classList.remove('gaming');
			if (kpdIcon) kpdIcon.classList.remove('gaming');
		}
		else {
			if (jstIcon) jstIcon.classList.add('gaming');
			if (kpdIcon) kpdIcon.classList.add('gaming');
		}
	}

	function setRamSize(size, callback, noreset) {
		var sizes = [8, 16, 32];
		size = parseFloat(size);
		if (size >= 1024) size = (size/1024) | 0;
		for (var i = 0, max = sizes.length-1; i <= max; i++) {
			if (sizes[i] >= size) {
				size = sizes[i];
				break;
			}
			if (i === max) size = sizes[max];
		}
		adjustSelect(UIids.selectRam, size);
		pet2001.setRamSize(size * 1024, noreset);
		if (typeof callback === 'function') waitForCursor(callback);
	}

	function setRomVersion(vers, callback, noreset) {
		if (adjustSelect(UIids.selectRom, vers)) {
			pet2001.setRomVers(vers, noreset);
			adjustKeyboardControls();
			setHeaderIcon();
			if (typeof callback === 'function') waitForCursor(callback);
		}
	}

	function adjustKeyboardControls() {
		if (!petKeys) return;
		var editMode = petKeys.isEditMode();
		setKeyboardIcons(editMode);
		/*
		var el = document.getElementById(UIids.selectKeyRepeat),
			businessMode = petKeys.isBusinessMode();
		if (el) {
			if (businessMode) el.setAttribute('disabled', true);
			else el.removeAttribute('disabled');
		}
		setKeyboardIcons(!businessMode && editMode);
		*/
	}

	function adjustSelect(id, v) {
		var select = document.getElementById(id);
		if (select) {
			var options = select.options;
			for (var i = 0; i < options.length; i++) {
				if (options[i].value == v) {
					select.selectedIndex = i;
					return true;
				}
			}
		}
		return false;
	}

	function setPixelAspectRatio(v) {
		var el = document.getElementById(UIids.screenCanvas);
		if (!el || typeof v === 'undefined') return;
		if (v) {
			el.style.transformOrigin = '50% 0';
			el.style.transform = 'scale(' + NTSCPixelAspect + ', 1)';
			proportionalPixels = true;
		}
		else {
			if (el.style.transform) el.style.transform = '';
			proportionalPixels = false;
		}
	}

	function loadIEEEData(startAddr, byteStream, isTempFile) {
		if (!byteStream.length) return false;
		var memRequired = startAddr + byteStream.length,
			ramSize = pet2001.getRamSize();
		if (memRequired <= ramSize) {
			pet2001.ieeeLoadData(startAddr, byteStream, isTempFile);
			return true;
		}
		else {
			showFileSizeError(ramSize, memRequired);
			return false;
		}
	}

	function showCPULog() {
		var log = pet2001.getCPULog(),
			data = log.data,
			size = log.size,
			p = log.cursor,
			s = data.byteLength,
			out = [];
		if (!size || !s) return;
		// parse ring buffer from cursor pos.
		for (var i = 0; i < size; i++) {
			if (p >= s) p = 0;
			var pc = data[p++] | (data[p++] << 8),
				opc = data[p++],
				op0 = data[p++],
				op1 = data[p++],
				ac = data[p++],
				xr = data[p++],
				yr = data[p++],
				sp = data[p++],
				sr = data[p++];
			if (sr==0) continue; // valid entries have 0x20 set
			var disass = PetUtils.disassembleInstruction(pc, opc, op0, op1, false).listing;
			while (disass.length < 23) disass += ' ';
			out.push(
				  hex(pc, 4) + ' '
				+ disass + '|'
				+ hex(ac,2) + ' '
				+ hex(xr,2) + ' '
				+ hex(yr,2) + ' '
				+ hex(sr,2) + ' '
				+ hex(sp,2) + '|'
				+ ((sr & 0x80)? 'N':'n')
				+ ((sr & 0x40)? 'V':'v')
				+ '-'
				+ ((sr & 0x10)? 'B':'b')
				+ ((sr & 8)? 'D':'d')
				+ ((sr & 4)? 'I':'i')
				+ ((sr & 2)? 'Z':'z')
				+ ((sr & 1)? 'C':'c')
				+ '|'
			);
		}
		showTextExport(
			'CPU Log (last '+out.length.toString(10).replace(/(\d{3})$/, ',$1') +' steps)',
			'addr instr     disass       |AC XR YR SR SP|nv-bdizc|\n' +
			'-----------------------------------------------------\n' + out.join('\n'),
			null, false, false
		);
	}

	function showFileSizeError(ramSize, memRequired) {
			showErrorDialog('Load Error', UIstrings.fileExceedsMemSize.replace('{{ram}}', Math.round(ramSize/1024)+'K').replace('{{required}}', (memRequired/1024).toFixed(3)+'K'));
		}

	function adjustBasicPointers(startAddr, endAddr) {
		function setPointer(ptrAddr, word) {
			pet2001.write(ptrAddr, word & 0xFF);
			pet2001.write(ptrAddr + 1, (word >> 8) & 0xFF);
		}
		var txttab = pet2001.getRomVers() == 1? 0x7A:0x28,
			maxRAM = pet2001.getRamSize();
		setPointer(txttab, startAddr);
		setPointer(txttab +	 2, endAddr);
		setPointer(txttab +	 4, endAddr);
		setPointer(txttab +	 6, endAddr);
		setPointer(txttab +	 8, maxRAM);
		setPointer(txttab + 10, maxRAM);
		setPointer(txttab + 12, maxRAM);
	}

	function oldRomIEEELoadComplete(startAddr, endAddr) {
		// adjust BASIC memory pointers
		if (startAddr == 0x400 || startAddr === 0x401) {
			// add a buffer byte at end of programm and set pointers
			pet2001.write(endAddr++, 0x24);
			adjustBasicPointers(0x401, endAddr);
		}
		setFileActivityIndicator(false);
		// emulate key press 'STOP'
		setTimeout(function() { petKeys.stopKey(false, function() {
			if (oldRomLoadRunFlag) {
				oldRomLoadRunFlag = false;
				setTimeout(function() { autoType(['run']); }, 100);
				refocus();
			}
		}) }, 100);
	}

	// popup & scroll management for overlays

	var ScrollUtility = (function() {
		var scrollX, scrollY,
			isCSS1Compat = (document.compatMode || '') === 'CSS1Compat',
			supportPageOffset = typeof window.pageXOffset !== 'undefined';

		function store() {
			scrollX = supportPageOffset ? window.pageXOffset
				: isCSS1Compat ? document.documentElement.scrollLeft
					: document.body.scrollLeft || 0;
			scrollY = supportPageOffset ? window.pageYOffset
				: isCSS1Compat ? document.documentElement.scrollTop
					: document.body.scrollTop || 0;
		}

		function restore() {
			window.scrollTo(scrollX, scrollY);
		}

		function disableBodyScrolling() {
			store();
			var html = document.getElementsByTagName('html')[0],
				body = document.getElementsByTagName('body')[0],
				offsetWidth = body.offsetWidth;
			html.style.overflow	 = 'hidden';
			html.style.webkitScrollOverflow = 'touch';
			body.style.webkitScrollOverflow = 'touch';
			// compensate for scroll bar
			var hOffset = body.offsetWidth - offsetWidth;
			if (hOffset > 0) body.style.paddingRight = hOffset + 'px';
			if ($debugger && $debugger.isActive()) {
				var el = document.getElementById('debug');
				if (el) el.style.marginRight = hOffset + 'px';
			}
			// readjust scroll position
			restore();
		}

		function enableBodyScrolling() {
			var html = document.getElementsByTagName('html')[0],
				body = document.getElementsByTagName('body')[0];
			html.style.overflow	 = 'auto';
			html.style.webkitScrollOverflow = '';
			body.style.webkitScrollOverflow = '';
			body.style.paddingRight = 0;
			if ($debugger && $debugger.isActive()) {
				var el = document.getElementById('debug');
				if (el) el.style.marginRight = 0;
			}
			restore();
		}

		return {
			'disableBodyScrolling': disableBodyScrolling,
			'enableBodyScrolling': enableBodyScrolling,
			'store': store,
			'restore': restore
		};
	})();

	var popupRunStateFlag, popupActive = false, popupStackCount = 0;

	function prepareForPopup() {
		if (popupStackCount++ == 0) {
			popupRunStateFlag = pause(true);
			ScrollUtility.disableBodyScrolling();
			popupActive = true;
		}
	}

	function resumeFromPopup() {
		if (--popupStackCount == 0) {
			ScrollUtility.enableBodyScrolling();
			if (popupRunStateFlag) pause(false);
			if (window.focus) window.focus();
			refocus();
			popupActive = false;
		}
	}

	var dialogCallback, activeModal;

	function showConfirmDialog(txt, callback, noCancelButton, okButtonText, cancelButtonText) {
		var dialog = document.getElementById(UIids.dialogConfirm),
			dialogText = document.getElementById(UIids.dialogConfirmText),
			okBtn = document.getElementById(UIids.dialogConfirmBtnOK),
			cnclBtn = document.getElementById(UIids.dialogConfirmBtnCancel);
		dialogText.innerHTML = txt;
		dialogCallback = callback;
		prepareForPopup();
		cnclBtn.hidden = !!noCancelButton;
		okBtn.value = okButtonText || 'OK';
		if (!noCancelButton) cnclBtn.value = cancelButtonText || 'Cancel';
		dialog.hidden = false;
		if (okBtn && okBtn.focus) okBtn.focus();
		enableModalDialogKeyHandler(true, 'confirm');
	}

	function closeConfirmDialog(confirmation) {
		var dialog = document.getElementById(UIids.dialogConfirm);
		dialog.hidden = true;
		enableModalDialogKeyHandler(false);
		resumeFromPopup();
		var f = dialogCallback;
		dialogCallback = null;
		if (typeof f === 'function') f(confirmation);
	}

	function switchCharacterSet() {
		var addr = pet2001.getIOAddr() + 0x4C, //0xE84C (59468)
			val = pet2001.dump(addr),
			isUcGfx = (val & 2) == 0,
			isNewCharRom = pet2001.video.isNewCharRom(),
			isJapaneseRom = pet2001.video.isJapaneseCharRom(),
			charsetOld,
			charsetNew,
			newVal = isUcGfx? val | 2:val & 253;
		if (isJapaneseRom) {
			charsetOld = isUcGfx? 'Roman letters / graphics':'Roman letters / kana';
			charsetNew = isUcGfx? 'Roman letters / kana':'Roman letters / graphics';
		}
		else if (isNewCharRom) {
			charsetOld = isUcGfx? 'upper case / graphics':'lower case / upper case';
			charsetNew = isUcGfx? 'lower case / upper case':'upper case / graphics';
		}
		else {
			charsetOld = isUcGfx? 'upper case / graphics':'upper case / lower case';
			charsetNew = isUcGfx? 'upper case / lower case':'upper case  /graphics';
		}
		showConfirmDialog(
			'Switch character set to ' + charsetNew.toUpperCase() + '?<br /><br />' +
			'The PET 2001 is currently in ' + charsetOld + ' mode.<br />' +
			'This will be the same as typing "POKE ' + addr + ',' + (newVal & 14) + '".',
			function(ok) { if (ok) pet2001.write(addr, newVal); }
		);
	}

	function showErrorDialog(title, text, callback, optionText) {
		showInfoDialog(title, text, false, true, callback, null, optionText);
	}

	function showInfoDialog(title, text, mono, warn, callback, legendText, optionText) {
		var dialog = document.getElementById(UIids.dialogInfo),
			dialogTitle = document.getElementById(UIids.dialogInfoTitle),
			dialogText = document.getElementById(UIids.dialogInfoText),
			closeBtn = document.getElementById(UIids.dialogInfoBtnClose),
			optionButton = document.getElementById(UIids.dialogInfoBtnOption);
		dialogTitle.className = warn? 'warn' : '';
		dialogTitle.textContent = title;
		dialogText.className = mono? 'mono' : '';
		dialogText.textContent = text;
		if (legendText) {
			var legend = document.createElement('pre');
			legend.id = '_infoDialogLegend';
			legend.textContent = legendText;
			dialogText.parentNode.insertBefore(legend, dialogText.nextSibling);
		}
		if (optionText) {
			optionButton.value = optionText;
			optionButton.hidden = false;
		}
		else optionButton.hidden = true;
		prepareForPopup();
		dialog.hidden = false;
		dialogCallback = callback;
		if (closeBtn && closeBtn.focus) closeBtn.focus();
		enableModalDialogKeyHandler(true, 'info');
	}

	function closeInfoDialog(arg) {
		var dialog = document.getElementById(UIids.dialogInfo),
			legend = document.getElementById('_infoDialogLegend');
		dialog.hidden = true;
		if (legend) legend.parentNode.removeChild(legend);
		enableModalDialogKeyHandler(false);
		resumeFromPopup();
		var f = dialogCallback;
		dialogCallback = null;
		if (typeof f === 'function') f(arg);
	}

	function showPromptDialog(txt, preset, callback) {
		var dialog = document.getElementById(UIids.dialogPrompt),
			dialogText = document.getElementById(UIids.dialogPromptText),
			input = document.getElementById(UIids.dialogPromptInput);
		dialogText.innerHTML = txt;
		input.value = typeof preset !== 'undefined' && preset !== null? preset:''
		dialogCallback = callback;
		prepareForPopup();
		dialog.hidden = false;
		input.select();
		input.focus();
		enableModalDialogKeyHandler(true, 'prompt');
	}

	function closePromptDialog(ok) {
		var dialog = document.getElementById(UIids.dialogPrompt),
			value = ok? document.getElementById(UIids.dialogPromptInput).value:null;
		dialog.hidden = true;
		enableModalDialogKeyHandler(false);
		resumeFromPopup();
		var f = dialogCallback;
		dialogCallback = null;
		if (typeof f === 'function') f(value);
	}

	function showBreakpointDialog(callback) {
		var dialog = document.getElementById(UIids.dialogDebugBreakpoint);
		dialogCallback = callback;
		prepareForPopup();
		dialog.hidden = false;
		setBreakpointDialogTab();
		enableModalDialogKeyHandler(true, 'breakpoint');
	}
	
	function setBreakpointDialogTab() {
		var tabBreakpoint = document.getElementById(UIids.dialogDebugBreakpointTabBP);
		if (tabBreakpoint.checked) {
			var el = document.getElementById(UIids.dialogDebugBreakpointInputBP);
			el.value='';
		}
		else {
			var el = document.getElementById(UIids.dialogDebugBreakpointInputBracketTo);
			el.value='';
			el = document.getElementById(UIids.dialogDebugBreakpointInputBracketFrom);
			el.value='';
		}
		el.select();
		el.focus();
	}

	function closeBreakpointDialog(ok) {
		function getHexVal(addr) {
			return parseInt( addr.replace(/\s/g,'').replace(/^(\$|0x)/i,'').replace(/[^0-9a-f]/ig,'') ,16);
		}
		var dialog = document.getElementById(UIids.dialogDebugBreakpoint),
			ret;
		if (ok) {
			if (document.getElementById(UIids.dialogDebugBreakpointTabBP).checked) {
				var val = getHexVal(document.getElementById(UIids.dialogDebugBreakpointInputBP).value);
				if (!isNaN(val)) ret = {'type': 'breakpoint', 'address': val & 0xffff};
			}
			else {
				var valFrom = getHexVal(document.getElementById(UIids.dialogDebugBreakpointInputBracketFrom).value),
					valTo = getHexVal(document.getElementById(UIids.dialogDebugBreakpointInputBracketTo).value),
					typeEnter = document.getElementById(UIids.dialogDebugBreakpointInputBracketRadioEnter).checked;
				if (!isNaN(valFrom) && !isNaN(valTo)) {
					valFrom &= 0xffff;
					valTo &= 0xffff;
					if (valFrom > valTo) {
						var t = valFrom;
						valFrom = valTo;
						valTo = t;
					}
					ret = {'type': 'bracket', 'from': valFrom, 'to': valTo, 'onEnter': typeEnter};
				}
			}
		}
		dialog.hidden = true;
		enableModalDialogKeyHandler(false);
		resumeFromPopup();
		var f = dialogCallback;
		dialogCallback = null;
		if (typeof f === 'function') f(ret);
	}

	function modalDialogKeyHandler(event) {
		if (event.metaKey || event.ctrlKey) return true;
		var code = event.charCode != 0 ? event.charCode : event.keyCode;
		if (activeModal == 'info' && (code == 13 || code == 27)) {
			closeInfoDialog();
			stopEvent(event);
		}
		else if (activeModal == 'confirm' && (code == 13 || code == 27)) {
			closeConfirmDialog(code == 13);
			stopEvent(event);
		}
		else if (activeModal == 'prompt' && (code == 13 || code == 27)) {
			closePromptDialog(code == 13);
			stopEvent(event);
		}
		else if (activeModal == 'breakpoint' && (code == 13 || code == 27)) {
			closeBreakpointDialog(code == 13);
			stopEvent(event);
		}
	}

	function enableModalDialogKeyHandler(flag, id) {
		if (flag) {
			activeModal = id;
			window.addEventListener('keydown', modalDialogKeyHandler, true);
		}
		else {
			window.removeEventListener('keydown', modalDialogKeyHandler, true);
			activeModal = '';
		}
	}

	var dialogEscCallback;
	function dialogEscHandler(event) {
		if (event.metaKey || event.ctrlKey) return true;
		var code = event.charCode != 0 ? event.charCode : event.keyCode;
		if (event.charCode || event.keyCode === 27) {
			if (typeof dialogEscCallback === 'function') dialogEscCallback();
			dialogEscCallback = null;
			stopEvent(event);
		}
	}

	function enableDialogEscHandler(flag, callback) {
		if (flag) {
			window.addEventListener('keydown', dialogEscHandler, true);
			dialogEscCallback = callback;
		}
		else {
			window.removeEventListener('keydown', dialogEscHandler, true);
			dialogEscCallback = null;
		}
	}

	function stopEvent(event) {
		event.preventDefault();
		event.stopPropagation();
		if (event.stopImmediatePropagation) event.stopImmediatePropagation();
		event.cancelBuble = false;
		event.returnValue = false;
		return false;
	}

	function focusTextarea(ta) {
		ta.focus();
		if (ta.scrollTo) setTimeout(function() { ta.scrollTo(0,0); }, 4);
	}

	// asm listing dialog

	var asmStore;
	function setAsmListing(asm, dialogType, dialogMessage, filename) {
		asmStore = asm;
		asmStore.dialogType = dialogType;
		asmStore.dialogMessage = dialogMessage;
		if (dialogType == 'options' && filename) asmStore.filename = filename.replace(/\.\w+$/, '');
		showAsmListing();
	}
	function showAsmListing() {
		var dialog = document.getElementById(UIids.dialogAsmListing),
			messageEl = document.getElementById(UIids.dialogAsmMessage),
			ta = document.getElementById(UIids.dialogAsmClipboard);
		messageEl.innerHTML = asmStore.dialogMessage.replace(/([1-9][0-9]*)( warn)/, '<strong>$1</strong>$2');
		ta.value = asmStore.listing;
		dialog.className = UIclasses.asmDialogBaseClass + ' ' + asmStore.dialogType;
		if (asmStore.dialogType == 'options') {
			var isSafePrg = asmStore.start > 0x400 && asmStore.end < pet2001.getRamSize(),
				cbxSetPointers = document.getElementById(UIids.dialogAsmCbxAdjustPointers);
			cbxSetPointers.disabled = !isSafePrg;
			if (!isSafePrg) messageEl.innerText += '\nWarning: code is outside of range of safe user RAM.';
		}
		prepareForPopup();
		dialog.hidden = false;
		focusTextarea(ta);
	}

	function closeAsmListing(job) {
		var dialog = document.getElementById(UIids.dialogAsmListing);
		resumeFromPopup();
		dialog.hidden = true;
		if (asmStore) {
			var isSafePrg = asmStore.start > 0x400 && asmStore.end < pet2001.getRamSize();
			switch(job) {
				case 'load':
					var reset = document.getElementById(UIids.dialogAsmCbxReset).checked;
					loadIEEEData(asmStore.start, asmStore.code);
					if (reset) {
						pet2001.reset();
						petKeys.reset();
					}
					autoLoad(asmStore.filename? asmStore.filename.toUpperCase() : '*', false, isSafePrg && asmStore.start == 0x401);
					break;
				case 'inject':
					var adjustPointers = document.getElementById(UIids.dialogAsmCbxAdjustPointers).checked;
					for (var i=0, l = asmStore.code.length, a = asmStore.start + i; i < l && a < 0xe800; i++, a++) {
						pet2001.write(a, asmStore.code[i]);
					}
					if (adjustPointers && isSafePrg) adjustBasicPointers(asmStore.start, asmStore.end);
					break;
				case 'export':
						var data = String.fromCharCode(asmStore.start & 0xff) + String.fromCharCode((asmStore.start >> 8) & 0xff);
						for (var i=0, l = asmStore.code.length; i < l; i++) data += String.fromCharCode(asmStore.code[i]);
						saveFile(asmStore.filename? asmStore.filename + '.prg' : '', data, true);
					break;
			}
			if (!asmStore || asmStore.dialogType === 'error') resetLoadData();
			if (asmStore && asmStore.dialogType !== 'options') asmStore = null;
		}
	}

	// import / export

	function showMountDialog() {
		var dialog = document.getElementById(UIids.dialogMountFile);
		prepareForPopup();
		enableDialogEscHandler(true, closeMountDialog);
		dialog.hidden = false;
	}

	function closeMountDialog(flagLoad) {
		var dialog = document.getElementById(UIids.dialogMountFile);
		enableDialogEscHandler(false);
		resumeFromPopup();
		if (flagLoad) loadFile();
		dialog.hidden = true;
	}

	function showTempMountDialog() {
		var dialog = document.getElementById(UIids.dialogMountTempFile);
		pet2001.halt(true);
		prepareForPopup();
		enableDialogEscHandler(true, closeTempMountDialog);
		enableTempMountDragDrop(true);
		dialog.hidden = false;
	}

	function closeTempMountDialog(flagLoad, flagFromDragDrop) {
		var dialog = document.getElementById(UIids.dialogMountTempFile);
		enableDialogEscHandler(false);
		enableTempMountDragDrop(false);
		if (!flagFromDragDrop) loadTempFile(document.getElementById(UIids.fileTempUpload).files[0]);
		pet2001.halt(false);
		resumeFromPopup();
		dialog.hidden = true;
	}

	var enableTempMountDragDrop = (function() {
		var el = document.getElementById(UIids.dialogMountTempFileDropZone);
		function dragEnter(event) {
			stopEvent(event);
			el.classList.add(UIclasses.dragdrop);
		}
		function dragLeave(event) {
			stopEvent(event);
			el.classList.remove(UIclasses.dragdrop);
		}
		function dropHandler(event) {
			dragLeave(event);
			if (event.dataTransfer.files.length) loadTempFile(event.dataTransfer.files[0]);
			closeTempMountDialog(false, true);
		}
		function enable(enableFlag) {
			if (el && typeof FileReader !== 'undefined') {
				if (enableFlag) {
					el.addEventListener('dragover', stopEvent, false);
					el.addEventListener('dragenter', dragEnter, false);
					el.addEventListener('dragleave', dragLeave, false);
					document.addEventListener('drop', dropHandler, true);
				}
				else {
					el.removeEventListener('dragover', stopEvent, false);
					el.removeEventListener('dragenter', dragEnter, false);
					el.removeEventListener('dragleave', dragLeave, false);
					document.removeEventListener('drop', dropHandler, true);
				}
			}
		}
		return enable;
	})();

	function petExport(select) {
		var idx = select.selectedIndex;
		select.selectedIndex = 0;
		if (idx > 0) {
			var opt = select.options[idx].value;
			switch(opt) {
				case 'screen as text': showTextExport('Screen Text (Unicode)', getScreenText(), '', false, true); break;
				case 'image': showScreenshot(true); break;
				case 'image marginless': showScreenshot(false); break;
				case 'hardcopy': showHardCopy(); break;
				case 'screen as hex': showTextExport('Screen Memory', getScreenHexDump()); break;
				case 'screen as basic': exportScreenAsProgram(); break;
				case 'basic as prg': exportBasicAsPrg(); break;
				case 'export prg': exportPrg(); break;
				case 'list basic':
				case 'list basic escaped':
				case 'hex-dump':
				case 'disassemble':
				case 'hex-dump program':
				case 'disassemble program':
				case 'disassemble variables':
					exportMemory(opt); break;
				case 'link-basic':
				case 'link-screen':
					exportUrl(opt); break;
				case 'renumber': showRenumberDialog(); break;
				case 'charset': switchCharacterSet(); break;
				case 'basicPointers': showBasicPointers(); break;
				case 'basicVariables': showTextExport(UIstrings.exportTitleBasicVariables, getVarDump()); break;
				case 'basicStringStack': showBasicStringHeap(); break;
				case 'memoryMap': showMemoryMap(); break;
			}
		}
	}

	function loadFile(infile, callback) {
		function tryLoad(addr, data, size, filename, type) {
			var ramSize = pet2001.getRamSize();
			if (size > ramSize) {
				showFileSizeError(ramSize, size);
			}
			else {
				if (addr && data) {
					if (loadIEEEData(addr, data)) {
						setMountedMedia(type, filename);
						setFileSize(size);
						return true;
					}
				}
				else {
					setMountedMedia(type, filename);
					setFileSize(size);
					if (typeof callback === 'function') callback();
					return true;
				}
			}
			resetLoadData();
			return false;
		}

		var file = infile || document.getElementById(UIids.fileUpload).files[0];

		if (!file) return;
		if ((/\.d(64|80|82)$/i).test(file.name)) {
			PetUtils.FDD.readDiskImage(file);
		}
		else if ((/\.t64$/i).test(file.name)) {
			PetUtils.T64.readImage(file);
		}
		else {
			setMountedMedia();
			var reader = new FileReader(),
				ramSize = pet2001.getRamSize();
			if ((/\.(te?xt|bas?|qb(as?)?)$/i).test(file.name)) {
				reader.onload = function fileReader_onTxtLoad(levent) {
					var parsed;
					if ((/\.qb(as?)?$/i).test(file.name)) {
						var transformed = PetUtils.qbTransform(levent.target.result);
						if (transformed.error) {
							showErrorDialog('QB Transform Error', 'Error: '+transformed.error+'\nLine '+transformed.line+':\n\u2192 '+transformed.source);
							resetLoadData();
							return;
						}
						parsed = PetUtils.txt2Basic(transformed.text, 0x0401, false, pet2001.getRomVers());
					}
					else {
						parsed = PetUtils.txt2Basic(levent.target.result, 0x0401, false, pet2001.getRomVers());
					}
					if (parsed.error) {
						if (parsed.asm && parsed.asm.listing) {
							setAsmListing(parsed.asm, 'error', parsed.error);
						}
						else {
							showErrorDialog('Parse Error', parsed.error);
						}
						resetLoadData();
					}
					else {
						var fileLoadFunc = function() {
							if (tryLoad(0x401, parsed.prg, parsed.prg.length-2, file.name, 'txt')
								&& typeof callback === 'function') callback();
						};
						if (parsed.asm && parsed.asm.listing) {
							var msg, accent, warnings = parsed.asm.warnings;
							if (warnings) {
								msg = warnings>1? 'with '+warnings+' warnings':'with 1 warning';
								accent = '#F5B124';
							}
							else {
								msg = 'without issues';
								accent = '#45884A';
							}
							showConfirmDialog('<span style="color:'+accent+';line-height:normal;font-size:33px;float:left;margin:-4px 15px 0 0;">&#x2713;</span>Assembler code found, compiled '+msg+'.<br />Do you want to review the  assembler listing?',
								function(ok) {
									if (ok) setAsmListing(parsed.asm, 'success',
											parsed.asm.message + '\nWill auto-load; assembly start address (dec.): ' + parsed.asm.start + '.' );
									fileLoadFunc();
								},
								false,
								warnings? '':'Review',
								warnings? '':'Skip'
							);
						}
						fileLoadFunc();
					}
				};
				reader.readAsText(file);
			}
			else if ((/\.(a(sm?|65)?|s(rc)?)$/i).test(file.name)) {
				reader.onload = function fileReader_onAsmLoad(levent) {
					var result = PetUtils.assemble(levent.target.result);
					setMountedMedia('asm', file.name);
					setAsmListing(result, result.error? 'error':'options', result.message, file.name);
				};
				reader.readAsText(file);
			}
			else if ((/\.(rom|bin)$/i).test(file.name)) {
				reader.onload = function fileReader_onRomLoad(levent) {
					var data = new Uint8Array(levent.target.result);
					if (data.byteLength) {
						var isBin = (/\.bin$/i).test(file.name),
							binAddr = isBin? data[0] | (data[1] << 8):0,
							msg = 'Found ROM image of 0x' + hex(data.byteLength, 4) +
							' bytes (' + (data.byteLength/1024).toFixed(2) +
							' K).<br />Please enter a start address for this to install at.<br />' +
							(isBin? 'Click <i>&quot;Cancel&quot;</i> to load &quot;'+file.name+'&quot; as a normal file at $'+hex(binAddr,4)+'.<br />':'') +
							'<br />Hex-address (9000 or higher) or socket ID (&quot;H<i>n</i>&quot;, &quot;D<i>n</i>&quot;, &quot;UD<i>n</i>&quot;):',
						promptCallback = function (v) {
							if (v === null) {
								if (isBin) {
									var size = data.byteLength,
										bytes = Array(size - 2);
									for (var i = 0; i < size - 2; i++) bytes[i] = data[i + 2];
									if (!callback) callback = binAddr === 0x401? autoLoad:function() {autoLoad('*', false, false);};
									if (tryLoad(binAddr, bytes, size - 2, file.name, 'bin') && typeof callback === 'function') callback();
								}
								return;
							}
							var startAddr,
								m = v.toUpperCase().match(/^\s*(H|D|UD)([0-9]{1,2})\s*$/);
							if (m) {
								var socketId = m[1] + m[2];
								startAddr = romSocketAddr[socketId];
								if (!startAddr) {
									showErrorDialog(
										'ROM Installation Failed',
										'Unknown socket designator "' + socketId + '".'
									);
									return;
								}
							}
							else {
								startAddr = (parseInt(v.replace(/^[\s\$0xX]+/,''), 16) || 0) & 0xffff;
								if (!startAddr) return;
							}
							if (startAddr < 0x9000) {
								showPromptDialog(msg, 'A000', promptCallback);
								return;
							}
							startAddr = Math.floor(startAddr / 0x800) * 0x800;
							var endAddr = startAddr + data.byteLength - 1;
							if (endAddr > 0xffff) {
								showErrorDialog(
									'ROM Installation Failed: Out of Range',
									'Cannot install: range 0x' + hex(startAddr, 4) + ' - 0x' + hex(endAddr, 5) +
										' exceeds available address space of 0xFFFF.'
								);
							}
							else {
								endAddr = pet2001.installRom(startAddr, data);
								if (!endAddr) {
									showErrorDialog(
										'ROM Installation Error: Invalid Range or Size',
										'Failed to install ROM at 0x' + hex(startAddr, 4) + '.)'
									);
								}
								else {
									showInfoDialog(
										'ROM Installation',
										'Installed ROM at 0x' + hex(startAddr, 4) + ' - 0x' + hex(endAddr, 4) + '.'
									);
									if (endAddr > 0xAFFF) reset();
								}
							}
						};
						var m = (file.name || '').match(/([9A-F][08]00)/i),
							sa = 'A000';
						if (m) sa = hex(parseInt(m[1],16)&0xffff,4);
						else {
							m = (file.name || '').toUpperCase().match(/(\b|_)(H|D|UD)([0-9]{1,2})\b/);
							if (m) {
								var socketId = m[2] + m[3];
								if (romSocketAddr[socketId]) sa = hex(romSocketAddr[socketId],4);
							}
						}
						showPromptDialog(msg, sa, promptCallback);
					}
				};
				reader.readAsArrayBuffer(file);
			}
			else {
				reader.onload = function fileReader_onBinLoad(levent) {
					if ((/\.p[0-9]{2}$/i).test(file.name)) {
						var parsed = PetUtils.parseP00(new DataView(levent.target.result));
						if (parsed.error) {
							showErrorDialog('Parse Error', parsed.error);
							resetLoadData();
						}
						else if (tryLoad(parsed.addr, parsed.prg, parsed.prg.length, file.name, 'bin')
								 && typeof callback === 'function') callback();
					}
					else {
						var data = new DataView(levent.target.result),
							size = levent.target.result.byteLength,
							addr = data.getUint8(0) | (data.getUint8(1) << 8),
							bytes = Array(size - 2);
						for (var i = 0; i < size - 2; i++) bytes[i] = data.getUint8(i + 2);
						if (tryLoad(addr, bytes, size - 2, file.name, 'bin')
							 && typeof callback === 'function') callback();
					}
				};
				reader.readAsArrayBuffer(file);
			}
		}
		setFileActivityIndicator(false);
	}

	var tempFileStore = null;

	function loadTempFile(file) {
		if (!file) {
			if (tempFileStore) pet2001.ieeeLoadData(tempFileStore.addr, tempFileStore.data, true);
			else pet2001.ieeeLoadData(0x83ff, [0], true);
			return;
		}
		var reader = new FileReader();
		reader.onload = function fileReader_onBinLoad(levent) {
			var data = new DataView(levent.target.result),
				size = levent.target.result.byteLength,
				addr = data.getUint8(0) | (data.getUint8(1) << 8),
				bytes = Array(size - 2);
			for (var i = 0; i < size - 2; i++) bytes[i] = data.getUint8(i + 2);
			if (addr && data) {
				tempFileStore = {
					'addr': addr,
					'data': bytes
				};
				pet2001.ieeeLoadData(addr, bytes, true);
			}
		};
		reader.readAsArrayBuffer(file);
	}

	function saveFile(filename, data, optShowAsLink) {
		var link = window.document.createElement('a'),
			extensionRE = /\.(prg|pet|sav|s)$/i;
		link.href = "data:application/octet-stream;base64," + btoa(data);
		if (filename && !extensionRE.test(filename)) filename += '.prg';
		if (typeof link.download !== 'undefined') {
			if (!filename) {
				if (optShowAsLink) { // default filename (override in OS dialog)
					filename = 'PET-program.prg';
				}
				else { // ask user and sanitize
					filename = prompt('Filename:', 'PET-program.prg');
					if (!filename) return;
					filename = filename.replace(/[\/\\]/g, '_');
					if (!extensionRE.test(filename)) filename = filename.replace(/\.\w*$/, '') + '.prg';
				}
			}
			link.download = filename;
			if (!optShowAsLink) { // save in downloads directory by default
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				return;
			}
		}
		// show the link (right-click to save)
		var el = document.getElementById(UIids.downloadLink),
			content = document.getElementById(UIids.downloadLinkParent),
			message = document.getElementById(UIids.downloadLinkMessage);
		if (el && content) {
			prepareForPopup();
			message.innerText = typeof link.download !== 'undefined'?
				'Click the link to download the program into your download folder or righ-click it to save otherwise:':
				'Right-click the link to download the program:';
			link.innerText = '"' + filename + '"';
			while (content.firstChild) content.removeChild(content.firstChild);
			content.appendChild(link);
			el.hidden = false;
			enableDialogEscHandler(true, hideDownloadLink);
		}
	}

	function hideDownloadLink() {
		document.getElementById(UIids.downloadLink).hidden = true;
		enableDialogEscHandler(false);
		resumeFromPopup();
	}

	var downloadLinksSupported = (function() {
		var supported;
		function isSupported() {
			if (typeof supported === 'undefined') {
				var link = window.document.createElement('a');
				supported = typeof link.download !== 'undefined';
			}
			return supported;
		}
		return isSupported;
	})();

	function getDateFilename(prefix, ext) {
		function dd(n) {
			return (n<10? '0':'') + n;
		}
		var d = new Date();
		return prefix + '-' + d.getFullYear() + '-' + dd(d.getMonth()+1) + '-' + dd(d.getDate()) + '-' +
			dd(d.getHours()) + dd(d.getMinutes()) + dd(d.getSeconds()) + '.' + ext;
	}

	function downloadUrlDataFile(filename, urldata) {
		var link = window.document.createElement('a');
		if (typeof link.download !== 'undefined') {
			link.href = urldata;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		}
	}

	function showDirectLink(url, fileName, mediaName) {
		var link = window.document.createElement('a'),
			el = document.getElementById(UIids.directLink),
			content = document.getElementById(UIids.directLinkParent),
			message = document.getElementById(UIids.directLinkMessage),
			directoryDialog = document.getElementById(UIids.dialogDirectory);
		if (el && content) {
			prepareForPopup();
			var msg = 'Direct link to "'+fileName+'"';
			if (mediaName) msg += ' on "'+mediaName+'"';
			msg += ':\n(Right-click the link below to copy the link address.)';
			message.innerText = msg;
			link.href = url;
			link.innerText = link.href;
			while (content.firstChild) content.removeChild(content.firstChild);
			content.appendChild(link);
			el.hidden = false;
			if (directoryDialog && !directoryDialog.hidden) enableDialogEscHandler(false);
			enableDialogEscHandler(true, hideDirectLink);
		}
	}

	function hideDirectLink() {
		document.getElementById(UIids.directLink).hidden = true;
		enableDialogEscHandler(false);
		resumeFromPopup();
		var directoryDialog = document.getElementById(UIids.dialogDirectory);
		if (directoryDialog && !directoryDialog.hidden) setTimeout( function() {
			enableDialogEscHandler(true, closeDirectoryList);
			var list = document.getElementById(UIids.dialogDirectoryList);
			if (list) list.focus();
		},1);
	}

	function executeText(txt, resetAndLoad) {
		if (!(/^\s*[0-9]/).test(txt)) {
			if (!(/[\r\n]$/).test(txt)) txt += '\n';
			petKeys.reset();
			autoType(txt);
		}
		else {
			var parsed = PetUtils.txt2Basic(txt, 0x0401, false, pet2001.getRomVers());
			if (parsed.error){
				showErrorDialog('Parse Error', parsed.error);
				resetLoadData();
			}
			else {
				if (resetAndLoad) {
					pet2001.reset();
					petKeys.reset();
					if (loadIEEEData(0x401, parsed.prg)) autoLoad('', false, true);
				}
				else {
					pet2001.writeRam(0x401, parsed.prg, parsed.prg.length);
					petKeys.reset();
					autoType(['run']);
					refocus();
				}
			}
		}
	}

	function renumber(startLineNo, step) {
		var txttab = pet2001.getRomVers() == 1? 0x7A:0x28,
			maxRAM = pet2001.getRamSize(),
			mem = [],
			basicStart, result, endAddr;
		pet2001.readRam(0, mem, maxRAM);
		basicStart = mem[txttab] | (mem[txttab + 1] << 8);
		result = PetUtils.renumber(mem, basicStart, startLineNo, step);
		endAddr = result.addr;
		if (endAddr > 0) {
			pet2001.writeRam(basicStart, mem.slice(basicStart, endAddr), endAddr - basicStart);
			// reset pointers
			adjustBasicPointers(basicStart, endAddr);
		}
		return result.message;
	}

	function showRenumberDialog() {
		var dialog = document.getElementById(UIids.dialogRenumber),
			lineNumberInput = document.getElementById(UIids.dialogRenumberLineNumber),
			stepInput = document.getElementById(UIids.dialogRenumberStep),
			message = document.getElementById(UIids.dialogRenumberMessage);
		if (dialog) {
			prepareForPopup();
			dialog.hidden = false;
			if (message) message.innerHTML = '&nbsp;';
			if (stepInput) stepInput.value = 10;
			if (lineNumberInput) {
				lineNumberInput.value = 100;
				lineNumberInput.focus();
			}
			enableDialogEscHandler(true, closeRenumberDialog);
		}
	}

	function closeRenumberDialog(execute) {
		var dialog = document.getElementById(UIids.dialogRenumber);
		if (execute) {
			var message = document.getElementById(UIids.dialogRenumberMessage),
				lineNumberInput = document.getElementById(UIids.dialogRenumberLineNumber),
				stepInput = document.getElementById(UIids.dialogRenumberStep),
				lineNumber = parseInt(lineNumberInput.value, 10),
				step = parseInt(stepInput.value, 10),
				keepVisible = true;
			if (isNaN(lineNumber) || lineNumber < 0) {
				message.innerHTML = UIstrings.renumberMsgMinLineNumber;
				lineNumberInput.value = 100;
			}
			if (isNaN(lineNumber) || isNaN(step) || lineNumber < 0 || step < 1) {
				message.innerHTML = UIstrings.renumberMsgMinStep;
				stepInput.value = 10;
			}
			else if (lineNumber > 63999) {
				message.innerHTML = UIstrings.renumberMsgMaxLineNumber;
				lineNumberInput.value = 100;
			}
			else if (step > 1000) {
				message.innerHTML = UIstrings.renumberMsgMaxStep;
				stepInput.value = 10;
			}
			else {
				var response = renumber(lineNumber, step);
				if (response) message.innerHTML = response;
				else keepVisible = false;
			}
			if (keepVisible) return;
		}
		dialog.hidden = true;
		enableDialogEscHandler(false);
		resumeFromPopup();
	}

	function hex(n, l) {
		if (!l) l = 2;
		var s = n.toString(16).toUpperCase();
		while (s.length < l) s = '0' + s;
		return s;
	}

	function dec(n, l) {
		if (!l) l = 2;
		var s = n.toString(10).toUpperCase();
		while (s.length < l) s = '0' + s;
		return s;
	}

	function getBasicPointers() {
		var txttab = pet2001.getRomVers() == 1? 0x7A:0x28,
			mem = [],
			ptrs = [
				['TXTTAB', 'Start of BASIC Text'],
				['VARTAB', 'Start of BASIC Variables'],
				['ARYTAB', 'Start of BASIC Arrays'],
				['STREND', 'End of BASIC Arrays'],
				['FRETOP', 'Bottom of String Storage'],
				['FRESPC', 'Utility String Pointer'],
				['MEMSIZ', 'Highest Address Used by BASIC']
			],
			out = [];
		pet2001.readRam(txttab, mem, 14);
		for (var i=0, j=0, addr = txttab; i < ptrs.length; i++, j+=2, addr += 2) {
			var ptr = ptrs[i];
			out.push( ptr[0] + '  $' + hex(addr) + '-$' + hex(addr+1) + ':  $' + hex(mem[j] | (mem[j+1] << 8), 4) + '  (' + ptr[1] + ')' );
		}
		return out.join('\n');
	}

	function showBasicPointers() {
		showInfoDialog(
			'BASIC System Pointers (BASIC '+pet2001.getRomVers()+'.0)',
			getBasicPointers() + '\n\n(FRETOP, FRESPC and MEMSIZE are only adjusted when running\na program.)',
			true
		);
	}

	function getVarDump() {
		var lowercase = (pet2001.dump(pet2001.getIOAddr() + 0x4C) & 2) != 0,
			romVersion = pet2001.getRomVers(),
			isNewCharRom = pet2001.video.isNewCharRom(),
			isJapaneseRom = pet2001.video.isJapaneseCharRom(),
			mem = [];
		pet2001.readRam(0, mem, pet2001.getRamSize());
		return PetUtils.parseVariables(mem, romVersion, lowercase, isNewCharRom, isJapaneseRom);
	}

	function exportBasicAsPrg() {
		var mem = [], maxRAM = pet2001.getRamSize();
		pet2001.readRam(0, mem, maxRAM);
		var data = PetUtils.convertToPrg(mem, 0x401);
		if (data) {
			saveFile('', data, true);
		}
		else {
			showInfoDialog('No Program', UIstrings.exportMsgNoPrg);
		}
	}

	function showBasicStringHeap() {
		function pad(n, l) {
			var s=''+n;
			while (s.length<l) s=' '+s;
			return s;
		}
		var txttab = pet2001.getRomVers() == 1? 0x7A:0x28,
			maxRAM = pet2001.getRamSize(),
			mem = [];
		pet2001.readRam(0, mem, maxRAM);
		var strend = mem[txttab+6]+(mem[txttab+7]<<8),
			fretop = mem[txttab+8]+(mem[txttab+9]<<8),
			memsiz = mem[txttab+12]+(mem[txttab+13]<<8),
			txt = 'Total: '+pad(memsiz-strend,5)+' bytes     ($'+hex(strend,4)+' - $'+hex(memsiz-1,4)+')\n'
				+ 'Used:  '+pad(memsiz-fretop,5)+' bytes\n'
				+ 'Free:  '+pad(fretop-strend,5)+' bytes\n'
				+ 'FRETOP (bottom of string stack): $'+hex(fretop,4)+'\n'
				+ '______________________________________\n\n';
		if (memsiz != fretop) {
			setTextOptions();
			txt += PetUtils.hexDump(mem, fretop, memsiz-1, textConfig, false, true);
		}
		else {
			txt += '- no string stack used -';
		}
		showTextExport('BASIC String Stack', txt, '', false, true);
	}

	function exportPrg() {
		var mem = [], maxRAM = pet2001.getRamSize();
		pet2001.readRam(0, mem, maxRAM);
		var ptrBase = pet2001.getRomVers() == 1? 0x7A:0x28,
			data,
			txttab = mem[ptrBase] | (mem[ptrBase + 1] << 8),
			vartab = mem[ptrBase + 2] | (mem[ptrBase + 3] << 8);
		if (txttab > vartab) txttab = 0x401; //let's have a try
		if (txttab === 0x401 && !mem[0x401] && !mem[0x402]) vartab=txttab; // empty BASIC prg
		if (txttab < vartab && txttab > 0x400 && vartab < maxRAM && vartab - txttab > 3) {
			data = String.fromCharCode(txttab & 0xff) + String.fromCharCode((txttab >> 8) & 0xff);
			for (var i=txttab; i<vartab; i++) data += String.fromCharCode(mem[i]);
			saveFile('', data, true);
		}
		else {
			showInfoDialog('No Program', UIstrings.exportMsgNoPrg);
		}
	}

	var memSnapshot = [], textConfig = {};
	function setTextOptions() {
		textConfig.charsetTag = pet2001.video.getCharsetTag();
		textConfig.isNewCharRom = pet2001.video.isNewCharRom();
		textConfig.isJapaneseRom = pet2001.video.isJapaneseCharRom();
	}

	function exportMemory(job) {
		var mem = [], maxRAM = pet2001.getRamSize();
		setTextOptions();
		if (job == 'hex-dump program' || job == 'disassemble program' || job == 'disassemble variables') {
			pet2001.readRam(0, mem, maxRAM);
			var pointer = pet2001.getRomVers() == 1? 0x7A:0x28,
				txttab = mem[pointer] | (mem[pointer + 1] << 8),
				vartab = mem[pointer+2] | (mem[pointer+3] << 8),
				rangeString = ' ($0401-$'+ hex(Math.max(txttab, vartab-1), 4) +')';
			if (job == 'hex-dump program') {
				showTextExport(UIstrings.exportTitleProgramHexDump + rangeString, PetUtils.hexDumpProgram(mem, txttab, vartab-1, textConfig) || UIstrings.listingNoPrgFound);
			}
			else if (job == 'disassemble program') {
				showTextExport(UIstrings.exportTitleProgramDisas + rangeString, PetUtils.disassembleProgram(mem, txttab, vartab-1, pet2001.getRomVers(), textConfig) || UIstrings.listingNoPrgFound);
			}
			else if (job == 'disassemble variables') {
				showTextExport(UIstrings.exportTitleBasicVariables, PetUtils.disassembleVariables(mem, pet2001.getRomVers(), textConfig) || UIstrings.listingNoVarsFound);
			}
		}
		else if (job == 'hex-dump' || job == 'disassemble') {
			pet2001.dumpRange(0, mem, 0x10000);
			memSnapshot = mem;
			showTextExport('', '', job);
		}
		else if (job == 'list basic escaped') {
			pet2001.readRam(0, mem, maxRAM);
			memSnapshot = mem;
			showTextExport(UIstrings.exportTitleBasicEscapedListing, '', job, true);
		}
		else {
			pet2001.readRam(0, mem, maxRAM);
			showTextExport(UIstrings.exportTitleBasicPortableListing, PetUtils.basic2Txt(pet2001.getRomVers(), mem, 0x401) || UIstrings.listingNoPrgFound, '', true);
		}
	}

	function disassembleProgram() {
		var mem = [], maxRAM = pet2001.getRamSize();
		pet2001.readRam(0, mem, maxRAM);
		var pointer = pet2001.getRomVers() == 1? 0x7A:0x28;
		var vartab = mem[pointer+2] | (mem[pointer+3] << 8);
		var rangeString = ' ($0401-$'+ hex(vartab, 4) +')';
		showTextExport(UIstrings.exportTitleProgramHexDump + rangeString, PetUtils.disassembleProgram(mem, 0x401, vartab, textConfig) || UIstrings.listingNoPrgFound);
	}

	function showTextExport(title, txt, job, showCaseOption, narrowContent) {
		var el = document.getElementById(UIids.dialogTextExport),
			ta = document.getElementById(UIids.dialogTextExportTextarea),
			ti = document.getElementById(UIids.dialogTextExportTitle),
			me = document.getElementById(UIids.dialogTextExportMemCtrl),
			escCtrl = document.getElementById(UIids.dialogTextExportEscapeCtrl),
			caseOptions = document.getElementById(UIids.dialogTextExportCaseCtrl);
		if (el && ta) {
			prepareForPopup();
			caseOptions.hidden = !showCaseOption;
			ta.classList[narrowContent? 'add':'remove']('narrow');
			if (showCaseOption && document.getElementById(UIids.dialogTextExportCbxLowerCase).checked)
				txt = txt.toLowerCase();
			ta.value = txt;
			if (title) {
				ti.innerHTML = title;
				ti.hidden = false;
			}
			else {
				ti.hidden = true;
			}
			if (job == 'list basic escaped') {
				me.hidden = true;
				escCtrl.hidden = false;
				updateEscapedListing();
			}
			else if (job) {
				adjustSelect(UIids.dialogTextExportMemSelectMode, job);
				document.getElementById(UIids.dialogTextExportMemStart).value = '0000';
				document.getElementById(UIids.dialogTextExportMemEnd).value = (pet2001.getRamSize()-1).toString(16).toUpperCase();
				me.hidden = false;
				escCtrl.hidden = true;
			}
			else {
				me.hidden = escCtrl.hidden = true;
			}
			el.hidden = false;
			if (!me.hidden) {
				var fld = document.getElementById(UIids.dialogTextExportMemStart);
				fld.select();
				fld.focus();
				var btnSelectAll = document.querySelector('#' + UIids.dialogTextExport + ' input.btnTextSelect');
				if (btnSelectAll) btnSelectAll.hidden = true;
			}
			else focusTextarea(ta);
			enableDialogEscHandler(true, hideTextExport);
		}
		else {
			return txt;
		}
	}

	function updateTextExportCase() {
		var ta = document.getElementById(UIids.dialogTextExportTextarea),
			cbx = document.getElementById(UIids.dialogTextExportCbxLowerCase);
		if (cbx.checked) ta.value = ta.value.toLowerCase();
		else ta.value = ta.value.toUpperCase();
	}

	function updateEscapedListing() {
		var useHex = document.getElementById(UIids.dialogTextExportCbxEscapeHex).checked,
			useLabels = document.getElementById(UIids.dialogTextExportCbxEscapeLabels).checked,
			ta = document.getElementById(UIids.dialogTextExportTextarea),
			txt = PetUtils.basic2Txt(pet2001.getRomVers(), memSnapshot, 0x401, true, useHex, useLabels);
		if (!txt) txt = UIstrings.listingNoPrgFound;
		else if (document.getElementById(UIids.dialogTextExportCbxLowerCase).checked) txt = txt.toLowerCase();
		ta.value = txt;
		var btnSelectAll = document.querySelector('#' + UIids.dialogTextExport + ' input.btnTextSelect');;
		if (btnSelectAll) btnSelectAll.hidden = false;
	}

	function updateTextExport() {
		var select = document.getElementById(UIids.dialogTextExportMemSelectMode),
			ta = document.getElementById(UIids.dialogTextExportTextarea),
			ctrlStart = document.getElementById(UIids.dialogTextExportMemStart),
			ctrlEnd = document.getElementById(UIids.dialogTextExportMemEnd),
			start = parseInt(ctrlStart.value, 16),
			end = parseInt(ctrlEnd.value, 16);

		if (isNaN(start)) start = 0;
		if (isNaN(end) || end == 0) end = pet2001.getRamSize()-1;

		if (start < 0) start = 0;
		else if (start > 0xfffe) start = 0xfffe;
		if (end > 0xffff) end = 0xffff;
		else if (start > end) end = start + 1;
		// update controls
		ctrlStart.value = hex(start, 4);
		ctrlEnd.value = hex(end, 4);
		// update output
		switch(select.options[select.selectedIndex].value) {
			case 'hex-dump':
				ta.value = PetUtils.hexDump(memSnapshot, start, end, textConfig); break;
			case 'disassemble':
				ta.value = PetUtils.disassemble(memSnapshot, start, end, pet2001.getRomVers(), textConfig); break;
		}
		focusTextarea(ta);
		var btnSelectAll = document.querySelector('#' + UIids.dialogTextExport + ' input.btnTextSelect');;
		if (btnSelectAll) btnSelectAll.hidden = false;
	}

	function hideTextExport() {
		var el =  document.getElementById(UIids.dialogTextExport);
		if (el) {
			el.hidden = true;
			el.value='';
		}
		memSnapshot.length = 0;
		enableDialogEscHandler(false);
		resumeFromPopup();
	}

	function getScreenText() {
		var snapshot = pet2001.video.getSnapshot(),
			charsetTag = pet2001.video.getCharsetTag(),
			isNewCharRom = pet2001.video.isNewCharRom(),
			isJapaneseRom = pet2001.video.isJapaneseCharRom();
		return PetUtils.screen2Txt.getText(snapshot, charsetTag, isNewCharRom, isJapaneseRom);
	}

	function getScreenHexDump() {
		var snapshot = pet2001.video.getSnapshot();
		return PetUtils.screen2Txt.getHexDump(snapshot);
	}

	function exportScreenAsProgram() {
		var el = document.getElementById(UIids.dialogSrcExport),
			panel = document.getElementById(UIids.dialogSrcExportContent);
		if (el && panel) {
			PetUtils.ScreenGenerator.load(pet2001.video.getSnapshot());
			enableDialogEscHandler(true, hideScreenAsProgram);
			prepareForPopup();
			el.hidden = false;
			generateScreenAsProgram();
		}
	}

	function selectTextarea(parentEl) {
		if (parentEl.nodeType !== 1 || parentEl.nodeName !== 'DIV') {
			var parentEl = parentEl.parentNode;
			while (parentEl) {
				if (parentEl.nodeType === 1 && parentEl.nodeName === 'DIV') break;
				parentEl = parentEl.parentNode;
			}
		}
		if (!parentEl) return;
		var ta = parentEl.querySelector('textarea');
		if (ta) {
			ta.select();
			focusTextarea(ta);
		}
	}

	var currentDataLinkOpt;

	function exportUrl(opt) {
		var el = document.getElementById(UIids.dialogUrlExport),
			panel = document.getElementById(UIids.dialogUrlExportContent),
			title = document.getElementById(UIids.dialogUrlExportTitle),
			linkPane = document.getElementById(UIids.dialogUrlExportLinkPane),
			ctrlPane = document.getElementById(UIids.dialogUrlExportCtrl);
		title.innerHTML = (opt === 'link-screen'? UIstrings.urlExportTitleScreen:UIstrings.urlExportTitleBasic);
		currentDataLinkOpt = opt;
		var link = getDataLink();
		if (link) {
			linkPane.innerHTML = link;
			ctrlPane.hidden = false;
			prepareForPopup();
			enableDialogEscHandler(true, hideUrlExport);
			el.hidden = false;
		}
		else showInfoDialog('No Program', UIstrings.exportMsgNoPrg);
	}

	function getDataLink() {
		var encodingSelect = document.getElementById(UIids.dialogUrlExportSelectEncoding),
			formatSelect = document.getElementById(UIids.dialogUrlExportSelectFormat),
			autorun = document.getElementById(UIids.dialogUrlExportCbxAutoRun).checked,
			list = document.getElementById(UIids.dialogUrlExportCbxList).checked,
			encodingIndex = encodingSelect.selectedIndex,
			formatIndex = formatSelect.selectedIndex,
			base64 = Boolean(encodingIndex >= 0 && encodingSelect.options[encodingIndex].value === 'base64'),
			asFragment = Boolean(formatIndex >= 0 && formatSelect.options[formatIndex].value === 'fragment'),
			url = currentDataLinkOpt == 'link-basic'?
				getBasicUrl(base64, autorun, asFragment, list):
				getScreenUrl(base64, autorun, asFragment);
		if (url) {
			url = url.replace(/&/g, '&amp;');
			url = '<a href="'+url+'">'+url+'</a><br /><br />' + UIstrings.urlExportMsgRightClickToCopy;
		}
		return url;
	}

	function generateDataLink() {
		var linkPane = document.getElementById(UIids.dialogUrlExportLinkPane),
			link = getDataLink();
		if (link) linkPane.innerHTML = link;
	}

	function hideUrlExport() {
		document.getElementById(UIids.dialogUrlExport).hidden = true;
		enableDialogEscHandler(false);
		resumeFromPopup();
	}

	function getBasicUrl(base64, autorun, asFragment, list) {
		var mem = [], maxRAM = pet2001.getRamSize();
		pet2001.readRam(0, mem, maxRAM);
		var txt = PetUtils.basic2Txt(pet2001.getRomVers(), mem, 0x401, true);
		if (!txt) return '';
		return getDataUrl(txt, base64, autorun, list, asFragment, true);
	}

	function getScreenUrl(base64, autorun, asFragment) {
		PetUtils.ScreenGenerator.load(pet2001.video.getSnapshot());
		return getDataUrl(PetUtils.ScreenGenerator.generate(100, 10, true, true), base64, autorun, false, asFragment, false);
	}

	function getDataUrl(txt, base64, autorun, list, asFragment, linkRomVersion) {
		txt = txt.replace(/\u03C0/g, '\\pi');
		var sep = asFragment? '#':'?',
			url = location.origin + location.pathname + sep +'data=' + (base64? 'base64:' + btoa(txt):encodeURIComponent(txt));
		if (linkRomVersion) url += '&rom=' + pet2001.getRomVers();
		if (typeof list === 'undefined' || list) url += '&list=true';
		if (typeof autorun === 'undefined' || autorun) url += '&autorun=true';
		return url;
	}

	function generateScreenAsProgram() {
		var ta = document.getElementById(UIids.dialogSrcExportTextarea),
			elLineNumber = document.getElementById(UIids.dialogSrcExportLineNumber),
			elLineStep = document.getElementById(UIids.dialogSrcExportStep),
			elUpperCase = document.getElementById(UIids.dialogSrcExportCbxUpperCase),
			elTrim = document.getElementById(UIids.dialogSrcExportCbxTrim),
			selectEscapeFormat = document.getElementById(UIids.dialogSrcExportSelectEscapeFormat),
			lineNumber, step, toUpperCase, trim, escapeFmt, useEscapes, useHex, useLabels;
		if (elLineNumber) {
			lineNumber = elLineNumber.value.replace(/\..*/, '').replace(/[^0-9]/g, '');
			lineNumber = parseInt(lineNumber);
			if (!lineNumber || isNaN(lineNumber)) lineNumber = 1000;
			elLineNumber.value = lineNumber;
		}
		if (elLineStep) {
			step = elLineStep.value.replace(/\..*/, '').replace(/[^0-9]/g, '');
			step = parseInt(step);
			if (!step || isNaN(step)) step = 10;
			elLineStep.value = step;
		}
		toUpperCase = elUpperCase? elUpperCase.checked:true;
		trim = elTrim? elTrim.checked:true;
		escapeFmt = selectEscapeFormat.options[selectEscapeFormat.selectedIndex].value;
		useEscapes =  escapeFmt !== 'portable';
		useHex = escapeFmt.indexOf('hex') >= 0;
		useLabels = escapeFmt.indexOf('labels') >= 0;
		ta.value = PetUtils.ScreenGenerator.generate(lineNumber, step, toUpperCase, trim, useEscapes, useHex, useLabels);
		focusTextarea(ta);
	}

	function hideScreenAsProgram() {
		PetUtils.ScreenGenerator.unload();
		document.getElementById(UIids.dialogSrcExport).hidden=true;
		enableDialogEscHandler(false);
		resumeFromPopup();
	}

	function showScreenshot(withMargins) {
		var dataUrl = pet2001.video.exportImage(withMargins);
		if (dataUrl) showImageExport(dataUrl);
	}

	function showHardCopy(rasterSize, dotSize) {
		var printData = pet2001.video.exportHardCopy(rasterSize, dotSize);
		if (typeof HTMLElement.prototype.animate !== 'undefined') showHardcopyDialog(printData);
		else showImageExport(printData.img, true);
	}

	function showImageExport(data, noLink) {
		var el = document.getElementById(UIids.dialogImgExport),
			parentEl = document.getElementById(UIids.dialogImgExportImgWrapper),
			downloadBtn = document.getElementById(UIids.dialogImgExportDownloadBtn);
		if (el && parentEl) {
			while (parentEl.firstChild) parentEl.removeChild(parentEl.firstChild);
			var img = new Image();
			img.src = data;
			if (downloadBtn) downloadBtn.hidden = noLink || !downloadLinksSupported();
			parentEl.appendChild(img);
			prepareForPopup();
			enableDialogEscHandler(true, hideImageExport);
			el.hidden = false;
		}
	}
	function downloadImage() {
		var img = document.querySelector('#'+UIids.dialogImgExportImgWrapper+ ' img');
		if (img) downloadUrlDataFile( getDateFilename('pet2001', 'png'), img.src );
	};

	function hideImageExport() {
		document.getElementById(UIids.dialogImgExport).hidden=true;
		enableDialogEscHandler(false);
		resumeFromPopup();
	}

	function renderMemoryMap() {
		function fillArea(start, end, clr1, clr2) {
			var d = end - start,
				h = d / 256,
				y = start / 128;
			for (var i=0; i<h; i++) {
				ctx.fillStyle = i%2? clr2:clr1;
				ctx.fillRect(0, y + i*2, 1024, 2);
			}
		}
		var canvas = document.createElement('canvas'),
			ctx = canvas.getContext('2d'),
			mem = [];
		canvas.width = 1024;
		canvas.height = 532;
		ctx.fillStyle = '#383838';
		ctx.fillRect(0,0, 1024,512);
		fillArea(0, pet2001.getRamSize(), '#09f', '#2ae');
		fillArea(0x8000, 0x8400, '#46e', '#68f');
		fillArea(0x8400, 0x9000, '#12c', '#34d');
		for (var i = 0x9000; i < 0x10000; i += 0x800) {
			if (pet2001.isRom(i)) fillArea(i, i + 0x800, '#0a1', '#283');
		}
		var io = pet2001.getIOAddr(), y = io/128;
		fillArea(io, pet2001.getIOTop()+1, '#710', '#521');
		ctx.fillStyle = '#f10';
		ctx.fillRect(0x10*8, y, 32, 1);
		ctx.fillRect(0x20*8, y, 32, 1);
		ctx.fillRect(0x40*8, y, 128, 1);
		pet2001.dumpRange(0, mem, 0x10000);
		var data = ctx.getImageData(0,0, 1024,512),
			pixels = data.data;
		for (var i = 0, p = 0; i < 0x10000; i++) {
			var m=mem[i];
			for (var b=7; b>=0; b--) {
				if ((m & (1<<b)) == 0) pixels[p] = pixels[p+1] = pixels[p+2] = 0;
				p+=4;
			}
		}
		ctx.putImageData(data, 0, 0);
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 512, 1024, 20);
		ctx.font = "12px 'Iosevka','m-1m',monospace";
		ctx.fillStyle = '#333436';
		ctx.fillText('0000-FFFF, 1 memory page = 2 lines', 6, 528);
		ctx.fillText('RAM', 300, 528);
		ctx.fillText('Video', 385, 528);
		ctx.fillText('Video Mirror', 470, 528);
		ctx.fillText('ROM', 600, 528);
		ctx.fillText('I/O', 700, 528);
		ctx.fillText('N.C.', 800, 528);
		ctx.fillStyle = '#1198e8';
		ctx.fillRect(284, 520, 8, 8);
		ctx.fillStyle = '#5577e8';
		ctx.fillRect(369, 520, 8, 8);
		ctx.fillStyle = '#2233c8';
		ctx.fillRect(454, 520, 8, 8);
		ctx.fillStyle = '#119922';
		ctx.fillRect(584, 520, 8, 8);
		ctx.fillStyle = '#882211';
		ctx.fillRect(684, 520, 8, 8);
		ctx.fillStyle = '#444';
		ctx.fillRect(784, 520, 8, 8);
		return canvas.toDataURL();
	}
	
	var memoryMapOverlay;

	function showMemoryMap() {
		var el = document.getElementById(UIids.dialogMemoryMap),
			parentEl = document.getElementById(UIids.dialogMemoryMapImgWrapper),
			downloadBtn = document.getElementById(UIids.dialogMemoryMapDownloadBtn);
		if (el && parentEl) {
			while (parentEl.firstChild) parentEl.removeChild(parentEl.firstChild);
			var img = new Image();
			img.src = renderMemoryMap();
			if (downloadBtn) downloadBtn.hidden = !downloadLinksSupported();
			parentEl.appendChild(img);
			prepareForPopup();
			enableDialogEscHandler(true, hideMemoryMap);
			el.hidden = false;
			if (!memoryMapOverlay) {
				memoryMapOverlay = document.createElement('div');
				memoryMapOverlay.id = UIids.memoryMapOverlay;
			}
			memoryMapOverlay.hidden = true;
			document.body.appendChild(memoryMapOverlay);
			setTimeout(function() {
				if (img) {
					img.addEventListener('mouseover', memoryMapPointerHandler, false);
					img.addEventListener('mousemove', memoryMapPointerHandler, false);
					img.addEventListener('mouseout', memoryMapPointerLeave, false);
				}
			}, 10);
		}
	}
	function downloadMemoryMap() {
		var img = document.querySelector('#'+UIids.dialogMemoryMapImgWrapper+ ' img');
		if (img) downloadUrlDataFile( getDateFilename('pet2001-memory-map', 'png'), img.src );
	};
	function hideMemoryMap() {
		document.body.removeChild(memoryMapOverlay);
		document.getElementById(UIids.dialogMemoryMap).hidden=true;
		var imgWrapper = document.getElementById(UIids.dialogMemoryMapImgWrapper);
		while (imgWrapper.firstChild) imgWrapper.removeChild(imgWrapper.firstChild);
		enableDialogEscHandler(false);
		resumeFromPopup();
	}
	function memoryMapPointerHandler(event) {
		var imgWidth = 1024,
			imgHeight = 532,
			mapHeight = 512,
			bytesPerLine = 128,
			pointerYOffset = 2,
			overlayXOffset = 8,
			img = event.target,
			rect = img.getBoundingClientRect(),
			x = Math.round((event.clientX - rect.x)*imgWidth/rect.width),
			y = Math.max(0, Math.round((event.clientY - rect.y)*imgHeight/rect.height) - pointerYOffset);
		if (y > mapHeight + pointerYOffset) memoryMapOverlay.hidden = true;
		else {
			var addr = Math.min(mapHeight-1,y)*bytesPerLine+Math.floor(x/8);
			memoryMapOverlay.innerHTML = '$'+hex(addr,4)+':&thinsp;$'+hex(pet2001.dump(addr),2);
			memoryMapOverlay.style.left = (event.clientX+overlayXOffset)+'px';
			memoryMapOverlay.style.top = event.clientY+'px';
			memoryMapOverlay.hidden=false;
		}
	}
	function memoryMapPointerLeave(event) {
		memoryMapOverlay.hidden = true;
	}

	function showHardcopyDialog(data) {
		var dialog = document.getElementById(UIids.dialogHardcopy),
			wrapper = document.getElementById(UIids.dialogHardcopyContent),
			imgParent = document.getElementById(UIids.dialogHardcopyBody);
		wrapper.classList.add('printing');
		while (imgParent.firstChild) imgParent.removeChild(imgParent.firstChild);
		var img = new Image();
		img.src = data.img;
		imgParent.appendChild(img);

		var durationLine = 438, durationFeed = 62,
			linesToPrint = 25,
			y = linesToPrint * 16,
			printHeadLeft = true,
			printHead = document.getElementById(UIids.dialogHardcopyPrintHead),
			paper = document.getElementById(UIids.dialogHardcopyPaper),
			printMask = document.getElementById(UIids.dialogHardcopyPrintMask),
			lineFlags = data.lineFlags;

		function moveRight() {
			printMask.animate(
				[
					{ transform: 'translate(0, 0)' },
					{ transform: 'translate(640px, 0)' }
				],
				{
					fill: 'forwards',
					duration: durationLine
				}
			);
			var anim = printHead.animate(
				[
					{ transform: 'translate(-86px, 0)' },
					{ transform: 'translate(554px, 0)' }
				],
				{
					fill: 'forwards',
					duration: durationLine
				}
			);
			printHeadLeft = false;
			anim.onfinish = feed;
		}
		function moveLeft() {
			printMask.animate(
				[
					{ transform: 'translate(0, 0)' },
					{ transform: 'translate(-640px, 0)' }
				],
				{
					fill: 'forwards',
					duration: durationLine
				}
			);
			var anim = printHead.animate(
				[
					{ transform: 'translate(554px, 0)' },
					{ transform: 'translate(-86px, 0)' }
				],
				{
					fill: 'forwards',
					duration: durationLine
				}
			);
			printHeadLeft = true;
			anim.onfinish = feed;
		}
		function feed() {
			printMask.animate(
				[
					{ transform: 'translate(0, -16px)' },
					{ transform: 'translate(0, 0)' }
				],
				{
					fill: 'forwards',
					duration: durationFeed
				}
			);
			var anim = paper.animate(
				[
					{ transform: 'translate(0, '+y+'px)' },
					{ transform: 'translate(0, '+(y-16)+'px)' }
				],
				{
					fill: 'forwards',
					duration: durationFeed
				}
			);
			y -= 16;
			linesToPrint--;
			if (linesToPrint > 0) anim.onfinish = nextLine;
			else if (linesToPrint === 0) anim.onfinish = feed;
			else finished();
		}
		function nextLine() {
			if (lineFlags.shift()) {
				if (printHeadLeft) moveRight();
				else moveLeft();
			}
			else {
				feed();
			}
		}
		function finished() {
			var btn = document.getElementById(UIids.dialogHardcopyDownloadBtn);
			if (btn) btn.hidden = !downloadLinksSupported();
			wrapper.classList.remove('printing');
			enableDialogEscHandler(true, hideHardcopy);
		}
		function start() {
			printHead.animate(
				[
					{ transform: 'translate(-86px, 0)' },
					{ transform: 'translate(-86px, 0)' }
				],
				{
					fill: 'forwards',
					duration: 0
				}
			);
			printMask.animate(
				[
					{ transform: 'translate(0, 0)' },
					{ transform: 'translate(0, 0)'}
				],
				{
					fill: 'forwards',
					duration: 0
				}
			);
			var anim = paper.animate(
				[
					{ transform: 'translate(0, '+y+'px)' },
					{ transform: 'translate(0, '+y+'px)' }
				],
				{
					fill: 'forwards',
					duration: durationLine
				}
			);
			anim.onfinish = nextLine;
		}
		
		prepareForPopup();
		dialog.hidden = false;
		start();
	}
	function hideHardcopy() {
		document.getElementById(UIids.dialogHardcopy).hidden=true;
		enableDialogEscHandler(false);
		resumeFromPopup();
	}
	function printHardcopy() {
		function closePrintFrame() {
			document.body.removeChild(printFrame);
		}
		var img = document.querySelector('#'+UIids.dialogHardcopyBody+ ' img');
		if (img) {
			var printFrame = document.createElement('iframe');
			printFrame.style.display = 'none';
			document.body.appendChild(printFrame);
			var cw = printFrame.contentWindow;
			try {
				cw.document.open();
				cw.document.write('<html><head><title>PET 2001 Hard-Copy</title></head><body><img width="640" height="400" style="display: block; width: 320px; height: 200px; padding: 0; border: 1px #ccc solid; box-sizing: content-box; margin: 2em auto 0 auto;" src="'+img.src+'" /></body></html>');
				cw.document.close();
				cw.focus();
				cw.onbeforeunload = closePrintFrame;
				cw.onafterprint = closePrintFrame;
				cw.print();
			}
			catch(e) {
				closePrintFrame();
				showErrorDialog('Print Error','Sorry, an error occurred on the attempt to print the selected element.');
			}
		}
	}
	function downloadHardcopy() {
		var img = document.querySelector('#'+UIids.dialogHardcopyBody+ ' img');
		if (img) downloadUrlDataFile( getDateFilename('pet2001-hardcopy', 'png'), img.src );
	}

	function toggleHelp(optId) {
		var el = document.getElementById(UIids.help);
		if (el) {
			if (el.hidden) {
				prepareForPopup();
				el.hidden = false;
				document.body.classList.add('helpMode');
				if (helpLoaded) {
					if (optId) {
						var target = document.getElementById(optId);
						if (target) target.scrollIntoView();
					}
				}
				else loadHelp(optId);
			}
			else {
				resumeFromPopup();
				el.hidden = true;
				document.body.classList.remove('helpMode');
			}
		}
	}

	function loadHelp(optId) {
		function setHelpContent(txt) {
			var el = document.getElementById(UIids.helpContent);
			el.innerHTML = txt;
		}
		var xhr = new XMLHttpRequest(),
			uid = typeof petHelpVersion === 'string'? '?v=' + petHelpVersion:'?uid=' + Date.now().toString(36);
		xhr.open('GET', 'pet-emulator-help.html' + uid, true);
		xhr.onload = function xhr_onHelpLoad() {
			if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
				if (xhr.responseType && xhr.responseType != 'text') {
					setHelpContent('<p>Sorry, something went wrong, while attempting to load the help document.<p>');
				}
				else {
					setHelpContent(xhr.responseText.replace(/^.*<!-- HELP -->/s, '').replace(/<!-- \/HELP -->.*/s, ''));
					if (optId) {
						var target = document.getElementById(optId);
						if (target) target.scrollIntoView();
					}
					helpLoaded = true;
				}
			}
			else {
				xhr.onerror();
			}
		};
		xhr.onerror = function xhr_onerror() {
			var msg = '<p>Sorry, something went wrong, while attempting to load the help document.<p>';
			if (xhr.status || xhr.statusText) {
				msg += '<p>(';
				if (xhr.status) msg += 'Status: '+xhr.status;
				if (xhr.statusText) msg +=	(xhr.status? ', ':'') + xhr.statusText;
				msg += '.)</p>';
			}
			setHelpContent(msg);
		};
		xhr.send(null);
	}

	var textImportCallback = null;

	function showTextImport(title, txt, callback) {
		var el = document.getElementById(UIids.dialogTextImport),
			ta = document.getElementById(UIids.dialogTextImportTextarea),
			ti = document.getElementById(UIids.dialogTextImportTitle);
		if (el && ta) {
			textImportCallback = callback;
			prepareForPopup();
			enableDialogEscHandler(true, closeTextImport);
			ta.value = txt || '';
			if (title) {
				ti.innerHTML = title;
				ti.hidden = false;
			}
			else {
				ti.hidden = true;
			}
			el.hidden = false;
			focusTextarea(ta);
		}
	}

	function closeTextImport(v) {
		var txt = v? document.getElementById(UIids.dialogTextImportTextarea).value || '':'';
		document.getElementById(UIids.dialogTextImport).hidden = true;
		enableDialogEscHandler(false);
		resumeFromPopup();
		if (v && txt && textImportCallback) textImportCallback(txt);
		textImportCallback = null;
	}

	function enableDragAndDropLoader(el) {
		function dropStart(event) {
			stopEvent(event);
			el.className = UIclasses.dragdrop;
		}
		function dropEnd(event) {
			stopEvent(event);
			el.className='';
		}
		function dropHandler(event) {
			dropEnd(event);
			if (event.dataTransfer.files.length) {
				var file = event.dataTransfer.files[0],
					filename = file.name.replace(/^.*[\\\/]/, '');
				if ((/\.(pro?g|pet|p[0-9]{2}|obj|[ob]65)$/i).test(filename)) {
					pet2001.reset();
					loadFile(file, event.shiftKey? function() {autoLoad('*', false, false);}:autoLoad);
					setMountedMedia('bin', filename);
				}
				else if ((/\.d(64|80|82)$/i).test(filename)) {
					PetUtils.FDD.readDiskImage(file);
					setFileSize(0);
				}
				else if ((/\.(te?xt|bas?|qb(as?)?)$/i).test(filename)) {
					pet2001.reset();
					loadFile(file, function() {autoLoad('*', false, false);});
					setMountedMedia('txt', filename);
				}
				else if ((/\.t64$/i).test(file.name)) {
					PetUtils.T64.readImage(file);
					setFileSize(0);
				}
				else if ((/\.(a(sm?|65)?|s(rc)?)$/i).test(filename)) {
					setMountedMedia('asm', filename);
					setFileSize(0);
					loadFile(file);
				}
				else if ((/\.(rom|bin)$/i).test(filename)) {
					loadFile(file);
				}
				else {
					showErrorDialog('Unrecognized File', 'Sorry, the file "'+file.name+'" does not appear to be of appropriate type.');
				}
			}
		}
		if (el && typeof FileReader !== 'undefined') {
			el.addEventListener('dragover', stopEvent, false);
			el.addEventListener('dragenter', dropStart, false);
			el.addEventListener('dragleave', dropEnd, false);
			el.addEventListener('drop', dropHandler, false);
			var icon = document.getElementById('petImg');
			if (icon) {
				icon.addEventListener('dragover', stopEvent, false);
				icon.addEventListener('dragenter', dropStart, false);
				icon.addEventListener('dragleave', dropEnd, false);
				icon.addEventListener('drop', dropHandler, false);
			}
		}
	}

	function autoLoad(fname, forceBasicStart, run, list) {
		waitForCursor(function() {autoRun(fname, forceBasicStart, run, list);});
	}

	function autoRun(fname, forceBasicStart, run, list) {
		var callback;
		fname = fname && typeof fname === 'string'? switchStringCase(fname) : '*';
		if (forceBasicStart) fname = forcedBasicLoadDriveString + ':' + fname; // drive 1
		var cmds = ['load "' + fname + '",8'];
		if (list) {
			cmds.push('list');
			if (run) callback = function() {
				petKeys.disable(true);
				waitForCursor(function() {
					setTimeout(function() { autoType('run'); }, 200);
				}, true);
			}
			autoExecStack=null;
		}
		else {
			if (pet2001.getRomVers() == 1) oldRomLoadRunFlag = run !== false;
			if (run !== false && !oldRomLoadRunFlag) cmds.push('run');
		}
		if (autoExecStack && autoExecStack.length && run) {
			var inputStack = autoExecStack;
			if (run) callback = function() {
				petKeys.disable(true);
				waitForCursor(function() {
					setTimeout(function() { autoType(inputStack); }, 100);
				}, true);
			}
			autoExecStack=null; 
		}
		autoType(cmds, callback);
		refocus();
	}

	function switchStringCase(s) {
		var t = '';
		for (var i=0; i<s.length; i++) {
			var c = s.charAt(i);
			if (c >= 'A' && c <= 'Z') t += c.toLowerCase();
			else if (c >= 'a' && c <= 'z') t += c.toUpperCase();
			else t += c;
		}
		return t;
	}

	// wait for the cursor to become active

	function waitForCursor(callback, ignoreKbdState) {
		var cursorOnFlag = pet2001.getRomVers() == 1? 548:167;
		function waitForIt() {
			if (pet2001.read(cursorOnFlag) || (petKeys.busy() && !ignoreKbdState)) setTimeout(waitForIt, 20);
			else if (typeof callback === 'function') setTimeout(callback, 200);
		}
		waitForIt();
	}

	// check for active cursor

	function cursorActive() {
		var cursorOnFlag = pet2001.getRomVers() == 1? 548:167;
		return !pet2001.read(cursorOnFlag);
	}

	function isInteractive() {
		return petRefreshHandle && cursorActive();
	}
	
	function isRunning() {
		return !!petRefreshHandle;
	}

	// auto typing
	var autoTypeQueue = [], autoTypeCallback = null, autoTypeCntr = -1, autoTypeDelay=0;

	function autoType(toType, callback, fastMode) {
		var stream;
		if (Object.prototype.toString.call(toType) === '[object Array]') {
			if (typeof toType[0] === 'string') toType = toType.join('\n');
			else if (Object.prototype.toString.call(toType[0]) === '[object Array]') toType = [].concat.apply([], toType);
		}
		else {
			toType = String(toType);
		}
		stream = typeof toType === 'string'? PetUtils.transcodeToPetsciiStream(toType): toType;
		if (stream[stream-length-1] !== 0x0d) stream.push(0x0d);
		autoTypeQueue.length = 0;
		for (var i = 0, max = stream.length; i < max; i++) {
			var c = stream[i], shift = false;
			if (c === 0x0a) c = 0x0d; // LF => CR
			else if (c === 0x0d && i < max && stream[i] === 0x0a) i++; // skip LF after CR
			autoTypeQueue.push(c & 0xff);
		}
		if (autoTypeQueue.length) {
			autoTypeDelay = fastMode? 0:2;
			autoTypeCntr = 0;
			autoTypeCallback = callback;
			petKeys.release();
			petKeys.disable(true);
		}
		else {
			autoTypeCntr = -1;
			if (typeof callback === 'function') setTimeout(callback, 1);
		}
	}

	function autoTypeSync() {
		if (autoTypeCntr > 0) autoTypeCntr--;
		else if (autoTypeCntr === 0 && autoTypeQueue.length && cursorActive()) {
			var romVers = pet2001.getRomVers(),
				kbdBufferIdx = romVers === 1?  0x20d:0x9e,
				kbdBufferAddr = romVers === 1? 0x20f:0x26f,
				idx = pet2001.read(kbdBufferIdx),
				c;
			if (!autoTypeDelay) {
				while (idx<9) {
					c = autoTypeQueue.shift();
					pet2001.write(kbdBufferAddr+idx, c);
					pet2001.write(kbdBufferIdx, ++idx);
					if (autoTypeQueue === 0) break;
				}
			}
			else if (idx===0) {
				c = autoTypeQueue.shift();
				pet2001.write(kbdBufferAddr+idx, c);
				pet2001.write(kbdBufferIdx, 1);
			}
			if (autoTypeQueue.length === 0) {
				if (typeof autoTypeCallback === 'function') {
					var f = autoTypeCallback;
					setTimeout(f,1);
				}
				autoTypeCntr = -1;
				autoTypeCallback = null;
				petKeys.disable(false);
			}
			else autoTypeCntr = autoTypeDelay;
		}
	}

	function autoTypeReset() {
		autoTypeQueue.length = 0;
		autoTypeCallback = null;
		autoTypeCntr = -1;
		autoTypeDelay=0
	}

	// media (fdd/t64) directories

	var dirList, dirInfo,
		mountInfo = {
			type: '',
			name: '',
			size: 0,
			mediaEntry: '',
			asBasic: false,
			fromLibrary: false
		};

	function displayDirectoryList(mode, dir, mediaName, presetAsBasic, presetAutorun, fromLibrary) {
		if (!dir || dir.length == 0) {
			console.warn('no directory information available.');
			return;
		}
		dirInfo = dir;
		var displayPane = document.getElementById(UIids.dialogDirectory),
			list = document.getElementById(UIids.dialogDirectoryList),
			title = document.getElementById(UIids.dialogDirectoryTitle);
		if (!displayPane || !list) return;
		while (list.firstChild) list.removeChild(list.firstChild);
		dirList = [];
		for (var i=0; i<dir.length; i++) {
			var e = dir[i];
			if (!e.display) continue;
			var li = document.createElement('li'),
				input = document.createElement('input'),
				label = document.createElement('label'),
				name = document.createElement('span'),
				size = document.createElement('span'),
				type = document.createElement('span');
			input.type = 'radio';
			input.name = 'directoryItemSelection';
			input.id = '_directoryItem_' + i;
			input.value = e.index;
			label.setAttribute('for', input.id);
			name.className = UIclasses.directoryListFileName;
			name.innerText = e.name;
			type.className = UIclasses.directoryListFileType;
			type.innerText = e.type;
			size.className = UIclasses.directoryListFileSize;
			size.append( document.createTextNode(e.size + ' K') );
			label.appendChild(name);
			size.appendChild(type);
			label.appendChild(size);
			li.className = UIclasses.directoryListItem +' '+ (i %2 ?
				UIclasses.directoryListItemOdd : UIclasses.directoryListItemEven);
			li.appendChild(input);
			li.appendChild(label);
			list.appendChild(li);
			dirList.push(input);
			li.addEventListener('contextmenu', ctxHandlerDirItem, true);
		}
		if (title) {
			if (mode === 'T64') {
				title.innerText = UIstrings.directoryListTitleT64;
			}
			else {
				var t = document.createElement('strong');
				t.innerText = mediaName;
				title.innerHTML = UIstrings.directoryListTitleDisk + ': ' + t.outerHTML;
			}
		}
		adjustSelect(UIids.dialogDirectorySelectRam, Math.round(pet2001.getRamSize()/1024));
		if (typeof presetAsBasic !== 'undefined') {
			var cbx = document.getElementById(UIids.dialogDirectoryCbxAsBasic);
			if (cbx) cbx.checked = presetAsBasic;
		}
		if (typeof presetAutorun !== 'undefined') {
			cbx = document.getElementById(UIids.dialogDirectoryCbxAutoRun);
			if (cbx) cbx.checked = presetAutorun;
		}
		prepareForPopup();
		enableDialogEscHandler(true, closeDirectoryList);
		displayPane.hidden = false;
		if (list.focus) list.focus();
		setMountedMedia(mode, mediaName, '', false, false, false, fromLibrary);
		setFileSize(0);
	}

	function setMountedMedia(type, name, fileName, asBasic, autorun, reset, fromLibrary) {
		var iconType;
		if (type) {
			switch(type.toLowerCase()) {
				case 'fdd':
					iconType = 'disk'; mountInfo.type = 'FDD'; break;
				case 't64':
					iconType = 'tape'; mountInfo.type = 'T64'; break;
				case 'ba':
				case 'bas':
				case 'text':
				case 'txt':
					iconType = 'bas'; mountInfo.type = 'BAS'; break;
				case 'asm':
					iconType = 'asm'; mountInfo.type = 'ASM'; break;
				default:
					iconType = 'bin';
					mountInfo.type = (/^p[0-9]+i/).test(type)? 'BAS':'BIN';
					break;
			}
			mountInfo.name = name;
		}
		else {
			iconType = 'none';
			mountInfo.type = '';
			mountInfo.name = '';
			mountInfo.mediaEntry = '';
			mountInfo.size = 0;
		}
		mountInfo.fromLibrary = mountInfo.type === 'FDD'? !!fromLibrary:false;
		if (mountInfo.type !== 'ASM') asmStore = null;
		mountInfo.asBasic = asBasic;
		var icon = document.querySelector('svg#fileIcon use');
		if (icon) icon.setAttribute('xlink:href', '#icon-'+iconType);
		var label = document.getElementById(UIids.fileLabel);
		if (label) label.textContent = name || UIstrings.fileNone;

		var el =  document.getElementById(UIids.btnDiskDirectory);
		el.hidden = mountInfo.type !== 'FDD';
		el =  document.getElementById(UIids.btnTapeDirector);
		el.hidden = mountInfo.type !== 'T64';
		if (fileName) {
			mountInfo.mediaEntry = fileName;
			fetchEntryFromMountedMedia(fileName, asBasic, autorun, reset);
		}
		else {
			mountInfo.mediaEntry = '';
		}
	}

	function setFileSize(size) {
		var label = document.getElementById(UIids.fileLabel);
		if (!label) return;
		if (size && size > 0) {
			var kb = (size / 1024).toFixed(2).replace(/\.?0+$/, '') + ' KB';
			label.setAttribute('title', kb);
			mountInfo.size = size;
		}
		else {
			label.removeAttribute('title');
			mountInfo.size = 0;
		}
	}

	function resetLoadData() {
		setMountedMedia('', '', '');
		setFileSize();
		pet2001.ieeeResetLoadData();
		autoExecStack=null;
		var upload = document.getElementById(UIids.fileUpload);
		if (upload && upload.form) upload.form.reset();
	}

	function displayDirectory() {
		switch(mountInfo.type) {
			case 'FDD': PetUtils.FDD.displayDirectory(false, mountInfo.fromLibrary); break;
			case 'T64': PetUtils.T64.displayDirectory(false, mountInfo.fromLibrary); break;
		}
	}

	function activateMountedMedia(immediately, noAutoRun) {
		function reloadFromFile() {
			reset();
			petKeys.reset();
			/*
			if (mountInfo.type !== 'BAS') {
				setKeyRepeat(false);
				adjustSelect(UIids.selectKeyRepeat, 'false');
			}
			*/
			autoLoad('*', mountInfo.asBasic, autorun);
		}
		var autorun = !noAutoRun;
		if (immediately && (mountInfo.type == 'FDD' || mountInfo.type == 'T64') && mountInfo.mediaEntry !== '') {
			fetchEntryFromMountedMedia(mountInfo.mediaEntry, mountInfo.asBasic, autorun, true);
		}
		else {
			switch(mountInfo.type) {
				case 'FDD': PetUtils.FDD.displayDirectory(); break;
				case 'T64': PetUtils.T64.displayDirectory(); break;
				case 'BIN':
				case 'BAS':
					if (immediately) {
						reloadFromFile();
					}
					else {
						showConfirmDialog(UIstrings.dialogReset, function(ok) {
							if (ok) reloadFromFile();
						});
					}
					break;
				case 'ASM':
					if (asmStore) {
						reset();
						petKeys.reset();
						showAsmListing();
					}
					break;
			}
		}
	}

	function setFileActivityIndicator(flag) {
		var indicator = document.getElementById(UIids.fileIcon);
		if (indicator) {
			if (flag) {
				if (!indicator.hasAttribute('class')) indicator.setAttribute('class', 'active');
			}
			else indicator.removeAttribute('class');
		}
	}

	function loadSelectedDirectoryIndex(autorrun, forceBasicStart, reset) {
		var index = -1;
		for (var i = 0; i < dirList.length; i++) {
			if (dirList[i].checked) {
				index = parseInt(dirList[i].value, 10);
				break;
			}
		}
		if (index < 0) index = 0;
		fetchEntryFromMountedMedia(index, forceBasicStart, autorrun, reset);
		closeDirectoryList();
	}

	function fetchEntryFromMountedMedia(entry, forceBasicStart, autorun, reset) {
		var loader =  mountInfo.type === 'T64'?	PetUtils.T64:PetUtils.FDD,
			file = loader.getFile(entry);
		if (!file) return;
		mountInfo.mediaEntry = entry;
		mountInfo.asBasic = forceBasicStart;
		var minRamSelect = document.getElementById(UIids.dialogDirectorySelectRam),
			minRam = minRamSelect? parseInt(minRamSelect.options[minRamSelect.selectedIndex].value):0;
		if (typeof minRam === 'number') {
			if (minRam < 1024) minRam *= 1024;
		}
		else {
			minRam = 0;
		}
		var addr = forceBasicStart? (file.address % 0x400 == 0? 0x400:0x0401):file.address,
			minDataSpace = forceBasicStart? 0x80:0,
			ramRequired = Math.max(minRam, addr + file.bytes.length - 2 + minDataSpace),
			loadAndRun = function() {
				autoLoad(file.name, forceBasicStart, autorun);
			};
		if (ramRequired >= pet2001.getRamSize()) {
			setRamSize(ramRequired/1024, loadAndRun);
		}
		else if (reset) {
			pet2001.reset();
			waitForCursor(loadAndRun);
		}
		else loadAndRun();
	}

	function closeDirectoryList() {
		if (dirList) {
			dirList.length = 0;
			dirInfo = null;
		}
		var el = document.getElementById(UIids.dialogDirectory);
		if (el) el.hidden = true;
		enableDialogEscHandler(false);
		resumeFromPopup();
	}

	function loadFromMountedMedia(filename) {
		if (typeof filename === 'string' && (/\.s(av)?$/i).test(filename)) {
			showTempMountDialog(filename.replace(/0xff/g, '\u03C0'));
			return;
		}
		if ((mountInfo.type !== 'FDD' && mountInfo.type !== 'T64') && PetUtils.VirtualDirectory.isDirectory(filename)) {
			var data = PetUtils.VirtualDirectory.getDirectoryFile(mountInfo.type, mountInfo.name, mountInfo.size);
			loadIEEEData(0x0401, data, data.length, true);
			return;
		}
		if (!mountInfo.type) return;
		filename = String(filename || '*').replace(/0xff/g, '\u03C0');
		var file,
			forceBasicStart = false,
			matches = (/^([0-9]):(.*)$/).exec(filename);
		if (matches) {
			filename = matches[2];
			if (matches[1] == forcedBasicLoadDriveString) forceBasicStart = true;
		}
		if (mountInfo.type === 'FDD') file = PetUtils.FDD.getFile(filename);
		else if (mountInfo.type === 'T64') file = PetUtils.T64.getFile(filename);

		if (file && file.bytes.length)
			loadIEEEData(forceBasicStart? (file.address % 0x400 == 0? 0x400:0x0401):file.address, file.bytes);
	}

	function extractFromMountedMedia(descriptor) {
		if (!mountInfo.type) return;
		var file, filename;
		if (typeof descriptor === 'string') {
			filename = descriptor;
		}
		else if (typeof descriptor === 'number' && dirInfo) {
			var item = dirInfo[descriptor];
			if (!item) return;
			filename = item.name;
			if (item.type) filename += '.' + item.type.toLowerCase();
		}
		else return;
		if (mountInfo.type === 'FDD') file = PetUtils.FDD.getFile(descriptor);
		else if (mountInfo.type === 'T64') file = PetUtils.T64.getFile(descriptor);
		if (file && file.bytes.length) {
			filename = String(filename || 'FILE').replace(/0xff/g, '\u03C0');
			var dataString = String.fromCharCode(file.address & 0xff) + String.fromCharCode((file.address >> 8) & 0xff),
				bytes = file.bytes;
			for (var i = 0, l = bytes.length; i < l; i++) dataString += String.fromCharCode(bytes[i]);
			if (!(/\.\S{3}$/).test(filename)) filename += '.prg';
			saveFile(filename, dataString, true);
		}
	}

	function dirListItemCtxMenuLoadCallback(entry) {
		var asBasic = document.getElementById('directoryCbxAsBasic').checked,
			autorun = document.getElementById('directoryCbxAutorun').checked,
			reset = document.getElementById('directoryCbxReset').checked;
		closeDirectoryList();
		fetchEntryFromMountedMedia(entry, asBasic, autorun, reset);
	}

	function showLinkForDirItem(descriptor) {
		if (dirInfo && mountInfo.fromLibrary && mountInfo.name && mountInfo.type == 'FDD') {
			var item = dirInfo[descriptor];
			if (item) {
				var fileName = item.name,
					mediaName = mountInfo.name,
					soundCbx = document.getElementById(UIids.soundCbxOnOff),
					url = '?prg='+encodeURIComponent(mediaName)+'/'+encodeURIComponent(fileName)+
						'&ram=32&kbd=games&rom='+pet2001.getRomVers()+
						'&screen='+pet2001.video.getColor();
				if (soundCbx && soundCbx.checked) url += '&sound=on';
				url += '&autorun=true';
				showDirectLink(url, fileName, mediaName);
			}
		}
	}

	// special display for Computer Space 2001

	function showCS2001Labels() {
		var el = document.getElementById(UIids.CS2001LabelsParent);
		if (el) {
			var labels = document.createElement('div');
			labels.id = UIids.CS2001Labels;
			el.appendChild(labels);
		}
	}

	function hideCS2001Labels() {
		var el = document.getElementById(UIids.CS2001Labels);
		if (el && el.parentNode) el.parentNode.removeChild(el);
	}

	// touch-active cursor, position cursor on screen click

	var cursorbase,
		screenClickMsgShown = true; // disabled for being annoying

	function observeScreenClicks(v) {
		var el = document.getElementById(UIids.touchClickTarget);
		cursorbase = document.getElementById(UIids.screenCanvas);
		if (!el || !cursorbase) return;
		if (v) {
			if (!screenClickMsgShown) {
				showInfoDialog('Click Cursor','Set the cursor position by simply tapping or clicking the screen. &#x2014; It is recommended to deactivate this option while running programs, as it may interfere with INPUT statements and other prompts with an active cursor.');
				screenClickMsgShown = true;
			}
			if (typeof el.onpointerdown !== 'undefined') {
				el.addEventListener('pointerdown', screenClick, false);
			}
			else {
				el.addEventListener('mousedown', screenClick, false);
				el.addEventListener('touchstart', screenClick, false);
			}
		}
		else {
			if (typeof el.onpointerdown !== 'undefined') {
				el.removeEventListener('pointerdown', screenClick, false);
			}
			else {
				el.removeEventListener('mousedown', screenClick);
				el.removeEventListener('touchstart', screenClick, false);
			}
		}
	}

	function screenClick(event) {
		event.preventDefault();
		event.stopPropagation();
		if (petKeys.busy() || (event.button !== 'undefined' && event.button != 0)) return;

		var cursorOnFlag;

		if (pet2001.getRomVers() == 1) {
			cursorOnFlag = 548;
		}
		else  {
			cursorOnFlag = 167;
		}
		if (pet2001.read(cursorOnFlag) != 0) return;

		var MARGIN = 5,
			bb = cursorbase.getBoundingClientRect(),
			x, y, row, col, pixelAspect;
		if (event.type === 'touchstart') {
			var touch = event.touches[0];
			x = touch.pageX;
			y = touch.pageY;
		}
		else {
			x = event.pageX;
			y = event.pageY;
		}
		pixelAspect = proportionalPixels? 1/NTSCPixelAspect:1;
		row = Math.max(0, Math.floor((y-window.pageYOffset-bb.top-MARGIN)/16));
		col = Math.max(0, Math.floor((x-window.pageXOffset-bb.left-MARGIN)/16 * pixelAspect));
		setCursor(row, col);
	}

	function setCursor(row, col) {
		var crsrBlinkFlag, crsrChar, quoteFlag, rvsFlag, insertCnt,
			curScreenLine, curLineCol, startOfLinePtr, maxLineLength,
			lsbVideoTable, hsbVideoTable,
			romVersion = pet2001.getRomVers();

		if (row < 0) row = 0;
		else if (row > 24) row = 24;
		if (col < 0) col = 0;
		else if (col > 39) col = 39;

		if (romVersion == 1) {
			curScreenLine = 0xF5;
			curLineCol = 0xE2;
			startOfLinePtr = 0xE0;
			maxLineLength = 0xF2;
			hsbVideoTable = 0x0229;
			lsbVideoTable = 0xE7BC;
			crsrBlinkFlag = 0x0227;
			crsrChar = 0x0226;
			quoteFlag = 0xEA;
			insertCnt = 0xFB;
			rvsFlag = 0x020E;
		}
		else {
			curScreenLine = 0xD8;
			curLineCol = 0xC6;
			startOfLinePtr = 0xC4;
			maxLineLength = 0xD5;
			hsbVideoTable = 0xE0;
			lsbVideoTable = romVersion == 4? 0xE65B : 0xE748;
			crsrBlinkFlag = 0xAA;
			crsrChar = 0xA9;
			quoteFlag = 0xCD;
			rvsFlag = 0x9F;
			insertCnt = 0xDC;
		}
		// unblink
		if (pet2001.read(crsrBlinkFlag)) {
			pet2001.write(crsrBlinkFlag, 0);
			pet2001.video.write(
				pet2001.read(startOfLinePtr) + (pet2001.read(startOfLinePtr+1)<<8)
					+ pet2001.read(curLineCol) - pet2001.getVideoAddr(),
				pet2001.read(crsrChar)
			);
		}
		// clear input mode flags
		pet2001.write(quoteFlag, 0);
		pet2001.write(rvsFlag, 0);
		pet2001.write(insertCnt, 0);
		// is target row a long line (more than 40 chars)?
		if (row > 0 && (pet2001.read(hsbVideoTable + row) & 0x80) == 0) {
			row--;
			col += 40;
		}
		// set cursor like ROM routine
		// compare 0xE5DB (ROM1) and 0xE25D (ROM2)
		pet2001.write(curScreenLine, row);
		pet2001.write(startOfLinePtr+1, pet2001.read(hsbVideoTable+row) | 0x80);
		pet2001.write(startOfLinePtr, pet2001.read(lsbVideoTable+row));
		if (row < 24 && (pet2001.read(hsbVideoTable+1+row) & 0x80) == 0) {
			pet2001.write(maxLineLength, 79);
		}
		else {
			pet2001.write(maxLineLength, 39);
		}
		// as in ROM, won't work for long lines
		/*
		if (col>=40) {
			pet2001.write(curLineCol, col-40);
		}
		else {
			pet2001.write(curLineCol, col);
		}
		*/
		// since we compensated for long lines above, write col as-is
		pet2001.write(curLineCol, col);
	}

	// context menus

	var ctxMenus, ctxMenuItems, ctxMenuShield, ctxMenuData;

	function createContextMenus() {
		ctxMenus = {};
		ctxMenuItems = {};
		ctxMenuData = {};
		var menuData = {
			'screen': [
				{ 'id': 'copy', 'label': 'Copy As Text', 'task': 'screen-copy' },
				{ 'id': 'paste', 'label': 'Paste To PET', 'task': 'screen-paste'},
				{ 'rel': '-separator-', 'group': true },
				{ 'id': 'imgExp', 'label': 'Export Screen As Image&hellip;', 'task': 'screen-as-img' },
				{ 'id': 'txtExp', 'label': 'Export Screen As Text&hellip;', 'task': 'screen-as-text' },
				{ 'id': 'hardcopy', 'label': 'Printer Hard-Copy&hellip;', 'task': 'screen-as-hardcopy' },
				{ 'id': 'hexDump', 'label': 'Hex-Dump Video Memory&hellip;', 'task': 'screen-as-hex' },
				{ 'id': 'screenAsBasic', 'label': 'Export Screen As BASIC program&hellip;', 'task': 'screen-as-basic' },
				{ 'rel': '-separator-', 'group': true },
				{ 'id': 'green', 'label': 'Screen: Green', 'task': 'screen-green', 'radio': true },
				{ 'id': 'white', 'label': 'Screen: White', 'task': 'screen-white', 'radio': true },
				{ 'id': 'ink', 'label': 'Screen: E-Ink (Inverted)', 'task': 'screen-ink', 'radio': true },
				{ 'rel': '-separator-' },
				{ 'id': 'charsetGraphics', 'label': 'Upper Case/Graphics', 'task': 'characterset-graphics', 'radio': true  },
				{ 'id': 'charsetBusinessOld', 'label': 'Upper Case/Lower Case', 'task': 'characterset-business', 'radio': true },
				{ 'id': 'charsetBusinessNew', 'label': 'Lower Case/Upper Case', 'task': 'characterset-business', 'radio': true },
				{ 'id': 'charsetGraphicsJa', 'label': 'Roman Letters/Graphics', 'task': 'characterset-graphics', 'radio': true  },
				{ 'id': 'charsetBusinessJa', 'label': 'Roman Letters/Kana', 'task': 'characterset-business', 'radio': true },
				{ 'rel': '-separator-', 'group': true },
				{ 'id': 'oldCharRom', 'label': 'Old Character ROM', 'task': 'screen-char_rom-old', 'title': 'Unshifted characters are upper case with mixed case character set.', 'radio': true  },
				{ 'id': 'newCharRom', 'label': 'New Character ROM', 'task': 'screen-char_rom-new', 'title': 'Unshifted characters are lower case with mixed case character set.', 'radio': true  },
				{ 'id': 'jaCharRom', 'label': 'Japanese Character ROM', 'task': 'screen-char_rom-ja', 'title': 'Uses Katakana for lower case characters.', 'radio': true  },
				{ 'id': 'altCharRom', 'label': '3rd-Party &quot;Computer&quot; Font', 'task': 'screen-char_rom-alt', 'title': 'Alternative 3rd party character ROM.', 'radio': true  },
				{ 'rel': '-separator-', 'group': true },
				{ 'id': 'longPersistence', 'label': '&quot;Hot&quot; Rendering / Long Persistence', 'checkmark': true, 'task': 'screen-persistence' },
				{ 'id': 'pixelAspectRatio', 'label': 'NTSC Pixel Aspect Ratio', 'checkmark': true, 'task': 'screen-pixelaspectratio' },
			],
			'dirItem': [
				{ 'id': 'load', 'label': 'Load File', 'task': 'dirItem-loadFile' },
				{ 'id': 'extract', 'label': 'Extract File', 'task': 'dirItem-extractFile' },
				{ 'id': 'link', 'label': 'Create Link', 'task': 'dirItem-link' }
			],
			'fileLabel': [
				{ 'id': 'mountPointReload', 'label': 'Reset and Reload From File', 'task': 'fileLabel-reloadData' },
				{ 'id': 'mountPointReloadNoRun', 'label': 'Reload From File Without Running', 'task': 'fileLabel-reloadData-noRun' },
				{ 'id': 'separator', 'rel': '-separator-' },
				{ 'id': 'mountPointReset', 'label': 'Reset Mount Point', 'task': 'fileLabel-resetData' },
				{ 'id': 'mountPointMount', 'label': '(None) Mount File&hellip;', 'task': 'fileLabel-mount' }
			],
			'joystick': [
				{ 'id': 'ignore', 'label': 'None', 'task': 'joystick', 'value': 'IGNORE', 'radio': true },
				{ 'rel': '-separator-' },
				{ 'id': 'simple', 'label': 'Simple (Left, Right, Fire)', 'task': 'joystick', 'value': 'SIMPLE', 'radio': true },
				{ 'id': 'pet', 'label': 'PET (Dual)', 'task': 'joystick', 'value': 'PET', 'radio': true },
				{ 'id': 'stupidpettricks', 'label': 'Stupid PET Tricks (Dual)', 'task': 'joystick', 'value': 'STUPIDPETTRICKS', 'radio': true },
				{ 'id': 'galaga', 'label': 'Galaga (H. Wening)', 'task': 'joystick', 'value': 'GALAGA', 'radio': true },
				{ 'id': 'scramble', 'label': 'Scramble (A. Jentzen)', 'task': 'joystick', 'value': 'SCRAMBLE', 'radio': true },
				{ 'id': 'chuck_johnson', 'label': 'Compute (C. Johnson)', 'task': 'joystick', 'value': 'CHUCK_JOHNSON', 'radio': true },
				{ 'rel': '-separator-' },
				{ 'id': 'snes', 'label': 'SNES Serial Adapter', 'task': 'joystick', 'value': 'SNES', 'radio': true },
				{ 'rel': '-separator-' },
				{ 'id': 'keyboard_a', 'label': '&rarr; Number Pad, Fire: A', 'task': 'joystick', 'value': 'KEYBOARD_A', 'radio': true },
				{ 'id': 'keyboard_shift', 'label': '&rarr; Number Pad, Fire: Shift', 'task': 'joystick', 'value': 'KEYBOARD_SHIFT', 'radio': true },
				{ 'id': 'keyboard_spc', 'label': '&rarr; Number Pad, Fire: Space', 'task': 'joystick', 'value': 'KEYBOARD_SPACE', 'radio': true },
				{ 'id': 'custom', 'label': '&rarr; Custom Mapping', 'task': 'joystick', 'value': 'CUSTOM', 'radio': true },
				{ 'rel': '-separator-' },
				{ 'id': 'other', 'label': 'Other', 'task': 'joystick', 'value': 'OTHER', 'radio': true, 'disabled': true },
				{ 'rel': '-separator-', 'group': true },
				{ 'id': 'settings', 'label': 'Open Joystick Settings&hellip;', 'task': 'joystick-settings' }
			],
			'sound': [
				{ 'id': 'on', 'label': 'Sound On', 'task': 'sound-on', 'radio': true },
				{ 'id': 'off', 'label': 'Sound Off', 'task': 'sound-off', 'radio': true }
			],
			'keyboard': [
				{ 'id': 'paste', 'label': 'Paste To PET', 'task': 'keyboard-paste' }
			],
			'clickCursor': [
				{ 'id': 'on', 'label': 'On', 'task': 'click-cursor-on', 'radio': true },
				{ 'id': 'off', 'label': 'Off', 'task': 'click-cursor-off', 'radio': true },
				{ 'rel': '-separator-', 'group': true },
				{ 'id': 'help', 'label': 'Help', 'task': 'click-cursor-help' }
			],
			'keypad': [
				{ 'id': 'on', 'label': 'On', 'task': 'keypad-on', 'radio': true },
				{ 'id': 'off', 'label': 'Off', 'task': 'keypad-off', 'radio': true },
				{ 'rel': '-separator-', 'group': true },
				{ 'id': 'help', 'label': 'Help', 'task': 'keypad-help' }
			],
			'prglib': [
				{ 'id': 'open', 'label': 'Open', 'task': 'prglib-open' },
				{ 'id': 'open', 'label': 'Open in Separate Window', 'task': 'prglib-open-new' }
			],
			'debugValue': [
				{ 'id': 'edit', 'label': 'Edit', 'task': 'debug-value' }
			]
		};
		var t=1;
		for (var menuId in menuData) {
			var items = {}, data = menuData[menuId], menuRoot = document.createElement('ul');
			for (var i=0; i<data.length; i++) {
				var dataItem = data[i],
					menuItem = document.createElement('li');
				if (dataItem.rel === '-separator-') {
					menuItem.className = dataItem.group? UIclasses.screenCtxMenuGroupSeparator:UIclasses.screenCtxMenuSeparator;
					menuItem.addEventListener('click', stopEvent, true);
					if (dataItem.id) items[dataItem.id] = menuItem;
				}
				else {
					menuItem.setAttribute('data-task', dataItem.task);
					menuItem.innerHTML = dataItem.label;
					if (dataItem.title) menuItem.setAttribute('title', dataItem.title);
					if (dataItem.value) menuItem.setAttribute('data-value', dataItem.value);
					if (dataItem.disabled) menuItem.setAttribute('disabled', true);
					if (dataItem.checkmark) {
						menuItem.className = UIclasses.screenCtxMenuHasCheckmark;
					}
					else if (dataItem.radio) {
						menuItem.className = UIclasses.screenCtxMenuHasRadio;
					}
					items[dataItem.id] = menuItem;
				}
				menuRoot.appendChild(menuItem);
			}
			menuRoot.addEventListener('contextmenu', stopEvent, true);
			var menu = document.createElement('menu');
			menu.className = UIclasses.screenCtxMenu;
			menu.appendChild(menuRoot);
			ctxMenuShield = document.createElement('div');
			ctxMenuShield.className = UIclasses.ctxMenuShield;
			ctxMenuShield.addEventListener('contextmenu', hideCtxMenu, true);
			ctxMenuShield.addEventListener('click', hideCtxMenu, false);
			ctxMenus[menuId] = menu;
			ctxMenuItems[menuId] = items;
		}
		// add listeners
		var screenEl = document.getElementById(UIids.screenCtxMenuTarget);
		if (screenEl) screenEl.addEventListener('contextmenu', ctxHandlerFor('screen'), false);
		var kbdEl = document.getElementById(UIids.keyboardElement);
		if (kbdEl) kbdEl.addEventListener('contextmenu', ctxHandlerVoid, false);
		// for any ctrl items…
		var ctrlItems = document.querySelectorAll('#petControls > *');
		for (var i = 0; i < ctrlItems.length; i++) {
			var ctrlItem = ctrlItems[i],
				ctxHandlerFileLabel = ctxHandlerFor('fileLabel');
			switch (ctrlItem.id) {
				case UIids.fileLabel:
					ctrlItem.addEventListener('contextmenu', ctxHandlerFileLabel, true);
					break;
				case UIids.fileIcon:
					ctrlItem.addEventListener('contextmenu', ctxHandlerFileLabel, true);
					break;
				case UIids.iconJoystick:
					ctrlItem.addEventListener('contextmenu', ctxHandlerFor('joystick'), true);
					break;
				case UIids.soundCtrl:
					ctrlItem.addEventListener('contextmenu', ctxHandlerFor('sound'), true);
					break;
				case UIids.checkboxClickCursor:
				case UIids.labelClickCursor:
					ctrlItem.addEventListener('contextmenu', ctxHandlerFor('clickCursor'), true);
					break;
				case UIids.virtualKeypadBtn:
					ctrlItem.addEventListener('contextmenu', ctxHandlerFor('keypad'), true);
					break;
				case UIids.prgLibraryBtn:
					ctrlItem.addEventListener('contextmenu', ctxHandlerFor('prglib'), true);
					break;
				default:
					ctrlItem.addEventListener('contextmenu', ctxHandlerVoid, true);
					break;
			}
		}
		var ctrlEl = document.getElementById('petControls');
		if (ctrlEl) ctrlEl.addEventListener('contextmenu', ctxHandlerVoid, false);
		window.addEventListener('blur', hideCtxMenu, false);
		window.addEventListener('focus', hideCtxMenu, false);
	}

	function ctxHandlerFor(menuId) {
		return function(event) {
			showCtxMenu(menuId, event);
		};
	}
	function ctxHandlerDirItem(event) {
		showCtxMenu('dirItem', event);
	}
	function ctxHandlerVoid(event) {
		event.preventDefault();
	}

	function showCtxMenu(id, event, posX, posY, customLabel) {
		var x = 0, y = 0;
		if (event.pageX || event.pageY) {
			x = event.pageX;
			y = event.pageY;
		}
		else if (event.clientX || event.clientY) {
			x = event.clientX + document.body.scrollLeft +	document.documentElement.scrollLeft;
			y = event.clientY + document.body.scrollTop +  document.documentElement.scrollTop;
		}
		else return;
		ctxMenuData.id = id;
		ctxMenuData.value = -1;
		var ctxMenu = ctxMenus[id];
		switch (id) {
		case 'screen':
			var items = ctxMenuItems.screen,
				screenClr = pet2001.video.getColor(),
				isAltCharROM = pet2001.video.isAltCharRom(),
				isNewCharRom = pet2001.video.isNewCharRom(),
				isBusinessKbd = petKeys.isBusinessMode(),
				isJaROM = pet2001.video.isJapaneseCharRom() && !isBusinessKbd,
				isLongPersitence = pet2001.video.isLongPersitence(),
				isUcGfx = (pet2001.dump(pet2001.getIOAddr() + 0x4C) & 2) == 0;
			items.green.setAttribute('disabled', screenClr === 'green');
			items.white.setAttribute('disabled', screenClr === 'white');
			items.ink.setAttribute('disabled', screenClr === 'ink');
			items.charsetBusinessOld.hidden = isJaROM || isNewCharRom || isAltCharROM;
			items.charsetBusinessNew.hidden = isJaROM || !(isNewCharRom || isAltCharROM);
			items.charsetGraphics.hidden = isJaROM;
			items.charsetGraphicsJa.hidden = !isJaROM;
			items.charsetBusinessJa.hidden = !isJaROM;
			items.charsetGraphics.setAttribute('disabled', isUcGfx);
			items.charsetBusinessOld.setAttribute('disabled', !isUcGfx);
			items.charsetBusinessNew.setAttribute('disabled', !isUcGfx);
			items.charsetGraphicsJa.setAttribute('disabled', isUcGfx);
			items.charsetBusinessJa.setAttribute('disabled', !isUcGfx);
			items.newCharRom.setAttribute('disabled', !(isJaROM || isAltCharROM) && isNewCharRom);
			items.oldCharRom.setAttribute('disabled', !(isJaROM || isAltCharROM) && !isNewCharRom);
			items.jaCharRom.setAttribute('disabled', isJaROM);
			items.jaCharRom.hidden = isBusinessKbd;
			items.altCharRom.setAttribute('disabled', isAltCharROM);
			if (isLongPersitence) {
				items.longPersistence.classList.add(UIclasses.screenCtxMenuChecked);
			}
			else {
				items.longPersistence.classList.remove(UIclasses.screenCtxMenuChecked);
			}
			if (proportionalPixels) {
				items.pixelAspectRatio.classList.add(UIclasses.screenCtxMenuChecked);
			}
			else {
				items.pixelAspectRatio.classList.remove(UIclasses.screenCtxMenuChecked);
			}
			items.paste.setAttribute('disabled', !isInteractive() || petKeys.busy());
			break;
		case 'dirItem':
			var target = event.target || this;
			while (target && target.nodeName !== 'LI') target = target.parentNode;
			if (target) {
				var cbx = target.querySelector('input');
				if (cbx) {
					ctxMenuData.value = parseInt(cbx.value, 10);
					var itemFileType = target.getElementsByClassName(UIclasses.directoryListFileType);
					ctxMenuItems.dirItem.load.setAttribute('disabled', itemFileType && itemFileType[0].textContent !== 'PRG');
				}
				if (isNaN(ctxMenuData.value)) ctxMenuData.value = -1;
			}
			if (ctxMenuData.value < 0) {
				stopEvent(event);
				return;
			}
			ctxMenuItems.dirItem.link.hidden = !mountInfo.fromLibrary;
			break;
		case 'fileLabel':
			var items = ctxMenuItems.fileLabel,
				empty = document.getElementById(UIids.fileLabel).innerHTML == UIstrings.fileNone;
			if (mountInfo.type === 'ASM' && !asmStore) empty = true;
			items.mountPointReload.hidden = empty;
			items.mountPointReloadNoRun.hidden = (empty || (mountInfo.type==='ASM' && asmStore));
			items.separator.hidden = empty;
			items.mountPointReset.hidden = empty;
			items.mountPointMount.hidden = !empty;
			break;
		case 'joystick':
			var encId = joystickEncoding.id,
				items = ctxMenuItems.joystick,
				found = false;
			for (var iid in items) {
				if (iid === 'settings' || iid === 'other') continue;
				var item = items[iid],
					value = item.getAttribute('data-value');
				var selected = value === encId;
				item.setAttribute('disabled', selected);
				if (selected) found = true;
			}
			items.other.hidden = found;
			items.other.previousSibling.hidden = found;
			break;
		case 'sound':
			var items = ctxMenuItems.sound,
				soundOn = document.getElementById(UIids.soundCbxOnOff).checked;
			items.on.setAttribute('disabled', soundOn);
			items.off.setAttribute('disabled', !soundOn);
			break;
		case 'keyboard':
			if (event.buttons !== 2) { event.preventDefault(); return; }
			ctxMenuItems.keyboard.paste.setAttribute('disabled', !isInteractive() || petKeys.busy());
			if (event.stopImmediatePropagation) event.stopImmediatePropagation();
			break;
		case 'clickCursor':
			var items = ctxMenuItems.clickCursor,
				clickCursorOn = document.getElementById(UIids.checkboxClickCursor).checked;
			items.on.setAttribute('disabled', clickCursorOn);
			items.off.setAttribute('disabled', !clickCursorOn);
			break;
		case 'keypad':
			var items = ctxMenuItems.keypad;
			items.on.setAttribute('disabled', virtualKeypadActive);
			items.off.setAttribute('disabled', !virtualKeypadActive);
			break;
		case 'debugValue':
			x = posX - 2;
			y = posY + 6;
			ctxMenuItems.debugValue.edit.innerHTML = customLabel || 'Edit';
			break;
		}
		y = Math.max(0, y - 24);
		ctxMenu.style.left = (x + 1) + 'px';
		ctxMenu.style.top = y + 'px';
		document.body.appendChild(ctxMenuShield);
		document.body.appendChild(ctxMenu);
		var rect = ctxMenu.getBoundingClientRect(),
			w = rect.width,
			h = rect.height,
			maxx = window.innerWidth + window.scrollX + 20,
			maxy = window.innerHeight + window.scrollY - 24;
		if (x + w > maxx && x - w > 0) ctxMenu.style.left = (x - w - 1) + 'px';
		if (y + h >= maxy) ctxMenu.style.top = Math.max(0, maxy - h) + 'px';
		window.addEventListener('click', ctxMenuHandler, false);
		event.preventDefault();
		event.returnValue = false;
		ctxScrollLock(true);
	}

	function hideCtxMenu(event) {
		ctxScrollLock(false);
		window.removeEventListener('click', ctxMenuHandler, false);
		var menu = ctxMenus[ctxMenuData.id];
		if (menu) {
			if (menu.parentNode) menu.parentNode.removeChild(menu);
			if (ctxMenuShield.parentNode) ctxMenuShield.parentNode.removeChild(ctxMenuShield);
			stopEvent(event);
			ctxMenuData.id = '';
			ctxMenuData.value = -1;
		}
		return false;
	}

	function ctxMenuHandler(event) {
		var target = event.target || this,
			menu = ctxMenus[ctxMenuData.id],
			task = target.nodeType === 1 && target.nodeName === 'LI' &&
			menu.contains(target) && target.getAttribute('data-task'),
			value = ctxMenuData.value;
		if (target.nodeType === 1 && target.nodeName === 'LI' &&
			menu.contains(target) && target.getAttribute('disabled') === 'true') return;
		hideCtxMenu(event);
		if (task) {
			switch (task) {
				case 'screen-copy':
					clipboardCopy(getScreenText());
					break;
				case 'screen-paste':
					clipboardPaste(event); break;
					break;
				case 'screen-as-img':
					showScreenshot(true); break;
				case 'screen-as-text':
					showTextExport('Screen Text (Unicode)', getScreenText(), '', false, true); break;
				case 'screen-as-hex':
					showTextExport('Screen Memory', getScreenHexDump()); break;
				case 'screen-as-basic':
					exportScreenAsProgram(); break;
				case 'screen-as-hardcopy':
					showHardCopy(); break;
				case 'switch-characterset':
					switchCharacterSet(); break;
				case 'characterset-business':
				case 'characterset-graphics':
					var addr = pet2001.getIOAddr() + 0x4C,
						val = pet2001.dump(addr),
						newVal = task == 'characterset-business'? val | 2:val & 253;
					pet2001.write(addr, newVal);
					break;
				case 'screen-green':
				case 'screen-white':
				case 'screen-ink':
					var clr = task.replace('screen-', '');
					pet2001.video.setColor(clr);
					adjustSelect(UIids.selectScreenColor, clr);
					break;
				case 'screen-char_rom-old':
					pet2001.setCharsetVersion('OLD', true);
					break;
				case 'screen-char_rom-new':
					pet2001.setCharsetVersion('NEW', true);
					break;
				case 'screen-char_rom-ja':
					pet2001.setCharsetVersion('JA', true);
					break;
				case 'screen-char_rom-alt':
					pet2001.setCharsetVersion('ALT', true);
					break;
				case 'screen-persistence':
					pet2001.video.useLongPersitence(!pet2001.video.isLongPersitence());
					break;
				case 'screen-pixelaspectratio':
					setPixelAspectRatio(!proportionalPixels);
					break;
				case 'fileLabel-resetData':
					resetLoadData();
					break;
				case 'fileLabel-reloadData':
				case 'fileLabel-reloadData-noRun':
					activateMountedMedia(true, task === 'fileLabel-reloadData-noRun');
					break;
				case 'fileLabel-mount':
					showMountDialog();
					break;
				case 'dirItem-extractFile':
					if (value >= 0) extractFromMountedMedia(value);
					break;
				case 'dirItem-loadFile':
					if (value >= 0) dirListItemCtxMenuLoadCallback(value);
					break;
				case 'dirItem-link':
					if (value >= 0) showLinkForDirItem(value);
					break;
				case 'joystick':
					var value = target.getAttribute('data-value');
					if (value && value !== 'OTHER') setJoystickEncoding(value);
					if (value && value == 'CUSTOM') showCustomJoystickDialog();
					break;
				case 'joystick-settings':
					openJoystickDialog();
					break;
				case 'sound-on':
				case 'sound-off':
					document.getElementById(UIids.soundCbxOnOff).checked = task === 'sound-on';
					soundToggleHandler();
					break;
				case 'keyboard-paste':
					clipboardPaste(event); break;
					break;
				case 'click-cursor-on':
				case 'click-cursor-off':
					var checked = task === 'click-cursor-on';
					document.getElementById(UIids.checkboxClickCursor).checked = checked;
					observeScreenClicks(checked);
					break;
				case 'click-cursor-help':
					showInfoDialog('About the Click-Cursor','Set the cursor position by simply tapping or clicking the screen.\n(Input modes like RVS and insert are reset on each click.)\n\nWhile this is helpful for editing, it is strongly recommended to deactivate this option while running programs, as this may interfere with INPUT statements and other prompts with an active cursor.');
					break;
				case 'keypad-on':
				case 'keypad-off':
					toggleVirtualKeypad();
					break;
				case 'keypad-help':
					showInfoDialog('About the Virtual Keypad','This allows you to use the PETs numeric keypad on a computer without a numeric kepad.\n\nWhen active, in Games Mode and with CAPS-LOCK engaged, the keys 7, 8, 9, and below will be mapped to the PET\'s keypad.\n(Use CAPS-LOCK to toggle this mapping on and off. You may also disable this momentarily by holding down SHIFT.)', false, false, null, ' 7   8   9          7 8 9\n  U   I   P         4 5 6\n   J   K   L   ->   1 2 3\n    M               0');
					break;
				case 'prglib-open':
				case 'prglib-open-new':
					showPrgLibrary(task === 'prglib-open-new');
					break;
				case 'debug-value':
					$debugger.ctxEditValue();
					break;
			}
		}
		return false;
	}

	function ctxScrollHandler(event) {
		event.preventDefault();
		event.stopPropagation();
		window.scrollTo(ctxMenuData.scrollX, ctxMenuData.scollY);
		event.returnValue = false;
		return false;
	}

	function ctxScrollLock(enable) {
		if (enable) {
			ctxMenuData.scrollX = window.scrollX;
			ctxMenuData.scrollY = window.scrollY;
			window.addEventListener('scroll', ctxScrollHandler, false);
			window.addEventListener('mousewheel', ctxScrollHandler, false);
		}
		else {
			window.removeEventListener('scroll', ctxScrollHandler);
			window.removeEventListener('mousewheel', ctxScrollHandler);
		}
	}

	function clipboardCopy(text) {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text);
		}
		else {
			showTextExport('Screen Text (Unicode)', text, '', false, true);
		}
	}

	// paste

	function clipboardPaste(event) {
		if (event) event.preventDefault();
		if (!isInteractive() || petKeys.busy()) return;
		if (navigator.clipboard && navigator.clipboard.readText) {
			navigator.clipboard.readText().then(function(text) {
				autoType(text, null, true);
			});
		}
		else {
			showTextImport(UIstrings.pasteTitle, '', function(text) { autoType(text, null, true); });
		}
	}

	function systemPasteListener(event) {
		if (popupActive || !isInteractive() || petKeys.busy()) return;
		if (event) {
			event.preventDefault();
			event.returnValue = false;
			if (event.clipboardData && event.clipboardData.getData) {
				var text = event.clipboardData.getData('text');
				if (text && confirm(UIstrings.pasteConfirm)) autoType(text, null, true);
			}
		}
	}

	// gamepads & joysticks

	var GamepadManager = new function() {
		var hasGPEvent=(typeof window.GamepadEvent !== 'undefined'),
			hasGetGamepads=Boolean(typeof navigator.getGamepads == 'function'
				|| typeof navigator.webkitGetGamepads == 'function'),
			enabled=true,
			THRSH_BTN=0.9,
			THRSH_AXS=0.65,
			states = [];

		function gamepadConnect(event) {
			//if (event.gamepad) controllers[event.gamepad.index]=event.gamepad;
		}
		function gamepadDisconnect(event) {
			/*
			try {
				if (event.gamepad) delete controllers[event.gamepad.index];
			}
			catch(e) {
				console.log('Error on attempt to disconnect a gamepad:', e);
			}
			*/
		}
		function readGamepads() {
			if (!enabled) return null;
			var gamepads, indices, idx, gp, i, l, ret, controllers;
			if (!hasGetGamepads) return null;
			gamepads=(navigator.getGamepads)? navigator.getGamepads():navigator.webkitGetGamepads();
			if (!gamepads || !gamepads.length) return null;
			indices=[]; controllers={};
			for (i=0, l=gamepads.length; i<l && indices.length<2; i++) {
				gp=gamepads[i];
				if (gp && gp.connected!==false) {
					idx=gp.index;
					controllers[idx]=gp;
					indices.push(idx);
				}
			}
			if (!indices.length) return null;
			indices.sort();
			ret=[];
			for (i=0, l=(indices.length>2)? 2:indices.length; i<l; i++) {
				var c=controllers[indices[i]],
					b=c.buttons, a=c.axes,
					readings, s=states[i],
					d=(c.mapping!='standard' || c.axes.length==5)?1:0;
				if (!b || !a) continue;
				if (!s) s = states[i] = {
					up: false, down: false, left: false, right: false, fire: false,
					a: false, b: false, x: false, y: false,
					l: false, r: false, start: false, select: false
				};
				readings= {
					fire:  getButton(b[0]) || getButton(b[1]) || getButton(b[2]) || getButton(b[3]),
					left:  getButton(b[14]) || getAxis(-a[d]) || getAxis(-a[d+2]),
					right: getButton(b[15]) || getAxis(a[d]) || getAxis(a[d+2]),
					up:    getButton(b[12]) || getAxis(-a[d+1]) || getAxis(-a[d+3]),
					down:  getButton(b[13]) || getAxis(a[d+1]) || getAxis(a[d+3]),
					b: getButton(b[0]),
					a: getButton(b[1]),
					y: getButton(b[2]),
					x: getButton(b[3]),
					l: getButton(b[4]) || getButton(b[6]),
					r: getButton(b[5]) || getButton(b[7]),
					select: getButton(b[8]),
					start: getButton(b[9])
				}
				// inhibit left-right button overlap
				if (readings.left && !s.left && readings.right) {
					readings.left = true;
					readings.right = false;
				}
				else if (readings.right && !s.right && readings.left) {
					readings.right = true;
					readings.left = false;
				}
				for (var p in readings) s[p]=readings[p];
				ret.push(readings);
			}
			return ret;
		}
		function getButton(b) {
			return typeof b === 'object'? b.pressed || b.value>=THRSH_BTN:b>=THRSH_BTN;
		}
		function getAxis(a) {
			return a>=THRSH_AXS;
		}
		function supported() {
			return hasGetGamepads;
		}
		function enable(flag) {
			enabled=!!flag;
		}
		function isEnabled() {
			return enabled;
		}
		function reset() {
			states.length = 0;
		}
		if (hasGPEvent) {
			window.addEventListener('gamepadconnected', gamepadConnect, false);
			window.addEventListener('gamepaddisconnected', gamepadDisconnect, false);
		}
		return {
			read: readGamepads,
			supported: supported,
			enable: enable,
			isEnabled: isEnabled,
			reset: reset
		};
	};

	var joystickEncoding = (function() {
		var PA0=0x01, PA1=0x02, PA2=0x04, PA3=0x08, PA4=0x10, PA5=0x20, PA6=0x40, PA7=0x80, NA=0,
			encodings = {
				SIMPLE: {
					'left':   PA0,
					'right':  PA1,
					'fire':   PA5,
					'id': 'SIMPLE',
					'label': 'SIMPLE',
					'isBidirectional': true
				},
				PET: {
					'up':     PA0,
					'down':   PA1,
					'left':   PA2,
					'right':  PA3,
					'fire':   PA0 | PA1,
					'up2':    PA4,
					'down2':  PA5,
					'left2':  PA6,
					'right2': PA7,
					'fire2':  PA4 | PA5,
					'id': 'PET',
					'label': 'PET / Joe Travis'
				},
				PET_SWAPPED: {
					'up2':     PA0,
					'down2':   PA1,
					'left2':   PA2,
					'righ2t':  PA3,
					'fire2':   PA0 | PA1,
					'up':    PA4,
					'down':  PA5,
					'left':  PA6,
					'right': PA7,
					'fire':  PA4 | PA5,
					'id': 'PET_SWAPPED',
					'label': 'PET-SWAPPED'
				},
				CGA: {
					'up':     PA0,
					'down':   PA1,
					'left':   PA2,
					'right':  PA3,
					'fire':   PA4,
					'id': 'CGA',
					'label': 'CGA'
				},
				C64DTV: {
					'up':     PA0,
					'down':   PA1,
					'left':   PA2,
					'right':  PA3,
					'fire':   PA4,
					'id': 'C64DTV',
					'label': 'C64DTV HUMMER'
				},
				VIC20: {
					'fire':   PA3,
					'right':  PA4,
					'left':   PA5,
					'down':   PA6,
					'up':     PA7,
					'id': 'VIC20',
					'label': 'VIC-20'
				},
				STUPIDPETTRICKS: {
					'left':   PA0,
					'right':  PA1,
					'up':     PA2,
					'down':   PA3,
					'fire':   PA2 | PA3,
					'left2':  PA4,
					'right2': PA5,
					'up2':    PA6,
					'down2':  PA7,
					'fire2':  PA6 | PA7,
					'id': 'STUPIDPETTRICKS',
					'label': 'STUPID PET TRICKS'
				},
				STUPIDPETTRICKS_SWAPPED: {
					'left2':   PA0,
					'right2':  PA1,
					'up2':     PA2,
					'down2':   PA3,
					'fire2':   PA2 | PA3,
					'left':  PA4,
					'right': PA5,
					'up':    PA6,
					'down':  PA7,
					'fire':  PA6 | PA7,
					'id': 'STUPIDPETTRICKS_SWAPPED',
					'label': 'STUPID PET TRICKS – SWAPPED'
				},
				CHUCK_JOHNSON: { //Compute Issue 4, May/June 1980
					'right':  PA0,
					'left':   PA1,
					'down':   PA2,
					'up':     PA3,
					'fire':   PA2 | PA3,
					'right2': PA4,
					'left2':  PA5,
					'down2':  PA6,
					'up2':    PA7,
					'fire2':  PA6 | PA7,
					'id': 'CHUCK_JOHNSON',
					'label': 'COMPUTE / C. Johnson'
				},
				CHUCK_JOHNSON_SWAPPED: {
					'right2':  PA0,
					'left2':   PA1,
					'down2':   PA2,
					'up2':     PA3,
					'fire2':   PA2 | PA3,
					'right': PA4,
					'left':  PA5,
					'down':  PA6,
					'up':    PA7,
					'fire':  PA6 | PA7,
					'id': 'CHUCK_JOHNSON_SWAPPED',
					'label': 'COMPUTE / C. Johnson – SWAPPED'
				},
				GALAGA: {
					'left':   PA3,
					'right':  PA4,
					'down':   PA2,
					'up':     PA1,
					'fire':   PA0,
					'id': 'GALAGA',
					'label': 'GALAGA / H. Wening'
				},
				SCRAMBLE: {
					'up':     PA0,
					'right':  PA1,
					'down':   PA2,
					'left':   PA3,
					'fire':   PA5,
					'id': 'SCRAMBLE',
					'label': 'SCRAMBLE / A. Jentzen'
				},
				SNES: {
					'b':      0x001,
					'y':      0x002,
					'select': 0x004,
					'start':  0x008,
					'up':     0x010,
					'down':   0x020,
					'left':   0x040,
					'right':  0x080,
					'a':      0x100,
					'x':      0x200,
					'l':      0x400,
					'r':      0x800,
					'id': 'SNES',
					'label': 'TexElec SNES Serial Adapter',
					'note': 'SNES controller polled via serial protocol.\n\nUser port F (PA3) ..... Clock\nUser port J (PA5) ..... Latch\nUser port K (PA6) ..... Data',
					'isSerial': true
				},
				KEYBOARD_A: {
					'id': 'KEYBOARD_A',
					'label': 'JOYSTICK TO KEYBOARD - A',
					'sendToKbd': true,
					'buttonChar': 0x41
				},
				KEYBOARD_SHIFT: {
					'id': 'KEYBOARD_SHIFT',
					'label': 'JOYSTICK TO KEYBOARD - SHIFT',
					'sendToKbd': true,
					'buttonChar': 1
				},
				KEYBOARD_SPACE: {
					'id': 'KEYBOARD_SPACE',
					'label': 'JOYSTICK TO KEYBOARD - SPACE',
					'sendToKbd': true,
					'buttonChar': 0x20
				},
				CUSTOM: {
					'id': 'CUSTOM',
					'label': 'CUSTOM KEYBOARD MAPPING',
					'sendToKbd': true,
					'buttonChar': 0x20,
					'mappings': {
						'left': 0x34,
						'right': 0x36,
						'up': 0x38,
						'down': 0x32,
						'fire': 0x20
					}
				},
				IGNORE: {
					'id': 'IGNORE',
					'label': 'IGNORE',
					'ignore': true
				}
			},
			proto = {
				'fire':   NA,
				'right':  NA,
				'left':   NA,
				'down':   NA,
				'up':     NA,
				'up2':    NA,
				'down2':  NA,
				'left2':  NA,
				'right2': NA,
				'fire2':  NA,
				'a':      NA,
				'b':      NA,
				'x':      NA,
				'y':      NA,
				'l':      NA,
				'r':      NA,
				'select': NA,
				'start':  NA,
				'id': '',
				'ignore': false,
				'sendToKbd': false,
				'buttonChar': 0,
				'isSerial': false,
				'isBidirectional': false,
				'mappings': null
			},
			externalObj = {};

		encodings.DUAL = encodings.PET;
		encodings.COMPUTE = encodings.CHUCK_JOHNSON;
		encodings.WENING = encodings.GALAGA;
		encodings.JENTZEN = encodings.SCRAMBLE;
		encodings.DEFAULT = encodings.IGNORE;
		encodings.HUMMER = encodings.C64DTV;
		encodings.TEXELEC = encodings.SNES;
		encodings.KEYBOARD = encodings.KEYBOARD_A;
		encodings.KEYBOARD_SPC = encodings.KEYBOARD_SPACE;

		function setEncoding(tag) {
			tag = String(tag).toUpperCase();
			var enc = encodings[tag] || encodings.DEFAULT;
			for (var p in proto) externalObj[p] = enc[p] || proto[p];
		}

		function getInfoFor(tag) {
			function getPAString(d8) {
				var s = '', s2 = '';
				for (var i = 0; i < 8; i++) {
					if (d8 & (1 << i)) {
						s += (s? '+':'') + 'PA' + i;
						s2 += (s2? '+':'') + up[i];
					}
				}
				if (s) s += ' (' + s2 + ')';
				return s;
			}
			var pa = {0x01:'PA0', 0x02:'PA1', 0x04:'PA2', 0x08:'PA3', 0x10:'PA4', 0x20:'PA5', 0x40:'PA6', 0x80:'PA7'},
				up = ['C','D','E','F','H','J','K','L'],
				enc = encodings[tag];
			if (!enc) return;
			if (enc.note) {
				return {
					'title': 'Joystick Adapter Type "' + enc.label + '"',
					'info': enc.note
				};
			}
			var out = '',
				props = [
					['Player 1  Left', 'left'],
					['Player 1  Right', 'right'],
					['Player 1  Up', 'up'],
					['Player 1  Down', 'down'],
					['Player 1  Fire', 'fire'],
					['Player 2  Left', 'left2'],
					['Player 2  Right', 'right2'],
					['Player 2  Up', 'up2'],
					['Player 2  Down', 'down2'],
					['Player 2  Fire', 'fire2']
				],
				u=[];
			for (var i = 0; i < props.length; i++) {
				var p = props[i], val = enc[p[1]] || 0;
				if (val) {
					var s = p[0];
					while (s.length < 16) s += ' ';
					while (s.length < 26) s += '.';
					if (out) out += '\n';
					out += s + ' ' + getPAString(val);
				}
			}
			out += '\n\n\nC–L: Pins at PET user port, signal active low.\n';
			return {
				'title': 'Joystick Adapter Type "' + enc.label + '",  Port A (User Port)',
				'info': out
			};
		}
		
		setEncoding('IGNORE');
		externalObj.setEncoding = setEncoding;
		externalObj.getInfoFor = getInfoFor;
		externalObj.getCustomMappings = function() { return encodings.CUSTOM.mappings; };
		return externalObj;

	})();

	var kbdJoystick = (function() {
		var isActive = false,
			state = {
			'up': false, 'down': false, 'left': false, 'right': false, 'fire': false,
			'a': false, 'b': false, 'x': false, 'y': false, 'l': false, 'r': false
		};

		function setKbdJoystick(tag, flag) {
			if (joystickEncoding.ignore) return false;
			if (joystickEncoding.isBidirectional && tag == 'up') tag='fire';
			else if (joystickEncoding.isSerial && tag == 'fire') tag='b';
			state[tag] = flag;
			setActivity();
			return true;
		}
		function setActivity(active) {
			var active = state.left || state.right || state.up || state.down || state.b || state.fire;
			if (active != isActive) {
				isActive = active;
				var el = document.getElementById(UIids.kbdJoystickIndicator);
				if (el) el.className = active? 'active':'';
			}
		}
		function resetKbdJoystick() {
			state.up = false;
			state.down = false;
			state.left = false;
			state.right = false;
			state.fire = false;
			state.b = false;
			if (pet2001 && joystickEncoding.sendToKbd) petKeys.joystickInputReset();
			setActivity();
		}

		state.setState = setKbdJoystick;
		state.reset = resetKbdJoystick;
		return state;
	})();

	function setJoystickEncoding(tag) {
		if (pet2001 && joystickEncoding.sendToKbd) petKeys.joystickInputReset();
		joystickEncoding.setEncoding(tag);
		if (pet2001) {
			if (!joystickEncoding.sendToKbd) pet2001.write(pet2001.getIOAddr()+0x4f, 0xff); //reset PA
			pet2001.resetSNESAdapter();
		}
		kbdJoystick.reset();
		GamepadManager.reset();
		var icon = document.getElementById(UIids.iconJoystick);
		if (icon) {
			if (joystickEncoding.ignore) icon.classList.remove('active');
			else icon.classList.add('active');
		}
	}
	function readJoystick() {
		if (joystickEncoding.ignore) return;
		var readings = GamepadManager.read(),
			j = readings && readings.length? readings[0]:kbdJoystick;
		if (joystickEncoding.isSerial) {
			var d16 = 0xffff;
			if (j.left)   d16 ^= joystickEncoding.left;
			if (j.right)  d16 ^= joystickEncoding.right;
			if (j.up)     d16 ^= joystickEncoding.up;
			if (j.down)   d16 ^= joystickEncoding.down;
			if (j.a)      d16 ^= joystickEncoding.a;
			if (j.b)      d16 ^= joystickEncoding.b;
			if (j.x)      d16 ^= joystickEncoding.x;
			if (j.y)      d16 ^= joystickEncoding.y;
			if (j.l)      d16 ^= joystickEncoding.l;
			if (j.r)      d16 ^= joystickEncoding.r;
			if (j.start)  d16 ^= joystickEncoding.start;
			if (j.select) d16 ^= joystickEncoding.select;
			pet2001.setSNESAdapter(d16);
			return;
		}
		if (joystickEncoding.sendToKbd) {
			petKeys.joystickInput(j, joystickEncoding.buttonChar, joystickEncoding.mappings);
			return;
		}
		var d8 = 0xff;
		if (j.left)  d8 ^= joystickEncoding.left;
		if (j.right) d8 ^= joystickEncoding.right;
		if (j.up)    d8 ^= joystickEncoding.up;
		if (j.down)  d8 ^= joystickEncoding.down;
		if (j.fire)  d8 ^= joystickEncoding.fire;
		if (readings) {
			j = readings.length>1? readings[1]:kbdJoystick;;
			if (j.left)  d8 ^= joystickEncoding.left2;
			if (j.right) d8 ^= joystickEncoding.right2;
			if (j.up)    d8 ^= joystickEncoding.up2;
			if (j.down)  d8 ^= joystickEncoding.down2;
			if (j.fire)  d8 ^= joystickEncoding.fire2;
		}
		pet2001.setDRAin(d8);
	}
	function joystickActive() {
		return !joystickEncoding.ignore;
	}
	function enableJoysticks() {
		GamepadManager.enable(true);
	}
	function getJoystickButtonChar() {
		return joystickEncoding.buttonChar;
	}
	function virtualJoystickReset() {
		kbdJoystick.reset();
		GamepadManager.reset();
	}

	function openJoystickDialog() {
		var form = document.getElementById(UIids.formJoystick),
			el = document.getElementById(UIids.dialogJoystick);
		if (el && form) {
			form.elements.joystick.value = joystickEncoding.id;
			prepareForPopup();
			el.hidden = false;
			enableJoystickDialogKeyHandler(true);
		}
	}
	function closeJoystickDialog(flag) {
		var form = document.getElementById(UIids.formJoystick),
			el = document.getElementById(UIids.dialogJoystick);
		if (flag) setJoystickEncoding(form.elements.joystick.value);
		enableJoystickDialogKeyHandler(false);
		el.hidden = true;
		resumeFromPopup();
	}

	function showJoystickInfo(tag) {
		var info = joystickEncoding.getInfoFor(tag);
		if (info) {
			enableJoystickDialogKeyHandler(false);
			showInfoDialog(info.title, info.info, true, false, function() {
				enableJoystickDialogKeyHandler(true);
			});
		}
	}

	function joystickDialogKeyHandler(event) {
		if (event.metaKey || event.ctrlKey) return true;
		var code = event.charCode != 0 ? event.charCode : event.keyCode;
		if (code == 13 || code == 27) {
			closeJoystickDialog(code == 13);
			stopEvent(event);
		}
	}

	function enableJoystickDialogKeyHandler(flag) {
		if (flag) {
			window.addEventListener('keydown', joystickDialogKeyHandler, true);
		}
		else {
			window.removeEventListener('keydown', joystickDialogKeyHandler, true);
		}
	}

	function showCustomJoystickDialog() {
		var dialog = document.getElementById('joystickCustomDialog'),
			jstkDialog = document.getElementById(UIids.dialogJoystick);
		if (jstkDialog && !jstkDialog.hidden) enableJoystickDialogKeyHandler(false);
		adjustJoystickCustomDialogOptions();
		prepareForPopup();
		dialog.hidden = false;
	}

	function closeJoystickCustomDialog(ok) {
		var dialog = document.getElementById('joystickCustomDialog');
		dialog.hidden = true;
		resumeFromPopup();
		if (ok) {
			var select = document.getElementById('jstckcfButtonSelect'),
				up = document.getElementById('jstckcfUp').value.toLowerCase(),
				down = document.getElementById('jstckcfDown').value.toLowerCase(),
				left = document.getElementById('jstckcfLeft').value.toLowerCase(),
				right = document.getElementById('jstckcfRight').value.toLowerCase(),
				buttonValue = select.options[select.selectedIndex].value,
				buttonCode;
			if (buttonValue == 'char') {
				var c = document.getElementById('jstckcfButtonChar').value.toUpperCase();
				if (c) buttonCode = c.charCodeAt(0);
				if (!buttonCode || buttonCode < 32 || buttonCode > 126) buttonCode = -1;
			}
			else {
				buttonCode = parseInt(buttonValue);
			}
			var mappings = joystickEncoding.getCustomMappings(),
				c = up.charCodeAt(0);
			mappings.up = isNaN(c) || c < 32 || c > 126? -1:c;
			c = down.charCodeAt(0);
			mappings.down = isNaN(c) || c < 32 || c > 126? -1:c;
			c = left.charCodeAt(0);
			mappings.left = isNaN(c) || c < 32 || c > 126? -1:c;
			c = right.charCodeAt(0);
			mappings.right = isNaN(c) || c < 32 || c > 126? -1:c;
			mappings.fire = buttonCode;
		}
		var jstkDialog = document.getElementById(UIids.dialogJoystick);
		if (jstkDialog && !jstkDialog.hidden) enableJoystickDialogKeyHandler(true);
	}

	function adjustJoystickCustomDialogOptions() {
		var mappings = joystickEncoding.getCustomMappings(),
			select = document.getElementById('jstckcfButtonSelect'),
			up = document.getElementById('jstckcfUp'),
			down = document.getElementById('jstckcfDown'),
			left = document.getElementById('jstckcfLeft'),
			right = document.getElementById('jstckcfRight'),
			buttonChar = document.getElementById('jstckcfButtonChar'),
			customButton = true;
		var b = mappings.fire < 0? '32': String(mappings.fire);
		for (var i = 1; i < select.options.length; i++) {
			if (select.options[i].value == b) {
				select.selectedIndex = i;
				customButton = false;
				break;
			}
		}
		if (customButton) {
			select.selectedIndex = 0;
			buttonChar.value = String.fromCharCode(mappings.fire).toUpperCase();
			buttonChar.removeAttribute('disabled');
		}
		else {
			buttonChar.value = '';
			buttonChar.setAttribute('disabled', true);
		}
		up.value = mappings.up < 0? '':String.fromCharCode(mappings.up).toUpperCase();
		down.value = mappings.down < 0? '':String.fromCharCode(mappings.down).toUpperCase();
		left.value = mappings.left < 0? '':String.fromCharCode(mappings.left).toUpperCase();
		up.right = mappings.right < 0? '':String.fromCharCode(mappings.right).toUpperCase();
	}
	
	function adjustJoystickCustomButtonChar(interactiveFlag) {
		var select = document.getElementById('jstckcfButtonSelect'),
			input = document.getElementById('jstckcfButtonChar');
		if (select.options[select.selectedIndex].value == 'char') {
			input.removeAttribute('disabled');
			if (interactiveFlag) {
				input.select();
				input.focus();
			}
		}
		else {
			input.setAttribute('disabled', true);
		}
	}

	// virtual keypad

	function toggleVirtualKeypad() {
		virtualKeypadActive = !virtualKeypadActive;
		var icon = document.getElementById(UIids.virtualKeypadBtn);
		if (icon) {
			if (virtualKeypadActive) icon.classList.add('active');
			else icon.classList.remove('active');
		}
		petKeys.enableVirtualKeypad(virtualKeypadActive);
	}

	function showKepadActivity(active) {
		var el = document.getElementById(UIids.keypadIndicator);
		if (el) el.className = active? 'active':'';
	}

	// visibility API  and fullscreen handling

	var visibilityHidden, visibilityChangeEvent, visibilityChangeRunStateFlag;

	function enableVisibilityChangeDetection() {
		if (visibilityHidden) return;
		if (typeof document.hidden!=='undefined') {
			visibilityHidden='hidden';
			visibilityChangeEvent='visibilitychange';
		}
		else if (typeof document.mozHidden!=='undefined') {
			visibilityHidden='mozHidden';
			visibilityChangeEvent='mozvisibilitychange';
		}
		else if (typeof document.msHidden!=='undefined') {
			visibilityHidden='msHidden';
			visibilityChangeEvent='msvisibilitychange';
		}
		else if (typeof document.webkitHidden!=='undefined') {
			visibilityHidden='webkitHidden';
			visibilityChangeEvent='webkitvisibilitychange';
		}
		if (visibilityHidden) document.addEventListener(visibilityChangeEvent, handleVisibilityChange, false);
	}

	function disableVisibilityChangeDetection() {
		if (visibilityHidden) document.removeEventListener(visibilityChangeEvent, handleVisibilityChange);
		visibilityHidden='';
	}

	function handleVisibilityChange() {
		if (document[visibilityHidden]) {
			visibilityChangeRunStateFlag = pause(true, true);
		}
		else {
			if (visibilityChangeRunStateFlag) pause(false, true);
		}
	}

	function observeFullscreen() {
		var el=document.getElementById('fullscreenToggle'),
			etypes= ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'],
			eventtype;

		function setScreenMode(event) {
			var isFullscreen = document.fullscreenElement != null || document.mozFullScreen || document.webkitIsFullScreen;
			if (!isFullscreen && ((window.innerHeight == screen.height) || (window.screenTop == 0 && window.screenY == 0))) {
				el.hidden = true;
			}
			else {
				el.hidden = false;
				el.className=isFullscreen?'fullscreen':'';
			}
			if (event) {
				if (event.preventDefault) event.preventDefault();
				if (event.stopPropagation) event.stopPropagation();
				event.cancelBubble=true;
				event.returnValue=false;
			}
		}

		function toggleFullscreen() {
			if (document.fullscreenElement === undefined && document.mozFullScreen === undefined && document.webkitIsFullScreen === undefined) return;
			var method;
			if (document.fullscreenElement != null || document.mozFullScreen || document.webkitIsFullScreen) {
				method = document.exitFullscreen
					|| document.cancelFullscreen
					|| document.webkitCancelFullScreen
					|| document.mozCancelFullScreen
					|| document.msCancelFullScreen;
				if (method) method.call(document);
			}
			else {
				var el= document.documentElement || document.getElementsByTagName('body')[0];
				method = el.requestFullscreen
					|| el.webkitRequestFullScreen
					|| el.mozRequestFullScreen
					|| el.msRequestFullScreen;
				if (method) method.call(el);
			}
		}

		if (el) {
			for (var i=0; i<etypes.length; i++) {
				var et=etypes[i];
				if (typeof document['on'+et] !== 'undefined') {
					eventtype = et;
					break;
				}
			}
			if (eventtype) {
				document.addEventListener(eventtype, setScreenMode, false);
				window.addEventListener('resize', setScreenMode, false);
				el.addEventListener('click', toggleFullscreen, true);
				setTimeout(setScreenMode, 10);
			}
		}
	}

	// sound controls

	function soundToggleHandler(event) {
		var soundOn = document.getElementById(UIids.soundCbxOnOff).checked,
			range = document.getElementById(UIids.soundVolumeRange),
			volume = parseInt(range.value, 10);
		if (soundOn) {
			if (!volume) range.value = volume = 50;
			pet2001.audio.setVolume(volume / 100);
			setSoundVolumeTrack(volume);
		}
		else {
			pet2001.audio.setVolume(0);
		}
	}

	function soundVolumeHandler(event) {
		var soundCbx = document.getElementById(UIids.soundCbxOnOff),
			range = document.getElementById(UIids.soundVolumeRange),
			volume = parseInt(range.value, 10);
		if (volume) {
			if (!soundCbx.checked) soundCbx.checked = true;
			pet2001.audio.setVolume(volume / 100);
		}
		else {
			pet2001.audio.setVolume(0);
			soundCbx.checked = false;
		}
		setSoundVolumeTrack(volume);
	}
	var soundVolumeCSS = null;
	function setSoundVolumeTrack(v) {
		// set active track for Chromium & Safari/Webkit
		if (soundVolumeCSS || typeof CSSStyleSheet !== 'undefined') {
			if (!soundVolumeCSS) {
				soundVolumeCSS = new CSSStyleSheet();
				document.adoptedStyleSheets = [soundVolumeCSS];
			}
			if (soundVolumeCSS) {
				soundVolumeCSS.replaceSync('input#soundCbxOnOff:checked ~ input[type="range"]::-webkit-slider-runnable-track { background: linear-gradient(to right, rgb(247,149,12) '+v+'%, #D1D1D5 '+v+'%); } body.dark input#soundCbxOnOff:checked ~ input[type="range"]::-webkit-slider-runnable-track { background: linear-gradient(to right, #CA8935 '+v+'%, #535458 '+v+'%); }');
			}
		}
	}

	function soundFxHandler(event) {
		var soundCbx = document.getElementById(UIids.soundCbxOnOff),
			cbxFX = document.getElementById(UIids.soundCbxFX);
		if (soundCbx.checked) {
			pet2001.audio.setFX(cbxFX.checked);
		}
		else {
			cbxFX.checked = !cbxFX.checked;
		}
	}

	function unlockAudio() {
		if (pet2001.audio) pet2001.audio.unlock();
	}

var ThemeManager = (function() {
	var defaultColorScheme='light',
		userColorScheme='',
		hasStorage=false,
		hasLocalStorage = typeof window.localStorage !== 'undefined',
		storageId='pet2001Config',
		basePath = '/pet/';
	
	function setColorScheme(scheme) {
		var other = scheme === 'dark'? 'light':'dark';
		document.body.classList.remove(other);
		document.body.classList.add(scheme);
		document.getElementById('viewModeDark').setAttribute('aria-selected',scheme=='dark');
		document.getElementById('viewModeLight').setAttribute('aria-selected',scheme!='dark');
	}
	
	function setDarkMode(v) {
		userColorScheme = v? 'dark':'light';
		setColorScheme(userColorScheme);
		storageWrite();
	}
	
	//storage
	function storageRead() {
		function extract(s) {
			var rows=decodeURIComponent(s).split(',');
			for (var j=0; j<rows.length; j++) {
				var cols=rows[j].split(':');
				if (cols[0]=='theme') {
					userColorScheme = cols[1].toLowerCase()=='dark'?'dark':'light';
					hasStorage=true;
					break;
				}
			}
		}
		userColorScheme='';
		if (hasLocalStorage) {
			var s= localStorage.getItem(storageId);
			if (s) extract(s);
		}
		else if (!hasLocalStorage && document.cookie) {
			var	cookies = document.cookie.split(/;\s*/g);
			for (var i=0; i<cookies.length; i++) {
				var parts = cookies[i].split('=');
				if (parts[0]==storageId) {
					extract(parts[1]);
					break;
				}
			}
			if (hasStorage) write(); // update expiration date
		}
	}
	function storageWrite() {
		var q=[];
		q.push('theme:'+userColorScheme);
		if (hasLocalStorage) {
			localStorage.setItem(storageId, encodeURIComponent(q.join(',')));
		}
		else {
			var t=storageId+'='+encodeURIComponent(q.join(',')),
				expires=new Date(),
				path=basePath,
				secure=(location.protocol.indexOf('https')==0)? 'secure=1':'';
			expires.setMilliseconds(expires.getMilliseconds() + 365 * 864e+5);
			t+='; expires='+expires.toUTCString();
			if (path) t+='; path='+path;
			if (secure) t+='; '+secure;
			document.cookie=t;
		}
		hasStorage=true;
	}
	function storageDestroy() {
		if (hasStorage) {
			if (hasLocalStorage) {
				localStorage.removeItem(storageId);
			}
			else {
				var t=storageId+'=; expires=Thu, 01 Jan 1970 00:00:00 GMT',
					path=basePath,
					secure=(location.protocol.indexOf('https')==0)? 'secure=1':'';
				if (path) t+='; path='+path;
				if (secure) t+='; '+secure;
				document.cookie=t;
			}
			hasStorage=false;
		}
		userColorScheme='';
	}

	function initialize() {
		storageRead();
		setColorScheme(userColorScheme || defaultColorScheme);
	}

	return {
		'setDarkMode': setDarkMode,
		'reset': storageDestroy,
		'initialize': initialize
	};
})();


	function toggleDebugger() {
		var active = document.body.classList.contains('debug');
		if (active) document.body.classList.remove('debug');
		else document.body.classList.add('debug');
		enableDebugger(!active);
	}

	function haltAndDebug() {
		if (isRunning()) {
			document.body.classList.add('debug');
			if (!$debugger) debuggerSetup();
			$debugger.halt();
		}
		else {
			pause(false);
		}
	}


	// prg-library

	function showPrgLibrary(asSeparateWindow, fragment) {
		var path = './prgs/';
		if (!asSeparateWindow && typeof petPrgLibVersion === 'string') {
			path += '?v=' + petPrgLibVersion;
		}
		if (fragment && typeof fragment === 'string') path += '#' + fragment.replace(/[^a-z0-9_-]/i, '');
		if (asSeparateWindow) {
			window.open(path);
			return;
		}
		if (!document.getElementById(UIids.help).hidden) toggleHelp();
		var el = document.getElementById(UIids.prgLibrary),
			iframe = document.getElementById(UIids.prgLibraryIframe);
		if (!el || !iframe) return;
		prepareForPopup();
		if (navigator.userAgent.match(/(iPod|iPhone|iPad|iOS)/)) iframe.parentNode.className = 'ios';
		iframe.src = path;
		el.hidden = false;
		if (iframe.focus) iframe.focus();
	}

	function prgLibraryScrollToYiOS(y) {
		var iframe = document.getElementById(UIids.prgLibraryIframe);
		if (iframe) iframe.parentNode.scrollTop = y || 0;
	}

	function hidePrgLibrary() {
		resumeFromPopup();
		document.getElementById(UIids.prgLibrary).hidden = true;
	}

	function loadFromPrgLibrary(params, createHistoryEntry) {
		if (typeof params === 'string') params = parseQuery(params);
		if (!document.getElementById(UIids.prgLibrary).hidden) hidePrgLibrary();
		else if (!document.getElementById(UIids.help).hidden) toggleHelp();
		if (window.scrollTo) window.scrollTo(0,0);
		for (var p in configDefaults) config[p] = configDefaults[p];
		var autorun = parseSetupParams(params, config);
		if (pet2001) {
			if (pet2001.audio && pet2001.audio.isAvailable()) {
				var v = optVal('boolean', params.sound || params.audio);
				if (typeof v !== 'undefined') {
					document.getElementById(UIids.soundCbxOnOff).checked = v;
					soundToggleHandler();
				}
			}
		}
		resetToConfig();
		if (typeof config.PERSISTENCE !== 'undefined') pet2001.video.useLongPersitence(config.PERSISTENCE == 'long');
		waitForCursor(function() {
			parseOptRomParams(params).then(function() {
				var loadedTitle = parsePrgParams(params, autorun);
				if (history.pushState && createHistoryEntry) {
					setTitle(loadedTitle);
					history.pushState({}, document.title);
				}
				else setTitle();
			});
		});
	}

	function showDemoPane(scrollToTop) {
		var help = document.getElementById(UIids.help);
		if (help && !help.hidden) toggleHelp();
		var el = document.getElementById(UIids.demoPane);
		if (scrollToTop) window.scrollTo(0,0);
		prepareForPopup();
		el.hidden = false;
	}

	function hideDemoPane() {
		resumeFromPopup();
		document.getElementById(UIids.demoPane).hidden = true;
	}

	function loadDemo(params) {
		if (typeof params === 'string') params = parseQuery(params.replace(/^.*?\?/, ''));
		hideDemoPane();
		for (var p in configDefaults) config[p] = configDefaults[p];
		var autorun = parseSetupParams(params, config);
		if (pet2001) {
			if (pet2001.audio && pet2001.audio.isAvailable() && typeof config.AUDIO !== 'undefined') {
				document.getElementById(UIids.soundCbxOnOff).checked = config.AUDIO;
				soundToggleHandler();
				if (config.AUDIO) pet2001.audio.resume();
			}
		}
		resetToConfig();
		if (typeof config.PERSISTENCE !== 'undefined') pet2001.video.useLongPersitence(config.PERSISTENCE == 'long');
		waitForCursor(function() {
			parsePrgParams(params, autorun);
			setTitle();
		});
	}

	function toggleElement(id) {
	   var el = document.getElementById(id),
			className;
	   if (id === 'imgOverlay' &&  el.hidden && petKeys) {
			if (petKeys.isBusinessMode()) className='business';
			else if (pet2001.getRomVers()==4) className='pet2001n';
			else className='';
	   		el.className = className;
	   }
	   el.hidden = !el.hidden;
	}

	function setHeaderIcon() {
		var el = document.getElementById('petImg'),
			className;
		console.log(pet2001.getRomVers());
		if (el) {
			if (petKeys.isBusinessMode()) className='business';
			else if (pet2001.getRomVers()==4) className='pet2001n';
			else className='';
			el.className=className;
		}
	}

	// params and setup handling

	function historyPopStateHandler(event) {
		loadFromPrgLibrary(getQuery(), false);
	}

	function setTitle(subtitle) {
		var t = String(document.title).replace(/ \(.+/, '');
		if (subtitle) {
			subtitle = subtitle.replace(/\.(?:prg|pet|te?xt|bas?|qb(as?)?|p[0-9]+)$/, '');
			if (subtitle) t += ' (' + subtitle + ')';
		}
		document.title = t;
	}

	function getQuery() {
		if (window.location.search.length > 1)	return parseQuery(window.location.search);
		if (window.location.hash.length > 1) return parseQuery(window.location.hash);
		return null;
	}

	function parseQuery(query) {
		if (!query) return {};
		var params = {},
			args = query.replace(/^[\?#]/, '').split('&');
		for (var i = 0; i < args.length; i++) {
			var arg = args[i],
				matches = (/^[?&]help(?:[\/:=-](\w+))?/).exec(query);
			if (matches) {
				params.help = matches[1];
			}
			else {
				var parts = /^(.+?)=(.*)$/.exec(arg),
					key = decodeURIComponent((parts? parts[1]:arg).replace(/[^a-zA-Z0-9_]/g,'')).toLowerCase(),
					value = '';
				if (!key) continue;
				if (parts && parts[2]) {
					var raw = /^(?:data|exec(?:ute)?)$/.test(key)? parts[2]:parts[2].replace(/\+/g, ' ');
					try {
						// try to resolve any double encodings of '%'
						value = decodeURIComponent(raw.replace(/%25([0-9A-F]{2})/g, '%$2'));
					}
					catch(e) {
						try {
							value = decodeURIComponent(raw);
						}
						catch(e2) {
							console.warn('PET 2001: ignoring malformed URI parameter "'+parts[2]+'" for key "'+key+'".\n(Reason: '+e2.message+'.)');
							continue;
						}
					}
				}
				params[key] = value;
			}
		}
		return params;
	}

	var optVal = (function () {
		var values = {
			'boolean': {
				'true': true,
				'on': true,
				'yes': true,
				'y': true,
				'1': true,
				'false': false,
				'off': false,
				'no': false,
				'n': false,
				'0': false
			},
			'screenColors': {
				'green': 'green',
				'white': 'white',
				'blue': 'white',
				'ink': 'ink',
				'e-ink': 'ink'
			},
			'ram': {
				'8': 8*1024,
				'16': 16*1024,
				'32': 32*1024
			},
			'rom': {
				'1': '1',
				'1.0': '1',
				'old': '1',
				'2': '2',
				'2.0': '2',
				'new': '2',
				'3': '2',
				'3.0': '2',
				'4': '4',
				'4.0': '4',
				'4b': '4b',
				'4.0b': '4b',
				'4business': '4b',
				'4.0business': '4b',
				'2b': '2b',
				'2.0b': '2b',
				'2business': '2b',
				'2.0business': '2b'
			},
			'kbd': {
				'repeat': true,
				'edit': true,
				'editing': true,
				'norepeat': false,
				'games': false,
				'gaming': false
			},
			'slimPixels': {
				'0.9': true,
				'0.91': true,
				'0.912': true,
				'.9': true,
				'.91': true,
				'.912': true,
				'1.1': true,
				'tall': true,
				'slim': true,
				'1.0': false,
				'square': false,
				'ntsc': false
			},
			'persistence': {
				'long': 'long',
				'hot': 'long',
				'normal': 'normal',
				'short': 'normal'
			},
			'charrom': {
				'old': 'OLD',
				'roman': 'OLD',
				'oldroman': 'OLD',
				'1': 'OLD',
				'new': 'NEW',
				'newroman': 'NEW',
				'2': 'NEW',
				'ja': 'JA',
				'jap': 'JA',
				'jp': 'JA',
				'jpn': 'JA',
				'japan': 'JA',
				'japanese': 'JA',
				'kanji': 'JA',
				'kana': 'JA',
				'katakana': 'JA',
				'ni': 'JA',
				'nippon': 'JA',
				'3': 'JA',
				'computer': 'ALT',
				'comp': 'ALT',
				'ocr': 'ALT',
				'micr': 'ALT',
				'alternative': 'ALT',
				'alt': 'ALT',
				'fancy': 'ALT'
			}
		};
		return function(mode, val) {
			if (mode === 'ram') val = ''+parseInt(val,10);
			return values[mode][(val || '').replace(/ /g, '').toLowerCase()];
		};
	})();

	// check url parameters on start up

	function parseSetupParams(params, configObj) {
		var v, autorun = false;

		v = optVal('kbd', params.keyboard || params.kbd || params.kbdmode || params.keyboard);
		if (typeof v !== 'undefined') configObj.KEYBOARD_REPEAT = v;

		v = optVal('boolean', params.repeat);
		if (typeof v !== 'undefined') configObj.KEYBOARD_REPEAT = v;

		v = optVal('screenColors', params.clr || params.color || params.screen);
		if (typeof v !== 'undefined') configObj.SCREEN_COLOR = v;

		v = optVal('rom', params.rom);
		if (typeof v !== 'undefined') configObj.ROM_VERSION = v;

		v = optVal('charrom', params.charrom);
		if (typeof v !== 'undefined') configObj.CHARROM_VERSION = v;

		v = optVal('ram', params.ram);
		if (typeof v !== 'undefined') configObj.RAM_SIZE = v;

		v = optVal('boolean', params.audio || params.sound);
		if (typeof v !== 'undefined') configObj.AUDIO = v;

		v = optVal('boolean', params.audiofx || params.soundfx);
		if (typeof v !== 'undefined') configObj.AUDIO_FX = v;

		v = optVal('persistence', params.persistence);
		if (typeof v !== 'undefined') configObj.PERSISTENCE = v;

		v = optVal('slimPixels', params.pixel || params.pixels || params.pixelaspect);
		if (typeof v !== 'undefined') proportionalPixels = v;

		v = optVal('boolean', params.autorun);
		if (typeof v !== 'undefined') autorun = v;

		v = params.joystick || params.joysticks || params.joystickmode || params.joystickenc || params.joysticksencoding || '';
		if (v.toLowerCase().indexOf('custom')==0) {
			var parts = v.toLowerCase().split(','),
				mappings = joystickEncoding.getCustomMappings();
			for (var i = 1; i < parts.length; i++) {
				var m = parts[i].match(/^(\w+?):(\w+)/);
				if (m) {
					var code = parseInt(m[2]);
					if (!isNaN(code)) {
						if (code <=0 || code > 127) code = -1;
						switch(m[1]) {
							 case 'l':
							 case 'lft':
							 case 'left': mappings.left = code; break;
							 case 'r':
							 case 'rgt':
							 case 'right': mappings.right = code; break;
							 case 'u':
							 case 'up': mappings.up = code; break;
							 case 'd':
							 case 'dwn':
							 case 'down': mappings.down = code; break;
							 case 'b':
							 case 'btn':
							 case 'button':
							 case 'f':
							 case 'fire': mappings.fire = code; break;
						}
					}
				}
			}
			v = 'custom';
		}
		setJoystickEncoding(v);

		return autorun;
	}

	function getCleanPathString(string) {
		return string.replace(/^[\.\/]+/, '').replace(/[^\u0020-\u00ff]/g, '').replace(/%[0-9A-F]{2}/gi, '').replace(/\/[\/\.]+/g, '/');
	}
	function getExecString(data) {
		var code, matches = null;
		try {
			// base64: either a simple prefix "base64:" or a regular data-URI (MIME: text/plain, text/basic, application/text, application/basic, application/octet-stream)
			matches = (/^((?:data:)?(?:text\/plain|text\/basic|application\/text|application\/basic|application\/octet-stream);base64,|base64:)(.*)$/i).exec(data);
			if (matches) code = atob(matches[2]);
			else code = data;
		}
		catch (e) {
			showErrorDialog('Load Error', 'Failed to decode URL-data, ' + (matches? 'base64':'URL-encoding') + '.\n' + e.message);
			return '';
		}
		return code.replace(/\r\n?/g, '\n').replace(/\\pi/gi, '\u03C0');
	}
	var autoExecStack;

	function parseOptRomParams(params) {
		return new Promise(function(resolve) {
			if (params && (params.bin || params.optrom)) {
				var filename = getCleanPathString(params.bin || params.optrom),
					m = (filename || '').match(/([9A-F][08]00)/i),
					sa = 0;
				if (m) sa = parseInt(m[1],16)&0xffff;
				else {
					m = (filename || '').toUpperCase().match(/(\b|_)(H|D|UD)([0-9]{1,2})\b/);
					if (m) {
						var socketId = m[2] + m[3];
						if (romSocketAddr[socketId]) sa = romSocketAddr[socketId];
					}
				}
				console.log(sa.toString(16));
				if (sa >= 0x9000) {
					filename = filename.replace(/(\.\w+)?$/, '.bin');
					var xhr = new XMLHttpRequest();
					xhr.open('GET', './prgs/' + encodeURIComponent(filename) + '?uid=' + Date.now().toString(36), true);
						if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
						if (xhr.overrideMimeType) xhr.overrideMimeType('text/plain; charset=x-user-defined');
						xhr.onload = function xhr_onBinLoad() {
						if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
							var data = new Uint8Array(xhr.response);
							pet2001.installRom(sa, data);
							resolve();
						}
						else {
							xhr.onerror();
						}
					};
					xhr.onerror = function xhr_onerror() {
						var msg = 'PET: Unable to load ROM file "'+filename+'"';
						if (xhr.status) msg += ' ('+xhr.status+')';
						msg +=	(xhr.statusText? ': '+xhr.statusText:'.');
						console.warn(msg);
						resolve();
					};
					xhr.send(null);
				}
				else resolve();
			}
			else resolve();
		});
	}

	function parsePrgParams(params, autorun) {
		var prgPath = './prgs/',
			defaultExtension = '.prg',
			v;

		// load program from url
		if (params.run) {
			v = params.run;
			autorun = true;
		}
		else {
			v = params.prg || params.prog || params.progr || params.program || params.load;
		}
		if (v) {
			autoExecStack = autorun && params.exec? getExecString(params.exec).split('\n'):null;
			var fileName = getCleanPathString(v),
				parts = fileName.split('/'),
				dirName;
			if ((/\.d(64|80|82)$/i).test(parts[0])) {
				dirName=parts[0];
				if (dirName) {
					var fileStack=[];
					for (var i=1; i<parts.length; i++) {
						if (parts[i]) fileStack.push(parts[i]);
					}
					fileName = fileStack.join('/');
					var forceBasicStart = optVal('boolean', params.basic || params.isbasic || params.asbasic);
					PetUtils.FDD.loadDiskImage(dirName, fileName, forceBasicStart, autorun, true);
					return fileName || dirName;
				}
			}
			else {
				fileName=parts[0];
				if (fileName) {
					var sysName = fileName.replace(/\.\w+$/, '');
					if (fileName == sysName) fileName += defaultExtension;
					var xhr = new XMLHttpRequest();
					xhr.open('GET', prgPath + encodeURIComponent(fileName) + '?uid=' + Date.now().toString(36), true);
					if ((/\.(te?xt|bas|qb(as?)?|asm?)$/i).test(fileName)) {
						xhr.overrideMimeType('text/plain');
						xhr.onload = function xhr_onTxtLoad() {
							if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
								if (xhr.responseType && xhr.responseType != 'text') {
									showErrorDialog('Load Error', 'Not a text document, "'+fileName+'".');
									autoExecStack=null;
								}
								else if ((/\.asm$/i).test(fileName)) {
									autoExecStack=null;
									var result = PetUtils.assemble(xhr.responseText);
									if (result.error) showErrorDialog('Parse Error', result.error);
									else setAsmListing(result, result.error? 'error':'options', result.message, fileName);
								}
								else {
									var parsed;
									if ((/\.qb(as?)?$/i).test(fileName)) {
										var transformed = PetUtils.qbTransform(xhr.responseText);
										if (transformed.error) {
											showErrorDialog('QB Transform Error', 'Error: '+transformed.error+'\nLine '+transformed.line+':\n\u2192 '+transformed.source);
											autoExecStack=null;
											return;
										}
										parsed = PetUtils.txt2Basic(transformed.text);
									}
									else parsed = PetUtils.txt2Basic(xhr.responseText);
									if (parsed.error) {
										showErrorDialog('Parse Error', parsed.error);
										autoExecStack=null;
									}
									else {
										if (loadIEEEData(0x401, parsed.prg)) {
											setMountedMedia('txt', fileName);
											setFileSize(parsed.prg.length);
											autoLoad(sysName.toUpperCase(), false, autorun);
										}
									}
								}
							}
							else {
								xhr.onerror();
							}
						}
					}
					else {
						if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
						if (xhr.overrideMimeType) xhr.overrideMimeType('text/plain; charset=x-user-defined');
						xhr.onload = function xhr_onBinLoad() {
							if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
								if ((/\.p[0-9]{2}$/i).test(fileName)) {
									var parsed = PetUtils.parseP00(new DataView(xhr.response));
									if (parsed.error) {
										showErrorDialog('Parse Error', parsed.error);
										autoExecStack=null;
									}
									else {
										if (loadIEEEData(parsed.addr, parsed.prg)) {
											setMountedMedia('bin', fileName);
											setFileSize(parsed.prg.length);
											autoLoad(parsed.name.toUpperCase() || sysName, false, autorun);
										}
										else autoExecStack=null;
									}
								}
								else {
									var data = new DataView(xhr.response),
										size = data.byteLength,
										addr = data.getUint8(0) + data.getUint8(1) * 256,
										bytes = Array(size - 2);
									for (var i = 0; i < size - 2; i++) bytes[i] = data.getUint8(i + 2);
									if (loadIEEEData(addr, bytes)) {
										setMountedMedia('bin', fileName);
										setFileSize(size-2);
										autoLoad(sysName.toUpperCase(), false);
										if ((/^computerspace2001$/i).test(sysName)) showCS2001Labels();
									}
									else autoExecStack=null;
								}
							}
							else {
								xhr.onerror();
							}
						};
					}
					xhr.onerror = function xhr_onerror() {
						var msg = 'PET: Unable to load file "'+fileName+'"';
						if (xhr.status) msg += ' ('+xhr.status+')';
						msg +=	(xhr.statusText? ': '+xhr.statusText:'.');
						console.warn(msg);
						autoExecStack=null;
					};
					xhr.send(null);
				}
			}
			return fileName;
		}


		// load disk image from url
		v = params.disk || params.dsk || params.floppy || params.d64 || params.d80 || params.d82;
		if (v) {
			var fileName = getCleanPathString(v),
				parts = fileName.split('/'), dirName;
			if ((/\.d(64|80|82)$/i).test(parts[0])) {
				dirName = parts[0];
				var fileStack=[];
				for (var i=1; i<parts.length; i++) {
					if (parts[i]) fileStack.push(parts[i]);
				}
				fileName = fileStack.join('/');
				var forceBasicStart = optVal('boolean', params.basic || params.isbasic || params.asbasic);
				PetUtils.FDD.loadDiskImage(dirName, fileName, forceBasicStart, autorun, true);
			}
			return fileName || dirName;
		}

		// load t64 image from url
		if (params.t64) {
			var fileName = getCleanPathString(params.t64), undef;
			if (!(/\.t64$/i).test(fileName)) filename+='.t64';
			PetUtils.T64.loadImage(fileName, undef, undef, undef, true);
			return fileName;
		}

		// load code from url parameter
		var execute = false,
			urldata = params.exec || params.execute;
		if (urldata) {
			execute = true;
		}
		else {
			urldata = params.data;
		}
		if (urldata) {
			var fname = (params.fname || params.filename || '').toUpperCase(),
				code = getExecString(urldata);
			if (!code) return '';
			if ((/^[^0-9]/).test(code) && execute) { // direct mode
				waitForCursor(function() {
					petKeys.reset();
					autoType(code.toLowerCase());
				});
			}
			else if (code) {
				var parsed = PetUtils.txt2Basic(code,
					0x0401, false, pet2001.getRomVers());
				if (parsed.error) {
					showErrorDialog('Parse Error', 'Failed on attempt to decode URL-data (BASIC).\n'+parsed.error);
				}
				else {
					try {
						if (fname) fname = decodeURIComponent(fname).toUpperCase();
					}
					catch (e) {
						console.warn('Failed to decode filename: ' + e.message);
						fname = '';
					}
					if (loadIEEEData(0x401, parsed.prg)) {
						setMountedMedia('txt', 'URL-Data.');
						setFileSize(parsed.prg.length);
						autoLoad(fname || 'URL-DATA', false, autorun || execute, optVal('boolean', params.list));
					}
				}
			}
			return 'URL-data';
		}


		// should we display the help, instead?
		if (params.help) {
			var helpTopic = params.help;
			if (helpTopic && helpTopic.indexOf('petHelpTopic') < 0 && helpTopic.length > 1)
				helpTopic = 'petHelpTopic' + helpTopic.charAt(0).toUpperCase() + helpTopic.substring(1);
			toggleHelp(helpTopic);
		}
	}

	// parse setup and run

	function startCore() {
		adjustMenus();
		run();
		enableUI();
	}

	function init() {
		if (navigator.userAgent && navigator.userAgent.indexOf('PaleMoon')>0) {
			document.body.classList.add('paleMoon');
		}
		ThemeManager.initialize();
		var params, autorun;
		var cbx = document.getElementById(UIids.checkboxClickCursor);
		if (cbx) cbx.checked = false;

		observeFullscreen();
		var upload = document.getElementById(UIids.fileUpload);
		if (upload && upload.form) upload.form.reset();

		configDefaults = {};
		for (var p in config) configDefaults[p] = config[p];
		params = getQuery();
		if (params) autorun = parseSetupParams(params, config);

		startCore();
		if (config.RAM_SIZE) setRamSize(config.RAM_SIZE, null, true);
		parseOptRomParams(params).then(function() {
			if (params) {
				var title;
				if (typeof params.demo !== 'undefined' || typeof params.demos !== 'undefined') {
					showDemoPane();
					title = 'Demos';
				}
				else {
					title = parsePrgParams(params, autorun);
					if (config.AUDIO && pet2001 && pet2001.audio && pet2001.audio.isAvailable()) showConfirmDialog(
						(title? 'The selected program or media requests audio playback.':'The configuration specifies audio playback.')
							+ '<br />Do you want to activate sounds?',
						function(ok) {
							if (ok) {
								document.getElementById(UIids.soundCbxOnOff).checked = true;
								soundToggleHandler();
								pet2001.audio.resume();
							}
							else delete config.AUDIO;
						});
				
				}
				if (title) setTitle(title);
			}
			window.addEventListener('popstate', historyPopStateHandler, false);
		});
	}

	if (document.readyState === 'loading') {
		// wait for page to become interactive
		document.addEventListener('DOMContentLoaded', init, false);
	}
	else {
		// DOM is available (page loaded or interactive)
		init();
	}

	// public methods / API
	controllerObj.resetButton = resetButton;
	controllerObj.pauseButton = pause;
	controllerObj.petExport = petExport;
	controllerObj.setColor = setColor;
	controllerObj.setKeyRepeat = setKeyRepeat;
	controllerObj.romSelection = romSelection;
	controllerObj.ramsizeSelection = ramsizeSelection;
	controllerObj.saveFile = saveFile;
	controllerObj.observeScreenClicks = observeScreenClicks;
	controllerObj.updateTextExport = updateTextExport;
	controllerObj.updateEscapedListing = updateEscapedListing;
	controllerObj.updateTextExportCase = updateTextExportCase;
	controllerObj.hideTextExport = hideTextExport;
	controllerObj.closeDirectoryList = closeDirectoryList;
	controllerObj.loadSelectedDirectoryIndex = loadSelectedDirectoryIndex;
	controllerObj.generateDataLink = generateDataLink;
	controllerObj.generateScreenAsProgram = generateScreenAsProgram;
	controllerObj.hideScreenAsProgram = hideScreenAsProgram;
	controllerObj.closeRenumberDialog = closeRenumberDialog;
	controllerObj.closeTextImport = closeTextImport;
	controllerObj.hideImageExport = hideImageExport;
	controllerObj.showPrgLibrary = showPrgLibrary;
	controllerObj.hidePrgLibrary = hidePrgLibrary;
	controllerObj.hideUrlExport = hideUrlExport;
	controllerObj.hideDownloadLink = hideDownloadLink;
	controllerObj.hideDirectLink=hideDirectLink;
	controllerObj.closeConfirmDialog = closeConfirmDialog;
	controllerObj.closePromptDialog = closePromptDialog;
	controllerObj.closeInfoDialog = closeInfoDialog;
	controllerObj.autoLoad = autoLoad;
	controllerObj.setRamSize = setRamSize;
	controllerObj.displayDirectoryList = displayDirectoryList;
	controllerObj.waitForCursor = waitForCursor;
	controllerObj.renumber = renumber;
	controllerObj.switchCharacterSet = switchCharacterSet;
	controllerObj.toggleHelp = toggleHelp;
	controllerObj.showMountDialog = showMountDialog;
	controllerObj.closeMountDialog = closeMountDialog;
	controllerObj.setMountedMedia = setMountedMedia;
	controllerObj.loadFromPrgLibrary = loadFromPrgLibrary;
	controllerObj.loadFromMountedMedia = loadFromMountedMedia;
	controllerObj.activateMountedMedia = activateMountedMedia;
	controllerObj._oldRomIEEELoadComplete = oldRomIEEELoadComplete;
	controllerObj._setFileActivityIndicator = setFileActivityIndicator;
	controllerObj.prgLibraryScrollToYiOS = prgLibraryScrollToYiOS;
	controllerObj.clipboardPaste = clipboardPaste;
	controllerObj.getVarDump = getVarDump;
	controllerObj.refocus = refocus;
	controllerObj.selectTextarea = selectTextarea;
	controllerObj.closeAsmListing = closeAsmListing;
	controllerObj.showDemoPane = showDemoPane;
	controllerObj.hideDemoPane = hideDemoPane;
	controllerObj.loadDemo = loadDemo;
	controllerObj.unlockAudio = unlockAudio;
	controllerObj.joystickActive = joystickActive;
	controllerObj.virtualJoystick = kbdJoystick.setState;
	controllerObj.virtualJoystickReset = virtualJoystickReset;
	controllerObj.virtualJoystickGetButtonChar = getJoystickButtonChar;
	controllerObj.openJoystickDialog = openJoystickDialog;
	controllerObj.closeJoystickDialog = closeJoystickDialog;
	controllerObj.showJoystickInfo = showJoystickInfo;
	controllerObj.toggleVirtualKeypad = toggleVirtualKeypad;
	controllerObj.showKepadActivity = showKepadActivity;
	controllerObj.closeMountTempDialog = closeTempMountDialog;
	controllerObj.toggleElement = toggleElement;
	controllerObj.isInteractive = isInteractive;
	controllerObj.displayDirectory = displayDirectory;
	controllerObj.kbdSync = autoTypeSync;
	controllerObj.setDarkMode = ThemeManager.setDarkMode;
	controllerObj.hideHardcopy = hideHardcopy;
	controllerObj.printHardcopy = printHardcopy;
	controllerObj.downloadHardcopy = downloadHardcopy;
	controllerObj.downloadImage = downloadImage;
	controllerObj.downloadMemoryMap = downloadMemoryMap;
	controllerObj.hideMemoryMap = hideMemoryMap;
	controllerObj.showCustomJoystickDialog = showCustomJoystickDialog;
	controllerObj.closeJoystickCustomDialog = closeJoystickCustomDialog;
	controllerObj.adjustJoystickCustomButtonChar = adjustJoystickCustomButtonChar;
	controllerObj.closeBreakpointDialog = closeBreakpointDialog;
	controllerObj.setBreakpointDialogTab = setBreakpointDialogTab;
	controllerObj.toggleDebugger = toggleDebugger;
	controllerObj.haltAndDebug = haltAndDebug;
	controllerObj.showCPULog = showCPULog;
	controllerObj.setHeaderIcon = setHeaderIcon;

	return controllerObj;
})();
