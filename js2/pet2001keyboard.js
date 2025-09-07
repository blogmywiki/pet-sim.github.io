//
// pet2001keyboard.js
// (c) Norbert Landsteiner 2023-2024, masswerk.at
//
// PET 2001 keyboard implementation
// Processes key presses and pointer interaction (with element provided to the constructor)
// editMode (boolean):
//   true:  single key press and virtual key repeat,
//          virtual keyboard shift works as a toggle
//   false: key matrix represents true state with concurrent key presses
//
// Simulates multi-touch interaction for the virtual keyboard in "gaming mode"
// (editMode: false) with a mouse and the ALT key held down.
// Holding SHIFT down on the physical keyboard always affects the virtual keyboard, as well.
//

var PetKeys = function(kbdElementId) {

	"use strict";

	// static vars
	var io = null,
		controller = null,
		disabled = false,
		editMode = true, // flag: distinct key presses and virtual key repeat
		businessMode = false,
		hasRepeatKey = false,
		keyrows = new Uint8Array(10),
		kbdShiftState = 0,
		kbdOldLvl3API = false,
		kbdOldLvl3Repeat = false,
		kbdOldLvl3CapsLock = false,
		kbdOldLvl3CapsLockActive = false,
		kbdOldLvl3LastKey = 0,
		virtualNumPad = false,
		pressedKeys = {},
		keyRepeatCode = null,
		keyRepeatCntr = 0,
		keyRepeatQueue = [],
		vkShiftState = 0,
		vkPressed = false,
		vkRepeatCntr = 0,
		vkRepeatVec = null,
		vkSticky = false,
		vkShiftLockState = 0,
		vkPointerShiftState = 0,
		vkKbd, vkShift1, vkShift2,
		vkGraphicsKbd, vkGfxShift1, vkGfxShift2,
		vkBusinessKbd, vkBsnShift1, vkBsnShift2, vkBsnShiftLock,
		keyboardElement = kbdElementId? document.getElementById(kbdElementId) : null,
		hasVK = !!keyboardElement,
		vkKbdJapan = false,
		useMouseAPI = hasVK && typeof keyboardElement.onmousedown !== 'undefined',
		useTouchAPI = hasVK && typeof keyboardElement.ontouchstart !== 'undefined'
			&& window.navigator && (navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0);

	// config
	var keyRepeatInitialDelay = 50,
		keyRepeatContinuationDelay = 35,
		keyRepeatDelay = 6,
		vkRepeatInitialDelay = 40,
		vkRepeatDelay = 8,
		disableVirtualModesOnShift = true;

	var unicode2Petscii = {
		0x2713: 0xba, 0x2714: 0xba, 0x2611: 0xba, 0x2500: 0xc0,
		0x2501: 0xc0, 0x2502: 0xdd, 0x2503: 0xdd, 0x007c: 0xdd,
		0x250C: 0xb0, 0x250F: 0xb0, 0x25F2: 0xb0, 0x2510: 0xae,
		0x2513: 0xae, 0x25F1: 0xae, 0x2514: 0xad, 0x2517: 0xad,
		0x25F3: 0xad, 0x2518: 0xbd, 0x251B: 0xbd, 0x25F0: 0xbd,
		0x251C: 0xab, 0x2523: 0xab, 0x2524: 0xb3, 0x252B: 0xb3,
		0x252C: 0xb2, 0x2533: 0xb2, 0x2534: 0xb1, 0x253B: 0xb1,
		0x253C: 0xdb, 0x254B: 0xdb, 0x256D: 0xd5, 0x256E: 0xc9,
		0x256F: 0xcb, 0x2570: 0xca, 0x259B: 0xcf, 0x259C: 0xd0,
		0x259F: 0xba, 0x2599: 0xcc, 0x2594: 0xa3, 0x2581: 0xa4,
		0x258F: 0xa5, 0x2595: 0xa7, 0x2596: 0xbb, 0x259D: 0xbc,
		0x2597: 0xac, 0x2598: 0xbe, 0x259A: 0xbf, 0x2573: 0xd6,
		0x2613: 0xd6, 0x2715: 0xd6, 0x2572: 0xcd, 0x2571: 0xce,
		0x25C6: 0xda, 0x25C7: 0xda, 0x2666: 0xda, 0x2662: 0xda,
		0x2666: 0xda, 0x25CA: 0xda, 0x25CF: 0xd1, 0x25CB: 0xd7,
		0x25EF: 0xd7, 0x2660: 0xc1, 0x2664: 0xc1, 0x2661: 0xd3,
		0x2665: 0xd3, 0x2663: 0xd8, 0x2667: 0xd8, 0x2584: 0xa2,
		0x258C: 0xa1, 0x25E7: 0xa1, 0x25E4: 0xa9, 0x25E9: 0xa9,
		0x25F8: 0xa9, 0x25E5: 0xdf, 0x25F9: 0xdf, 0x2591: 0xa6,
		0x2592: 0xa6, 0x2593: 0xa6, 0x25A6: 0xa6, 0x25A9: 0xa6,
		0x2582: 0xaf, 0x2583: 0xb9, 0x258E: 0xb4, 0x258D: 0xb5,
		0x2160: 0xa5, 0x2161: 0xd4, 0x2162: 0xc7, 0x2163: 0xc2,
		0x2164: 0xdd, 0x2165: 0xc8, 0x2166: 0xd9, 0x2167: 0xa7,
		0x2170: 0xa3, 0x2171: 0xc5, 0x2172: 0xc4, 0x2173: 0xc3,
		0x2174: 0xc0, 0x2175: 0xc6, 0x2176: 0xd2, 0x2177: 0xa4,
		0x25D0: 0xdc, 0x25D2: 0xa8, 0x2B16: 0xdc, 0x2B19: 0xa8,
		0x2059: 0xde, 0x25BD: 0xb7, 0x25BC: 0xb8, 0x25C1: 0xaa,
		0x25C0: 0xb6, 0x2B13: 0xa2, 0x2B14: 0xdf, 0x29EB: 0xda,
		0x2B25: 0xda, 0x23BE: 0xcf, 0x23BF: 0xcc, 0x23CB: 0xd0,
		0x23CC: 0xba, 0x14A5: 0xcf, 0x14AA: 0xcc, 0x14A3: 0xd0,
		0x14A7: 0xba,
		0x1FB70: 0xd4, 0x1FB71: 0xc7, 0x1FB72: 0xc2, 0x1FB73: 0xdd,
		0x1FB74: 0xc8, 0x1FB75: 0xd9, 0x1FB76: 0xc5, 0x1FB77: 0xc4,
		0x1FB78: 0xc3, 0x1FB79: 0xc0, 0x1FB7A: 0xc6, 0x1FB7B: 0xd2,
		0x1FB7C: 0xcc, 0x1FB7D: 0xcf, 0x1FB7E: 0xd0, 0x1FB7F: 0xba,
		0x1FB82: 0xb7, 0x1FB83: 0xb8, 0x1FB87: 0xaa, 0x1FB88: 0xb6,
		0x1FB8C: 0xdc, 0x1FB8F: 0xa8, 0x1FB90: 0xa6, 0x1FB95: 0xde,
		0x1FB96: 0xde, 0x1FB98: 0xdf, 0x1FB99: 0xa9, 0x1FB9C: 0xa9,
		0x1FB9D: 0xdf, 0x1FBB1: 0xba, 0x1FBAF: 0xdb
	},
	kana2Petscii = {
		// kana
		0x00a5: 0x5c, 0xffe5: 0x5c, 0x30a2: 0xa1, 0x30a1: 0xa1,
		0xff71: 0xa1, 0xff67: 0xa1, 0x30a4: 0xa2, 0x30a3: 0xa2,
		0xff72: 0xa2, 0xff68: 0xa2, 0x30a6: 0xa3, 0x30a5: 0xa3,
		0xff73: 0xa3, 0xff69: 0xa3, 0x30a8: 0xa4, 0x30a7: 0xa4,
		0xff74: 0xa4, 0xff6a: 0xa4, 0x30aa: 0xa5, 0x30a9: 0xa5,
		0xff75: 0xa5, 0xff6b: 0xa5, 0x30ad: 0xa7, 0xff77: 0xa7,
		0x30ab: 0xa6, 0x30f5: 0xa6, 0xff76: 0xa6, 0x30ef: 0xdc,
		0x30ee: 0xdc, 0xff9c: 0xdc, 0x30af: 0xa8, 0xff78: 0xa8,
		0x30b1: 0xa9, 0xff79: 0xa9, 0x30f2: 0xdf, 0xff66: 0xdf,
		0x30e0: 0xd1, 0xff91: 0xd1, 0x30e9: 0xd7, 0xff97: 0xd7,
		0x30ca: 0xc5, 0xff85: 0xc5, 0x30e1: 0xd2, 0xff92: 0xd2,
		0x30e4: 0xd4, 0x30e3: 0xd4, 0xff94: 0xd4, 0xff6c: 0xd4,
		0x30eb: 0xd9, 0xff99: 0xd9, 0x30e6: 0xd5, 0xff7a: 0xd5,
		0x30ce: 0xc9, 0xff89: 0xc9, 0x30de: 0xcf, 0xff8f: 0xcf,
		0x30df: 0xd0, 0xff90: 0xd0, 0x30bf: 0xb7, 0xff80: 0xb7,
		0x30ed: 0xb8, 0xff9b: 0xb8, 0x30f3: 0xb9, 0xff9d: 0xb9,
		0x309c: 0xaf, 0x302c: 0xaf, 0x302b: 0xaf, 0xff9f: 0xaf,
		0x30c1: 0xc1, 0xff81: 0xc1, 0x30e2: 0xd3, 0xff93: 0xd3,
		0x30c8: 0xc4, 0xff84: 0xc4, 0x30cb: 0xc6, 0xff86: 0xc6,
		0x30cc: 0xc7, 0xff87: 0xc7, 0x30cd: 0xc8, 0xff88: 0xc8,
		0x30cf: 0xca, 0xff8a: 0xca, 0x30d2: 0xcb, 0xff8b: 0xcb,
		0x30d5: 0xcc, 0xff8c: 0xcc, 0x30b3: 0xba, 0xff7a: 0xba,
		0x5e74: 0xb4, 0xf98e: 0xb4, 0x6708: 0xb5, 0x2f49: 0xb5,
		0x65e5: 0xb6, 0x2f47: 0xb6, 0x309b: 0xaa, 0xff9e: 0xaa,
		0x30ec: 0xda, 0xff9a: 0xda, 0x30ea: 0xd8, 0xff99: 0xd8,
		0x30c6: 0xc3, 0xff83: 0xc3, 0x30e8: 0xd6, 0x30e7: 0xd6,
		0xff96: 0xd6, 0xff6e: 0xd6, 0x30c4: 0xc2, 0xff82: 0xc2,
		0x30db: 0xce, 0xff8e: 0xce, 0x30d8: 0xcd, 0xff8d: 0xcd,
		0x30b9: 0xac, 0xff7d: 0xac, 0x30b5: 0xbb, 0xff7b: 0xbb,
		0x30bd: 0xbf, 0xff7f: 0xbf, 0x30b7: 0xbc, 0xff7c: 0xbc,
		0x30bb: 0xbe, 0x30e3: 0xbe, 0xff94: 0xbe, 0x30e3: 0xbe,
		0x30fc: 0x2d, 0x30fb: 0x2e
	};

	function configure() {
		var e = new KeyboardEvent('keydown');
		if (typeof e.key === 'undefined' && typeof e.keyIdentifier !== 'undefined') kbdOldLvl3API = true;
		if (typeof e.repeat === 'undefined' && typeof e.keyCode !== 'undefined') kbdOldLvl3Repeat = true;
		if (kbdOldLvl3API && !event.getModifierState) kbdOldLvl3CapsLock = true;
	}

	function connect(components) {
		io = components.io;
		controller = components.controller;
	}

	function init() {
		configure();
		if (hasVK) vkCreateGraphicsKbd();
	}

	function enableUIHandlers() {
		window.addEventListener('focus', releaseAllKeys, false);
		window.addEventListener('blur',  releaseAllKeys, false);
		window.addEventListener('keydown', onKeyDown, false);
		window.addEventListener('keyup', onKeyUp, false);
		if (useMouseAPI) {
			keyboardElement.addEventListener('mousedown', onMouseDown, false);
			keyboardElement.addEventListener('mouseup', onMouseUp, false);
			keyboardElement.addEventListener('mouseout', onMouseOut, false);
		}
		if (useTouchAPI) {
			keyboardElement.addEventListener('touchstart', onTouchStart, false);
			keyboardElement.addEventListener('touchend', onTouchEnd, false);
			keyboardElement.addEventListener('touchcancel', onTouchCancel, false);
		}
	}

	function reset(keyRepeatFlag) {
		joystickLastCode = 0;
		keyRepeatReset();
		releaseAllKeys();
		if (typeof keyRepeatFlag !== 'undefined') editMode = !!keyRepeatFlag;
	}

	function releaseAllKeys() {
		kbdShiftState = 0;
		kbdOldLvl3LastKey = 0;
		keyRepeatCode = null;
		keyRepeatCntr = 0;
		releaseKeyMatrix();
		if (io) syncKeyMatrix();
		vkReset();
	}

	// sync-step method called by IO (just before VBLANK)

	function ioSync() {
		controller.kbdSync();
		if (keyRepeatCntr) keyRepeatSyncAction();
		if (vkRepeatCntr) vkRepeatSyncAction();
	}

	// basic setters for keyboard matrix

	function releaseKeyMatrix() {
		for (var p in pressedKeys) delete pressedKeys[p];
		for (var i = 0; i < 10; i++) keyrows[i] = 0xff;
	}

	function clearKeyMatrix() {
		for (var i = 0; i < 10; i++) keyrows[i] = 0xff;
	}

	function syncKeyMatrix() {
		io.setKeyrows(keyrows);
	}

	function keyMatrixSetRow(row, col, active) {
		if (active) { // active low
			keyrows[row] &= ~(1 << col);
		}
		else {
			keyrows[row] |= 1 << col;
		}
	}

	function keyMatrixSetChar(petscii, shift) {
		var m = petscii2matrix[petscii];
		if (m) keyrows[m[0]] &= ~(1 << m[1]);
		if (shift) {
			m = petscii2matrix[0];
			keyrows[m[0]] &= ~(1 << m[1]);
		}
	}

	function keyMatrixUnsetChar(petscii) {
		var m = petscii2matrix[petscii];
		if (m) keyrows[m[0]] |= 1 << m[1];
	}

	function setShift(shiftState) {
		if (businessMode) {
			keyMatrixSetRow(6, 0, (shiftState | vkShiftLockState) & 1); // lshift
			keyMatrixSetRow(6, 6, shiftState & 2); // rshift
		}
		else {
			keyMatrixSetRow(8, 0, shiftState & 1); // lshift
			keyMatrixSetRow(8, 5, shiftState & 2); // rshift
		}
	}

	// ======= external methods =======

	function stopKey(shift, callback) {
		keyMatrixSetChar(3, shift);
		syncKeyMatrix();
		setTimeout(function() {
			releaseAllKeys();
			if (typeof callback === 'function') callback();
		}, 30);
	}

	function disable(flag) {
		disabled = !!flag;
		if (disabled) releaseAllKeys();
	}
	function setKeyRepeat(flag) {
		if (flag != editMode) releaseAllKeys();
		editMode = !!flag;
	}
	function getKeyRepeat() {
		return editMode;
	}
	function busy() { // i.e. not accepting input
		return disabled || keyRepeatCntr > 0;
	}
	function enableVirtualKeypad(flag) {
		virtualNumPad = !!flag;
	}
	function setBusinessMode(flag, romVers) {
		businessMode = !!flag;
		if (businessMode && !vkBusinessKbd) vkBusinessCreateKeyboard();
		keyboardElement.className = businessMode? 'business':'';
		if (businessMode) {
			petscii2matrix = petscii2matrixBusinessKbd;
			virtualNumPadCodes = virtualNumPadCodesBusinessKbd;
			joystickDirCodes = joystickDirCodesBusinessKbd;
			vkKbd = vkBusinessKbd;
			vkShift1 = vkBsnShift1;
			vkShift2 = vkBsnShift2;
		}
		else {
			petscii2matrix = petscii2matrixGraphicsKbd;
			virtualNumPadCodes = virtualNumPadCodesGraphicsKbd;
			joystickDirCodes = joystickDirCodesGraphicsKbd;
			vkKbd = vkGraphicsKbd;
			vkShift1 = vkGfxShift1;
			vkShift2 = vkGfxShift2;
			vkAdjustLanguage();
		}
		hasRepeatKey = flag && romVers == 4;
	}
	function isEditMode() {
		return editMode;
	}
	function isBusinessMode() {
		return businessMode;
	}
	function setCharsetVersion(version) {
		vkKbdJapan = version == 'JA';
		vkAdjustLanguage();
	}

	// ======= virtual keyboard =======

	function vkDecodePointerEvent(event) {
		if (event.target.nodeName === 'SPAN') {
			var el = event.target,
				row = el.getAttribute('data-row'),
				col = el.getAttribute('data-col');
			if (row && col) {
				var r = parseInt(row),
					c = parseInt(col),
					shift = 0;
				if (businessMode) {
					if (r === 6 && (c === 0 || c === 6)) shift = c === 0? 1:2;
					if (r === -1 && c === -1 && /(?:down|start)$/.test(event.type)) { //shift-lock
						vkShiftLockState = vkShiftLockState? 0:1;
						vkBsnShiftLock.className = vkShiftLockState? 'active':'';
						setShift(vkShiftState | kbdShiftState | (event.shiftKey? 1:0));
						vkApplyUIShifts(vkShiftState);
					}
				}
				else if (r === 8 && (c === 0 || c === 5)) shift = c === 0? 1:2;
				return {'row': r, 'col': c, 'shift': shift };
			}
		}
		return {'row': r-1, 'col': -1, 'shift': 0 };
	}

	function vkKeyDown(vec, sticky, pointerShiftFlag) {
		if (vec.row < 0) return;
		vkPressed = true;
		if (vec.shift) {
			if (editMode && !businessMode) {
				vkShiftState = vkShiftState? 0:3;
			}
			else if (sticky) {
				vkShiftState = (vkShiftState ^ vec.shift) & 3;
			}
			else {
				if (vkSticky) vkReleaseSticky();
				vkShiftState |= vec.shift;
			}
			vkPointerShiftState = pointerShiftFlag && !(vkShiftState || kbdShiftState)? 1:0;
			setShift(vkShiftState | kbdShiftState | vkPointerShiftState);
			vkApplyUIShifts(vkShiftState);
			syncKeyMatrix();
		}
		else {
			vkPointerShiftState = pointerShiftFlag && !(vkShiftState || kbdShiftState)? 1:0;
			if (editMode && !businessMode) {
				clearKeyMatrix();
				setShift(vkShiftState | kbdShiftState | vkPointerShiftState);
				vkRepeatSet(vec);
				keyMatrixSetRow(vec.row, vec.col, true);
				vkSetUIKey(vec);
			}
			else if (sticky) {
				var down = vkGetUIKeyState(vec, false);
				keyMatrixSetRow(vec.row, vec.col, down);
				if (down) vkSetUIKey(vec);
				else vkUnsetUIKey(vec);
				if (down && vkPointerShiftState) setShift(vkShiftState | kbdShiftState | vkPointerShiftState);
			}
			else {
				if (vkSticky) vkReleaseSticky();
				keyMatrixSetRow(vec.row, vec.col, true);
				vkSetUIKey(vec);
			}
			syncKeyMatrix();
		}
		if (!editMode || businessMode) vkSticky = sticky;
	}

	function vkKeyUp(vec, sticky) {
		if (vec.row < 0) return;
		vkPressed = false;
		if (vec.shift) {
			if ((!editMode || businessMode) && !vkSticky) {
				vkShiftState &= ~vec.shift;
				vkApplyUIShifts(vkShiftState);
				setShift(vkShiftState | kbdShiftState);
				syncKeyMatrix();
			}
			else if (vkPointerShiftState) {
				setShift(vkShiftState | kbdShiftState);
				syncKeyMatrix();
			}
		}
		else {
			if (editMode && !businessMode) {
				clearKeyMatrix();
				setShift(vkShiftState | kbdShiftState);
				vkRepeatReset();
				vkUnsetUIKey(vec);
			}
			else if (!sticky) {
				if (vkSticky) vkReleaseSticky();
				else {
					keyMatrixSetRow(vec.row, vec.col, false);
					vkUnsetUIKey(vec);
				}
				if (vkPointerShiftState) setShift(vkShiftState | kbdShiftState);
			}
			syncKeyMatrix();
		}
		vkPointerShiftState = 0;
		if (!editMode || businessMode) vkSticky = sticky;
	}

	function vkLeave() {
		if (vkPressed) {
			clearKeyMatrix();
			vkSetUIKey(null);
			if (!editMode) {
				vkShiftState = 0;
				setShift(kbdShiftState);
				vkApplyUIShifts(0);
			}
			syncKeyMatrix();
			vkPressed = false;
			vkSticky = false;
		}
		vkRepeatReset();
	}

	function vkReleaseSticky() {
		vkShiftState = 0;
		clearKeyMatrix();
		setShift(kbdShiftState);
		vkApplyUIShifts(0);
		vkSetUIKey(null);
	}

	function onMouseDown(event) {
		if (event.button > 0 || event.buttons > 1) return;
		event.preventDefault();
		vkKeyDown( vkDecodePointerEvent(event), event.altKey, event.shiftKey );
	}
	function onMouseUp(event) {
		if (event.button > 0 || event.buttons > 1) return;
		vkKeyUp( vkDecodePointerEvent(event), event.altKey );
	}
	function onMouseOut(event) {
		vkLeave();
	}

	function onTouchStart(event) {
		if (event.button > 0 || event.buttons > 1 || !event.changedTouches) return;
		event.preventDefault();
		var sticky = event.altKey || false;
		for (var touchList = event.changedTouches, i = 0; i < touchList.length; i++) {
			vkKeyDown( vkDecodePointerEvent(touchList[i]),  sticky, false );
		}
	}
	function onTouchEnd(event) {
		if (event.button > 0 || event.buttons > 1 || !event.changedTouches) return;
		event.preventDefault();
		var sticky = event.altKey || false;
		for (var touchList = event.changedTouches, i = 0; i < touchList.length; i++) {
			var tp = vkDecodePointerEvent(touchList[i]);
			if (tp.row >= 0) vkKeyUp(tp, sticky);
			else {
				vkLeave();
				break;
			}
		}
	}
	function onTouchCancel(event) {
		event.preventDefault();
		vkLeave();
	}

	function vkApplyUIShifts(shiftState) {
		vkShift1.className = ((shiftState | vkShiftLockState) & 1)? 'active':'';
		vkShift2.className = (shiftState & 2)? 'active':'';
	}

	function vkSetUIKey(vec) {
		if (!vec) {
			for (var r = 0; r < 10; r++) {
				for (var c = 0; c < 8; c++) {
					var m = vkKbd[r][c];
					if (m) m.className = '';
				}
			}
		}
		else {
			vkKbd[vec.row][vec.col].className = 'active';
		}
	}

	function vkUnsetUIKey(vec) {
		vkKbd[vec.row][vec.col].className = '';
	}

	function vkGetUIKeyState(vec, active) {
		var up = !vkKbd[vec.row][vec.col].className;
		return active? !up:up;
	}

	function vkRepeatSet(vec) {
		vkRepeatCntr = vkRepeatInitialDelay;
		vkRepeatVec = vec;
	}

	function vkRepeatReset() {
		vkRepeatCntr = 0;
		vkRepeatVec = null;
	}

	function vkRepeatSyncAction() {
		if (vkRepeatCntr === 2) {
			releaseKeyMatrix();
			setShift(vkShiftState | kbdShiftState);
			syncKeyMatrix();
			vkRepeatCntr--;
		}
		else if (vkRepeatCntr === 1) {
			if (vkRepeatVec) {
				keyMatrixSetRow(vkRepeatVec.row, vkRepeatVec.col, true);
				syncKeyMatrix();
			}
			vkRepeatCntr = vkRepeatDelay;
		}
		else vkRepeatCntr--;
	}

	function vkReset() {
		if (!hasVK) return;
		vkShiftState = 0;
		vkShiftLockState = 0;
		vkPressed = false;
		vkSticky = false;
		vkPointerShiftState = 0;
		vkRepeatCntr = 0;
		vkRepeatVec = null;
		vkSetUIKey(null);
		vkApplyUIShifts(0);
	}

	function vkAdjustLanguage() {
		var gfxKbd = document.getElementById('graphicsKbd');
		if (gfxKbd) gfxKbd.className = vkKbdJapan? 'ja':'';
	}

	function vkCreateGraphicsKbd() {
		vkGraphicsKbd = [];
		var parentEl = document.createElement('div');
		parentEl.id = 'graphicsKbd';
		for (var r = 0; r < 10; r++) vkGraphicsKbd[r] = [];
		for (var keyX = 0; keyX < 16; keyX++) {
			if (keyX === 11) continue;
			for (var keyY = 0; keyY < 5; keyY++) {
				if ((keyX === 6 && keyY === 4) || keyX === 10 && keyY === 2) continue;
				var col = keyX >> 1,
					row = keyY << 1;
				if (keyX & 1) row++;
				var x = 13 + keyX * 48.5,
					y = 13 + keyY * 48.5,
					isReturn = keyX === 10 && keyY === 3,
					isSpace = keyX === 5 && keyY === 4,
					el = document.createElement('span'),
					st = el.style;
				if (isReturn) y -= 48.5;
				if (keyX > 9) x--;
				if (keyY > 3) y--;
				st.width = isSpace? '96px':'48px';
				st.height = isReturn? '96px':'48px';
				st.left = Math.floor(x)+'px';
				st.top = Math.floor(y)+'px';
				st.padding = 0;
				st.margin= 0;
				st.zIndex = 2;
				el.setAttribute('data-row', row);
				el.setAttribute('data-col', col);
				parentEl.appendChild(el);
				if (col === 0 && row === 8) vkGfxShift1 = el; // left shift
				else if (col === 5 && row === 8) vkGfxShift2 = el; // right shift
				else vkGraphicsKbd[row][col] = el;
			}
		}
		keyboardElement.appendChild(parentEl);
		vkAdjustLanguage();
	}


	// ======= business keyboard =======

	var vkBusinessKeyDef = [
		{r:9,c:0,x:10,y:0,w:43},//_
		{r:1,c:0,x:54,y:0,w:43},//1
		{r:0,c:0,x:98,y:0,w:43},//2
		{r:9,c:1,x:142,y:0,w:43},//3
		{r:1,c:1,x:186,y:0,w:43},//4
		{r:0,c:1,x:230,y:0,w:43},//5
		{r:9,c:2,x:274,y:0,w:43},//6
		{r:1,c:2,x:318,y:0,w:43},//7
		{r:0,c:2,x:362,y:0,w:43},//8
		{r:9,c:3,x:406,y:0,w:43},//9
		{r:1,c:3,x:450,y:0,w:43},//0
		{r:9,c:5,x:494,y:0,w:43},//:
		{r:0,c:3,x:538,y:0,w:43},//-
		{r:1,c:5,x:582,y:0,w:43},//^
		{r:0,c:5,x:626,y:0,w:43},//RGT
		{r:9,c:4,x:670,y:0,w:43},//STP
		{r:1,c:4,x:744,y:0,w:43},//k7
		{r:0,c:4,x:788,y:0,w:43},//k8
		{r:1,c:7,x:832,y:0,w:43},//k9
		{r:4,c:0,x:10,y:46,w:65},//TAB
		{r:5,c:0,x:76,y:46,w:43},//Q
		{r:4,c:1,x:120,y:46,w:43},//W
		{r:5,c:1,x:164,y:46,w:43},//E
		{r:4,c:2,x:208,y:46,w:43},//R
		{r:5,c:2,x:252,y:46,w:43},//T
		{r:4,c:3,x:296,y:46,w:43},//Y
		{r:5,c:3,x:340,y:46,w:43},//U
		{r:4,c:5,x:384,y:46,w:43},//I
		{r:5,c:5,x:428,y:46,w:43},//O
		{r:4,c:6,x:472,y:46,w:43},//P
		{r:5,c:6,x:516,y:46,w:43},//[
		{r:4,c:4,x:560,y:46,w:43},//\
		{r:5,c:4,x:604,y:46,w:43},//DWN
		{r:4,c:7,x:648,y:46,w:43},//DEL
		{r:5,c:7,x:744,y:46,w:43},//k4
		{r:2,c:7,x:788,y:46,w:43},//k5
		{r:3,c:7,x:832,y:46,w:43},//k6
		{r:2,c:0,x:0,y:92,w:43},//ESC
		{r:-1,c:-1,x:44,y:92,w:43},//SLK
		{r:3,c:0,x:88,y:92,w:43},//A
		{r:2,c:1,x:132,y:92,w:43},//S
		{r:3,c:1,x:176,y:92,w:43},//D
		{r:2,c:2,x:220,y:92,w:43},//F
		{r:3,c:2,x:264,y:92,w:43},//G
		{r:2,c:3,x:308,y:92,w:43},//H
		{r:3,c:3,x:352,y:92,w:43},//J
		{r:2,c:5,x:396,y:92,w:43},//K
		{r:3,c:5,x:440,y:92,w:43},//L
		{r:2,c:6,x:484,y:92,w:43},//;
		{r:3,c:6,x:528,y:92,w:43},//@
		{r:2,c:4,x:572,y:92,w:43},//]
		{r:3,c:4,x:616,y:92,w:86},//RET
		{r:8,c:7,x:744,y:92,w:43},//k1
		{r:7,c:7,x:788,y:92,w:43},//k2
		{r:6,c:7,x:832,y:92,w:43},//k3
		{r:8,c:0,x:0,y:138,w:43},//RVS
		{r:6,c:0,x:44,y:138,w:65},//LSH
		{r:7,c:0,x:110,y:138,w:43},//Z
		{r:8,c:1,x:154,y:138,w:43},//X
		{r:6,c:1,x:198,y:138,w:43},//C
		{r:7,c:1,x:242,y:138,w:43},//V
		{r:6,c:2,x:286,y:138,w:43},//B
		{r:7,c:2,x:330,y:138,w:43},//N
		{r:8,c:3,x:374,y:138,w:43},//M
		{r:7,c:3,x:418,y:138,w:43},//,
		{r:6,c:3,x:462,y:138,w:43},//.
		{r:8,c:6,x:506,y:138,w:43},///
		{r:6,c:6,x:550,y:138,w:65},//RSH
		{r:7,c:6,x:616,y:138,w:43},//RPT
		{r:8,c:4,x:660,y:138,w:43},//HOM
		{r:7,c:4,x:744,y:138,w:87},//k0
		{r:6,c:4,x:832,y:138,w:43},//k.
		{r:8,c:2,x:123,y:184,w:387},//SPC
	];

	function vkBusinessCreateKeyboard() {
		vkBusinessKbd = [];
		for (var i=0; i<10; i++) vkBusinessKbd[i] = [];
		var parentEl = document.createElement('div');
		parentEl.id = 'businessKbd';
		vkBusinessKeyDef.forEach(function(def) {
			var el = document.createElement('span'),
				st = el.style;
				st.width = def.w + 'px';
				st.height = '44px';
				st.top = def.y + 'px';
				st.left = def.x + 'px';
				st.backgroundPosition = '-' + def.x + 'px -' + def.y + 'px';
				el.setAttribute('data-row', def.r);
				el.setAttribute('data-col', def.c);
			parentEl.appendChild(el);
			if (def.r >- 1) vkBusinessKbd[def.r][def.c] = el;
			else vkBusinessKbd[6][8] = el;
		});
		keyboardElement.appendChild(parentEl);
		vkBsnShift1 = vkBusinessKbd[6][0];
		vkBsnShift2 = vkBusinessKbd[6][6];
		vkBsnShiftLock = vkBusinessKbd[6][8];
	}

	// ======= computer keyboard =======

	// PETSCII code (0..127) to keyboard matrix
	// matrix of [row: 0..9, col: 0..7 {, shifted: 0||1}] || null (n.a.)
	// special codes: Left-SHIFT: 1, Right-SHIFT: 2, STOP: 3
	// (original SHIFT code 0, both keys)
	var petscii2matrixGraphicsKbd = [
			[8,0],[8,0],[8,5],[9,4], null, null, null, null, null, null, null, null, null,[6,5], null, null,
			 null,[1,6],[9,0],[0,6],[1,7], null, null, null, null, null, null, null, null,[0,7], null, null,
			[9,2],[0,0],[1,0],[0,1],[1,1],[0,2],[0,3],[1,2],[0,4],[1,4],[5,7],[7,7],[7,3],[8,7],[9,6],[3,7],
			[8,6],[6,6],[7,6],[6,7],[4,6],[5,6],[4,7],[2,6],[3,6],[2,7],[5,4],[6,4],[9,3],[9,7],[8,4],[7,4],
			[8,1],[4,0],[6,2],[6,1],[4,1],[2,1],[5,1],[4,2],[5,2],[3,3],[4,3],[5,3],[4,4],[6,3],[7,2],[2,4],
			[3,4],[2,0],[3,1],[5,0],[2,2],[2,3],[7,1],[3,0],[7,0],[3,2],[6,0],[9,1],[1,3],[8,2],[2,5],[0,5],
			 null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
			 null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null
		],
		petscii2matrixBusinessKbd = [
			[6,0,0],[6,0,0],[6,6,0],[9,4,0],   null,   null,   null,   null,   null,[4,0,0],   null,   null,   null,[3,4,0],   null,   null,
			   null,[5,4,0],[8,0,0],[8,4,0],[4,7,0],   null,   null,   null,   null,   null,   null,[2,0,0],   null,[0,5,0],   null,   null,
			[8,2,0],[1,0,1],[0,0,1],[9,1,1],[1,1,1],[0,1,1],[9,2,1],[1,2,1],[0,2,1],[9,3,1],[9,5,1],[2,6,1],[7,3,0],[0,3,0],[6,3,0],[8,6,0],
			[1,3,0],[1,0,0],[0,0,0],[9,1,0],[1,1,0],[0,1,0],[9,2,0],[1,2,0],[0,2,0],[9,3,0],[9,5,0],[2,6,0],[7,3,1],[0,3,1],[7,3,1],[8,6,1],
			[3,6,0],[3,0,0],[6,2,0],[6,1,0],[3,1,0],[5,1,0],[2,2,0],[3,2,0],[2,3,0],[4,5,0],[3,3,0],[2,5,0],[3,5,0],[8,3,0],[7,2,0],[5,5,0],
			[4,6,0],[5,0,0],[4,2,0],[2,1,0],[5,2,0],[5,3,0],[7,1,0],[4,1,0],[8,1,0],[4,3,0],[7,0,0],[5,6,0],[4,4,0],[2,4,0],[1,5,0],[9,0,0],
			   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,
			   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,   null,
			[7,4,0],[8,7,0],[7,7,0],[6,7,0],[5,7,0],[2,7,0],[3,7,0],[1,4,0],[0,4,0],[1,7,0],[6,4,0],[7,6,0] // numpad 0…9, numpad ., REPEAT
		],
		petscii2matrix = petscii2matrixGraphicsKbd;
	// dict keyCode (cursor keys, space) to joystick movement
	var kbdJoystickCodes = {
			37: 'left',
			38: 'up',
			39: 'right',
			40: 'down',
			32: 'fire'
		},
		kbdJoystickRaw = {
			37: 0x9d,
			38: 0x91,
			39: 0x1d,
			40: 0x11,
			32: 0x20
		};
	// virtual numeric keypad
	var virtualNumPadCodesGraphicsKbd = {
			'U': 0x34,
			'I': 0x35,
			'O': 0x36,
			'J': 0x31,
			'K': 0x32,
			'L': 0x33,
			'M': 0x30
		},
		virtualNumPadCodesBusinessKbd = {
			'7': 0x87,
			'8': 0x88,
			'6': 0x86,
			'U': 0x84,
			'I': 0x85,
			'O': 0x86,
			'J': 0x81,
			'K': 0x82,
			'L': 0x83,
			'M': 0x80,
			'.': 0x8a
		},
		virtualNumPadCodes = virtualNumPadCodesGraphicsKbd;

	// parses a KeyboardEvent and returns a PETSCII code object with properties:
	//  code:  unshifted PETSCII code or Left-SHIFT: 1, Right-SHIFT: 2, STOP: 3 (default: -1)
	//  shift: is shifted key (boolean flag)
	//  pos:   positional code (en-us) on native keyboard, if available

	function decodeKbdEvent(event) {
		var key = event.key || '',
			shift = false,
			code = -1,
			pos = event.code;
		if (kbdOldLvl3API) { // fix up deprecated Level 3 model
			key = event.keyIdentifier;
			var match = key.match(/^U\+([0-9A-F]+)/i);
			if (match) {
				key = String.fromCharCode(parseInt(match[1], 16));
				if (!event.shiftKey) key = key.toLowerCase();
			}
			else if (key === 'Unidentified') key = 'Dead';
			if (event.keyCode == 0x2d && !event.charCode) key = 'Insert';
		}
		if ((event.getModifierState && event.getModifierState('CapsLock')) || kbdOldLvl3CapsLockActive) {
			var tag = !editMode && kbdJoystickCodes[event.keyCode],
				fireIsShift =  controller.virtualJoystickGetButtonChar() == 1;
			if (tag) { // virtual joystick
				if (disableVirtualModesOnShift && event.shiftKey && !fireIsShift) {
					event.preventDefault();
					if (controller.joystickActive()) controller.virtualJoystickReset();
					var code = kbdJoystickRaw[event.keyCode];
					return { 'code': code & 0x7f, 'shift': !!(code & 0x80), 'pos': pos };
				}
				else if (controller.virtualJoystick(tag, event.type === 'keydown')) {
					event.preventDefault();
					return { 'code': -1, 'shift': false, 'pos': pos };
				}
			}
			if (key.length === 1) {
				if ((!editMode && (!businessMode || event.location !== 3)) && virtualNumPad && virtualNumPadCodes[key.toUpperCase()]) { // virtual numpad
					event.preventDefault();
					if (disableVirtualModesOnShift && event.shiftKey && !fireIsShift) {
						setShift(0);
						return { 'code': key.toUpperCase().charCodeAt(0), 'shift': false, 'pos': pos };
					}
					else {
						controller.showKepadActivity(event.type === 'keydown');
						return { 'code': virtualNumPadCodes[key.toUpperCase()], 'shift': false, 'pos': pos };
					}
				}
				key = event.shiftKey || kbdShiftState? key.toUpperCase():key.toLowerCase();
			}
		}
		if (key.length == 1) { // single character
			code = key.charCodeAt(0);
			if (event.location === 3) { // numeric key pad
				if (code === 0x2c || code === 0x2e) code = businessMode? 0x8a:0x2e; // comma => decimal dot 
				else if (code === 0xd && !businessMode) code = 0x3d; // enter => =
				if (businessMode && code >= 0x30 && code <= 0x39) code += 0x50;
				shift = event.shiftKey;
			}
			else if (code === 0x60 || code === 0xa7) { // grave, section (row 1, key 1) => up-arrow
				code = 0x5e;
			}
			else if (code === 0x03c0 || code === 0xb0 || code === 0xb1 || code === 0xac || code === 0x7e) { // PI (also degree, plus/minus, not, tilde)
				code = 0x5e;
				shift = true;
			}
			else if (code === 0xae) { // (R) => reverse (ALT + R)
				code = 0x12;
			}
			else if (code === 0x2030 || code === 0xb6 || code === 0xb8) { // reverse off (per-mille, pilcrow, cedille: ALT+SHIFT R)
				code = 0x12;
				shift = true;
			}
			else if (code === 0xa3) { // pound (£)  => $
				code = 0x24;
			}
			else if (code >= 0x41 && code <= 0x5a) { // upper-case letter
				shift = event.shiftKey;
			}
			else if (code >= 0x61 && code <= 0x7a) { // normalize lower-case to upper-case
				code -= 0x20;
			}
			else if (code === 8 || code === 0x7f) { // backspace, del
				code = 0x14;
				shift = event.shiftKey;
			}
			else if (code === 9) { // tab
				if (businessMode) {
					code = event.altKey? 0x12:0x09;
				}
				else {
					code = event.altKey? 0x12:0x5e;
				}
				shift = event.shiftKey;
			}
			else if (code === 0x1b) { // esc
				if (businessMode) {
					code = event.altKey? 3:27;
				}
				else {
					code = 3;
				}
				shift = event.shiftKey;
				event.preventDefault();
			}
			var gfx = unicode2Petscii[code];
			if (gfx) {
				code = gfx & 0x7f;
				shift = true;
			}
			else if (vkKbdJapan) {
				var katakana = kana2Petscii[code];
				if (katakana) {
					code = katakana & 0x7f;
					shift = katakana != 0x5C; //¥ not shifted
				}
			}
			if (code === 0x52 && event.altKey) { // R + ALT (not ALT-GR) => reverse on/off
				code = 0x12;
				shift = event.shiftKey;
			}
			if (code === 0x20 || code === 0x0d) shift = event.shiftKey;
			if (!petscii2matrix[code]) code = -1;
		}
		else if (key === 'Dead') {
			switch (event.keyCode) {
				case 192: //caret/grave (row 1, key 1) as dead key
				case 160:
					code = 0x5e;
					shift = event.shiftKey;
					break;
			}
		}
		else {
			switch (key) {
			// function/modifier
				case 'Escape':
				case 'Esc':
					if (businessMode) {
						code = event.altKey? 3:27; // ESC = ESC, ALT+ESC = STOP
					}
					else {
						code = 3; // ESC => STOP (^C)
					}
					shift = event.shiftKey;
					event.preventDefault();
					break;
				case 'Shift': // SHIFT: left = 1, right = 2
					code = event.location == 2? 2:1;
					shift = event.shiftKey;
					break;
			// editing
				case 'Enter':
					if (event.altKey && event.shiftKey) {
						if (controller) controller.showCPULog();
						break;
					}
					if (!businessMode && event.location === 3) { // numeric key pad
						code = 0x3d; // enter to =
					}
					else {
						code = 0x0d;
					}
					shift = event.shiftKey;
					break;
				case 'Tab':
					if (businessMode) {
						code = event.altKey? 0x12:0x09; // TAB = TAB, TAB+ALT = rvs
					}
					else {
						code = event.altKey? 0x12:0x5e; // TAB => up arrow/pi, TAB + ALT => rvs on/off
					}
					shift = event.shiftKey;
					break;
				case 'Backspace':
				case 'Delete':
				case 'Del':
					code = 0x14;
					shift = event.shiftKey;
					break;
				case 'Insert':
					code = 0x14;
					shift = event.shiftKey;
					break;
				case 'Space':
					code = 0x20;
					shift = event.shiftKey;
					break;
			// navigation
				case 'Home':
				case 'Clear':
					code = 0x13;
					shift = event.shiftKey;
					break;
				case 'ArrowDown':
				case 'Down':
					code = 0x11;
					break;
				case 'ArrowUp':
				case 'Up':
					code = 0x11;
					shift = 1;
					break;
				case 'ArrowRight':
				case 'Right':
					code = 0x1d;
					break;
				case 'ArrowLeft':
				case 'Left':
					code = 0x1d;
					shift = 1;
					break;
			// numeric keypad
				case 'Decimal':
					code = 0x3d;
					shift = event.shiftKey;
					break;
				case 'Multiply':
					code = 0x2a;
					shift = event.shiftKey;
					break;
				case 'Divide':
					code = 0x2f;
					shift = event.shiftKey;
					break;
				case 'Add':
					code = 0x2b;
					shift = event.shiftKey;
					break;
				case 'Subtract':
					code = 0x2d;
					shift = event.shiftKey;
					break;
			}
		}
		return { 'code': code, 'shift': shift, 'pos': pos };
	}
	
	function isKbdBlocked(event) {
		return (
			disabled || event.metaKey || event.ctrlKey || (event.getModifierState &&
				(event.getModifierState('Fn') ||  event.getModifierState('Hyper')
				|| event.getModifierState('OS') || event.getModifierState('Super')
				|| event.getModifierState('Win') || event.getModifierState('Control')
				|| event.getModifierState('Meta'))
				)
			);
	}

	function onKeyDown(event) {
		if (kbdOldLvl3CapsLock && event.keyIdentifier === 'CapsLock') {
			kbdOldLvl3CapsLockActive = true;
			return;
		}
		if (event.ctrlKey && (event.key === 'Esc' || event.key === 'Escape')) {
			event.preventDefault();
			controller.haltAndDebug();
			return;
		}
		if (isKbdBlocked(event)) return true;
		if (kbdOldLvl3Repeat && event.keyCode === kbdOldLvl3LastKey) {
			event.preventDefault();
			return;
		}
		var key = decodeKbdEvent(event);
		if (key.code === 1 || key.code === 2) {
			kbdShiftState |= key.code;
		}
		if (!event.shiftKey) kbdShiftState = 0;
		if (key.code > 0) event.preventDefault();
		if (event.repeat && pressedKeys[key.code]) return;
		if (key.code === 3) {
			if (event.altKey && !businessMode) {
				if (!event.repeat) controller.pauseButton();
			}
			else {
				releaseKeyMatrix();
				keyMatrixSetChar(3, key.shift);
				syncKeyMatrix();
			}
			return;
		}
		else if (key.code > 2) {
			addKeyPress(key, editMode && !businessMode);
			if (editMode && key.code !== 0x12 && key.code !== 0x13) keyRepeatSet(key); // no repeat for RVS and HOME
		}
		if (key.code > 0) {
			applyKeys(kbdShiftState);
			if (kbdOldLvl3Repeat) kbdOldLvl3LastKey = event.keyCode;
		}
	}

	function onKeyUp(event) {
		if (kbdOldLvl3CapsLock && event.keyIdentifier === 'CapsLock') {
			kbdOldLvl3CapsLockActive = false;
			return;
		}
		if (isKbdBlocked(event)) return true;
		if (event.repeat) return;
		var key = decodeKbdEvent(event);
		if (key.code === 1 || key.code === 2) {
			kbdShiftState &= ~key.code;
		}
		if (!event.shiftKey) kbdShiftState = 0;
		if (key.code > 0) {
			event.preventDefault();
			if (key.code > 2) {
				removeKeyPress(key);
				if (keyRepeatCntr) keyRepeatReset(key);
			}
			applyKeys(kbdShiftState);
		}
		if (!event.altKey && vkSticky && !vkPressed) vkReleaseSticky();
		if (kbdOldLvl3Repeat) kbdOldLvl3LastKey = 0;
	}
	
	function addKeyPress(key, clearAll) {
		if (clearAll) {
			for (var p in pressedKeys) delete pressedKeys[p];
		}
		else {
			removeKeyPress(key);
		}
		pressedKeys[key.code] = key;
	}

	function removeKeyPress(key) {
		if (pressedKeys[key.code]) { // delete by semantics
			delete pressedKeys[key.code];
		}
		else if (key.pos) { // delete by position
			for (var p in pressedKeys) {
				if (pressedKeys[p].pos == key.pos) {
					var k = pressedKeys[p];
					delete pressedKeys[p];
					if (keyRepeatCntr) keyRepeatReset(k);
					break;
				}
			}
		}
	}

	function applyKeys(shiftState) {
		var shifted = false, presses = 0;
		for (var i = 0; i < 10; i++) keyrows[i] = 0xff;
		for (var p in pressedKeys) {
			var k = pressedKeys[p],
				m = petscii2matrix[k.code];
			keyrows[m[0]] &= ~(1 << m[1]);
			if (k.shift || m[2]) shifted = true;
			presses++;
		}
		var shiftCode = shifted?
				shiftState || 1:
				presses? 0 : shiftState || 0;
		setShift(shiftCode);
		io.setKeyrows(keyrows);
	}

	function keyRepeatSet(key) {
		if (!hasRepeatKey) {
			if (keyRepeatCntr && keyRepeatCode && (key.code !== keyRepeatCode.code || (key.pos && key.pos !== keyRepeatCode.pos)))
				keyRepeatQueue.push(keyRepeatCode);
			keyRepeatCode = key;
		}
		keyRepeatCntr = keyRepeatInitialDelay;
	}

	function keyRepeatReset(key) {
		if (hasRepeatKey) {
			var m = petscii2matrix[0x8b];
			keyrows[m[0]] |= 1 << m[1];
		}
		else {
			for (var p in pressedKeys) delete pressedKeys[p];
			if (key) {
				if (keyRepeatCode && (key.code === keyRepeatCode.code || (key.pos && key.pos === keyRepeatCode.pos))) {
					if (key.pos) {
						for (var i = 0; i < keyRepeatQueue.length; i++) {
							var k = keyRepeatQueue[i];
							if (key.pos === keyRepeatCode.pos) keyRepeatQueue.splice(i--, 1);
						}
					}
					if (keyRepeatQueue.length) {
						keyRepeatCode = keyRepeatQueue.pop();
						addKeyPress(keyRepeatCode, true);
						applyKeys(kbdShiftState);
						keyRepeatCntr = keyRepeatContinuationDelay;
						return;
					}
				}
				else {
					for (var i = 0; i < keyRepeatQueue.length; i++) {
						var k = keyRepeatQueue[i];
						if (key.code === k.code && key.shift === k.shift) {
							keyRepeatQueue.splice(i, 1);
							return;
						}
					}
				}
			}
		}
		keyRepeatQueue.length = 0;
		keyRepeatCntr = 0;
		keyRepeatCode = null;
	}

	function keyRepeatSyncAction() {
		if (keyRepeatCntr === 2) {
			if (!hasRepeatKey) {
				clearKeyMatrix();
				syncKeyMatrix();
			}
			keyRepeatCntr--;
		}
		else if (keyRepeatCntr === 1) {
			if (hasRepeatKey) {
				var m = petscii2matrix[0x8b];
				keyrows[m[0]] &= ~(1 << m[1]);
				syncKeyMatrix();
				keyRepeatCntr = 0;
			}
			else if (keyRepeatCode) {
				var c = keyRepeatCode.code,
					m = petscii2matrix[c],
					shiftCode;
				if (c === 0x0d || c === 0x20 || (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a)) {
					shiftCode = kbdShiftState;
				}
				else if (keyRepeatCode.shift && kbdShiftState) {
					shiftCode = kbdShiftState;
				}
				else if (keyRepeatCode.shift) {
					shiftCode = 1;
				}
				else {
					shiftCode =  0;
				}
				keyrows[m[0]] &= ~(1 << m[1]);
				setShift(shiftCode);
				syncKeyMatrix();
			}
			keyRepeatCntr = keyRepeatDelay;
		}
		else keyRepeatCntr--;
	}

	// ======= joystick keyboard input =======

	var joystickDirs = {
			'down':   1,
			'left':   2,
			'right':  4,
			'up':     8,
		},
		joystickDirCodesGraphicsKbd = {
			1: 0x32,
			2: 0x34,
			4: 0x36,
			8: 0x38,
			3: 0x31,
			5: 0x33,
			10: 0x37,
			12: 0x39
		},
		joystickDirCodesBusinessKbd = {
			1: 0x82,
			2: 0x84,
			4: 0x86,
			8: 0x88,
			3: 0x81,
			5: 0x83,
			10: 0x87,
			12: 0x89
		},
		joystickDirCodes = joystickDirCodesGraphicsKbd,
		joystickLastCode = 0,
		joystickLastButtonChar = 0,
		lastMappings = null;

	function joystickInput(reading, buttonChar, mappings) {
		if (disabled) return;
		if (mappings) {
			for (var d in joystickDirs) {
				var c = mappings[d];
				if (c > 0) {
					if (businessMode && c >= 0x30 && c <= 0x39) c += 0x50; // numpad
					if (reading[d]) keyMatrixSetChar(c, 0);
					else keyMatrixUnsetChar(c);
				}
			}
			c = mappings.fire;
			if (c < 0) c = buttonChar;
			if (reading.fire) keyMatrixSetChar(c, 0);
			else keyMatrixUnsetChar(c);
			lastMappings = mappings;
			syncKeyMatrix();
		}
		else {
			var dirCode = 0, code, lastDirCode;
			if (reading.left)  dirCode ^= joystickDirs.left;
			if (reading.right) dirCode ^= joystickDirs.right;
			if (reading.up)    dirCode ^= joystickDirs.up;
			if (reading.down)  dirCode ^= joystickDirs.down;
			if ((code & 6) === 6) dirCoded &= ~6;
			if ((code & 9) === 9) dirCode &= ~9;
			code = dirCode;
			if (reading.fire) code |= 0x100;
			if (code !== joystickLastCode) { // state changed
				lastDirCode = joystickLastCode & 0xff;
				if (editMode) {
					keyRepeatReset();
					if (!businessMode) releaseKeyMatrix();
				}
				else if (lastDirCode && joystickDirCodes[lastDirCode]) keyMatrixUnsetChar(joystickDirCodes[lastDirCode]);
				if (dirCode && joystickDirCodes[dirCode]) keyMatrixSetChar(joystickDirCodes[dirCode], 0);
				if (reading.fire) {
					keyMatrixSetChar(buttonChar, 0);
					if (joystickLastButtonChar && joystickLastButtonChar != buttonChar) keyMatrixUnsetChar(joystickLastButtonChar);
					joystickLastButtonChar = buttonChar;
				}
				else if ((joystickLastCode & 0x100) && joystickLastButtonChar) {
					keyMatrixUnsetChar(joystickLastButtonChar);
					joystickLastButtonChar = 0;
				}
				joystickLastCode = code;
				syncKeyMatrix();
			}
			lastMappings = null;
		}
	}
	function joystickInputReset() {
		if (lastMappings) {
			for (var d in joystickDirs) {
				var c = lastMappings[d];
				if (c > 0) {
					if (businessMode && c >= 0x30 && c <= 0x39) c += 0x50; // numpad
					keyMatrixUnsetChar(c);
				}
			}
			c = lastMappings.fire;
			if (c < 0) c = buttonChar;
			keyMatrixUnsetChar(c);
			syncKeyMatrix();
		}
		else if (joystickLastCode) {
			var lastDirCode = joystickLastCode & 0xff;
			if (lastDirCode && joystickDirCodes[lastDirCode]) keyMatrixUnsetChar(joystickDirCodes[lastDirCode]);
			if (joystickLastButtonChar) keyMatrixUnsetChar(joystickLastButtonChar);
			syncKeyMatrix();
		}
		joystickLastCode = 0;
		joystickLastButtonChar = 0;
		lastMappings = null;
	}
	
	init();

	return {
		'connect': connect,
		'listen': enableUIHandlers,
		'disable': disable,
		'setKeyRepeat': setKeyRepeat,
		'getKeyRepeat': getKeyRepeat,
		'joystickInput': joystickInput,
		'joystickInputReset': joystickInputReset,
		'enableVirtualKeypad': enableVirtualKeypad,
		'setBusinessMode': setBusinessMode,
		'isEditMode': isEditMode,
		'isBusinessMode': isBusinessMode,
		'reset': reset,
		'release': releaseAllKeys,
		'busy': busy,
		'stopKey': stopKey,
		'sync': ioSync,
		'setCharsetVersion': setCharsetVersion
	};

};
