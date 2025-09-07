//
// Copyright (c) 2024 Norbert Landsteiner; www.masswerk.at/pet/
// All rights reserved.
//
// petdebugger.js - debugger/monitor
//

function PetDebugger(pet2001, ctrl, sysConfig) {
	"use strict";

	var IO_ADDR    = 0xe800,
		IO_TOP     = 0xefff,
		VIDEO_ADDR = 0x8000,
		VIDEO_TOP  = 0x8fff;

	if (sysConfig && typeof sysConfig === 'object') {
		IO_ADDR    = sysConfig.IO_ADDR;
		IO_TOP     = sysConfig.IO_TOP;
		VIDEO_ADDR = sysConfig.VIDEO_ADDR;
		VIDEO_TOP  = sysConfig.VIDEO_TOP;
		if (VIDEO_TOP >= IO_ADDR) VIDEO_TOP = IO_ADDR - 1;
	}

	var modes = {
		'OFF':    0,
		'CONT':   1,
		'NEXT':   2,
		'SINGLE': 3
	},
	breakpoints = {},
	brackets = [],
	runLevel = modes.CONT,
	ignoreInterrupts = true,
	trapIllegals = false,
	guiDisabled = true,
	COM = {
		'breakpoints': breakpoints,
		'brackets': brackets,
		'runLevel': runLevel,
		'ignoreInterrupts': ignoreInterrupts,
		'trapIllegals': trapIllegals
	},
	regNames =['pc','sr','sp','a','x','y'],
	flagNames=['n','v','b','d','i','z','c'],
	currentPC, currentSP = 0x1ff,
	inputs, buttons, checkboxes, regInputs, flagEls, codeCtrlButtons,
	elDisass, elDisassHint, elTrace, debugDisplays, elVideoDisplay,
	elMemNote, elStackMark,
	memDisplayAddr = 0, codeDisplayAddr = 0xf000, codeDisplayNext = 0,
	tabs, tabPanes, tabDisplays, debugCodeAddr, codeDisplayTarget, codeDisplaySelected,
	codeDisplayMore, codeHistStackPrev = [], codeHistStackNext = [], ctxEditData,
	tabActive, tabUpdated = {}, regsEditable = false, btnRegisterLock;
	function setRunLevel(v) {
		runLevel = COM.runLevel = v;
	}
	function setIgnoreInterrupts() {
		ignoreInterrupts = COM.ignoreInterrupts = checkboxes.IGNORE_INTERRUPTS.checked;
	}

	function setTrapIllegals() {
		trapIllegals = COM.trapIllegals = checkboxes.TRAP_ILLEGALS.checked;
	}

	function hex(n, l) {
		if (!l) l = 2;
		var s = n.toString(16).toUpperCase();
		while (s.length < l) s = '0' + s;
		return s;
	}

	function petsciiToAscii(c) {
		if (c === 0x26) return '&amp;';
		if (c === 0x22) return '&quot;';
		if (c === 0x3C) return '&lt;';
		if (c === 0x3E) return '&gt;';
		if (c >= 0x40 && c <= 0x5A) return String.fromCharCode(c + 0x20);
		if (c >= 0xC1 && c <= 0xDA) return String.fromCharCode(c - 0x80);
		return c < 0x20 || c > 0x7D? '~' : String.fromCharCode(c);
	}
	function screenCodeToAscii(c) {
		c &= 0x7f;
		if (c === 0) return '@';
		if (c === 0x26) return '&amp;';
		if (c === 0x22) return '&quot;';
		if (c === 0x3C) return '&lt;';
		if (c === 0x3E) return '&gt;';
		if (c <= 0x1A) return String.fromCharCode(c + 0x60);
		if (c <= 0x1A) return String.fromCharCode(c + 0x20);
		if (c <= 0x1F) return String.fromCharCode(c + 0x40);
		if (c <= 0x3F) return String.fromCharCode(c);
		if (c >= 0x41 && c <= 0x5A) return String.fromCharCode(c);
		if (c === 0x5E) return '\u03c0';
		return '~';
	}

	function enable(flagActive) {
		guiEnable(false);
		setRunLevel(flagActive? modes.CONT:modes.OFF);
		if (!flagActive) {
			pet2001.halt(false);
			ctrl.pause(false, false, true);
		}
	}

	function addBreakpoint(event) {
		if (event) {
			event.preventDefault();
			event.returnValue = false;
		}
		ctrl.showBreakpointDialog(function(retObj) {
			if (typeof retObj === 'object') addBreakpointOrBracket(retObj);
		});
	}
	function addBreakpointOrBracket(obj) {
		var id, title, label, type;
		if (obj.type === 'breakpoint') {
			id = hex(obj.address,4);
			label = hex(obj.address,4);
			title = 'breakpoint at $'+label;
			type = 'breakpoint';
		}
		else if (obj.type === 'bracket') {
			var hFrom = hex(obj.from,4),
				hTo = hex(obj.to,4),
				mode = obj.onEnter? 'enter':'exit';
			id = hFrom+'_'+hTo+'_'+mode;
			label = '['+hFrom+'&hellip;'+hTo+']';
			title = 'halt on PC '+ mode+'s range $'+hex(obj.from,4)+'&hellip;$'+hex(obj.to,4);
			type = 'bracket-'+mode;
		}
		if (id && document.getElementById('debugBP'+id)) {
			ctrl.showInfoDialog('New Breakpoint or Bracket', 'Breakpoint or bracket already exists.');
			return;
		}
		var bp = document.createElement('div');
		bp.id='debugBP_'+id;
		bp.innerHTML = '<span><input type="checkbox" checked title="active"></span><span class="debugBreakpointAddress debugIconType-'+type+'" title="'+title+'">'+label+'</span><span class="debugBreakpointRight"><span class="debugBreakpointDelete" title="delete">&times;</span></span>';
		bp.querySelector('input[type=checkbox]').addEventListener('change', function() { activateBreakpoint(id, this) }, false);
		bp.querySelector('.debugBreakpointDelete').addEventListener('click', function(event) {
			removeBreakpoint(id);
			event.preventDefault();
			event.returnValue = false;
		}, false);
		document.getElementById('debugBreakpoints').appendChild(bp);
		if (obj.type === 'breakpoint') {
			breakpoints[obj.address] = true;
		}
		else if (obj.type === 'bracket') {
			brackets.push([true, obj.from, obj.to, obj.onEnter]);
		}
	}
	function activateBreakpoint(id, cbx) {
		var parts = id.split('_');
		if (parts.length===1) {
			var addr=parseInt(id,16);
			if (!isNaN(addr) && typeof breakpoints[addr] !== 'undefined') breakpoints[addr] = cbx.checked;
		}
		else {
			var addrFrom=parseInt(parts[0],16),
				addrTo=parseInt(parts[1],16),
				modeEnter = parts[2] === 'enter';
			for (var i=0; i<brackets.length; i++) {
				var b = brackets[i];
				if (b[1] == addrFrom && b[2] == addrTo && b[3] == modeEnter) {
					b[0] = cbx.checked;
					break;
				}
			}
		}
		cbx.setAttribute('title', cbx.checked? 'active':'inactive');
	}
	function removeBreakpoint(id) {
		var parts = id.split('_');
		if (parts.length===1) {
			var addr=parseInt(id,16);
			if (!isNaN(addr) && typeof breakpoints[addr] !== 'undefined') {
				delete breakpoints[addr];
			}
		}
		else {
			var addrFrom=parseInt(parts[0],16),
				addrTo=parseInt(parts[1],16),
				modeEnter = parts[2] === 'enter';
			for (var i=0; i<brackets.length; i++) {
				var b = brackets[i];
				if (b[1] == addrFrom && b[2] == addrTo && b[3] == modeEnter) {
					brackets.splice(i,1);
					break;
				}
			}
		}
		var bp=document.getElementById('debugBP_'+id);
		bp.parentNode.removeChild(bp);
	}

	function editRegister(event) {
		if (!regsEditable || guiDisabled) return;
		var el = event.target,
			reg = el.dataset.reg;
		if (reg) {
			var v = parseInt(el.value.replace(/[^0-9a-f]/gi,''), 16);
			if (isNaN(v)) {
				el.value = hex(pet2001.getRegister(reg), reg==='pc'? 4:2);
			}
			else {
				var h;
				v &= reg === 'pc'?  0xffff:0xff;
				pet2001.setRegister(reg, v);
				var s = pet2001.getCPUStatus();
				el.value = hex(s[reg], reg==='pc'? 4:2);
				disass(s.pc);
				elDisassHint.innerHTML = executionHint(s);
				if (reg === 'sp') {
					currentSP = s.sp;
					tabUpdated.STACK = false;
					if (tabActive === 'STACK') renderActiveTab();
				}
				else if (reg === 'pc') {
					currentPC = s.pc;
					tabUpdated.CODE = false;
					if (tabActive === 'CODE') renderActiveTab();
				}
				else if (reg === 'sr') {
					for (var n of flagNames) flagEls[n].innerHTML = s[n];
				}
			}
		}
	}
	function toggleFlag(event) {
		if (!regsEditable || guiDisabled) return;
		var el = event.target,
			flag = el.dataset.flag;
		if (flag) {
			var v = pet2001.getFlag(flag) ^ 1;
			pet2001.setFlag(flag, v);
			el.innerHTML = v;
			regInputs.sr.value = hex(pet2001.getRegister('sr'), 2);
		}
		event.preventDefault();
	}

	function updateStatus(s, reason) {
		for (var n of regNames) regInputs[n].value = hex(s[n], n==='pc'? 4:2);
		for (var n of flagNames) flagEls[n].innerHTML = s[n];
		disass(s.pc);
		elDisass.className = reason? 'debugIconType-'+reason:'';
		elDisassHint.innerHTML = executionHint(s);
		currentSP = s.sp;
		currentPC = s.pc;
		tabUpdated.MEM = tabUpdated.STACK = tabUpdated.CODE = tabUpdated.IO = false;
		elVideoDisplay.innerHTML = 'video: ' + pet2001.getVideoStatus(true);
		renderActiveTab();
	}

	function updateCPUStatus() {
		var status = pet2001.getCPUStatus();
		if (pet2001.cpuJammed) updateStatus({
			'pc': status.pc,
			'a': 0xff,
			'x': 0xff,
			'y': 0xff,
			'sp': 0xff,
			'sr': 0xff,
			'c': 1,
			'z': 1,
			'i': 1,
			'd': 1,
			'b': 1,
			'v': 1,
			'n': 1
		});
		else {
			updateStatus(status);
			pet2001.video.update();
		}
	}
	function cpuJammed(pc) {
		update();
	}

	function disass(pc) {
		elDisass.innerHTML = hex(pc, 4) + ' ' +
			PetUtils.disassembleInstruction(pc, pet2001.dump(pc), pet2001.dump((pc+1)&0xffff), pet2001.dump((pc+2)&0xffff), false).listing;
		elDisass.classList.remove('disabled');
	}
	function addTrace(str, status, cycles) {
		while (str.length < 28) str += ' ';
		str += '|' + hex(status.a,2) + ' '
			+ hex(status.x,2) + ' '
			+ hex(status.y,2) + ' '
			+ hex(status.sp,2) + '|'
			+ status.n + status.v + status.d + status.i + status.z + status.c
			+ '|' + (cycles || '-') + '\n';
		elTrace.value += str;
		elTrace.scrollTop = elTrace.scrollHeight;
	}

	function trace(status, cycles) {
		var pc = status.pc;
		addTrace(
			hex(pc, 4) + ' ' +
			PetUtils.disassembleInstruction(pc, pet2001.dump(pc), pet2001.dump((pc+1)&0xffff), pet2001.dump((pc+2)&0xffff), false).listing,
			status,
			cycles
		);
	}
	function interrupt(type, status, pc0, pc1, cycles) {
		addTrace(hex(pc0,4) + ' ' + type + ' -> ' + hex(pc1,4), status, cycles);
	}
	function haltOnInstr(status, reason) {
		updateStatus(status, reason);
		pet2001.halt(true);
		ctrl.pause(true, false, true);
		guiEnable(true);
		document.getElementById('debugShowCPULog').hidden = false;
	}

	function clearLog(event) {
		if (event) {
			event.preventDefault();
			event.returnValue = false;
		}
		elTrace.value = '';
		elTrace.scrollTop = 0;
	}

	function showCPULog() {
		if (event) {
			event.preventDefault();
			event.returnValue = false;
		}
		ctrl.showCPULog();
	}

	function halt() {
		if (!runLevel) setRunLevel(modes.CONT);
		pet2001.halt(true);
		guiEnable(true);
		ctrl.pause(true);
	}
	function step() {
		setRunLevel(modes.SINGLE);
		pet2001.halt(false);
		guiEnable(false);
		ctrl.pause(false, false, true);
	}
	function next() {
		setRunLevel(modes.NEXT);
		pet2001.halt(false);
		guiEnable(false);
		ctrl.pause(false, false, true);
	}
	function run() {
		setRunLevel(modes.CONT);
		pet2001.halt(false);
		guiEnable(false);
		ctrl.pause(false, false, true);
	}
	function resume() {
		setRunLevel(modes.CONT);
		pet2001.halt(false);
		guiEnable(false);
	}
	function update() {
		guiEnable(true);
		updateCPUStatus();
	}

	function renderStack() {
		var sp = currentSP,
			stack = [], s='', spIdx;
		pet2001.readRam(0x100, stack, 0x100);
		for (var i=0; i<=0xff; i++) {
			if (i === sp) spIdx = s.length;
			s += hex(stack[i],2) + ((i+1)%16==0? '\n':' ');
		}
		tabDisplays.STACK.innerHTML = s;
		if (spIdx) {
			var range = document.createRange(),
				textNode = tabDisplays.STACK.firstChild;
			range.setStart(textNode, spIdx);
			range.setEnd(textNode, spIdx+2);
			var rect = range.getBoundingClientRect(),
				clientRect = tabDisplays.STACK.getBoundingClientRect(),
				s = elStackMark.style;
			s.left = (rect.x - clientRect.x - 3)+'px';
			s.top = (rect.y - clientRect.y - 2)+'px';
			s.width = (rect.width + 6)+'px';
			s.height = (rect.height + 4)+'px';
			tabDisplays.STACK.appendChild(elStackMark);
		}
		tabUpdated.STACK = true;
	}

	function renderMemory(scrollFlag) {
		if (memDisplayAddr >= IO_ADDR && memDisplayAddr <= IO_TOP) {
			tabDisplays.MEM.innerHTML = getIOList();
			elMemNote.innerHTML = 'I/O space ' + hex(IO_ADDR,4) + '&ndash;' + hex(IO_TOP,4) + ' (view only).';
		}
		else {
			var s = '', mem = [],
				isVideoRam = memDisplayAddr >= VIDEO_ADDR && memDisplayAddr <= VIDEO_TOP,
				editable = memDisplayAddr < pet2001.getRamSize() || isVideoRam,
				charFunc = isVideoRam? screenCodeToAscii:petsciiToAscii;
			pet2001.readRange(memDisplayAddr, mem, 0x100);
			for (var r = 0; r < 32; r++) {
				var b = r * 8, addr = hex(memDisplayAddr + b, 4), t = '';
				s += '<span class="debugMemRow"><span class="debugMemAddr">'+addr+' </span>';
				if (editable) s += '<span class="debugMemData" data-loc="'+addr+'">';
				else s += '<span class="debugMemData">';
				for (var i = 0; i < 8; i++) {
					var d = mem[b+i];
					s += hex(d,2);
					if (i<7) s+=' ';
					t += charFunc(d);
				}
				s += '</span><span class="debugMemChar"> '+t+'</span></span>';
			}
			tabDisplays.MEM.innerHTML = s;
			elMemNote.innerHTML = editable? 'right-click memory values to edit.':'view only (no RAM).';
		}
		if (scrollFlag) tabDisplays.MEM.scrollTop = 0;
		tabUpdated.MEM = true;
	}

	function renderIO() {
		tabDisplays.IO.innerHTML = getIOList();
		tabUpdated.IO = true;
	}

	function getIOVal(addr) {
		var v = pet2001.dump(addr),
			h = (0x100 | v).toString(16).substring(1).toUpperCase(),
			bh = (0x10 | (v>>4)).toString(2).substring(1),
			bl = (0x10 | (v&0xf)).toString(2).substring(1);
		return h + '  <span class="debugBinNibble">'+bh+'</span><span class="debugBinNibble">'+bl+'</span> ';
	}

	function getIOList() {
		var rStart = '<span class="debugIOrow"><span class="debugIOlabel">',
			rEnd = '</span></span>',
			rSep = ' </span><span class="debugIOdata">',
			ah = hex((IO_ADDR>>8), 2);
		return  rStart + '- PIA 1 -' + rEnd
			+ rStart + ah + '10 PORT A' + rSep + getIOVal(IO_ADDR + 0x10) + rEnd
			+ rStart + ah + '11 CRA' + rSep + getIOVal(IO_ADDR + 0x11) + rEnd
			+ rStart + ah + '12 PORT B' + rSep + getIOVal(IO_ADDR + 0x12) + rEnd
			+ rStart + ah + '13 CRB' + rSep + getIOVal(IO_ADDR + 0x13) + rEnd
			+ rStart + '&nbsp;' + rEnd
			+ rStart + '- PIA 2 -' + rEnd
			+ rStart + ah + '20 PORT A' + rSep + getIOVal(IO_ADDR + 0x20) + rEnd
			+ rStart + ah + '21 CA2' + rSep + getIOVal(IO_ADDR + 0x21) + rEnd
			+ rStart + ah + '22 PORT B' + rSep + getIOVal(IO_ADDR + 0x22) + rEnd
			+ rStart + ah + '23 CB2' + rSep + getIOVal(IO_ADDR + 0x23) + rEnd
			+ rStart + '&nbsp;' + rEnd
			+ rStart + '- VIA -' + rEnd
			+ rStart + ah + '40 PORT B' + rSep + getIOVal(IO_ADDR + 0x40) + rEnd
			+ rStart + ah + '41 PORT A' + rSep + getIOVal(IO_ADDR + 0x41) + rEnd
			+ rStart + ah + '42 DDRB' + rSep + getIOVal(IO_ADDR + 0x42) + rEnd
			+ rStart + ah + '43 DDRA' + rSep + getIOVal(IO_ADDR + 0x43) + rEnd
			+ rStart + ah + '44 T1 LO' + rSep + getIOVal(IO_ADDR + 0x44) + rEnd
			+ rStart + ah + '45 T1 HI' + rSep + getIOVal(IO_ADDR + 0x45) + rEnd
			+ rStart + ah + '46 T1 Latch LO' + rSep + getIOVal(IO_ADDR + 0x46) + rEnd
			+ rStart + ah + '47 T1 Latch HI' + rSep + getIOVal(IO_ADDR + 0x47) + rEnd
			+ rStart + ah + '48 T2 LO' + rSep + getIOVal(IO_ADDR + 0x48) + rEnd
			+ rStart + ah + '49 T2 HI' + rSep + getIOVal(IO_ADDR + 0x49) + rEnd
			+ rStart + ah + '4A SR' + rSep + getIOVal(IO_ADDR + 0x4A) + rEnd
			+ rStart + ah + '4B ACR' + rSep + getIOVal(IO_ADDR + 0x4B) + rEnd
			+ rStart + ah + '4C PCR' + rSep + getIOVal(IO_ADDR + 0x4C) + rEnd
			+ rStart + ah + '4D IFR' + rSep + getIOVal(IO_ADDR + 0x4D) + rEnd
			+ rStart + ah + '4E IER' + rSep + getIOVal(IO_ADDR + 0x4E) + rEnd
			+ rStart + ah + '4F ANH' + rSep + getIOVal(IO_ADDR + 0x4F) + rEnd;
	}

	function setMemDisplay() {
		var addr = parseInt(inputs.MEMPAGE.value.replace(/[^0-9a-f]/gi,''),16);
		if (!isNaN(addr)) {
			while (addr >= 0x100) addr >>= 4;
			memDisplayAddr = addr << 8;
			renderMemory(true);
		}
		inputs.MEMPAGE.value = hex(memDisplayAddr>>8,2);
		adjustMemPageButtons(addr);
	}
	function memPageFwd() {
		var addr = memDisplayAddr>>8;
		inputs.MEMPAGE.value = hex(Math.min(0xff, addr+1),2);
		setMemDisplay();
	}
	function memPageBack() {
		var addr = memDisplayAddr>>8;
		inputs.MEMPAGE.value = hex(Math.max(0, addr-1),2);
		setMemDisplay();
	}
	function adjustMemPageButtons() {
		buttons.MEMPAGE.PAGEPREV.disabled = memDisplayAddr == 0;
		buttons.MEMPAGE.PAGENEXT.disabled = memDisplayAddr >= 0xff00;
	}

	function renderCode(extend, histObj) {
		function isValidTarget(loc) {
			if (loc >= 0x100 && loc <= 0x1ff) return false; // stack
			if (loc >= IO_ADDR && loc <= IO_TOP) return false; // io
			if (loc >= 0xffff) return false;
			return true;
		}
		function getEndAddress(start, end) {
			if (start < 0x100 && end > 0x100) end = 0x100;
			else if (start < VIDEO_ADDR && end > VIDEO_ADDR) end = VIDEO_ADDR;
			else if (start < IO_ADDR && end > IO_ADDR) end = IO_ADDR;
			else if (end >= 0xfff8) end = 0x10000; //extend to sys vectors
			return end;
		}
		// fetch data, get disassembly 
		var startAddr, endAddr, codeRange;
		if (typeof histObj === 'object') {
			extend = false;
			startAddr = codeDisplayAddr = histObj.start;
			endAddr = getEndAddress(startAddr, histObj.end);
		}
		else {
			startAddr = extend? codeDisplayNext:codeDisplayAddr;
			endAddr = getEndAddress(startAddr, startAddr + 0x80);
		}
		codeRange = endAddr - startAddr;
		tabUpdated.CODE = true;
		if (codeRange <= 0) {
			codeDisplayMore = false;
			codeCtrlButtons.MORE.disabled = true;
			return;
		}
		var s = '', mem = [], targets = {}, data;
		pet2001.readRange(startAddr, mem, codeRange);
		data = PetUtils.disassembleCodeRange(startAddr, mem);
		if (!data.length) return;
		// compile content
		for (var i=0; i<data.length; i++) {
			var d = data[i],
				addr = hex(d.addr,4);
			s += '<span class="debugCodeRow" data-addr="'+addr+'"><span class="debugCodeAddr">'+addr+'</span>' +
				'<span class="debugCodeData"> '+d.listing+'</span></span>';
		}
		codeDisplayNext = d.addr + d.step;
		if (extend) {
			tabDisplays.CODE.innerHTML += s;
		}
		else {
			tabDisplays.CODE.innerHTML = s;
			codeDisplayTarget = null;
		}
		// handle local targets and links
		for (var node = tabDisplays.CODE.firstChild; node != null; node = node.nextSibling) {
			var link = node.querySelector('[data-target]');
			if (link) {
				if (link.dataset.indirect) {
					var al = parseInt(link.dataset.target,16),
						ah = (al&0xff00)|((al+1)&0xff),
						a = pet2001.dump(al) | (pet2001.dump(ah)<<8),
						sa = hex(a,4);
					link.setAttribute('title', '&rarr; $'+sa);
					if (isValidTarget(a)) link.dataset.indirect = sa;
					else {
						link.removeAttribute('data-target');
						link.removeAttribute('data-indirect');
					}
				}
				else {
					var a = parseInt(link.dataset.target,16);
					if (!isValidTarget(a)) {
						link.removeAttribute('data-target');
						link.removeAttribute('data-rel');
					}
					if (link.dataset.relative) targets[link.dataset.target] = true;
				}
			}
		}
		for (var node = tabDisplays.CODE.firstChild; node != null; node = node.nextSibling) {
			if (node.dataset.addr && targets[node.dataset.addr]) node.classList.add('localTarget');
		}
		// scroll to new content (and mark selected node)
		if (extend) {
			codeScrollToAddress(hex(startAddr,4), false);
		}
		else if (histObj) {
			var el = tabDisplays.CODE.querySelector('[data-addr="'+hex(histObj.selected,4)+'"]');
			if (el) {
				el.classList.add('selected');
				codeDisplaySelected = el;
			}
			tabDisplays.CODE.scrollTop = histObj.scrollState;
		}
		else {
			tabDisplays.CODE.firstChild.classList.add('selected');
			codeDisplaySelected = tabDisplays.CODE.firstChild;
			tabDisplays.CODE.scrollTop = 0;
		}
		codeDisplayMore = isValidTarget(codeDisplayNext);
		codeCtrlButtons.MORE.disabled = !codeDisplayMore;
	}

	function codeScrollToAddress(sa, select) {
		var el = tabDisplays.CODE.querySelector('[data-addr="'+sa+'"]');
		if (el) {
			if (select) {
				if (codeDisplaySelected) codeDisplaySelected.classList.remove('selected');
				el.classList.add('selected');
				codeDisplaySelected = el;
			}
			var y = Math.max(0, Math.min(tabDisplays.CODE.scrollHeight, el.offsetTop-tabDisplays.CODE.offsetTop-3));
			if (!select || y < tabDisplays.CODE.scrollTop || y > tabDisplays.CODE.scrollTop + tabDisplays.CODE.offsetHeight - el.offsetHeight) tabDisplays.CODE.scrollTop = y;
			return true;
			}
		return false;
	}
	function codeHighliteAddress(addr) {
		if (codeDisplayTarget) codeDisplayTarget.classList.remove('currentTarget');
		codeDisplayTarget = null;
		if (typeof addr !== 'undefined') {
			var va, sa;
			if (typeof addr === 'string') {
				sa = addr;
				va = parseInt(sa,16);
			}
			else {
				va = addr;
				sa = hex(va,4);
			}
			if (va >= codeDisplayAddr && va < codeDisplayNext) {
				var el = tabDisplays.CODE.querySelector('[data-addr="'+sa+'"]');
				if (el) {
					el.classList.add('currentTarget');
					codeDisplayTarget = el;
				}
			}
		}
	}

	function codeAdjustHistoryButtons() {
		codeCtrlButtons.HISTPREV.disabled = codeHistStackPrev.length == 0;
		codeCtrlButtons.HISTNEXT.disabled = codeHistStackNext.length == 0;
	}
	function codeHistoryGetEntry() {
		return {
			'start': codeDisplayAddr,
			'end': codeDisplayNext,
			'selected': codeDisplaySelected? parseInt(codeDisplaySelected.dataset.addr,16) : codeDisplayAddr,
			'scrollState': tabDisplays.CODE.scrollTop
		};
	}
	function codeHistoryBack() {
		if (codeHistStackPrev.length > 0) {
			codeHistStackNext.push(codeHistoryGetEntry());
			renderCode(false, codeHistStackPrev.pop());
		}
		codeAdjustHistoryButtons();
	}
	function codeHistoryFwd() {
		if (codeHistStackNext.length > 0) {
			codeHistStackPrev.push(codeHistoryGetEntry());
			renderCode(false, codeHistStackNext.pop());
		}
		codeAdjustHistoryButtons();
	}
	function codeHistoryReset() {
		codeHistStackNext.length = codeHistStackPrev.length = 0;
		codeAdjustHistoryButtons();
	}
	function codeNavigateTo(addr) {
		codeHistStackPrev.push(codeHistoryGetEntry());
		codeDisplayAddr = addr;
		codeHistStackNext.length = 0;
		renderCode();
		codeAdjustHistoryButtons();
	}
	function codeListCurrent() {
		codeHistoryReset();
		codeDisplayAddr = currentPC;
		renderCode();
	}

	function codeMouseOver(event) {
		if (guiDisabled) return;
		if (event.target.dataset.target) {
			codeHighliteAddress(event.target.dataset.indirect? event.target.dataset.indirect : event.target.dataset.target);
		}
	}
	function codeMouseOut(event) {
		if (guiDisabled) return;
		if (event.target.dataset.target) codeHighliteAddress();
	}
	function codeMouseClick(event) {
		event.preventDefault();
		if (guiDisabled) return;
		if (event.target.dataset.target) {
			var ta = event.target.dataset.indirect? event.target.dataset.indirect : event.target.dataset.target,
				a = parseInt(ta,16);
			if (a < codeDisplayAddr || a >= codeDisplayNext || !codeScrollToAddress(ta, true)) codeNavigateTo(a);
		}
	}
	function codeExtend() {
		if (guiDisabled) return;
		renderCode(true);
	}

	function guiEnable(interactive) {
		guiDisabled = !interactive;
		for (var btn in buttons) buttons[btn].disabled = btn === 'HALT'? interactive:guiDisabled;
		for (var n in inputs) inputs[n].disabled = guiDisabled;
		for (var n in regInputs) regInputs[n].disabled = guiDisabled || !regsEditable;
		debugDisplays.className = interactive? 'active':'';
		if (guiDisabled) {
			if (runLevel !== modes.SINGLE) {
				for (var r of regNames) regInputs[r].value = r === 'pc'? '----':'--';
				for (var f of flagNames) flagEls[f].innerHTML = '-';
				if (pet2001.cpuJammed) {
					elDisass.innerHTML = 'jammed';
					elDisassHint.innerHTML = 'CPU unresponsive.';
					elDisass.className='debugIconType-illegal';
				}
				else {
					elDisass.innerHTML = 'running';
					elDisassHint.innerHTML = '&hellip;';
					elDisass.className='';
				}
				elDisass.classList.add('disabled');
				elVideoDisplay.innerHTML = '&hellip;'
			}
			for (var n in codeCtrlButtons) codeCtrlButtons[n].disabled = true; 
		}
		else {
			codeAdjustHistoryButtons();
			codeCtrlButtons.MORE.disabled = !codeDisplayMore;
		}
		document.getElementById('debugShowCPULog').hidden = !pet2001.cpuJammed;
	}

	function setTab(id) {
		for (var p in tabs) {
			var tab = tabs[p];
			if (id == tab.id) {
				tabActive = p;
				tab.className = tabPanes[p].className = 'active';
			}
			else {
				tab.className = tabPanes[p].className = '';
			}
		}
		renderActiveTab();
	}
	function renderActiveTab() {
		if (!tabUpdated[tabActive]) {
			switch (tabActive) {
				case 'STACK': renderStack(); break;
				case 'MEM': renderMemory(); break;
				case 'IO': renderIO(); break;
				case 'CODE':
					if (runLevel === modes.SINGLE && currentPC >= codeDisplayAddr && currentPC < codeDisplayNext && codeScrollToAddress(hex(currentPC,4), true)) tabUpdated.CODE = true;
					else codeListCurrent();
					break;
			}
		}
	}

	function ctxHandlerStack(event) {
		event.preventDefault();
		if (guiDisabled) return;
		if (event.target.dataset.loc) editValueAtPoint('STACK', event);
	}

	function ctxHandlerMem(event) {
		event.preventDefault();
		if (guiDisabled) return;
		if (event.target.dataset.loc) editValueAtPoint('MEM', event);
	}

	function editValueAtPoint(tab, event) {
		var range, offsetNode, offset;
		if (document.caretPositionFromPoint) {
			range = document.caretPositionFromPoint(event.clientX, event.clientY);
			offsetNode = range.offsetNode;
			offset = range.offset;
		}
		else if (document.caretRangeFromPoint) {
			range = document.caretRangeFromPoint(event.clientX, event.clientY);
			offsetNode = range.startContainer;
			offset = range.startOffset;
		}
		else return;
		var clientNode = offsetNode.parentNode;
		if (clientNode.dataset.loc) {
			var txt = clientNode.textContent,
				max = txt.length - 1,
				ofs0 = offset,
				ofs1,
				reHexChar = /^[0-9A-F]$/;
			while (ofs0 > 0 && reHexChar.test(txt.charAt(ofs0-1))) ofs0--;
			ofs1 = ofs0;
			while (ofs1 < max && reHexChar.test(txt.charAt(ofs1+1))) ofs1++;
			ofs1++;
			var addr = parseInt(clientNode.dataset.loc,16) + Math.floor(offset/3),
				valueStr = txt.substring(ofs0, ofs1);
			//storeSelection();
			var selection = document.getSelection(),
				srange = document.createRange();
			srange.setStart(offsetNode, ofs0);
			srange.setEnd(offsetNode, ofs1);
			selection.removeAllRanges();
			selection.addRange(srange);
			ctxEditData = {
				'tab': tab,
				'addr': addr,
				'valueString': valueStr
			};
			var rect = srange.getBoundingClientRect(),
				x = rect.x+Math.floor(rect.width / 2),
				y = rect.y+rect.height;
			x += document.body.scrollLeft +	document.documentElement.scrollLeft;
			y += document.body.scrollTop +  document.documentElement.scrollTop;
			ctrl.showCtxMenu('debugValue', event, x, y, 'Edit &quot;'+valueStr+'&quot;');
		}
	}

	function ctxEditValue() {
		ctrl.showPromptDialog('Edit contents of location $'+hex(ctxEditData.addr,4)+(ctxEditData.tab=='STACK'? ' (stack $'+hex(ctxEditData.addr&0xff, 2)+')':'')+', hex value:', ctxEditData.valueString, function(vs) {
			if (vs === null) return;
			var v = parseInt(vs.replace(/[^0-9a-f]/gi,''), 16);
			if (isNaN(v)) return;
			v &= 0xff;
			if (v != parseInt(ctxEditData.valueString,16)) {
				pet2001.write(ctxEditData.addr, v);
				if ((ctxEditData.addr >= currentPC && ctxEditData.addr <= currentPC+2) || ctxEditData.addr === 0x100 + currentSP) {
					var s = pet2001.getCPUStatus();
					disass(s.pc);
					elDisassHint.innerHTML = executionHint(s);
				}
				if (ctxEditData.addr >= 0x100 && ctxEditData.addr <= 0x1ff) tabUpdated.STACK = false;
				if (ctxEditData.tab === 'MEM' || (ctxEditData.addr && 0xff00) === memDisplayAddr) tabUpdated.MEM = false;
				if (ctxEditData.addr >= codeDisplayAddr && ctxEditData.addr < codeDisplayNext) {
					tabUpdated.CODE = false;
					codeDisplayNext = 0;
				}
				renderActiveTab();
			}
		});
	}

	function tabHandler(event) {
		if (event.target.nodeName == 'LI') setTab(event.target.id);
	}

	function focusElement(event) {
		var el = this;
		setTimeout(function() { el.select(); }, 0);
	}

	function toggleRegsEditible() {
		regsEditable = !regsEditable;
		btnRegisterLock.className = regsEditable? 'open':'closed';
		if (!guiDisabled) {
			for (var n in regInputs) regInputs[n].disabled = guiDisabled || !regsEditable;
		}
		document.getElementById('debugRegs').className = regsEditable? 'active':'';
	}

	function setup() {
		if (inputs) return;
		inputs = {};
		regInputs = {};
		buttons = {};
		checkboxes = {};
		var regTable = document.getElementById('debugRegs'), el;
		for (var n of regNames) {
			el = regInputs[n] = regTable.querySelector('input[data-reg="'+n+'"]');
			el.addEventListener('change', editRegister, false);
			el.addEventListener('focus', focusElement, false);
		}
		flagEls = {};
		for (var n of flagNames) {
			el = flagEls[n] = regTable.querySelector('span[data-flag="'+n+'"]');
			if (n !== 'b') el.addEventListener('click', toggleFlag, false);
		}
		buttons.STEP = document.getElementById('debugBtnStep');
		buttons.NEXT = document.getElementById('debugBtnNext');
		buttons.CONT = document.getElementById('debugBtnCont');
		buttons.HALT = document.getElementById('debugBtnHalt');

		elDisass = document.getElementById('debugDisass');
		elDisassHint = document.getElementById('debugHint');
		elVideoDisplay = document.getElementById('debugVideo');
		elTrace = document.getElementById('debugTrace');
		elTrace.value='';

		tabs = {};
		tabPanes = {};
		tabDisplays = {};
		tabs.STACK =  document.getElementById('debugTabStack');
		tabs.MEM =  document.getElementById('debugTabMem');
		tabs.CODE =  document.getElementById('debugTabCode');
		tabs.IO =  document.getElementById('debugTabIO');
		tabPanes.STACK =  document.getElementById('debugPaneStack');
		tabPanes.MEM =  document.getElementById('debugPaneMem');
		tabPanes.CODE =  document.getElementById('debugPaneCode');
		tabPanes.IO =  document.getElementById('debugPaneIO');
		tabDisplays.STACK = document.getElementById('debugDisplayStack');
		tabDisplays.MEM = document.getElementById('debugDisplayMem');
		tabDisplays.CODE = document.getElementById('debugDisplayCode');
		tabDisplays.IO = document.getElementById('debugDisplayIO');
		debugDisplays = document.getElementById('debugDisplays');

		checkboxes.IGNORE_INTERRUPTS = document.getElementById('debugIgnoreInterruptsCbx');
		checkboxes.IGNORE_INTERRUPTS.checked = ignoreInterrupts;
		checkboxes.IGNORE_INTERRUPTS.addEventListener('change', setIgnoreInterrupts, false);

		checkboxes.TRAP_ILLEGALS = document.getElementById('debugTrapIllegalsCbx');
		checkboxes.TRAP_ILLEGALS.checked = trapIllegals;
		checkboxes.TRAP_ILLEGALS.addEventListener('change', setTrapIllegals, false);

		buttons.STEP.addEventListener('click', step, false);
		buttons.NEXT.addEventListener('click', next, false);
		buttons.CONT.addEventListener('click', run, false);
		buttons.HALT.addEventListener('click', halt, false);
		document.getElementById('debugTabs').addEventListener('click', tabHandler, true);
		document.getElementById('debugTraceClear').addEventListener('click', clearLog, false);
		document.getElementById('debugBreakpointsNew').addEventListener('click', addBreakpoint, false);
		document.getElementById('debugShowCPULog').addEventListener('click', showCPULog, false);
		document.getElementById('debugShowCPULog').hidden = true;

		inputs.MEMPAGE = document.getElementById('debugMemPage');
		inputs.MEMPAGE.value = hex(memDisplayAddr >> 8, 2);
		inputs.MEMPAGE.addEventListener('change', setMemDisplay, false);
		inputs.MEMPAGE.addEventListener('focus', focusElement, false);
		buttons.MEMPAGE = document.getElementById('debugMemBtn');
		buttons.MEMPAGE.addEventListener('click', setMemDisplay, false);
		buttons.MEMPAGE.PAGEPREV = document.getElementById('debugPageBtnPrev');
		buttons.MEMPAGE.PAGENEXT = document.getElementById('debugPageBtnNext');
		buttons.MEMPAGE.PAGEPREV.addEventListener('click', memPageBack, false);
		buttons.MEMPAGE.PAGENEXT.addEventListener('click', memPageFwd, false);
		buttons.MEMMAP = document.getElementById('debugMemMapBtn');
		buttons.MEMMAP.addEventListener('click', ctrl.showMemoryMap, false);
		elMemNote = document.getElementById('debugMemNote');
		adjustMemPageButtons();

		tabDisplays.STACK.dataset.loc = '0100';
		elStackMark = document.createElement('span');
		elStackMark.id= 'stackMarkPC';

		tabDisplays.STACK.addEventListener('contextmenu', ctxHandlerStack, true);
		tabDisplays.MEM.addEventListener('contextmenu', ctxHandlerMem, true);
		tabDisplays.CODE.addEventListener('mouseover', codeMouseOver, true);
		tabDisplays.CODE.addEventListener('mouseout', codeMouseOut, true);
		tabDisplays.CODE.addEventListener('click', codeMouseClick, true);

		document.getElementById('debugCodeBtnPC').addEventListener('click', codeListCurrent, false);
		codeCtrlButtons = {};
		codeCtrlButtons.MORE =  document.getElementById('debugCodeBtnMore')
		codeCtrlButtons.MORE.addEventListener('click', codeExtend, false);
		codeCtrlButtons.HISTPREV = document.getElementById('debugCodeBtnPrev');
		codeCtrlButtons.HISTNEXT = document.getElementById('debugCodeBtnNext');
		codeCtrlButtons.HISTPREV.addEventListener('click', codeHistoryBack, false);
		codeCtrlButtons.HISTNEXT.addEventListener('click', codeHistoryFwd, false);

		btnRegisterLock = document.getElementById('debugLock');
		btnRegisterLock.className = regsEditable? 'open':'closed';
		btnRegisterLock.addEventListener('click', toggleRegsEditible, false);
		regTable.className = regsEditable? 'active':'';

		tabUpdated = {
			'STACK': false,
			'MEM': false,
			'CODE': false,
			'IO': false
		};
		setTab(tabs.STACK.id);

		guiEnable(false);
		setRunLevel(modes.CONT);
	}

var executionHint = (function() {

	var getMem = pet2001.dump,
		pageBoundary = false,
		magicConstANE  = 0xef,
		magicConstLXA  = 0xee,
		hexPrefix = '$',
		boundaryNote = '<span class="note" title="as page boundary is crossed">*<span>';

	function mem(a) { return getMem(a & 0xffff); }
	function memWord(a) { return getMem(a & 0xffff) | (getMem((a+1) & 0xffff) << 8); }
	function getStack(offset) { return getMem(((s.sp+offset) & 0xff) | 0x0100); }

	function imm() { return mem(s.pc+1); }
	function abs() { return memWord(s.pc+1); }
	function absx() {
		var a1=memWord(s.pc+1),
			a2=(a1+s.x)&0xffff;
		if ((a1&0xff00)!=(a2&0xff00)) pageBoundary=true;
		return a2;
	}
	function absy() {
		var a1=memWord(s.pc+1),
			a2=(a1+s.y)&0xffff;
		if ((a1&0xff00)!=(a2&0xff00)) pageBoundary=true;
		return a2;
	}
	function zpg() { return mem(s.pc+1); }
	function zpgx() { return 0xff & (mem(s.pc+1) + s.x); }
	function zpgy() { return 0xff & (mem(s.pc+1) + s.y); }
	function ind() {
		var al = memWord(s.pc+1),
			ah = (al&0xff00)|(0xff&(al+1));
		return getMem(al)|(getMem(ah)<<8);
	}
	function xind() {
		var a = 0xff & (mem(s.pc+1) + s.x);
		return mem(a)|(mem(0xff & (a+1)) << 8);
	}
	function indy() {
		var a0=mem(s.pc+1),
			a1=mem(a0)|(mem(0xff&(a0+1))<<8),
			a2=(a1 + s.y)&0xffff;
		if ((a1&0xff00)!=(a2&0xff00)) pageBoundary=true;
		return a2;
	}

	function fmtWord(v) { return hexPrefix + (0x10000 | v).toString(16).substring(1).toUpperCase(); }
	function fmtAddress(v) { return '[' + (0x10000 | v).toString(16).substring(1).toUpperCase() + ']'; }
	function fmtByte(v) { return hexPrefix + (0x100 | v).toString(16).substring(1).toUpperCase(); }
	function fmtBits(v) { return '|' + (0x100 | v).toString(2).substring(1) + '|'; }
	function fmtPC(offset) {
		var a = (s.pc + offset)&0xffff;
		return fmtByte(a>>8)+' '+fmtByte(a&0xff);
	}
	function fmtConstant(v) { return '<span class="note" title="*magic constant*">'+fmtByte(v)+'<span>'; }

	function asl(target, source) { return target + ' &lArr; C &lt; ' + fmtBits(source) + ' &lt; 0'; }
	function lsr(target, source) { return target + ' &lArr; 0 &gt; ' + fmtBits(source) + ' &gt; C'; }
	function rol(target, source) { return target + ' &lArr; C &lt; ' + fmtBits(source) + ' &lt; C'; }
	function ror(target, source) { return target + ' &lArr; C &gt; ' + fmtBits(source) + ' &gt; C'; }
	function load(target, source) { return target + ' &lArr; ' + fmtByte(source); }
	function loadAddress(target, source) { return target + ' &lArr; ' + fmtWord(source); }
	function store(source, target) { return fmtAddress(target) + ' &lArr; ' + source; }
	function transfer(source, target) { return source + ' &rArr; ' + target; }
	function op(operation, operand) { return 'A &lArr; A ' + operation + ' ' + fmtByte(operand); }
	function pushStack(source) { return source + ' &rArr; STK'; }
	function pullStack(target, offset) { return target + ' &rArr; STK (' + fmtByte(getStack(offset)) + ')'; }
	function pullSR(offset) { return 'SR &lArr; ' + fmtBits(getStack(offset) | 0x20); };
	function pullAddress(target, offset) { return target + ' &lArr;  STK (' + fmtWord((getStack(offset)<<8) | getStack(offset+1)) + ')'; }
	function branch(flag, v) {
		var ofs = imm(),
			rel =  ofs & 0x80? ' - ' +  ((ofs^0xff)+1) : ' + ' + ofs;
		return 'if ' + flag + ' ' + (v? 'set':'clear') + ': PC &lArr; ' + fmtWord((s.pc + 2) & 0xffff) + rel;
	}
	function comp(label, reg, operand) {
		var v = reg - operand,
			c = v >= 0? 1:0,
			z = v = 0,
			n = 0x80 & v? 1:0;
		return label+' &lt;=&gt; '+fmtByte(operand)+'  &rArr;  N: '+n+', Z: '+z+', C: '+c;
	}
	function compDCP(label, operand) { return label+' &lt;=&gt; '+fmtByte((operand-1)&0xff); }
	function opBit(operand) {
		var v = s.a & operand;
		return 'A AND '+ fmtByte(operand) + '  &rArr;  N: ' + (v&0x80? 1:0) + ', V: ' + (v&0x40? 1:0) + ', Z: ' + (v? 0:1);
	}
	function setFlag(flag, v) { return flag + ' &lArr; ' + v; }
	function jump(target) { return 'PC &lArr; ' + fmtWord(target); }
	function inc(reg, v) { return reg + ' &lArr; ' + fmtByte(v) + ' + 1'; }
	function dec(reg, v) { return reg + ' &lArr; ' + fmtByte(v) + ' - 1'; }
	function rla(m) { return 'A &lArr; A AND ( ' +fmtAddress(m) + ' &lArr; C&lt;|'+fmtByte(mem(m))+'|&lt;C )'; }
	function slo(m) { return 'A &lArr; A OR ( ' +fmtAddress(m) + ' &lArr; C&lt;|'+fmtByte(mem(m))+'|&lt;0 )'; }
	function sre(m) { return 'A &lArr; A OR ( ' +fmtAddress(m) + ' &lArr; 0&gt;|'+fmtByte(mem(m))+'|&gt;C )'; }
	function rra(m) { return 'A &lArr; A + ( ' +fmtAddress(m) + ' &lArr; C&gt;|'+fmtByte(mem(m))+'|&gt;C )'; }
	function isc(m) { return 'A &lArr; A - ( '+fmtAddress(m) + ' &lArr; ' + fmtByte(mem(m)) + ' + 1 )'; }
	function arr(m) {
		var c = (s.a & m)&0x80? '1':'0';
		return 'A &rArr; C &gt; |(A AND '+fmtByte(m)+')| &gt;, '+setFlag('C', c)+'<span class="note" title="assuming not in decimal mode">*<span>';
	}
	function fmtHModAddress(a, h, v) { return fmtAddress(((v&h)<<8)|(a&0xff)); }
	function sha(m) {
		var h=m>>8;
		if (pageBoundary) {
			return fmtHModAddress(m, h, s.a&s.x) + ' &lArr; A AND X AND '+fmtByte(h)+boundaryNote;
		}
		else {
			return fmtAddress(m) + ' &lArr; A AND X AND ('+fmtByte(h)+'+1)';
		}
	}
	function shx(m) {
		var h=m>>8;
		if (pageBoundary) {
			return fmtHModAddress(m, h, s.x) + ' &lArr; X AND '+fmtByte(h)+boundaryNote;
		}
		else {
			return fmtAddress(m) + ' &lArr; X AND ('+fmtByte(h)+'+1)';
		}
	}
	function shy(m) {
		var h=m>>8;
		if (pageBoundary) {
			return fmtHModAddress(m, h, s.y) + ' &lArr; Y AND '+fmtByte(h)+boundaryNote;
		}
		else {
			return fmtAddress(m) + ' &lArr; Y AND ('+fmtByte(h)+'+1)';
		}
	}
	function tas(m) {
		var str = 'SP &lArr; A AND X, ';
			h=m>>8;
		if (pageBoundary) {
			return str + fmtHModAddress(m, h, s.a&s.x) + ' &lArr; SP AND '+fmtByte(h)+boundaryNote;
		}
		else {
			return str + fmtAddress(m) + ' &lArr; SP AND ('+fmtByte(h)+'+1)';
		}
	}
	function none() { return '-'; }


var s,
	hints = [

//BRK
function() { return pushStack(fmtPC(2) + ' ' + fmtByte(s.sr | 0x30)) + ', ' + loadAddress('PC', memWord(0xfffe)); },
//ORA Xind
function() { return op('OR', mem(xind())); },
//JAM
none,
//SLO Xind
function() { return slo(xind()); },
//NOP
none,
//ORA zpg
function() { return op('OR', mem(zpg())); },
//ASL zpg
function() { var m=zpg(); return asl(fmtAddress(m), mem(m)); },
//SLO zpg
function() { return slo(zpg()); },
//PHP
function() { return pushStack(fmtBits(s.sr)); },
//ORA #
function() { return op('OR', imm()); },
//ASL A
function() { return asl('A', s.a); },
//ANC #
function() { return op('AND', imm()) + ', ' + setFlag('C', 'A(7)'); },
//NOP
none,
//ORA abs
function() { return op('OR', mem(abs())); },
//ASL abs
function() { var m=abs(); return asl(fmtAddress(m), mem(m)); },
//SLO abs
function() { return slo(abs()); },
//BPL rel
function() { return branch('Z', 0); },
//ORA indY
function() { return op('OR', mem(indy())); },
//JAM
none,
//SLO indY
function() { return slo(indy()); },
//NOP
none,
//ORA zpgX
function() { return op('OR', mem(zpgx())); },
//ASL zpgX
function() { var m=zpgx(); return asl(fmtAddress(m), mem(m)); },
//SLO zpgX
function() { return slo(zpgx()); },
//CLC
function() { return setFlag('C', 0); },
//ORA absY
function() { return op('OR', mem(abs())); },
//NOP
none,
//SLO absY
function() { return slo(absy()); },
//NOP
none,
//ORA absX
function() { return op('OR', mem(absx())); },
//ASL absX
function() { var m=absx(); return asl(fmtAddress(m), mem(m)); },
//SLO absX
function() { return slo(absx()); },
//JSR loc
function() { return pushStack(fmtPC(2)) + ', ' + loadAddress('PC', abs()); },
//AND Xind
function() { return op('AND', mem(xind())); },
//JAM
none,
//RLA Xind
function() { return rla(xind()); },
//BIT zpg
function() { return opBit(mem(zpg())); },
//AND zpg
function() { return op('AND', mem(zpg())); },
//ROL zpg
function() { var m=zpg(); return rol(fmtAddress(m), mem(m)); },
//RLA zpg
function() { return rla(zpg()); },
//PLP stk
function() { return pullSR(0); },
//AND #
function() { return op('AND', imm()); },
//ROL A
function() { return rol('A', s.a); },
//ANC #
function() { return op('AND', imm()) + ', ' + setFlag('C', 'A(7)'); },
//BIT abs
function() { return opBit(mem(abs())); },
//AND abs
function() { return op('AND', mem(abs())); },
//ROL abs
function() { var m=abs(); return rol(fmtAddress(m), mem(m)); },
//RLA abs
function() { return rla(abs()); },
//BMI rel
function() { return branch('Z', 1); },
//AND indY
function() { return op('AND', mem(indy())); },
//JAM
none,
//RLA indY
function() { return rla(indy()); },
//NOP
none,
//AND zpgX
function() { return op('AND', mem(zpgx())); },
//ROL zpgX
function() { var m=zpgx(); return rol(fmtAddress(m), mem(m)); },
//RLA zpgX
function() { return rla(zpgx()); },
//SEC
function() { return setFlag('C', 1); },
//AND absY
function() { return op('AND', mem(absy())); },
//NOP
none,
//RLA absY
function() { return rla(absy()); },
//NOP
none,
//AND absX
function() { return op('AND', mem(absx())); },
//ROL absX
function() { var m=absx(); return rol(fmtAddress(m), mem(m)); },
//RLA absX
function() { return rla(absx()); },
//RTI
function() { return pullSR(0) + ', ' + pullAddress('PC', 1); },
//EOR Xind
function() { return op('XOR', mem(xind())); },
//JAM
none,
//SRE Xind
function() { return sre(xind()); },
//NOP
none,
//EOR zpg
function() { return op('XOR', mem(zpg())); },
//LSR zpg
function() { var m=zpg(); return lsr(fmtAddress(m), mem(m)); },
//SRE zpg
function() { return sre(zpg()); },
//PHA A
function() { return pushStack('A'); },
//EOR #
function() { return op('XOR', imm()); },
//LSR A
function() { return lsr('A', s.a); },
//ALR #
function() { return op('AND', imm()) + ', ' + lsr('A', s.a); },
//JMP loc
function() { return jump(abs()); },
//EOR abs
function() { return op('XOR', mem(abs())); },
//LSR abs
function() { var m=abs(); return lsr(fmtAddress(m), mem(m)); },
//SRE abs
function() { return sre(abs()); },
//BVC rel
function() { return branch('V', 0); },
//EOR indY
function() { return op('XOR', mem(indy())); },
//JAM
none,
//SRE indY
function() { return sre(indy()); },
//NOP
none,
//EOR zpgX
function() { return op('XOR', mem(zpgx())); },
//LSR zpgX
function() { var m=zpgx(); return lsr(fmtAddress(m), mem(m)); },
//SRE zpgX
function() { return sre(zpgx()); },
//CLI
function() { return setFlag('C', 0); },
//EOR absY
function() { return op('XOR', mem(absy())); },
//NOP
none,
//SRE absY
function() { return sre(absy()); },
//NOP absX
none,
//EOR absX
function() { return op('XOR', mem(absx())); },
//LSR absX
function() { var m=absx(); return lsr(fmtAddress(m), mem(m)); },
//SRE absX
function() { return sre(absx()); },
//RTS
function() { return pullAddress('PC', 0) + ' + 1'; },
//ADC Xind
function() { return op('+', mem(xind())); },
//JAM
none,
//RRA Xind
function() { return rra(xind()); },
//NOP
none,
//ADC zpg
function() { return op('+', mem(zpg())); },
//ROR zpg
function() { var m=zpg(); return ror(fmtAddress(m), mem(m)); },
//RRA zpg
function() { return rra(zpg()); },
//PLA
function() { return pullStack('A', 0); },
//ADC #
function() { return op('+', imm()); },
//ROR A
function() { return ror('A', s.a); },
//ARR #
function() { return arr(imm()); },
//JMP ind
function() { return jump(ind()) },
//ADC abs
function() { return op('+', mem(abs())); },
//ROR abs
function() { var m=abs(); return ror(fmtAddress(m), mem(m)); },
//RRA abs
function() { return rra(abs()); },
//BVS rel
function() { return branch('B', 1); },
//ADC indY
function() { return op('+', mem(indy())); },
//JAM -
none,
//RRA indY
function() { return rra(indy()); },
//NOP -
none,
//ADC zpgX
function() { return op('+', mem(zpgx())); },
//ROR zpgX
function() { var m=zpgx(); return ror(fmtAddress(m), mem(m)); },
//RRA zpgX
function() { return rra(zpgx()); },
//SEI
function() { return setFlag('I', 1); },
//ADC absY
function() { return op('+', mem(absy())); },
//NOP -
none,
//RRA absY
function() { return rra(absy()); },
//NOP absX
none,
//ADC absX
function() { return op('+', mem(absx())); },
//ROR absX
function() { var m=absx(); return ror(fmtAddress(m), mem(m)); },
//RRA absX
function() { return rra(absx()); },
//NOP #
none,
//STA Xind
function() { return store('A', xind()); },
//NOP -
none,
//SAX Xind
function() { return store('A AND X', xind()); },
//STY zpg
function() { return store('Y', zpg()); },
//STA zpg
function() { return store('A', zpg()); },
//STX zpg
function() { return store('X', zpg()); },
//SAX zpg
function() { return store('A AND X', zpg()); },
//DEY
function() { return dec('Y', s.y); },
//NOP #
none,
//TXA
function() { return transfer('X', 'A'); },
//ANE #
function() { return 'A &lArr; ('+fmtConstant(magicConstANE)+' OR A) AND X AND '+fmtByte(imm()); },
//STY abs
function() { return store('Y', abs()); },
//STA abs
function() { return store('A', abs()); },
//STX abs
function() { return store('X', abs()); },
//SAX abs
function() { return store('A AND X', abs()); },
//BCC rel
function() { return branch('C', 0); },
//STA indY
function() { return store('A', indy()); },
//JAM -
none,
//SHA indY
function() { return sha(indy()); },
//STY zpgX
function() { return store('Y', zpgx()); },
//STA zpgX
function() { return store('A', zpgx()); },
//STX zpgY
function() { return store('X', zpgy()); },
//SAX zpgY
function() { return store('A AND X', zpgy()); },
//TYA
function() { return transfer('Y', 'A'); },
//STA absY
function() { return store('A', absy()); },
//TXS
function() { return transfer('X', 'SP'); },
//TAS absY
function() { return tas(absy()); },
//SHY absX
function() { return shy(absx()); },
//STA absX
function() { return store('A', absx()); },
//SHX absY
function() { return shx(absy()); },
//SHA absY
function() { return sha(absy()); },
//LDY #
function() { return load('Y', imm()); },
//LDA Xind
function() { return load('A', mem(xind())); },
//LDX #
function() { return load('X', imm()); },
//LAX Xind
function() { return load('A, X', mem(xind())); },
//LDY zpg
function() { return load('Y', mem(zpg())); },
//LDA zpg
function() { return load('A', mem(zpg())); },
//LDX zpg
function() { return load('X', mem(zpg())); },
//LAX zpg
function() { return load('A, X', mem(zpg())); },
//TAY
function() { return transfer('A', 'Y'); },
//LDA #
function() { return load('A', imm()); },
//TAX
function() { return transfer('A', 'X'); },
//LXA #
function() { return 'A, X &lArr; ('+fmtConstant(magicConstLXA)+' OR A) AND '+fmtByte(imm()); },
//LDY abs
function() { return load('Y', mem(abs())); },
//LDA abs
function() { return load('A', mem(abs())); },
//LDX abs
function() { return load('X', mem(abs())); },
//LAX abs
function() { return load('A, X', mem(abs())); },
//BCS rel
function() { return branch('C', 1); },
//LDA indY
function() { return load('A', mem(indy())); },
//JAM -
none,
//LAX indY
function() { return load('A, X', mem(indy())); },
//LDY zpgX
function() { return load('Y', mem(zpgx())); },
//LDA zpgX
function() { return load('A', mem(zpgx())); },
//LDX zpgY
function() { return load('X', mem(zpgy())); },
//LAX zpgY
function() { return load('A, X', mem(zpgy())); },
//CLV
function() { return setFlag('V', 0); },
//LDA absY
function() { return load('A', mem(absy())); },
//TSX
function() { return transfer('SP', 'X'); },
//LAS absY
function() { return 'A, X, SP &lArr; A AND '+fmtByte(mem(absy())); },
//LDY absX
function() { return load('Y', mem(absx())); },
//LDA absX
function() { return load('A', mem(absx())); },
//LDX absY
function() { return load('X', mem(absy())); },
//LAX absY
function() { return load('A, X', mem(absy())); },
//CPY #
function() { return comp('Y', s.y, imm()); },
//CMP Xind
function() { return comp('A', s.a, mem(xind())); },
//NOP
none,
//DCP Xind
function() { var m = xind(), b = mem(m); return dec(fmtAddress(m), b) + ', ' + compDCP('A', b); },
//CPY zpg
function() { return comp('Y', s.y, mem(zpg())); },
//CMP zpg
function() { return comp('A', s.a, mem(zpg())); },
//DEC zpg
function() { var m=zpg(); return dec(fmtAddress(m), mem(m)); },
//DCP zpg
function() { var m = zpg(), b = mem(m); return dec(fmtAddress(m), b) + ', ' + compDCP('A', b); },
//INY
function() { return inc('Y', s.y); },
//CMP #
function() { return comp('A', s.a, imm()); },
//DEX
function() { return dec('X', s.x); },
//SBX #
function() { return 'X &lArr; (A AND X) - ' + fmtByte(imm()); },
//CPY abs
function() { return comp('Y', s.y, mem(abs())); },
//CMP abs
function() { return comp('A', s.a, mem(abs())); },
//DEC abs
function() { var m=abs(); return dec(fmtAddress(m), mem(m)); },
//DCP abs
function() { var m = abs(), b = mem(m); return dec(fmtAddress(m), b) + ', ' + compDCP('A', b); },
//BNE rel
function() { return branch('Z', 0); },
//CMP indY
function() { return comp('A', s.a, mem(indy())); },
//JAM
none,
//DCP indY
function() { var m = indy(), b = mem(m); return dec(fmtAddress(m), b) + ', ' + compDCP('A', b); },
//NOP
none,
//CMP zpgX
function() { return comp('A', s.a, mem(zpgx())); },
//DEC zpgX
function() { var m=zpgx(); return dec(fmtAddress(m), mem(m)); },
//DCP zpgX
function() { var m = zpgx(), b = mem(m); return dec(fmtAddress(m), b) + ', ' + compDCP('A', b); },
//CLD
function() { return setFlag('D', 0); },
//CMP absY
function() { return comp('A', s.a, mem(absy())); },
//NOP
none,
//DCP absY
function() { var m = absy(), b = mem(m); return dec(fmtAddress(m), b) + ', ' + compDCP('A', b); },
//NOP
none,
//CMP absX
function() { return comp('A', s.a, mem(absx())); },
//DEC absX
function() { var m=absx(); return dec(fmtAddress(m), mem(m)); },
//DCP absX
function() { var m = absx(), b = mem(m); return dec(fmtAddress(m), b) + ', ' + compDCP('A', b); },
//CPX #
function() { return comp('X', s.x, imm()); },
//SBC Xind
function() { return op('-', mem(xind())); },
//NOP
none,
//ISC Xind
function() { return isc(xind()); },
//CPX zpg
function() { return comp('X', s.x, mem(zpg())); },
//SBC zpg
function() { return op('-', mem(zpg())); },
//INC zpg
function() { var m=zpg(); return inc(fmtAddress(m), mem(m)); },
//ISC zpg
function() { return isc(zpg()); },
//INX
function() { return inc('X', s.x); },
//SBC #
function() { return op('-', imm()); },
//NOP
none,
//USBC #
function() { return op('-', imm()); },
//CPX abs
function() { return comp('X', s.x, mem(abs())); },
//SBC abs
function() { return op('-', mem(abs())); },
//INC abs
function() { var m=abs(); return inc(fmtAddress(m), mem(m)); },
//ISC abs
function() { return isc(abs()); },
//BEQ rel
function() { return branch('Z', 1); },
//SBC indY
function() { return op('-', mem(indy())); },
//JAM
none,
//ISC indY
function() { return isc(indy()); },
//NOP
none,
//SBC zpgX
function() { return op('-', mem(zpgx())); },
//INC zpgX
function() { var m=zpgx(); return inc(fmtAddress(m), mem(m)); },
//ISC zpgX
function() { return isc(zpgx()); },
//SED
function() { return setFlag('D', 1); },
//SBC absY
function() { return op('-', mem(absy())); },
//NOP
none,
//ISC absY
function() { return isc(absy()); },
//NOP
none,
//SBC absX
function() { return op('-', mem(absx())); },
//INC absX
function() { var m=absx(); return inc(fmtAddress(m), mem(m)); },
//ISC absX
function() { return isc(absx()); },

];

	return function(status) {
		if (status.jammed || pet2001.cpuJammed) return 'CPU unresponsive.';
		s = status;
		pageBoundary = false;
		return hints[mem(s.pc)]();
	};

})();

	COM.update = update;
	COM.resume = resume;
	COM.haltOnInstr = haltOnInstr;
	COM.trace = trace;
	COM.interrupt = interrupt;
	COM.setup = setup;
	COM.enable = enable,
	COM.ctxEditValue = ctxEditValue;
	COM.isActive = function() { return runLevel !== modes.OFF; };
	COM.halt = halt;
	COM.jammed = cpuJammed;

	return COM;
}