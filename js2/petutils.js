//
// PET utilities, Norbert Landsteiner, 2017-2023; www.masswerk.at/pet/
// Contains
//   a Basic source to tokenized prg parser,
//   a parser for D64,D80,D82 images and T64 files,
//   a facility to generate BASIC source to print a given snapshot of screen RAM,
//   a facility to generate BASIC source from memory,
//   facilities to hex-dump BASIC programs or arbritrary memory ranges
//   a 6502 disassembler
//   transcoding utilities
//

"use strict";

var PetUtils = (function() {

// internal utility

var undef;

var IO_ADDR    = 0xe800,
	IO_TOP     = 0xefff,
	VIDEO_ADDR = 0x8000,
	VIDEO_TOP  = 0x8fff;

function setSysConfig(cfg) {
	if (cfg && typeof cfg === 'object') {
		IO_ADDR    = cfg.IO_ADDR;
		IO_TOP     = cfg.IO_TOP;
		VIDEO_ADDR = cfg.VIDEO_ADDR;
		VIDEO_TOP  = cfg.VIDEO_TOP;
		if (VIDEO_TOP >= IO_ADDR) VIDEO_TOP = IO_ADDR - 1;
	}
}

function hex(n, l) {
	var s = n.toString(16).toUpperCase();
	while (s.length < l) s = '0' + s;
	return s;
}

function quoteWildCardExpr(expr) {
	return expr.replace(/([\[\]\+\-\(\)\|\\.\$\^\{\}])/g ,'\\$1').replace(/([?*])/g, '.$1')
}

var petsciiLabels = {
	0x93: 'CLEAR',
	0x13: 'HOME',
	0x11: 'DOWN',
	0x91: 'UP',
	0x9D: 'LEFT',
	0x1D: 'RIGHT',
	0x12: 'RVS ON',
	0x92: 'RVS OFF',
	0x94: 'INST',
	0x03: 'STOP'
};

function getEscapedPetscii(stream, escapeAsHex, lc, swapCase, isJapaneseRom) {
	var s = '', lcSwap = lc && swapCase;
	if (typeof stream === 'string') {
		var t = [];
		for (var i = 0; i < stream.length; i++) t.push(stream.charCodeAt(i));
		stream = t;
	}
	for (var i = 0; i < stream.length; i++) {
		var c = stream[i];
		if (isJapaneseRom && (lc && petsciiToKana[c]) || c==0x5c)
			s += String.fromCharCode(petsciiToKana[c]);
		else if (lc && c >= 0xC1 && c <= 0xDA)
			s += lcSwap? String.fromCharCode(c & 0x7F) : String.fromCharCode(c & 0x7F).toLowerCase();
		else if (lcSwap && c >= 0x41 && c <= 0x5A)
			s += String.fromCharCode(c).toLowerCase();
		else if (c == 0x22) s += '{QUOTE}';
		else if (c >= 0x20 && c < 0x80) s += String.fromCharCode(c);
		else if (c === 0xFF) s += '\u03C0';
		else if (petsciiLabels[c]) s += '{' + petsciiLabels[c] + '}';
		else s += '{' + (escapeAsHex? '$' + hex(c,2) : c) + '}';
	}
	return s;
}

var srcTextUtil = (function() {
	// undo common character substitions and auto-corrections
	var replacements = {
			'“': '"',
			'”': '"',
			'„': '"',
			'«': '"',
			'»': '"',
			'‘': '\'',
			'’': '\'',
			'‹': '\'',
			'›': '\'',
			'´': '\'',
			'`': '\'',
			'…': '...',
			'–': '-', // en-dash
			'—': '--', // em-dash
			'−': '-', // minus
			'+': '+', // plus
			'=': '=', // equals
			'×': '*',
			'÷': '/',
			'≥': '>=',
			'≤': '<=',
			'©': '(c)',
			'®': '(r)',
			'℗': '(p)',
			'™': '(tm)',
			'↑': '^',
			'⇡': '^',
			'←': '–',
			'⇽': '–',
			'⇠': '–',
			'⟵': '–',
			'µ': 'u',
			 // pi replacements
			'°': 'π',
			'~': 'π',
			// graphical characters
			'─': String.fromCharCode(0xc0),
			'━': String.fromCharCode(0xc0),
			'╴': String.fromCharCode(0xc0),
			'╶': String.fromCharCode(0xc0),
			'╸': String.fromCharCode(0xc0),
			'╺': String.fromCharCode(0xc0),
			'⎯': String.fromCharCode(0xc0),
			'│': String.fromCharCode(0xdd),
			'┃': String.fromCharCode(0xdd),
			'|': String.fromCharCode(0xdd),
			'╵': String.fromCharCode(0xdd),
			'╷': String.fromCharCode(0xdd),
			'╹': String.fromCharCode(0xdd),
			'╻': String.fromCharCode(0xdd),
			'⏐': String.fromCharCode(0xdd),
			'┌': String.fromCharCode(0xb0),
			'┏': String.fromCharCode(0xb0),
			'◲': String.fromCharCode(0xb0),
			'┐': String.fromCharCode(0xae),
			'┓': String.fromCharCode(0xae),
			'◱': String.fromCharCode(0xae),
			'└': String.fromCharCode(0xad),
			'┗': String.fromCharCode(0xad),
			'◳': String.fromCharCode(0xad),
			'┘': String.fromCharCode(0xbd),
			'┛': String.fromCharCode(0xbd),
			'◰': String.fromCharCode(0xbd),
			'├': String.fromCharCode(0xab),
			'┣': String.fromCharCode(0xab),
			'┤': String.fromCharCode(0xb3),
			'┫': String.fromCharCode(0xb3),
			'┬': String.fromCharCode(0xb2),
			'┳': String.fromCharCode(0xb2),
			'┴': String.fromCharCode(0xb1),
			'┻': String.fromCharCode(0xb1),
			'┼': String.fromCharCode(0xdb),
			'╋': String.fromCharCode(0xdb),
			'╭': String.fromCharCode(0xd5),
			'╮': String.fromCharCode(0xc9),
			'╯': String.fromCharCode(0xcb),
			'╰': String.fromCharCode(0xca),
			'◜': String.fromCharCode(0xd5),
			'◝': String.fromCharCode(0xc9),
			'◞': String.fromCharCode(0xcb),
			'◟': String.fromCharCode(0xca),
			'▛': String.fromCharCode(0xcf),
			'▜': String.fromCharCode(0xd0),
			'▟': String.fromCharCode(0xba),
			'▙': String.fromCharCode(0xcc),
			'▔': String.fromCharCode(0xa3),
			'▁': String.fromCharCode(0xa4),
			'▏': String.fromCharCode(0xa5),
			'▕': String.fromCharCode(0xa7),
			'▖': String.fromCharCode(0xbb),
			'▝': String.fromCharCode(0xbc),
			'▗': String.fromCharCode(0xac),
			'▘': String.fromCharCode(0xbe),
			'▚': String.fromCharCode(0xbf),
			'╳': String.fromCharCode(0xd6),
			'☓': String.fromCharCode(0xd6),
			'✕': String.fromCharCode(0xd6),
			'╲': String.fromCharCode(0xcd),
			'╱': String.fromCharCode(0xce),
			'◆': String.fromCharCode(0xda),
			'◇': String.fromCharCode(0xda),
			'♦': String.fromCharCode(0xda),
			'♢': String.fromCharCode(0xda),
			'♦': String.fromCharCode(0xda),
			'◊': String.fromCharCode(0xda),
			'●': String.fromCharCode(0xd1),
			'○': String.fromCharCode(0xd7),
			'◯': String.fromCharCode(0xd7),
			'♠': String.fromCharCode(0xc1),
			'♤': String.fromCharCode(0xc1),
			'♡': String.fromCharCode(0xd3),
			'♥': String.fromCharCode(0xd3),
			'❤︎': String.fromCharCode(0xd3),
			'♣': String.fromCharCode(0xd8),
			'♧': String.fromCharCode(0xd8),
			'▄': String.fromCharCode(0xa2),
			'▌': String.fromCharCode(0xa1),
			'◧': String.fromCharCode(0xa1),
			'◤': String.fromCharCode(0xa9),
			'◩': String.fromCharCode(0xa9),
			'◸': String.fromCharCode(0xa9),
			'◥': String.fromCharCode(0xdf),
			'◹': String.fromCharCode(0xdf),
			'░': String.fromCharCode(0xa6),
			'▒': String.fromCharCode(0xa6),
			'▓': String.fromCharCode(0xa6),
			'▦': String.fromCharCode(0xa6),
			'▩': String.fromCharCode(0xa6),
			'▂': String.fromCharCode(0xaf),
			'▃': String.fromCharCode(0xb9),
			'▎': String.fromCharCode(0xb4),
			'▍': String.fromCharCode(0xb5),
			'◐': String.fromCharCode(0xdc),
			'◒': String.fromCharCode(0xa8),
			'⬖': String.fromCharCode(0xdc),
			'⬙': String.fromCharCode(0xa8),
			'⁙': String.fromCharCode(0xde),
			'▽': String.fromCharCode(0xb7),
			'▼': String.fromCharCode(0xb8),
			'◁': String.fromCharCode(0xaa),
			'◀': String.fromCharCode(0xb6),
			'⬓': String.fromCharCode(0xa2),
			'⬔': String.fromCharCode(0xdf),
			'⧫': String.fromCharCode(0xda),
			'⬥': String.fromCharCode(0xda),
			'ᒥ': String.fromCharCode(0xcf),
			'ᒪ': String.fromCharCode(0xcc),
			'ᒣ': String.fromCharCode(0xd0),
			'ᒧ': String.fromCharCode(0xba),
			'⎾': String.fromCharCode(0xcf),
			'⎿': String.fromCharCode(0xcc),
			'⏋': String.fromCharCode(0xd0),
			'⏌': String.fromCharCode(0xba),
			// strokes
			'Ⅰ': String.fromCharCode(0xa5),
			'Ⅱ': String.fromCharCode(0xd4),
			'Ⅲ': String.fromCharCode(0xc7),
			'Ⅳ': String.fromCharCode(0xc2),
			'Ⅴ': String.fromCharCode(0xdd),
			'Ⅵ': String.fromCharCode(0xc8),
			'Ⅶ': String.fromCharCode(0xd9),
			'Ⅷ': String.fromCharCode(0xa7),
			'ⅰ': String.fromCharCode(0xa3),
			'ⅱ': String.fromCharCode(0xc5),
			'ⅲ': String.fromCharCode(0xc4),
			'ⅳ': String.fromCharCode(0xc3),
			'ⅴ': String.fromCharCode(0xc0),
			'ⅵ': String.fromCharCode(0xc6),
			'ⅶ': String.fromCharCode(0xd2),
			'ⅷ': String.fromCharCode(0xa4),
			// other (lower-case set)
			'✓': String.fromCharCode(0xba),
			'✔': String.fromCharCode(0xba),
			'☑': String.fromCharCode(0xba),
			//kana
			'¥': String.fromCharCode(0x5c),
			'￥': String.fromCharCode(0x5c),
			'ア': String.fromCharCode(0xa1),
			'ァ': String.fromCharCode(0xa1),
			'ｱ': String.fromCharCode(0xa1),
			'ｧ': String.fromCharCode(0xa1),
			'イ': String.fromCharCode(0xa2),
			'ィ': String.fromCharCode(0xa2),
			'ｲ': String.fromCharCode(0xa2),
			'ｨ': String.fromCharCode(0xa2),
			'ウ': String.fromCharCode(0xa3),
			'ゥ': String.fromCharCode(0xa3),
			'ｳ': String.fromCharCode(0xa3),
			'ｩ': String.fromCharCode(0xa3),
			'エ': String.fromCharCode(0xa4),
			'ェ': String.fromCharCode(0xa4),
			'ｴ': String.fromCharCode(0xa4),
			'ｪ': String.fromCharCode(0xa4),
			'オ': String.fromCharCode(0xa5),
			'ォ': String.fromCharCode(0xa5),
			'ｵ': String.fromCharCode(0xa5),
			'ｫ': String.fromCharCode(0xa5),
			'キ': String.fromCharCode(0xa7),
			'ｷ': String.fromCharCode(0xa7),
			'カ': String.fromCharCode(0xa6),
			'ヵ': String.fromCharCode(0xa6),
			'ｶ': String.fromCharCode(0xa6),
			'ワ': String.fromCharCode(0xdc),
			'ヮ': String.fromCharCode(0xdc),
			'ﾜ': String.fromCharCode(0xdc),
			'ク': String.fromCharCode(0xa8),
			'ｸ': String.fromCharCode(0xa8),
			'ケ': String.fromCharCode(0xa9),
			'ｹ': String.fromCharCode(0xa9),
			'ヲ': String.fromCharCode(0xdf),
			'ｦ': String.fromCharCode(0xdf),
			'ム': String.fromCharCode(0xd1),
			'ﾑ': String.fromCharCode(0xd1),
			'ラ': String.fromCharCode(0xd7),
			'ﾗ': String.fromCharCode(0xd7),
			'ナ': String.fromCharCode(0xc5),
			'ﾅ': String.fromCharCode(0xc5),
			'メ': String.fromCharCode(0xd2),
			'ﾒ': String.fromCharCode(0xd2),
			'ヤ': String.fromCharCode(0xd4),
			'ャ': String.fromCharCode(0xd4),
			'ﾔ': String.fromCharCode(0xd4),
			'ｬ': String.fromCharCode(0xd4),
			'ル': String.fromCharCode(0xd9),
			'ﾙ': String.fromCharCode(0xd9),
			'ユ': String.fromCharCode(0xd5),
			'ｺ': String.fromCharCode(0xd5),
			'ノ': String.fromCharCode(0xc9),
			'ﾉ': String.fromCharCode(0xc9),
			'マ': String.fromCharCode(0xcf),
			'ﾏ': String.fromCharCode(0xcf),
			'ミ': String.fromCharCode(0xd0),
			'ﾐ': String.fromCharCode(0xd0),
			'タ': String.fromCharCode(0xb7),
			'ﾀ': String.fromCharCode(0xb7),
			'ロ': String.fromCharCode(0xb8),
			'ﾛ': String.fromCharCode(0xb8),
			'ン': String.fromCharCode(0xb9),
			'ﾝ': String.fromCharCode(0xb9),
			'゜': String.fromCharCode(0xaf),
			'〬': String.fromCharCode(0xaf),
			'〫': String.fromCharCode(0xaf),
			'ﾟ': String.fromCharCode(0xaf),
			'チ': String.fromCharCode(0xc1),
			'ﾁ': String.fromCharCode(0xc1),
			'モ': String.fromCharCode(0xd3),
			'ﾓ': String.fromCharCode(0xd3),
			'ト': String.fromCharCode(0xc4),
			'ﾄ': String.fromCharCode(0xc4),
			'ニ': String.fromCharCode(0xc6),
			'ﾆ': String.fromCharCode(0xc6),
			'ヌ': String.fromCharCode(0xc7),
			'ﾇ': String.fromCharCode(0xc7),
			'ネ': String.fromCharCode(0xc8),
			'ﾈ': String.fromCharCode(0xc8),
			'ハ': String.fromCharCode(0xca),
			'ﾊ': String.fromCharCode(0xca),
			'ヒ': String.fromCharCode(0xcb),
			'ﾋ': String.fromCharCode(0xcb),
			'フ': String.fromCharCode(0xcc),
			'ﾌ': String.fromCharCode(0xcc),
			'コ': String.fromCharCode(0xba),
			'ｺ': String.fromCharCode(0xba),
			'年': String.fromCharCode(0xb4),
			'年': String.fromCharCode(0xb4),
			'月': String.fromCharCode(0xb5),
			'⽉': String.fromCharCode(0xb5),
			'日': String.fromCharCode(0xb6),
			'⽇': String.fromCharCode(0xb6),
			'゛': String.fromCharCode(0xaa),
			'ﾞ': String.fromCharCode(0xaa),
			'レ': String.fromCharCode(0xda),
			'ﾚ': String.fromCharCode(0xda),
			'リ': String.fromCharCode(0xd8),
			'ﾙ': String.fromCharCode(0xd8),
			'テ': String.fromCharCode(0xc3),
			'ﾃ': String.fromCharCode(0xc3),
			'ヨ': String.fromCharCode(0xd6),
			'ョ': String.fromCharCode(0xd6),
			'ﾖ': String.fromCharCode(0xd6),
			'ｮ': String.fromCharCode(0xd6),
			'ツ': String.fromCharCode(0xc2),
			'ﾂ': String.fromCharCode(0xc2),
			'ホ': String.fromCharCode(0xce),
			'ﾎ': String.fromCharCode(0xce),
			'ヘ': String.fromCharCode(0xcd),
			'ﾍ': String.fromCharCode(0xcd),
			'ス': String.fromCharCode(0xac),
			'ｽ': String.fromCharCode(0xac),
			'サ': String.fromCharCode(0xbb),
			'ｻ': String.fromCharCode(0xbb),
			'ソ': String.fromCharCode(0xbf),
			'ｿ': String.fromCharCode(0xbf),
			'シ': String.fromCharCode(0xbc),
			'ｼ': String.fromCharCode(0xbc),
			'セ': String.fromCharCode(0xbe),
			'ャ': String.fromCharCode(0xbe),
			'ﾔ': String.fromCharCode(0xbe),
			'ャ': String.fromCharCode(0xbe),
			'ー': '-',
			'・': '.'
			
		},
		replacementsUnicode = {
			// legacy computing range
			0x1FB70: String.fromCharCode(0xd4), // 8th v-block 2
			0x1FB71: String.fromCharCode(0xc7), // 8th v-block 3
			0x1FB72: String.fromCharCode(0xc2), // 8th v-block 4
			0x1FB73: String.fromCharCode(0xdd), // 8th v-block 5
			0x1FB74: String.fromCharCode(0xc8), // 8th v-block 6
			0x1FB75: String.fromCharCode(0xd9), // 8th v-block 7
			0x1FB76: String.fromCharCode(0xc5), // 8th h-block 2
			0x1FB77: String.fromCharCode(0xc4), // 8th h-block 3
			0x1FB78: String.fromCharCode(0xc3), // 8th h-block 4
			0x1FB79: String.fromCharCode(0xc0), // 8th h-block 5
			0x1FB7A: String.fromCharCode(0xc6), // 8th h-block 6
			0x1FB7B: String.fromCharCode(0xd2), // 8th h-block 7
			0x1FB7C: String.fromCharCode(0xcc), // left-lower 8th block
			0x1FB7D: String.fromCharCode(0xcf), // left-upper 8th block
			0x1FB7E: String.fromCharCode(0xd0), // right-upper 8th block
			0x1FB7F: String.fromCharCode(0xba), // right-lower 8th block
			0x1FB82: String.fromCharCode(0xb7), // upper 2 eights
			0x1FB83: String.fromCharCode(0xb8), // upper 3 eights
			0x1FB87: String.fromCharCode(0xaa), // right 2 eights
			0x1FB88: String.fromCharCode(0xb6), // right 3 eights
			0x1FB8C: String.fromCharCode(0xdc), // left half medium
			0x1FB8F: String.fromCharCode(0xa8), // lower half medium
			0x1FB90: String.fromCharCode(0xa6), // medium shade block
			0x1FB91: String.fromCharCode(0xa8), // lower half medium (inverse)
			0x1FB94: String.fromCharCode(0xdc), // left half medium (inverse)
			0x1FB95: String.fromCharCode(0xde), // checker board (lower-case set)
			0x1FB96: String.fromCharCode(0xde), // checker board inverse (lower-case set)
			0x1FB98: String.fromCharCode(0xdf), // cross-hatch l-r (lower-case set)
			0x1FB99: String.fromCharCode(0xa9), // cross-hatch r-l (lower-case set)
			0x1FB9C: String.fromCharCode(0xa9), // -> upper left triangle
			0x1FB9D: String.fromCharCode(0xdf), // -> upper right triangle
			0x1FB9D: String.fromCharCode(0xa9), // -> upper left triangle (inverse)
			0x1FB9E: String.fromCharCode(0xdf), // -> upper right triangle (inverse)
			0x1FBB1: String.fromCharCode(0xba), // -> checkmark inverse (lower-case set)
			0x1FBAF: String.fromCharCode(0xdb), // box drawings light horizontal with vertical
		},
		replacementsRE = null,
		replacementsUnicodeRE = null;
	try {
		// is there support for 5-byte unicode? try the legacy computing range...
		if (String.prototype.codePointAt) replacementsUnicodeRE = new RegExp('[\\u{1FB00}-\\u{1FBFF}]', 'gu');
	}
	catch (e) {}
	function getReplacement(c) {
		return replacements[c] || '?';
	}
	function getUnicodeReplacement(c) {
		var cc = c.codePointAt(0);
		console.log(cc.toString(16), replacementsUnicode[cc]);
		return (cc && replacementsUnicode[cc])? replacementsUnicode[cc]:'?';
	}
	function getReplacementsRE() {
		if (!replacementsRE) {
			var pattern;
			if (typeof Object.keys === 'function') {
				pattern = Object.keys(replacements).join('');
			}
			else {
				pattern = '';
				for (var n in replacements) {
					if (replacements.hasOwnProperty(n)) pattern += n;
				}
			}
			replacementsRE = new RegExp('[' + pattern + ']' , 'g');
		}
		return replacementsRE;
	}
	function normalize(s) {
		if (typeof s === 'string') {
			if (replacementsUnicodeRE) s = s.replace(replacementsUnicodeRE, getUnicodeReplacement)
			return s.replace(getReplacementsRE(), getReplacement);
		}
		return s;
	}

	// convert from markup "{ddd}" or "{$hh}" or "{label}" to PETSCCI

	var	reIsDec = /^[0-9]+$/,
		reIsHex = /^\$[0-9A-F]+$/,
		reIsAlpha = /^[A-Z]+$/,
		reMarkupIgnored = /[^$A-Z0-9]/g,
		reQuantifier = /^\s*([0-9]+)\s+(\S.*)?\s*$/,
		rePreserveTrailingS = /^(CL?S|RVS|INS|APOS)$/i,
		reTrailingS = /S$/i;

	// convert to single char from 'ddd' or '$xx' or 'label'
	function markupCodeToPetscii(s) {
		function quantified(c) {
			if (quantifier == 1) return c;
			var t = [];
			for (var i=0; i<quantifier; i++) t.push(c);
			return t;
		}
		var quantifier = 1, qMatch = s.match(reQuantifier);
		if (qMatch) {
			quantifier = parseInt(qMatch[1]);
			s = qMatch[2];
			if (!rePreserveTrailingS.test(s)) s=s.replace(reTrailingS, '');
		}
		var s = s.toUpperCase().replace(reMarkupIgnored, '');
		if (reIsDec.test(s)) {
			return quantified(parseInt(s, 10) & 0xFF);
		}
		else if (reIsHex.test(s)) {
			return quantified(parseInt(s.substring(1), 16) & 0xFF);
		}
		else if (reIsAlpha.test(s)) {
			switch(s) {
				case 'CLEAR':
				case 'CLEARSCREEN':
				case 'CLEARSCR':
				case 'CLEARHOME':
				case 'CLRHOME':
				case 'CLRHM':
				case 'CLRH':
				case 'CLR':
				case 'CLH':
				case 'CLS':
				case 'CS':
				case 'SC':
					return quantified(0x93);
				case 'HOME':
				case 'HOM':
				case 'HM':
				case 'CHOME':
				case 'CRSRHOME':
				case 'CH':
					return quantified(0x13);
				case 'CRSRDOWN':
				case 'CRSRDWN':
				case 'DOWN':
				case 'DWN':
				case 'DN':
				case 'CD':
					return quantified(0x11);
				case 'CRSRUP':
				case 'UP':
				case 'CU':
					return quantified(0x91);
				case 'CRSRLEFT':
				case 'CRSRLFT':
				case 'LEFT':
				case 'LFT':
				case 'CL':
					return quantified(0x9D);
				case 'CRSRRIGHT':
				case 'CRSRRGT':
				case 'RIGHT':
				case 'RGHT':
				case 'RGT':
				case 'CR':
					return quantified(0x1D);
				case 'REVERSEON':
				case 'RVSON':
				case 'RVS':
				case 'RVON':
				case 'RON':
					return quantified(0x12);
				case 'REVERSEOFF':
				case 'RVSOFF':
				case 'RVOFF':
				case 'ROFF':
				case 'ROF':
					return quantified(0x92);
				case 'PI':
					return quantified(0xFF);
				case 'SPACE':
				case 'SPC':
				case 'SP':
				case 'BLANK':
				case 'BLNK':
				case 'BL':
					return quantified(0x20);
				case 'INSERT':
				case 'INST':
				case 'INS':
					return quantified(0x94);
				case 'STOP':
				case 'STP':
					return quantified(0x03);
				case 'QUOTE':
				case 'QUOT':
				case 'Q':
				case 'DQ':
				case 'DOUBLEQUOTE':
				case 'DBLQUOTE':
				case 'DBLQUOT':
				case 'DQUOTE':
				case 'DQUOT':
					return quantified(0x22);
				case 'SINGLEQUOTE':
				case 'SNGLQUOTE':
				case 'SNGLQUOT':
				case 'SQUOTE':
				case 'SQUOT':
				case 'SQ':
				case 'APOSTROPHE':
				case 'APOS':
					return quantified(0x27);
				case 'SHIFTSPACE':
				case 'SHIFTSPC':
				case 'SHIFTSP':
				case 'SHIFTBLANK':
				case 'SHIFTBLNK':
				case 'SHIFTBL':
				case 'SHFTSPACE':
				case 'SHFTSPC':
				case 'SHFTSP':
				case 'SHFTBLANK':
				case 'SHFTBLNK':
				case 'SHFTBL':
				case 'SBLANK':
				case 'SBLNK':
				case 'SBL':
					return quantified(0xA0);
				case 'UPARROW':
				case 'UARROW':
				case 'UPARR':
				case 'UARR':
					return quantified(0x5E);
				case 'LEFTARROW':
				case 'LFTARROW':
				case 'LARROW':
				case 'LEFTARR':
				case 'LFTARR':
				case 'LARR':
					return quantified(0x5F);
			}
		}
		return -1;
	}

	function replacePetsciiMarkup(m, m1) {
		var t = markupCodeToPetscii(m1);
		if (typeof t === 'number') return t >= 0? String.fromCharCode(t):'';
		var s = '', c = String.fromCharCode(t[i]);
		for (var i=0; i<t.length; i++) s += c;
		return s;
	}

	// unescape PETSCII from {ddd} or {$hh} or {label}
	function unescapePetscii(stream, catchASM) {
		if (typeof stream === 'string') {
			if (catchASM && (/\{\s*asm[ _-]*start\s*}/i).test(stream)) {
				var streamParts = stream.split(/\{\s*asm[ _-]*start\s*}/i),
					outStream = streamParts[0].replace(/\{(.*?)\}/g, replacePetsciiMarkup);
				outStream += String.fromCharCode(0x04); //EOT
				for (var i=1; i < streamParts.length; i++); outStream += streamParts[i];
				return outStream;
			}
			return stream.replace(/\{(.*?)\}/g, replacePetsciiMarkup);
		}
		else {
			var q = [], i = 0, max = stream.length - 1;
			while (i <= max) {
				var c = stream[i++];
				if (c === 0x7B) { // {
					var s = '';
					c = stream[i++];
					while (i <= max && c && c !== 0x7D) {
						s += String.fromCharCode(c);
						c = stream[i++];
					}
					if (catchASM && (/^\s*asm[ _-]*start\s*$/i).test(s)) {
						q.push(0x04); //EOT
						while (i <= max) q.push(stream[i++]);
						return q;
					}
					var cc = markupCodeToPetscii(s);
					if (typeof cc === 'number') {
						if (cc >= 0) q.push(cc);
					}
					else {
						for (var j=0; j<cc.length; j++) q.push(cc[j]);
					}
				}
				else q.push(c);
			}
			return q;
		}
	}

	function transcode(text, includeRunStop) {
		function adjustCase(line) {
			var m = reFirstChar.exec(line);
			if (m) {
				var c = m[1];
				isUC = c >= 'A' && c <= 'Z';
			}
			else {
				line = line.replace(reREM, '$1');
				if (reHasLC.test(line)) isUC = false;
				else if (reHasUC.test(line)) isUC = true;
			}
		}
		if (typeof text !== 'string') {
			console.warn(
				'PetUtils.srcTextUtil.transcode: Expected string, got '
				+ Object.prototype.toString.call(text) + '.'
			);
			return [];
		}
		var reHasLC = /[a-z]/,
			reHasUC = /[A-Z]/,
			reMarkup = /\{.*?\}/g,
			reRunStop = /RU?N.*STO?P/i,
			reFirstChar = /^\s*[0-9]*\s*([a-z])/i,
			reREM = /\b(REM)\b.*$/i,
			isUC = false,
			lines = text.split(/\r?\n/),
			out = [];
		for (var i = 0, lm = lines.length - 1; i <= lm; i++) {
			var line = normalize(lines[i]),
				ltxt = line.replace(reMarkup, '');
			// check for letters and case, otherwise use last setting
			adjustCase(line);
			for (var k = 0, km = line.length; k < km; k++) {
				var c = line.charCodeAt(k);
				if (c === 0x03C0) out.push(0xFF); // pi
				else if (c === 0x7B) { //'{'
					var s = '';
					while (++k < km) {
						var ch = line.charAt(k);
						if (ch === '}' || ch === '"') break;
						s = s + ch;
					}
					if (s) {
						var cc = markupCodeToPetscii(s);
						if (typeof cc === 'number') {
							if (cc >= 0) out.push(cc);
							else if (includeRunStop && reRunStop.test(s)) out.push(0x83);
						}
						else {
							for (var j=0; j<cc.length; j++) out.push(cc[j]);
						}
					}
				}
				else if (c >= 0x60&& c <= 0x7A) out.push(c - 0x20); // lc
				else if (c >= 0x40 && c <= 0x5A) {  // uc
					if (isUC) out.push(c);
					else out.push(c | 0x80);
				}
				else if (c >= 0x20 && c <= 0xFF) out.push(c);
			}
			if (i < lm) out.push(0x0D);
		}
		return out;
	}

	return {
		'normalize': normalize,
		'markupCodeToPetscii': markupCodeToPetscii,
		'unescapePetscii': unescapePetscii,
		'transcode': transcode
	};
})();

// unicode for petscii glyphs specific to japanese char-rom
var petsciiToKana = {
	0x5C:0x00A5, 0xA1:0x30A2, 0xA2:0x30A4, 0xA3:0x30A6, 0xA4:0x30A8,
	0xA5:0x30AA, 0xA7:0x30AD, 0xA6:0x30AB, 0xDC:0x30EF, 0xA8:0x30AF,
	0xA9:0x30B1, 0xDF:0x30F2, 0xD1:0x30E0, 0xD7:0x30E9, 0xC5:0x30CA,
	0xD2:0x30E1, 0xD4:0x30E4, 0xD9:0x30EB, 0xD5:0x30E6, 0xC9:0x30CE,
	0xCF:0x30DE, 0xD0:0x30DF, 0xB7:0x30BF, 0xB8:0x30ED, 0xB9:0x30F3,
	0xAF:0x309C, 0xC1:0x30C1, 0xD3:0x30E2, 0xC4:0x30C8, 0xC6:0x30CB,
	0xC7:0x30CC, 0xC8:0x30CD, 0xCA:0x30CF, 0xCB:0x30D2, 0xCC:0x30D5,
	0xBA:0x30B3, 0xB4:0x5E74, 0xB5:0x6708, 0xB6:0x65E5, 0xAA:0x309B,
	0xDA:0x30EC, 0xD8:0x30EA, 0xC3:0x30C6, 0xD6:0x30E8, 0xC2:0x30C4,
	0xCE:0x30DB, 0xCD:0x30D8, 0xAC:0x30B9, 0xBB:0x30B5, 0xBF:0x30BD,
	0xBC:0x30B7, 0xBE:0x30BB
};

// tables for basic tokens and keywords

var	basicTokens = [
		0x45,0x4E,0xC4, //end
		0x46,0x4F,0xD2, //for
		0x4E,0x45,0x58,0xD4, //next
		0x44,0x41,0x54,0xC1, //data
		0x49,0x4E,0x50,0x55,0x54,0xA3, //input#
		0x49,0x4E,0x50,0x55,0xD4, //input
		0x44,0x49,0xCD, //dim
		0x52,0x45,0x41,0xC4, //read
		0x4C,0x45,0xD4, //let
		0x47,0x4F,0x54,0xCF, //goto
		0x52,0x55,0xCE, //run
		0x49,0xC6, //if
		0x52,0x45,0x53,0x54,0x4F,0x52,0xC5, //restore
		0x47,0x4F,0x53,0x55,0xC2, //gosub
		0x52,0x45,0x54,0x55,0x52,0xCE, //return
		0x52,0x45,0xCD, //rem
		0x53,0x54,0x4F,0xD0, //stop
		0x4F,0xCE, //on
		0x57,0x41,0x49,0xD4, //wait
		0x4C,0x4F,0x41,0xC4, //load
		0x53,0x41,0x56,0xC5, //save
		0x56,0x45,0x52,0x49,0x46,0xD9, //verify
		0x44,0x45,0xC6, //def
		0x50,0x4F,0x4B,0xC5, //poke
		0x50,0x52,0x49,0x4E,0x54,0xA3, //print#
		0x50,0x52,0x49,0x4E,0xD4, //print
		0x43,0x4F,0x4E,0xD4, //cont
		0x4C,0x49,0x53,0xD4, //list
		0x43,0x4C,0xD2, //clr
		0x43,0x4D,0xC4, //cmd
		0x53,0x59,0xD3, //sys
		0x4F,0x50,0x45,0xCE, //open
		0x43,0x4C,0x4F,0x53,0xC5, //close
		0x47,0x45,0xD4, //get
		0x4E,0x45,0xD7, //new
		0x54,0x41,0x42,0xA8, //tab(
		0x54,0xCF, //to
		0x46,0xCE, //fn
		0x53,0x50,0x43,0xA8, //spc(
		0x54,0x48,0x45,0xCE, //then
		0x4E,0x4F,0xD4, //not
		0x53,0x54,0x45,0xD0, //step
		0xAB, //plus
		0xAD, //minus
		0xAA, //multiply
		0xAF, //divide
		0xDE, //power
		0x41,0x4E,0xC4, //and
		0x4F,0xD2, //on
		0xBE, //greater
		0xBD, //equal
		0xBC, //less
		0x53,0x47,0xCE, //sgn
		0x49,0x4E,0xD4, //int
		0x41,0x42,0xD3, //abs
		0x55,0x53,0xD2, //usr
		0x46,0x52,0xC5, //fre
		0x50,0x4F,0xD3, //pos
		0x53,0x51,0xD2, //sqr
		0x52,0x4E,0xC4, //rnd
		0x4C,0x4F,0xC7, //log
		0x45,0x58,0xD0, //exp
		0x43,0x4F,0xD3, //cos
		0x53,0x49,0xCE, //sin
		0x54,0x41,0xCE, //tan
		0x41,0x54,0xCE, //atn
		0x50,0x45,0x45,0xCB, //peek
		0x4C,0x45,0xCE, //len
		0x53,0x54,0x52,0xA4, //str$
		0x56,0x41,0xCC, //val
		0x41,0x53,0xC3, //asc
		0x43,0x48,0x52,0xA4, //chr$
		0x4C,0x45,0x46,0x54,0xA4, //left$
		0x52,0x49,0x47,0x48,0x54,0xA4, //right$
		0x4D,0x49,0x44,0xA4, //mid$   -- end of rom 1 (253) --
		0x47,0xCF, //go               -- end of rom 2 (255) --
		0x43, 0x4F, 0x4E, 0x43, 0x41, 0xD4, //concat
		0x44, 0x4F,  0x50, 0x45, 0xCE, //dopen
		0x44, 0x43, 0x4C, 0x4F, 0x53, 0xC5, //dclose
		0x52, 0x45, 0x43, 0x4F, 0x52, 0xC4, //record
		0x48, 0x45, 0x41, 0x44, 0x45, 0xD2,  //header
		0x43, 0x4F, 0x4C, 0x4C, 0x45, 0x43, 0xD4, //collect
		0x42, 0x41, 0x43, 0x4B, 0x55, 0xD0,  //backup
		0x43, 0x4F, 0x50, 0xD9,  //copy
		0x41, 0x50, 0x50, 0x45, 0x4E, 0xC4, //appenD
		0x44, 0x53, 0x41, 0x56, 0xC5, //dsave
		0x44, 0x4C, 0x4F, 0x41, 0xC4, //dload
		0x43, 0x41, 0x54, 0x41, 0x4C, 0x4F, 0xC7, //catalog
		0x52, 0x45, 0x4E, 0x41, 0x4D, 0xC5, //rename
		0x53, 0x43, 0x52, 0x41, 0x54, 0x43, 0xC8, //scratch
		0x44, 0x49, 0x52, 0x45, 0x43, 0x54, 0x4F, 0x52, 0xD9, //directory
		0x00  // -- end of rom 4 (346 + 1) --
	],
	basicKeywords = [
		'END', 'FOR', 'NEXT', 'DATA', 'INPUT#', 'INPUT', 'DIM', 'READ', 'LET',
		'GOTO', 'RUN', 'IF', 'RESTORE', 'GOSUB', 'RETURN', 'REM', 'STOP', 'ON',
		'WAIT', 'LOAD', 'SAVE', 'VERIFY', 'DEF', 'POKE', 'PRINT#', 'PRINT',
		'CONT', 'LIST', 'CLR', 'CMD', 'SYS', 'OPEN', 'CLOSE', 'GET', 'NEW',
		'TAB(', 'TO', 'FN', 'SPC(', 'THEN', 'NOT', 'STEP', '+', '-', '*', '/',
		'^', 'AND', 'OR', '>', '=', '<', 'SGN', 'INT', 'ABS', 'USR', 'FRE',
		'POS', 'SQR', 'RND', 'LOG', 'EXP', 'COS', 'SIN', 'TAN', 'ATN', 'PEEK',
		'LEN', 'STR$', 'VAL', 'ASC', 'CHR$', 'LEFT$', 'RIGHT$', 'MID$', // end rom 1
		'GO', // end rom 2
		'CONCAT', 'DOPEN', 'DCLOSE', 'RECORD', 'HEADER', 'COLLECT', 'BACKUP',
		'COPY', 'APPEND', 'DSAVE', 'DLOAD', 'CATALOG', 'RENAME', 'SCRATCH',
		'DIRECTORY' // end rom 4
	];

function getTokensForRomVersion(romVersion) {
	var tokens;
	if (romVersion == 4) {
		tokens = basicTokens;
	}
	else if (romVersion == 1) { // no "go" on PET 2001, ROM 1.0
		tokens = basicTokens.slice(0, 253);
		tokens.push(0);
	}
	else {
		tokens = basicTokens.slice(0, 255);
		tokens.push(0);
	}
	return tokens;
}
function getBasicKeywordsForRomVersion(romVersion) {
	if (romVersion == 4) {
		return basicKeywords;
	}
	else if (romVersion == 1) { // no "go" on PET 2001, ROM 1.0
		return basicKeywords.slice(0, 75);
	}
	else {
		return basicKeywords.slice(0, 76);
	}
}

// parse a plain text listing to tokenized BASIC

function txt2Basic(txt, address, asPrgFile, romVersion) {
	// normalize arguments
	var src, startAddr;
	switch (Object.prototype.toString.call(txt)) {
		case '[object Array]':
		case '[object Uint8Array]':
			src = txt;
			break;
		case '[object ArrayBuffer]':
			txt = new DataView(txt);
		case '[object DataView]':
			var src = [], size = txt.byteLength;
			for (var i = 0; i < size; i++) src[i] = txt.getUint8(i);
			break;
		case '[object String]':
			var src = [];
			txt = srcTextUtil.normalize(txt);
			for (var i = 0; i < txt.length; i++) {
				if (txt.charAt(i) === 'π' || txt.charAt(i) === '∏') {
					src.push(0xFF);
				}
				else {
					var c = txt.charCodeAt(i);
					if (c <= 0xFF) src.push(c);
					else {
						console.warn('Text import: Replacing illegal source character "'+String.fromCharCode(c)+'" (U+'+hex(c,4)+') by "?" at stream position '+i+'.');
						src.push(0x3F); // "?"
					}
				}
			}
			break;
		default:
			return {
				'prg': [],
				'error': 'illegal input: '+Object.prototype.toString.call(txt)+'.'
			};
	}

	// unescape PETSCII from {ddd} or {$hh} or {label}
	src = srcTextUtil.unescapePetscii(src,true);

	// start address defaults to PET
	startAddr = (address && !isNaN(address))?
		Number(address) & 0xFFFF
		: 0x0401;

	// defs and setup
	var tokens = basicTokens, //getTokensForRomVersion(romVersion),
		lineLengthMax = 88,
		lineNumberMax = 63999,
		lines = {},
		error = '',
		idx = 0,
		srcLength = src.length,
		sl = 1,
		isLC = false,
		raw = 0,
		bigEndien = true,
		eof = false,
		asmStart = false,
		asmAddr = 0,
		asmSrc = '',
		asm;

	function getCh() {
		for (;;) {
			if (idx >= srcLength) {
				raw = 0;
				eof = true;
				return 0;
			}
			var c = src[idx++];
			if ((bigEndien && c === 3 && src[idx] === 0xC0)
				|| (!bigEndien && c === 0xC0 && src[idx] === 3)
				|| (c === 0xCF && src[idx] === 0x80)) {
				idx++;
				c = 0xFF; // pi
			}
			else if (c === 0x7E || c === 0xDE)
				c = 0xFF; // copies of pi in PETSCII
			else if (c === 9) // tab
				c = 0x20;
			else if (c === 0x0D || c === 0x0A) {
				var cr = false;
				if (c === 0x0D) {
					if (src[idx] === 0x0A) idx++;
					cr = true;
				}
				else if (c === 0x0A) cr = true;
				if (cr) c = 0;
			}
			raw = c;
			if (isLC) {
				if (c >= 0x61 && c <= 0x7A) c &= 0xDF;
				else if (c >= 0x41 && c <= 0x5A) c |= 0x80;
			}
			eof = idx >= srcLength;
			return c;
		}
	}

	function gotCharCaseAdjusted() {
		if (raw >= 0x41 && raw <= 0x5A) {
			isLC = false;
			return raw;
		}
		else if (raw >= 0x61 && raw <= 0x7A) {
			isLC = true;
			return raw & 0xDF;
		}
		return raw;
	}

	function getAsmSrc() {
		asmSrc = '';
		// skip rest of line
		while (idx < src.length) {
			var c = src[idx++];
			if (c === 0x0D || c === 0x0A) {
				if (c === 0x0D && src[idx] === 0x0A) idx++;
				break;
			}
		}
		// now collect the rest of the file in a string
		while (idx < src.length) {
			var c = src[idx++];
			if (c === 0x0D || c === 0x0A) { // normalize to nl
				if (c === 0x0D && src[idx] === 0x0A) idx++;
				asmSrc += '\n';
			}
			else {
				asmSrc += String.fromCharCode(c);
			}
		}
	}

	//skip BOM
	if (src[0] == 0xEF && src[1] == 0xBB && src[2] == 0xBF) idx = 3;
	else if (src[0] == 0xFF && src[1] == 0xFE) idx = 2;
	else if (src[0] == 0xFE && src[1] == 0xFF) { idx = 2; bigEndien = false; }

	// parse loop
	parseloop: while (idx < srcLength) {
		var c, ln = 0, dataFlag = false, tokenized = [], direct = true;
		// get line number
		c = getCh();
		while ((c >= 0x30 && c <= 0x39) || c === 0x20) {
			if (!c) break;
			if (c !== 0x20) ln = ln * 10 + c - 0x30;
			direct = false;
			c = getCh();
		}
		if (ln >= lineNumberMax) {
			error = 'line '+sl+': syntax error (illegal line number).';
			break;
		}
		if (direct) {
			while (c === 0x20) getCh();
			if (c !== 0) {
				error = 'line '+sl+': illegal direct mode (missing line number).';
				break;
			}
		}
		else {
			// tokenize line content
			while (c) {
				c = gotCharCaseAdjusted();
				// parse and tokenize like CBM BASIC
				if (c === 0x04) {
					// catch asm-start token (ASCII EOT)
					asmStart = true;
					lines[ln] = tokenized;
					getAsmSrc();
					break parseloop;
				}
				if (tokenized.length > lineLengthMax) {
					error = 'line '+sl+': string too long.';
					break parseloop;
				}
				if (c >= 0x80) {
					if (c === 0xFF) tokenized.push(c);
				}
				else if (c) {
					if (c === 0x20) tokenized.push(c);
					else if (c === 0x22) { //quote
						tokenized.push(c)
						c = getCh();
						while (c) {
							tokenized.push(c);
							if (c === 0x22) break;
							c = getCh();
						}
						if (!c && !eof) idx--;
					}
					else if (dataFlag) {
						tokenized.push(c);
					}
					else if (c === 0x3F) { //"?"
						c = 0x99;
						tokenized.push(c);
					}
					else if (c >= 0x30 && c < 0x3C) {
						tokenized.push(c);
					}
					else {
						// evaluate tokens
						var ptr = idx, b = c, cmd = 0, cnt = 0;
						for (;;) {
							var d = tokens[cnt] - c;
							if (d == 0) {
								c = getCh();
								cnt++;
							}
							else if (Math.abs(d) == 0x80) {
								c = 0x80 | cmd;
								break;
							}
							else {
								c = b;
								idx = ptr;
								while ((tokens[cnt++] & 0x80) == 0);
								if (tokens[cnt] == 0) break;
								cmd++;
							}
						}
						tokenized.push(c);
						if (c === 0x3A) dataFlag = false; //":"
						else if (c === 0x83) dataFlag = true; //"DATA"
						else if (c === 0x8F) {//"REM"
							c = getCh();
							while (c) {
								if (c === 0x04) {
									// catch asm-start token (ASCII EOT)
									asmStart = true;
									lines[ln] = tokenized;
									getAsmSrc();
									break parseloop;
								}
								tokenized.push(c);
								c = getCh();
							}
							if (!eof) idx--;
						}
					}
				}
				c = getCh();
			}
			if (tokenized.length > lineLengthMax) {
				error = 'line '+sl+': string too long.';
				break;
			}
			if (tokenized.length) lines[ln] = tokenized;
		}
		sl++;
	}

	// generate linked lines
	var	lns = [],
		prg = [],
		pc = startAddr;
	for (var n in lines) lns.push(n);
	lns.sort(function(a,b) { return a-b; });
	for (var i = 0, max = lns.length - 1; i <= max; i++) {
		var n = lns[i], tk = lines[n], tl = tk.length;
		if (tl) {
			if (asmStart && i == max) {
				// insert ascii for next addr after prg
				asmAddr = (pc + tl + 6);
				var s = asmAddr.toString(10);
				asmAddr += s.length;
				var asmAddrStr = asmAddr.toString(10);
				if (s.length != asmAddr.length) {
					asmAddr++;
					asmAddrStr = asmAddr.toString(10);
				}
				for (var ac = 0; ac < asmAddrStr.length; ac++) tk.push(asmAddrStr.charCodeAt(ac));
				tl += asmAddrStr.length;
			}
			var link = pc + tl + 5;
			prg.push(link & 0xFF);
			prg.push((link >> 8)  & 0xFF);
			prg.push(n & 0xFF);
			prg.push((n >> 8)  & 0xFF);
			for (var t = 0; t < tk.length; t++) prg.push(tk[t]);
			prg.push(0);
			pc = link;
		}
	}
	if (prg.length) {
		prg.push(0);
		prg.push(0);
		if (asmStart) {
			if (asmSrc) {
				asm = assembler.assemble(asmSrc, asmAddr);
				var asmError = asm.error,
					message = '';
				if (!asm.error && asm.code) {
					if (asm.code.start < asmAddr) {
						message = 'Error: assembly code cannot backtrack inside the program (code starts at $'
							+ hex(asmAddr,4) + ', retraces to $' + hex(asm.code.start,4) + '.';
						asmError = true;
					}
					else if (asmAddr + asm.code.length > 0x8000) {
						message = 'Error: code exceeds max. RAM range ($8000).';
						asmError = true;
					}
					else {
						for (var i=0; i < asm.code.length; i++) prg.push(asm.code[i]);
					}
				}
				if (asmError) {
					error += (error? '\n':'') + asm.message;
					if (message) error += '\n' + message;
					prg.push(0x60); // RTS
				}
			}
			else {
				prg.push(0x60); // RTS
			}
		}
		if (asPrgFile) prg.splice(0, 0, startAddr & 0xFF, (startAddr >> 8)  & 0xFF);
	}
	return { 'prg': prg, 'error': error, 'asm': asm };
}

// transform QB-like sources to regular BASIC
// (labels using "[...]", comments with "'", generate line numbers)

function qbTransform(txt) {
	function lnNo(i) {
		return '' + ((1+i)*10);
	}
	var source = txt.split('\n'),
		labels = {},
		lnNoLabels = {},
		lines = [],
		tags = [],
		out = [],
		excessLabels = {},
		addEnd = false,
		sourceLC = false;;
	for (var i=0; i<source.length; i++) {
		var l = source[i], m, lineNo = -1;
		m = /^([0-9\s]+)(.*)$/.exec(l);
		if (m) {
			l = m[2].replace(/\s+$/,'');
			var lnlbl = parseInt(m[1].replace(/\s/g, ''), 10);
			if (!isNaN(lnlbl)) lineNo=lnlbl;
		}
		m = /^\s*\[\s*([^\]]*?)\s*\](.*)$/.exec(l);
		if (m) {
			var tag = m[1].toUpperCase().replace(/\W/g,'');
			if (!tag) return {
				'error': 'empty label.',
				'line': i+1,
				'source': l
			};
			if (labels[tag]) return {
				'error': 'label "'+tag+'" already exists.',
				'line': i+1,
				'source': l
			};
			l = m[2].replace(/^\s*:?\s*/, '');
			tags.push(tag);
			labels[tag] = -1;
		}
		if (!l) continue;
		while (tags.length) {
			labels[tags.shift()] = lines.length;
		}
		if (lineNo >= 0) lnNoLabels[lineNo] = lines.length;
		lines.push({
			'txt': l,
			'lno': i+1
		});
	}
	if (tags.length) {
		var top = lines.length;
		while (tags.length) {
			var t = tags.shift();
			labels[t] = top;
			excessLabels[t] = true;
		}
	}
	for (var i=0; i<lines.length; i++) {
		var l = lines[i].txt,
			statementStart = true;
		if (l.search(/[a-z]/) >= 0) sourceLC = true;
		for (var k=0; k<l.length; k++) {
			var c = l.charAt(k).toUpperCase();
			if (c == '"') {
				if (++k == l.length) break;
				while (l.charAt(k) != '"' && k < l.length) k++;
				statementStart=false;
				continue;
			}
			if (c == "'") {
				var lc = l.search(/[a-z]/),
					uc = l.search(/[A-Z]/),
					rem =  (lc >= 0 && (uc < 0 || lc < uc)) || sourceLC? 'rem':'REM';
				if (!statementStart) rem = ':'+rem;
				l = l.substring(0, k)+rem+' '+l.substring(k+1).replace(/\s*'$/,'');
				break;
			}
			if (c == 'R' && k + 2 < l.length
				&& l.charAt(k+1).toUpperCase() == 'E'
				&& l.charAt(k+2).toUpperCase() == 'M') break;
			if (c=='[') {
				var tag = '', idx = k;
				for (k++; k < l.length; k++) {
					c = l.charAt(k);
					if (c == ']') break;
					if (/\w/.test(c)) tag+=c.toUpperCase();
				}
				if (tag) {
					if (typeof labels[tag] === 'undefined') return {
						'error': 'undefined label "'+tag+'".',
						'line': lines[i].lno,
						'source': lines[i].txt
					};
					if (excessLabels[tag]) addEnd = true;
					var n = lnNo(labels[tag]);
					l = l.substring(0, idx)+lnNo(labels[tag])+l.substring(k+1);
					k = idx+n.length-1;
				}
				else {
					k = idx;
				}
				statementStart=false;
				continue;
			}
			else if (c == 'G' && k + 4 < l.length && l.charAt(k+1).toUpperCase() == 'O') {
				var m = (/(^GO *TO|GOSUB)(.*?)$/i).exec(l.substring(k));
				if (m) {
					var tcmd = m[1],
						targ = m[2],
						ts = '',
						tr = '';
					for (var tk=0; tk<targ.length; tk++) {
						var tc = targ.charAt(tk);
						if (tc == ':' || tc == '\'') {
							tr=targ.substring(tk);
							break;
						}
						if (tc == '[') {
							var tag = '',
								found = false,
								tidx = tk;
							for (var tk=tk+1; tk<targ.length; tk++) {
								tc = targ.charAt(tk);
								if (tc == ']') {
									found = true;
									break;
								}
								if (/\w/.test(tc)) tag+=tc.toUpperCase();
								else if (/[,':]/.test(tc)) return {
									'error': 'unfinished label "'+tag+'" for '+tcmd.toUpperCase()+', found "'+tc+'".',
									'line': lines[i].lno,
									'source': lines[i].txt
								};
							}
							if (found && tag) {
								if (typeof labels[tag] === 'undefined') return {
									'error': 'undefined label "'+tag+'".',
									'line': lines[i].lno,
									'source': lines[i].txt
								};
								if (excessLabels[tag]) addEnd = true;
								ts += lnNo(labels[tag]);
							}
							else return {
								'error': found? 'empty label "[]" for '+tcmd.toUpperCase()+'.' :
									'unclosed bracket "[" near '+tcmd.toUpperCase()+' (label "'+tag+'").',
								'line': lines[i].lno,
								'source': lines[i].txt
							};
						}
						else if (tc >= '0' && tc <= '9') {
							var tn = tc,
								tblanks = 0,
								tidx = tk;
							for (var tk=tk+1; tk<targ.length; tk++) {
								tc = targ.charAt(tk);
								if (tc >= '0' && tc <= '9') {
									tn += tc;
									tblanks = 0;
								}
								else if (tc == ' ') tblanks++;
								else break;
							}
							tn = parseInt(tn, 10);
							if (!isNaN(tn) && typeof lnNoLabels[tn] !== 'undefined') {
								ts += lnNo(lnNoLabels[tn]);
								while (tblanks--) ts += ' ';
							}
							else {
								ts += targ.substring(tidx, tk);
							}
							tk--;
						}
						else ts += tc;
					}
					l = l.substring(0,k) + tcmd + ts + tr;
					k += tcmd.length + ts.length - 1;
					statementStart=false;
					continue;
				}
			}
			statementStart = c==':' || (statementStart && /\s/.test(c));
		}
		out.push(lnNo(i)+' '+l);
	}
	if (addEnd) out.push(lnNo(lines.length)+' '+(sourceLC? 'end':'END'));
	return {
		'error': '',
		'text': out.join('\n')
	};
}

// generate a plain text listing from tokenized BASIC

function basic2Txt(romVersion, mem, startAddress, escapePetscii, escapeAsHex, usePetsciiLabels) {
	var	tokens = basicKeywords, //getBasicKeywordsForRomVersion(romVersion),
		lines = [],
		addr = (!startAddress || isNaN(startAddress))? 0x0401:Number(startAddress) | 0,
		maxMem = mem.length;
	escapePetscii = !!escapePetscii;
	escapeAsHex = !!escapeAsHex;
	usePetsciiLabels = !!usePetsciiLabels;
	while (addr < maxMem) {
		var lineLink = mem[addr++] + (mem[addr++]<<8);
		if (!lineLink) break;
		var	ln = String(mem[addr++] + (mem[addr++]<<8)) + ' ',
			isPrint = false,
			isStringFn = false,
			parenCnt = 0,
			c = mem[addr++];
		while (c) {
			if (c === 0xFF) {
				ln += '\u03C0';
			}
			else if (c & 0x80) {
				var t = tokens[c ^ 0x80];
				if (t) {
					ln += t;
					if (t === 'REM') {
						c = mem[addr++];
						while(c) {
							if (c >= 0x20 && c < 0x80) ln += String.fromCharCode(c);
							else if (c === 0xFF) ln += '\u03C0';
							else if (escapePetscii) ln += '{'+c+'}';
							c = mem[addr++];
						}
						break;
					}
					if (/^PRINT/.test(t)) isPrint = true;
					else if (/^(?:MID|LEFT|RIGHT)\$|LEN|VAL|ASC$/.test(t)) {
						isStringFn = true;
						parenCnt = 0;
					}
				}
			}
			else if (c === 0x22) {
				var s= '', q = false, sep = (isPrint && !isStringFn)? ';':'+';
				c = mem[addr++];
				for (;;) {
					if (c === 0x22 || c === 0) {
						if (q) s += '"';
						q = false;
						if (!c) addr--;
						break;
					}
					else if (c === 0xFF) {
						if (!q) {
							if (s) s += sep;
							s += '"';
							q = true;
						}
						s += (escapePetscii && usePetsciiLabels)? '{PI}':'\u03C0';
					}
					else if (c >= 0x20 && c < 0x80) {
						if (!q) {
							if (s) s += sep;
							s += '"';
							q = true;
						}
						s += String.fromCharCode(c);
					}
					else if (escapePetscii) {
						if (!q) {
							s += '"';
							q = true;
						}
						if (usePetsciiLabels && petsciiLabels[c]) {
							s += '{' + petsciiLabels[c] + '}';
						}
						else {
							s += '{' + (escapeAsHex? '$' + hex(c,2) : c) + '}';
						}
					}
					else {
						if (q) {
							s += '"';
							q = false;
						}
						if (s) s += sep;
						s += 'CHR$(' + c + ')';
					}
					c = mem[addr++];
				}
				ln += s? s : '""';
			}
			else {
				ln += String.fromCharCode(c);
				if (c === 0x3A) isPrint = isStringFn = false; //colon
				else if (isStringFn) {
					if (c === 0x28) parenCnt++; //left parenthesis
					else if (c === 0x29 && --parenCnt === 0) isStringFn = false; //right parenthesis
				}
			}
			c = mem[addr++];
		}
		lines.push(ln);
		addr = lineLink;
	}
	return lines.join('\n') || '';
}


// renumber BASIC in provided memory slice (0..max)
// processes GOTO, GOSUB, GO TO, ON GOTO|GOSUB|GO TO, THEN

function renumberBasic(mem, basicStart, startNo, step) {

	basicStart = (!basicStart || isNaN(basicStart))? 0x0401:Number(basicStart) | 0;
	startNo = (typeof startNo === 'undefined' || isNaN(startNo) || startNo < 0)? 100:Number(startNo) | 0;
	step = (!step || isNaN(step))? 10:Number(step) | 0;

	var lineNoTable = {},
		lines = [],
		maxLineNo = 36999;

	// parse and split lines to chunks of blobs and line targets
	// stores parsed chunks in array lines,
	// generates a reference of old and new line numbers in lineNoTable.
	function parseSplit() {
		var	addr = basicStart,
			lineNo = startNo,
			maxMem = mem.length,
			chunks,
			blob;

		// scans for a jump target,
		// generates a target entry and a new blob in current chunks,
		// any leading blanks are added to the current blob
		function parseLineTarget(maybeList) {
			while (mem[addr] === 0x20) {
				blob.push(0x20);
				addr++;
			}
			// parse ASCII to string, ignoring any blanks
			var n = '',
				c = mem[addr];
			while ((c >= 0x30 && c <= 0x39) || c === 0x20) {
				if (c !== 0x20) n += String.fromCharCode(c);
				c = mem[++addr];
			}
			// if we found a number, push chunks and open a new blob
			if (n !== '') {
				chunks.push({'type': 'blob', 'val': blob});
				chunks.push({'type': 'target', 'val': n});
				blob = [];
				// scan for any comma (ON GOTO|GOSUB|GO TO)
				if (maybeList && c === 0x2C) {
					blob.push(0x2C);
					addr++;
					parseLineTarget(true);
				}
			}
		}

		while (addr < maxMem) {
			var lineLink = mem[addr++] | (mem[addr++]<<8);
			if (!lineLink) break;
			chunks = [];
			blob = [];
			var	ln = String(mem[addr++] | (mem[addr++]<<8)),
				b = mem[addr++],
				line = {
					'ln': ln,
					'chunks': chunks
				};
			lineNoTable[ln] = lineNo;
			lineNo += step;
			while (b) {
				blob.push(b);
				switch(b) {
					case 0x8F: // REM (read rest of line)
						while (mem[addr]) blob.push(mem[addr++]);
						break;
					case 0x22: // quote (read up to next quote)
						var c = mem[addr++];
						while (c) {
							blob.push(c);
							if (c === 0x22) break;
							c = mem[addr++];
						}
						break;
					case 0x89: // GOTO
					case 0x8D: // GOSUB
						parseLineTarget(true);
						break;
					case 0xA7: // THEN
						parseLineTarget(false);
						break;
					case 0xCB: // GO (read ahead and test for TO)
						var t = addr;
						while (mem[t] == 0x20) t++;
						if (mem[t] !== 0xA4) break;
						while (addr <= t) blob.push(mem[addr++]);
						parseLineTarget(true);
						break;
				}
				b = mem[addr++];
			}
			if (blob.length) chunks.push({'type': 'blob', 'val': blob});
			lines.push(line);
			addr = lineLink;
		}
	}

	// reassamble BASIC code from line chunks using new line numbers from lineNoTable
	function reassembleLines() {
		var addr = basicStart;
		for (var i = 0, max = lines.length; i < max; i++) {
			var currLine = lines[i],
				currNo = lineNoTable[currLine.ln],
				linkAddr = addr;
			mem[addr++] = 0;
			mem[addr++] = 0;
			mem[addr++] = currNo & 0xFF;
			mem[addr++] = (currNo >> 8) & 0xFF;
			for (var j = 0; j < currLine.chunks.length; j++) {
				var chunk = currLine.chunks[j];
				if (chunk.type === 'blob') {
					var blob = chunk.val;
					for (var k = 0; k < blob.length; k++) mem[addr++] = blob[k];
				}
				else if (chunk.type === 'target') {
					var s = '';
					if (chunk.val) {
						var n = lineNoTable[chunk.val];
						s = typeof n !== 'undefined'? n.toString(10):chunk.val;
					}
					for (var k = 0; k < s.length; k++) mem[addr++] = s.charCodeAt(k);
				}
			}
			mem[addr++] = 0;
			mem[linkAddr++] = addr & 0xFF;
			mem[linkAddr] = (addr >> 8) & 0xFF;
		}
		mem[addr++] = 0;
		mem[addr++] = 0;
		return addr;
	}

	parseSplit();
	// check, if we are still in the range of legal line numbers
	if (lines.length) {
		var topLineNo = lineNoTable[lines[lines.length - 1].ln];
		if (topLineNo > maxLineNo) return {
			'addr': -1,
			'message': 'Out of range. Top line number is ' + topLineNo +' (' + maxLineNo + ' allowed).'
		};
	}
	var endAddr = reassembleLines();
	return { 'addr': endAddr };
}


// generate BASIC print statements from screen memory
// requires function hex() and object petsciiLabels

var screenCodesToUnicode = {
	'rom1': {
		0x00: 0x0040,
		0x01: 0x0041, 0x02: 0x0042, 0x03: 0x0043, 0x04: 0x0044, 0x05: 0x0045,
		0x06: 0x0046, 0x07: 0x0047, 0x08: 0x0048, 0x09: 0x0049, 0x0A: 0x004A,
		0x0B: 0x004B, 0x0C: 0x004C, 0x0D: 0x004D, 0x0E: 0x004E, 0x0F: 0x004F,
		0x10: 0x0050, 0x11: 0x0051, 0x12: 0x0052, 0x13: 0x0053, 0x14: 0x0054,
		0x15: 0x0055, 0x16: 0x0056, 0x17: 0x0057, 0x18: 0x0058, 0x19: 0x0059,
		0x1A: 0x005A, 0x1B: 0x005B, 0x1C: 0x005C, 0x1D: 0x005D, 0x1E: 0x2191,
		0x1F: 0x2190, 0x20: 0x0020, 0x21: 0x0021, 0x22: 0x0022, 0x23: 0x0023,
		0x24: 0x0024, 0x25: 0x0025, 0x26: 0x0026, 0x27: 0x0027, 0x28: 0x0028,
		0x29: 0x0029, 0x2A: 0x002A, 0x2B: 0x002B, 0x2C: 0x002C, 0x2D: 0x002D,
		0x2E: 0x002E, 0x2F: 0x002F, 0x30: 0x0030, 0x31: 0x0031, 0x32: 0x0032,
		0x33: 0x0033, 0x34: 0x0034, 0x35: 0x0035, 0x36: 0x0036, 0x37: 0x0037,
		0x38: 0x0038, 0x39: 0x0039, 0x3A: 0x003A, 0x3B: 0x003B, 0x3C: 0x003C,
		0x3D: 0x003D, 0x3E: 0x003E, 0x3F: 0x003F, 0x40: 0x2500, 0x41: 0x2660,
		0x42: 0x2502, 0x43: 0x2500, 0x44: 0x2500, 0x45: 0x2594, 0x46: 0x2500,
		0x47: 0x2502, 0x48: 0x2502, 0x49: 0x256E, 0x4A: 0x2570, 0x4B: 0x256F,
		0x4C: 0x14AA, 0x4D: 0x2572, 0x4E: 0x2571, 0x4F: 0x14A5, 0x50: 0x14A3,
		0x51: 0x25CF, 0x52: 0x2581, 0x53: 0x2665, 0x54: 0x258F, 0x55: 0x256D,
		0x56: 0x2573, 0x57: 0x25CB, 0x58: 0x2663, 0x59: 0x2595, 0x5A: 0x2666,
		0x5B: 0x253C, 0x5C: 0x258C, 0x5D: 0x2502, 0x5E: 0x03C0, 0x5F: 0x25E5,
		0x60: 0x0020, 0x61: 0x258C, 0x62: 0x2584, 0x63: 0x2594, 0x64: 0x2581,
		0x65: 0x258F, 0x66: 0x2592, 0x67: 0x2595, 0x68: 0x2584, 0x69: 0x25E4,
		0x6A: 0x2595, 0x6B: 0x251C, 0x6C: 0x2597, 0x6D: 0x2514, 0x6E: 0x2510,
		0x6F: 0x2582, 0x70: 0x250C, 0x71: 0x2534, 0x72: 0x252C, 0x73: 0x2524,
		0x74: 0x258E, 0x75: 0x258D, 0x76: 0x2590, 0x77: 0x2594, 0x78: 0x2580,
		0x79: 0x2583, 0x7A: 0x14A7, 0x7B: 0x2596, 0x7C: 0x259D, 0x7D: 0x2518,
		0x7E: 0x2598, 0x7F: 0x259A, 0xCC: 0x259D, 0xCF: 0x2597, 0xD0: 0x2596,
		0xDF: 0x25E3, 0xE0: 0x2588, 0xE1: 0x2590, 0xE2: 0x2580, 0xE3: 0x2587,
		0xE4: 0x2580, 0xE5: 0x2598, 0xE6: 0x2592, 0xE7: 0x2589, 0xE9: 0x25E2,
		0xEA: 0x258A, 0xEC: 0x259B, 0xEF: 0x2580, 0xF4: 0x2590, 0xF5: 0x2590,
		0xF6: 0x258B, 0xF7: 0x2586, 0xF8: 0x2585, 0xF9: 0x2580, 0xFA: 0x2580,
		0xFB: 0x259C, 0xFC: 0x2599, 0xFE: 0x259F, 0xFF: 0x259E, 0xA0: 0x2588
	},
	'rom2': {
		0x00: 0x0040,
		0x01: 0x0041, 0x02: 0x0042, 0x03: 0x0043, 0x04: 0x0044, 0x05: 0x0045,
		0x06: 0x0046, 0x07: 0x0047, 0x08: 0x0048, 0x09: 0x0049, 0x0A: 0x004A,
		0x0B: 0x004B, 0x0C: 0x004C, 0x0D: 0x004D, 0x0E: 0x004E, 0x0F: 0x004F,
		0x10: 0x0050, 0x11: 0x0051, 0x12: 0x0052, 0x13: 0x0053, 0x14: 0x0054,
		0x15: 0x0055, 0x16: 0x0056, 0x17: 0x0057, 0x18: 0x0058, 0x19: 0x0059,
		0x1A: 0x005A, 0x1B: 0x005B, 0x1C: 0x005C, 0x1D: 0x005D, 0x1E: 0x2191,
		0x1F: 0x2190, 0x20: 0x0020, 0x21: 0x0021, 0x22: 0x0022, 0x23: 0x0023,
		0x24: 0x0024, 0x25: 0x0025, 0x26: 0x0026, 0x27: 0x0027, 0x28: 0x0028,
		0x29: 0x0029, 0x2A: 0x002A, 0x2B: 0x002B, 0x2C: 0x002C, 0x2D: 0x002D,
		0x2E: 0x002E, 0x2F: 0x002F, 0x30: 0x0030, 0x31: 0x0031, 0x32: 0x0032,
		0x33: 0x0033, 0x34: 0x0034, 0x35: 0x0035, 0x36: 0x0036, 0x37: 0x0037,
		0x38: 0x0038, 0x39: 0x0039, 0x3A: 0x003A, 0x3B: 0x003B, 0x3C: 0x003C,
		0x3D: 0x003D, 0x3E: 0x003E, 0x3F: 0x003F, 0x40: 0x2500, 0x41: 0x0061,
		0x42: 0x0062, 0x43: 0x0063, 0x44: 0x0064, 0x45: 0x0065, 0x46: 0x0066,
		0x47: 0x0067, 0x48: 0x0068, 0x49: 0x0069, 0x4A: 0x006A, 0x4B: 0x006B,
		0x4C: 0x006C, 0x4D: 0x006D, 0x4E: 0x006E, 0x4F: 0x006F, 0x50: 0x0070,
		0x51: 0x0071, 0x52: 0x0072, 0x53: 0x0073, 0x54: 0x0074, 0x55: 0x0075,
		0x56: 0x0076, 0x57: 0x0077, 0x58: 0x0078, 0x59: 0x0079, 0x5A: 0x007A,
		0x5B: 0x253C, 0x5C: 0x258C, 0x5D: 0x2502, 0x5E: 0x2591, 0x5F: 0x25A7,
		0x60: 0x0020, 0x61: 0x258C, 0x62: 0x2584, 0x63: 0x2594, 0x64: 0x2581,
		0x65: 0x258F, 0x66: 0x2592, 0x67: 0x2595, 0x68: 0x2584, 0x69: 0x25A8,
		0x6A: 0x2595, 0x6B: 0x251C, 0x6C: 0x2597, 0x6D: 0x2514, 0x6E: 0x2510,
		0x6F: 0x2582, 0x70: 0x250C, 0x71: 0x2534, 0x72: 0x252C, 0x73: 0x2524,
		0x74: 0x258E, 0x75: 0x258D, 0x76: 0x2590, 0x77: 0x2594, 0x78: 0x2580,
		0x79: 0x2583, 0x7A: 0x2713, 0x7B: 0x2596, 0x7C: 0x259D, 0x7D: 0x2518,
		0x7E: 0x2598, 0x7F: 0x259A, 0xDE: 0x2591, 0xDF: 0x25A7, 0xE0: 0x2588,
		0xE1: 0x2590, 0xE2: 0x2580, 0xE3: 0x2587, 0xE4: 0x2580, 0xE5: 0x2598,
		0xE6: 0x2592, 0xE7: 0x2589, 0xE9: 0x25A8, 0xEA: 0x258A, 0xEC: 0x259B,
		0xEF: 0x2580, 0xF4: 0x2590, 0xF5: 0x2590, 0xF6: 0x258B, 0xF7: 0x2586,
		0xF8: 0x2585, 0xF9: 0x2580, 0xFB: 0x259C, 0xFC: 0x2599, 0xFE: 0x259F,
		0xFF: 0x259E, 0xA0: 0x2588
	}
};

var screenCodesKana = {
	'rom1': { 0x1C: 0x00A5 },
	'rom2': {
		0x1C: 0x00A5, 0x61: 0x30A2, 0x62: 0x30A4, 0x63: 0x30A6, 0x64: 0x30A8,
		0x65: 0x30AA, 0x67: 0x30AD, 0x66: 0x30AB, 0x5C: 0x30EF, 0x68: 0x30AF,
		0x69: 0x30B1, 0x5F: 0x30F2, 0x51: 0x30E0, 0x57: 0x30E9, 0x45: 0x30CA,
		0x52: 0x30E1, 0x54: 0x30E4, 0x59: 0x30EB, 0x55: 0x30E6, 0x49: 0x30CE,
		0x4F: 0x30DE, 0x50: 0x30DF, 0x77: 0x30BF, 0x78: 0x30ED, 0x79: 0x30F3,
		0x6F: 0x309C, 0x41: 0x30C1, 0x53: 0x30E2, 0x44: 0x30C8, 0x46: 0x30CB,
		0x47: 0x30CC, 0x48: 0x30CD, 0x4A: 0x30CF, 0x4B: 0x30D2, 0x4C: 0x30D5,
		0x7A: 0x30B3, 0x74: 0x5E74, 0x75: 0x6708, 0x76: 0x65E5, 0x6A: 0x309B,
		0x5A: 0x30EC, 0x58: 0x30EA, 0x43: 0x30C6, 0x56: 0x30E8, 0x42: 0x30C4,
		0x4E: 0x30DB, 0x4D: 0x30D8, 0x6C: 0x30B9, 0x7B: 0x30B5, 0x7F: 0x30BD,
		0x7C: 0x30B7, 0x7E: 0x30BB, 0x5E: 0x03C0
	}
}

var ScreenGenerator = (function() {
	var screen;

	function load(snapshot) {
		screen = snapshot;
	}

	function unload() {
		screen = null;
	}

	function generate(lineNumber, step, toUpperCase, trim, escapePetscii, escapeAsHex, usePetsciiLabels) {
		if (!screen) return '';
		// normalize arguments
		lineNumber = (lineNumber && !isNaN(lineNumber))? Number(lineNumber):1000;
		step = (step && !isNaN(step))? Number(step):10;
		toUpperCase = typeof toUpperCase === 'undefined' || Boolean(toUpperCase);
		trim = typeof trim === 'undefined' || Boolean(trim);
		escapePetscii = !!escapePetscii;
		escapeAsHex = !!escapeAsHex;
		usePetsciiLabels = !!usePetsciiLabels;

		var	rows = 25, cols = 40,
			lineLengthMax = 78, //BASIC input buffer is 88, but VICE has problems
			screenLines = [],
			lines = [],
			line = '',
			buffer = '',
			quoted = false,
			rvs = false,
			semicolonEnding = false,
			chrstr = toUpperCase? 'CHR$(':'chr$(',
			statement;

		function petsciiEscape(c) {
			var s = '{' +
				(usePetsciiLabels && petsciiLabels[c]? petsciiLabels[c]:
					escapeAsHex? '$' + hex(c,2) : c) +
				'}';
			return toUpperCase? s:s.toLowerCase();
		}

		function charOut(c, toCode) {
			if (toCode) {
				if (escapePetscii) {
					if (c === 0x22) {
						if (buffer) {
							lineAdd('"' + buffer + '"');
							buffer = '';
						}
						lineAdd(chrstr + 0x22 +')');
						quoted = !quoted;
					}
					else {
						if (quoted) {
							if (buffer) lineAdd('"' + buffer + '"');
							lineAdd(chrstr + 0x22 +')');
							buffer = petsciiEscape(0x9D);
							quoted = false;
						}
						buffer += petsciiEscape(c);
					}
				}
				else {
					if (c === 0x22) {
						quoted = !quoted;
					}
					else if (quoted) {
						lineAdd(chrstr + 0x22 +')');
						lineAdd(chrstr + 0x9D +')');
						quoted = false;
					}
					if (buffer) {
						lineAdd('"' + buffer + '"');
						buffer = '';
					}
					lineAdd(chrstr + c +')');
				}
			}
			else buffer += String.fromCharCode(c);
		}

		function lineAdd(chunk) {
			if (line.length + chunk.length <= lineLengthMax) {
				line += chunk;
			}
			else {
				lines.push(line + ';');
				line = String(lineNumber) + ' ?' + chunk;
				lineNumber += step;
			}
		}

		function lineFlush(addSemicolon) {
			var resetRvs=!addSemicolon;
			if (buffer) {
				if (!/^[0-9]+ \?$/.test(line) && line.length + buffer.length > lineLengthMax) {
					lines.push(line + ';');
					line = String(lineNumber) + ' ?';
					lineNumber += step;
					resetRvs=false;
				}
				line += '"' + buffer + '"';
				buffer = '';
			}
			if (addSemicolon) line += ';';
			if (resetRvs) rvs=false;
			lines.push(line);
			line = String(lineNumber) + ' ?';
			lineNumber += step;
		}

		// split screen contents into lines
		for (var i = 0, m = rows * cols; i < m; i += cols)
			screenLines.push(screen.slice(i, i + cols));
		// trim right-hand white-space
		if (trim) {
			var bottom = true;
			for (var r = rows-1; r >= 0; r--) {
				var l = cols, s = screenLines[r];
				for (var c = cols-1; c >= 0 && s[c] === 0x20; c--) l--;
				if (bottom && l === 0) screenLines.length--;
				else {
					if (l !== cols) s.length = l;
					bottom = false;
				}
			}
		}
		else if (screenLines[rows-1][cols-1] == 0x20) {
			screenLines[rows-1].length--;
		}

		// generate BASIC source text
		var r0 = 0;
		// initialize first line
		// generate either a home (trimmed text) or clear screen command
		line = String(lineNumber) + ' ?';
		line += escapePetscii? '"'+petsciiEscape(147)+'"':chrstr + '147)';
		if (screenLines[0].length) line += ';';
		else r0++;
		lineNumber += step;
		lineFlush();  // start a new line
		rvs = false;
		for (var r = r0, rl = screenLines.length - 1; r <= rl; r++) {
			var s = screenLines[r],
				cl = s.length;
			if (r===24 && cl === 40) cl--;
			for (var c=0; c < cl; c++) {
				var sc = s[c];
				// handle revers video
				if (sc & 0x80) {
					if (!rvs) {
						charOut(18, true);
						rvs = true;
					}
					sc ^= 0x80;
				}
				else if (rvs) {
					charOut(146, true);
					rvs = false;
				}
				// to PETSCII
				if (sc < 0x20) sc |= 0x40;
				else if (sc >= 0x40 && sc < 0x60) sc |= 0x80;
				else if (sc >= 0x60) sc += 0x40;
				// to ASCII printable
				if (sc === 0x22) charOut(0x22, true); //quote
				else if (sc === 0xDE) charOut(0x03C0); //π
				else if (toUpperCase) {
					if (sc < 0x60) charOut(sc);
					else charOut(sc, true);
				}
				else {
					if (sc <= 0x40 || sc > 0x5A && sc < 0x60) charOut(sc);
					else if (sc <= 0x5A) charOut(sc + 0x20);
					else if (sc >= 0xC1 && sc <= 0xDA) charOut(sc & 0x7F);
					else charOut(sc, true);
				}
			}
			if (r === rl && rvs) charOut(146, true);
			lineFlush(s.length === cols);
		}
		lineNumber -= step;
		if (screenLines.length > 23) {
			if (!/;$/.test(lines[lines.length-1])) lines[lines.length-1] += ';';
			statement = lineNumber + ' ?';
			if (escapePetscii) statement += '"';
			statement += escapePetscii? petsciiEscape(145):'chr$(145)';
			if (screenLines.length === 25) statement += escapePetscii? petsciiEscape(145):'chr$(145)';
			if (escapePetscii) statement += '"';
			if (toUpperCase) statement = statement.toUpperCase();
			lines.push(statement);
			lineNumber += step;
		}
		statement = lineNumber + ' fori=-1to0:getk$:i=k$="":next:rem wait for keypress';
		if (toUpperCase) statement = statement.toUpperCase();
		lines.push(statement);
		return lines.join('\n');
	}

	return {
		'load': load,
		'unload': unload,
		'generate': generate
	};
})();

var screen2Txt = (function() {

	function getHexDump(videoBuffer) {
		var s = '';
		for (var r = 0; r < 25; r++) {
			for (var c = 0; c < 40; c+=8) {
				var l = [];
				for (var i=0; i<8; i++) {
					var v = videoBuffer[r * 40 + c + i];
					l.push((v < 16? '$0':'$')+v.toString(16));
				}
				s += l.join(',').toUpperCase() + (c == 0? ' ;' + r +'\n':'\n');
			}
		}
		return s;
	}

	function getText(videoBuffer, charsetTag, isNewCharRom, isJapaneseRom) {
		var s = '',
			ct = screenCodesToUnicode[charsetTag],
			swapCase = isNewCharRom && charsetTag == 'rom2';
		if (isJapaneseRom) {
			var kana = screenCodesKana[charsetTag];
			for (var r = 0; r < 25; r++) {
				var l = '';
				for (var c = r * 40, cm = c + 40; c < cm; c++) {
					var v = videoBuffer[c];
					l += String.fromCharCode(kana[v & 0x7f] || ct[v] || ct[v & 0x7f]);
				}
				s += l.replace(/ +$/, '') + '\n';
			}
		}
		else {
			for (var r = 0; r < 25; r++) {
				var l = '';
				for (var c = r * 40, cm = c + 40; c < cm; c++) {
					var v = videoBuffer[c];
					if (swapCase) {
						var v0 = v & 0x7f;
						if ((v0 >= 1 && v0 <= 0x1a) || (v0 >= 0x41 && v0 <= 0x5a)) v = v0 ^ 0x40;
					}
					l += String.fromCharCode(ct[v] || ct[v & 0x7f]);
				}
				s += l.replace(/ +$/, '') + '\n';
			}
		}
		return s.replace(/\n+$/, '');
	}

	return {
		'getHexDump': getHexDump,
		'getText': getText
	};

})();


// memory dump

function hexDump(mem, addr, end, textOptions, oldStyle, honorCase) {
	function getScreenChar(c) {
		if (isJapaneseRom && screenCodesJa[c]) return String.fromCharCode(screenCodesJa[c]);
		return String.fromCharCode(screenCodesToUnicode.rom1[c]) || String.fromCharCode(screenCodesToUnicode.rom1[c & 127]);
	}
	function getStringFor(c) {
		if (isJapaneseRom && (japaneseLC && petsciiToKana[c]) || c==0x5c)
			return String.fromCharCode(petsciiToKana[c]);
		if (honorCase) {
			var shifted = c & 0x80,
				ch =
					(c >= 0x20 && c <= 0x60)? String.fromCharCode(c):
					(c >= 0xc1 && c <= 0xda)? String.fromCharCode(c & 0x7f):
					'.';
			if (flipCase) shifted = !shifted;
			return shifted? ch.toLowerCase():ch;
		}
		return (c >= 0x20 && c <= 0x60)? String.fromCharCode(c):'.';
	}
	function dump() {
		var c = mem[addr], isScreenAddr = addr >= VIDEO_ADDR && addr <= VIDEO_TOP;
		if (addr % 8 === 0) {
			if (out) out += '  ' + charsPrefix + chars + '\n';
			if (isScreenAddr) {
				if ((addr & 0x03ff) % 40 == 0) {
					out += '\n';
					lines = 0;
				}
			}
			else {
				if (++lines % 16 == 0 && lines > 1) out += '\n';
			}
			out +=  addrPrefix + hex(addr, 4) + addrPostfix;
			chars = '';
		}
		out += ' ' + hex(c, 2);
		if (isScreenAddr) chars += getScreenChar(c);
		else chars += getStringFor(c);
		addr++;
		return c;
	}
	if (addr >= mem.length) return 'Error: Start address out of bounds.';
	if (addr > end) return 'Error: End address lower than start address.';
	var	out = '', chars='',
		addrPrefix = oldStyle? ':':'',
		addrPostfix = oldStyle? '':':',
		charsPrefix = oldStyle? ';':'',
		offset = addr % 8,
		lines = 0,
		isJapaneseRom = textOptions? textOptions.isJapaneseRom : false,
		japaneseLC = textOptions? textOptions.charsetTag == 'rom2':false,
		screenCodesJa = japaneseLC? screenCodesKana.rom2:screenCodesKana.rom1,
		flipCase = textOptions? textOptions.isNewCharRom && textOptions.charsetTag == 'rom2':false;
	if (offset) {
		out = addrPrefix + hex(addr, 4) + addrPostfix;
		for (var i = 0; i < offset; i++) {
			out += '   ';
			chars += ' ';
		}
	}
	while (addr <= end) {
		if (addr >= IO_ADDR && addr <= IO_TOP) {
			if (chars) {
				out += '  ' + charsPrefix + chars + '\n';
				chars = '';
			}
			out += '                               ;skipping IO range ($'+hex(IO_ADDR,4)+'-$'+hex(IO_TOP,4)+')\n';
			addr = IO_TOP+1;
		}
		dump();
	}
	if (chars) {
		while (addr++ % 8 !== 0) out += '   ';
		out += '  ' + charsPrefix + chars;
	}
	return out;
}

function hexDumpProgram(mem, addr, end, textOptions, oldStyle) {
	var basicList = getBasicLinks(mem);
	if (basicList.length) {
		var basicEnd = basicList[basicList.length - 1] + 1;
		if (basicEnd > end) end = basicEnd;
	}
	if (end - addr < 3) return '';
	if (end >= mem.length) end = mem.length-1;
	return hexDump(mem, addr, end, textOptions, oldStyle);
}

// generate PRG file from memory, from start-address up to end-of-basic marker (0x00 0x00 0x00)

function convertToPrg(mem, startAddress) {
	var	addr = (!startAddress || isNaN(startAddress))? 0x0401:Number(startAddress) | 0,
		leadIn = String.fromCharCode(startAddress & 0xff) + String.fromCharCode((startAddress >> 8) & 0xff),
		out = '';

	function putChr() {
		var c = mem[addr++] || 0;
		out += String.fromCharCode(c);
		return c;
	}

	for (;;) {
		if (putChr() + (putChr()<<8) === 0) break;
		do {} while (putChr());
	}
	return (out.length > 2)? leadIn + out : '';
}

// 6502 disassembler

var	opctab= [
		['BRK','imp'], ['ORA','inx'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['ORA','zpg'], ['ASL','zpg'], [   '','imp'],
		['PHP','imp'], ['ORA','imm'], ['ASL','acc'], [   '','imp'],
		[   '','imp'], ['ORA','abs'], ['ASL','abs'], [   '','imp'],
		['BPL','rel'], ['ORA','iny'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['ORA','zpx'], ['ASL','zpx'], [   '','imp'],
		['CLC','imp'], ['ORA','aby'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['ORA','abx'], ['ASL','abx'], [   '','imp'],
		['JSR','abs'], ['AND','inx'], [   '','imp'], [   '','imp'],
		['BIT','zpg'], ['AND','zpg'], ['ROL','zpg'], [   '','imp'],
		['PLP','imp'], ['AND','imm'], ['ROL','acc'], [   '','imp'],
		['BIT','abs'], ['AND','abs'], ['ROL','abs'], [   '','imp'],
		['BMI','rel'], ['AND','iny'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['AND','zpx'], ['ROL','zpx'], [   '','imp'],
		['SEC','imp'], ['AND','aby'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['AND','abx'], ['ROL','abx'], [   '','imp'],
		['RTI','imp'], ['EOR','inx'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['EOR','zpg'], ['LSR','zpg'], [   '','imp'],
		['PHA','imp'], ['EOR','imm'], ['LSR','acc'], [   '','imp'],
		['JMP','abs'], ['EOR','abs'], ['LSR','abs'], [   '','imp'],
		['BVC','rel'], ['EOR','iny'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['EOR','zpx'], ['LSR','zpx'], [   '','imp'],
		['CLI','imp'], ['EOR','aby'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['EOR','abx'], ['LSR','abx'], [   '','imp'],
		['RTS','imp'], ['ADC','inx'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['ADC','zpg'], ['ROR','zpg'], [   '','imp'],
		['PLA','imp'], ['ADC','imm'], ['ROR','acc'], [   '','imp'],
		['JMP','ind'], ['ADC','abs'], ['ROR','abs'], [   '','imp'],
		['BVS','rel'], ['ADC','iny'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['ADC','zpx'], ['ROR','zpx'], [   '','imp'],
		['SEI','imp'], ['ADC','aby'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['ADC','abx'], ['ROR','abx'], [   '','imp'],
		[   '','imp'], ['STA','inx'], [   '','imp'], [   '','imp'],
		['STY','zpg'], ['STA','zpg'], ['STX','zpg'], [   '','imp'],
		['DEY','imp'], [   '','imp'], ['TXA','imp'], [   '','imp'],
		['STY','abs'], ['STA','abs'], ['STX','abs'], [   '','imp'],
		['BCC','rel'], ['STA','iny'], [   '','imp'], [   '','imp'],
		['STY','zpx'], ['STA','zpx'], ['STX','zpy'], [   '','imp'],
		['TYA','imp'], ['STA','aby'], ['TXS','imp'], [   '','imp'],
		[   '','imp'], ['STA','abx'], [   '','imp'], [   '','imp'],
		['LDY','imm'], ['LDA','inx'], ['LDX','imm'], [   '','imp'],
		['LDY','zpg'], ['LDA','zpg'], ['LDX','zpg'], [   '','imp'],
		['TAY','imp'], ['LDA','imm'], ['TAX','imp'], [   '','imp'],
		['LDY','abs'], ['LDA','abs'], ['LDX','abs'], [   '','imp'],
		['BCS','rel'], ['LDA','iny'], [   '','imp'], [   '','imp'],
		['LDY','zpx'], ['LDA','zpx'], ['LDX','zpy'], [   '','imp'],
		['CLV','imp'], ['LDA','aby'], ['TSX','imp'], [   '','imp'],
		['LDY','abx'], ['LDA','abx'], ['LDX','aby'], [   '','imp'],
		['CPY','imm'], ['CMP','inx'], [   '','imp'], [   '','imp'],
		['CPY','zpg'], ['CMP','zpg'], ['DEC','zpg'], [   '','imp'],
		['INY','imp'], ['CMP','imm'], ['DEX','imp'], [   '','imp'],
		['CPY','abs'], ['CMP','abs'], ['DEC','abs'], [   '','imp'],
		['BNE','rel'], ['CMP','iny'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['CMP','zpx'], ['DEC','zpx'], [   '','imp'],
		['CLD','imp'], ['CMP','aby'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['CMP','abx'], ['DEC','abx'], [   '','imp'],
		['CPX','imm'], ['SBC','inx'], [   '','imp'], [   '','imp'],
		['CPX','zpg'], ['SBC','zpg'], ['INC','zpg'], [   '','imp'],
		['INX','imp'], ['SBC','imm'], ['NOP','imp'], [   '','imp'],
		['CPX','abs'], ['SBC','abs'], ['INC','abs'], [   '','imp'],
		['BEQ','rel'], ['SBC','iny'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['SBC','zpx'], ['INC','zpx'], [   '','imp'],
		['SED','imp'], ['SBC','aby'], [   '','imp'], [   '','imp'],
		[   '','imp'], ['SBC','abx'], ['INC','abx'], [   '','imp']
	],
	steptab = {
		'imp':1,
		'acc':1,
		'imm':2,
		'abs':3,
		'abx':3,
		'aby':3,
		'zpg':2,
		'zpx':2,
		'zpy':2,
		'ind':3,
		'inx':2,
		'iny':2,
		'rel':2
	},
	opctabIllegals = {
		0x02: ['JAM', 'imp'], 0x03: ['SLO', 'inx'], 0x04: ['NOP', 'zpg'],
		0x07: ['SLO', 'zpg'], 0x0B: ['ANC', 'imm'], 0x0C: ['NOP', 'abs'],
		0x0F: ['SLO', 'abs'], 0x12: ['JAM', 'imp'], 0x13: ['SLO', 'iny'],
		0x14: ['NOP', 'zpx'], 0x17: ['SLO', 'zpx'], 0x1A: ['NOP', 'imp'],
		0x1B: ['SLO', 'aby'], 0x1C: ['NOP', 'abx'], 0x1F: ['SLO', 'abx'],
		0x22: ['JAM', 'imp'], 0x23: ['RLA', 'inx'], 0x27: ['RLA', 'zpg'],
		0x2B: ['ANC', 'imm'], 0x2F: ['RLA', 'abs'], 0x32: ['JAM', 'imp'],
		0x33: ['RLA', 'iny'], 0x34: ['NOP', 'zpx'], 0x37: ['RLA', 'zpx'],
		0x3A: ['NOP', 'imp'], 0x3B: ['RLA', 'aby'], 0x3C: ['NOP', 'abx'],
		0x3F: ['RLA', 'abx'], 0x42: ['JAM', 'imp'], 0x43: ['SRE', 'inx'],
		0x44: ['NOP', 'zpg'], 0x47: ['SRE', 'zpg'], 0x4B: ['ALR', 'imm'],
		0x4F: ['SRE', 'abs'], 0x52: ['JAM', 'imp'], 0x53: ['SRE', 'iny'],
		0x54: ['NOP', 'zpx'], 0x57: ['SRE', 'zpx'], 0x5A: ['NOP', 'imp'],
		0x5B: ['SRE', 'aby'], 0x5C: ['NOP', 'abx'], 0x5F: ['SRE', 'abx'],
		0x62: ['JAM', 'imp'], 0x63: ['RRA', 'inx'], 0x64: ['NOP', 'zpg'],
		0x67: ['RRA', 'zpg'], 0x6B: ['ARR', 'imm'], 0x6F: ['RRA', 'abs'],
		0x72: ['JAM', 'imp'], 0x73: ['RRA', 'iny'], 0x74: ['NOP', 'zpx'],
		0x77: ['RRA', 'zpx'], 0x7A: ['NOP', 'imp'], 0x7B: ['RRA', 'aby'],
		0x7C: ['NOP', 'abx'], 0x7F: ['RRA', 'abx'], 0x80: ['NOP', 'imm'],
		0x82: ['NOP', 'imm'], 0x83: ['SAX', 'inx'], 0x87: ['SAX', 'zpg'],
		0x89: ['NOP', 'imm'], 0x8B: ['ANE', 'imm'], 0x8F: ['SAX', 'abs'],
		0x92: ['JAM', 'imp'], 0x93: ['SHA', 'iny'], 0x97: ['SAX', 'zpy'],
		0x9B: ['TAS', 'aby'], 0x9C: ['SHY', 'abx'], 0x9E: ['SHX', 'aby'],
		0x9F: ['SHA', 'aby'], 0xA3: ['LAX', 'inx'], 0xA7: ['LAX', 'zpg'],
		0xAB: ['LXA', 'imm'], 0xAF: ['LAX', 'abs'], 0xB2: ['JAM', 'imp'],
		0xB3: ['LAX', 'iny'], 0xB7: ['LAX', 'zpy'], 0xBB: ['LAS', 'aby'],
		0xBF: ['LAX', 'aby'], 0xC2: ['NOP', 'imm'], 0xC3: ['DCP', 'inx'],
		0xC7: ['DCP', 'zpg'], 0xCB: ['SBX', 'imm'], 0xCF: ['DCP', 'abs'],
		0xD2: ['JAM', 'imp'], 0xD3: ['DCP', 'iny'], 0xD4: ['NOP', 'zpx'],
		0xD7: ['DCP', 'zpx'], 0xDA: ['NOP', 'imp'], 0xDB: ['DCP', 'aby'],
		0xDC: ['NOP', 'abx'], 0xDF: ['DCP', 'abx'], 0xE2: ['NOP', 'imm'],
		0xE3: ['ISC', 'inx'], 0xE7: ['ISC', 'zpg'], 0xEB: ['USBC', 'imm'],
		0xEF: ['ISC', 'abs'], 0xF2: ['JAM', 'imp'], 0xF3: ['ISC', 'iny'],
		0xF4: ['NOP', 'zpx'], 0xF7: ['ISC', 'zpx'], 0xFA: ['NOP', 'imp'],
		0xFB: ['ISC', 'aby'], 0xFC: ['NOP', 'abx'], 0xFF: ['ISC', 'abx']
	};

function disassemble(mem, start, end, romVersion, textOptions, addressToSymbolDict) {
	/*
	addressToSymbolDict: object, optional -- dictionary of symbolic addresses
	example: {
		0x401: 'BASIC',
		0x8000: 'SCREEN',
		...
	}
	*/
	var symbolsSeen = {}, symbolicLabels = {}, targets = [], labels = {},
	    labelColumnWidth = 8, blanks = '            ',
	    terminateLabelsByColon = false,
	    maxMem = mem.length;

	var basicStart = 0x10000, basicEnd = -1,
		varStart = 0x10000, varEnd = -1;

	function getBasicRange() {
		var basicList = getBasicLinks(mem);
		if (basicList.length) {
			var bStart = basicList[0],
				bEnd = basicList[basicList.length - 1] + 1;
			if (start < bEnd && end > bStart) {
				basicStart = bStart;
				if (start >= bStart) {
					var i = 0;
					while (basicList[i] < start && i < basicList.length) basicStart = basicList[i++];
					start = Math.min(start, basicStart);
				}
				basicEnd = bEnd;
				if (end <= bEnd) {
					var i = basicList.length - 2;
					while (basicList[i] > end && i >= 0) basicEnd = basicList[i--]-1;
					end = Math.max(end, basicEnd);
				}
			}
		}
	}

	function getVariableRange() {
		var vars = getVariableSpace(mem, romVersion);
		if (vars.length) {
			varStart = vars.start
			varEnd = vars.start + vars.length -1;
		}
	}

	if (!addressToSymbolDict || typeof addressToSymbolDict !== 'object')
		addressToSymbolDict = {};

	function addressString(a, l) {
		if (addressToSymbolDict[a]) { symbolsSeen[a] = true; return addressToSymbolDict[a]; }
		if (addressToSymbolDict[a-1]) { symbolsSeen[a-1] = true; return addressToSymbolDict[a-1]+'+1'; }
		return labels[a] || '$'+hex(a, l);
	}

	function list(addr, addrStr, opc, disas) {
		var label = labels[addr] || addressToSymbolDict[addr] || '';
		if (terminateLabelsByColon && label) label += ':';
		listing += addrStr + blanks.substring(0, 6-addrStr.length)
			+ opc + blanks.substring(0, 11-opc.length)
			+ label + blanks.substring(0, labelColumnWidth-label.length)
			+ disas+'\n';
	}

	function getMem(a) {
		return (a < maxMem)? mem[a] || 0:0;
	}

	function disassembleStep() {
		var	addr = hex(pc, 4),
			instr = getMem(pc),
			opc = hex(instr, 2),
			disas = opctab[instr][0] || '.byte $' + opc,
			adm = opctab[instr][1],
			step = steptab[adm],
			op;
		if (step == 2) {
			op = getMem(pc+1);
			opc += ' ' + hex(op, 2);
		}
		else if (step == 3) {
			op = (getMem(pc+2)<<8) | getMem(pc+1);
			opc += ' ' + hex(getMem(pc+1), 2) + ' ' + hex(getMem(pc+2), 2);
		}
		else {
			opc+='';
		}
		// format and output to listing
		switch (adm) {
			case 'imm':
				disas+=' #$'+hex(op, 2);
				break;
			case 'zpg':
				disas+=' '+addressString(op, 2);
				break;
			case 'acc':
				disas+=' A';
				break;
			case 'abs':
				disas+=' '+addressString(op, 4);
				break;
			case 'zpx':
				disas+=' '+addressString(op, 2)+',X';
				break;
			case 'zpy':
				disas+=' '+addressString(op, 2)+',Y';
				break;
			case 'abx':
				disas+=' '+addressString(op, 4)+',X';
				break;
			case 'aby':
				disas+=' '+addressString(op, 4)+',Y';
				break;
			case 'iny':
				disas+=' ('+addressString(op, 2)+'),Y';
				break;
			case 'inx':
				disas+=' ('+addressString(op, 2)+',X)';
				break;
			case 'rel':
				var offset = getMem(pc+1), target = pc+2;
				if (offset & 128) {
					target -= (offset ^ 255)+1;
				}
				else {
					target += offset;
				}
				target &= 0xFFFF;
				disas += ' '+ (labels[target] || addressString(target, 4));
				break;
			case 'ind' :
				disas+=' ('+addressString(op, 4)+')';
				break;
		}
		list(pc, addr, opc, disas);
		pc = pc+step;
	}

	function collectTargets() {
		var ot = opctab[getMem(pc)], instr = ot[0];
		switch (instr) {
			case 'BPL':
			case 'BMI':
			case 'BVC':
			case 'BVS':
			case 'BCC':
			case 'BCS':
			case 'BNE':
			case 'BEQ':
				var offset = getMem(pc+1) || 0, target = pc+2;
				if (offset & 128) {
					target -= (offset ^ 255)+1;
				}
				else {
					target += offset;
				}
				addLabel(target & 0xFFFF);
				break;
			case 'JMP':
			case 'JSR':
				addLabel((getMem(pc+2)<<8) | getMem(pc+1));
				break;
		}
		if (addressToSymbolDict[pc]) symbolicLabels[addressToSymbolDict[pc]] = true;
		pc += steptab[ot[1]];
	}

	function addLabel(target) {
		if (target >= VIDEO_ADDR && target <= VIDEO_TOP) return;
		if (target >= IO_ADDR && target <= IO_TOP) return;
		if (!addressToSymbolDict[target] && !labels[target] && target >= start  && target <= end)
			labels[target] = 'i'+hex(target, 4);
	}

	function scanSymbolLengths(obj) {
		var  max = 0;
		for (var s in obj) {
			var l = s.length;
			if (l > max) max = l;
		}
		max += (max % 2)? 3:2;
		if (max > labelColumnWidth) {
			labelColumnWidth = max;
			while (blanks.length < max) blanks += ' ';
		}
	}

	var pc, listing = '';
	if (!start) start = 0;
	if (!end) end = 0;
	if (isNaN(start) || start < 0) return 'Error: Start address not a valid value.';
	if (isNaN(end) || end < 0) return 'Error: End address not a valid value.';
	start &= 0xFFFF;
	end &= 0xFFFF;
	if (end < start) end = maxMem-1;

	getBasicRange();
	getVariableRange();

	pc = start;
	while (pc <= end) {
		if (pc >= 0 && pc <= 0x028E) pc = 0x028F;
		else if (pc >= 0x03F9 && pc <= 0x03FF) pc = 0x0400;
		else if (pc >= basicStart && pc <= basicEnd) pc = basicEnd + 1;
		else if (pc >= varStart && pc <= varEnd) pc = varEnd + 1;
		else if (pc >= VIDEO_ADDR && pc <= VIDEO_TOP) pc = VIDEO_TOP + 1;
		else if (pc >= IO_ADDR && pc <= IO_TOP) pc = IO_TOP + 1;
		else collectTargets();
	}
	scanSymbolLengths(symbolicLabels);

	if (start != basicStart) list(-1, '','','* = $'+hex(start, 4));
	pc = start;
	while (pc <= end) {
		if (pc >= 0 && pc < 0x027A) { // system ram below tape buffer
			listing += disassembleSystemRam(mem, pc, end);
			pc = 0x027A;
			if (pc < end) {
				listing += '\n';
				list(-1, '','','* = $'+hex(pc, 4) + ' ; tape buffers');
			}
		}
		else if (pc >= 0x03E8 && pc < 0x0400) { // system ram above tape buffer #2
			if (pc > start) listing += '\n';
			listing += disassembleSystemRam(mem, pc, end);
			pc = 0x0400;
			if (pc < end) {
				listing += '\n';
				list(-1, '','','* = $'+hex(pc, 4));
			}
		}
		else if (pc >= basicStart && pc <= basicEnd) { // basic text
			if (pc > start) listing += '\n';
			listing += disassembleBasic(mem, basicStart, basicEnd, romVersion, textOptions);
			pc = basicEnd + 1;
			if (pc <= end && (pc != varStart || varEnd < 0)) {
				listing += '\n';
				list(-1, '','','* = $'+hex(pc, 4));
			}
		}
		else if (pc >= varStart && pc <= varEnd) { // basic variables
			if (pc > start) listing += '\n';
			listing += disassembleVariables(mem, pc, end, romVersion, false, false);
			pc = varEnd + 1;
			if (pc < end) {
				listing += '\n';
				list(-1, '','','* = $'+hex(pc, 4));
			}
		}
		else if (pc >= VIDEO_ADDR && pc <= VIDEO_TOP) { // video ram
			if (pc > start) listing += '\n';
			listing += disassembleVideoRam(mem, pc, Math.min(VIDEO_TOP, end), textOptions);
			pc = VIDEO_TOP + 1;
			if (pc < end) {
				listing += '\n';
				list(-1, '','','* = $'+hex(pc, 4));
			}
		}
		else if (pc >= IO_ADDR && pc <= IO_TOP) { // skip IO range
			if (pc > start) listing += '\n';
			pc = IO_TOP + 1;
			listing += '                         ;skipping IO range\n';
			listing += '                         ;($'+hex(IO_ADDR,4)+'-$'+hex(IO_TOP,4)+')\n';
			if (pc < end) {
				listing += '\n';
				list(-1, '','','* = $'+hex(pc, 4));
			}
		}
		else disassembleStep();
	}
	list(-1, '','','.end');

	var symbolList = [];
	for (var a in symbolsSeen) {
		var n = Number(a), s = addressToSymbolDict[a];
		if (!symbolicLabels[s]) symbolList.push(s + ' = $' + hex(n, n <= 0xFF? 2:4));
	}
	if (symbolList.length) {
		listing = symbolList.join('\n') + '\n\n' + listing;
	}

	return listing;
}

function disassembleInstruction(pc, instr, op0, op1, isRange) {
	function isJmpOp() {
		return opc == 'JMP' || opc == 'JSR'; 
	}
	var	disas = hex(instr, 2),
		opc = opctab[instr][0],
		step;
	if (isRange && !opc) {
		step = 1;
		while (disas.length < 10) disas += ' ';
		disas += '<span class="listing">.</span>'
	}
	else {
		var adm = opc? opctab[instr][1]:opctabIllegals[instr][1], op, ts;
		step = steptab[adm];
		if (step == 2) {
			op = op0;
			disas += ' ' + hex(op, 2);
		}
		else if (step == 3) {
			op = (op1<<8) | op0;
			disas += ' ' + hex(op0, 2) + ' ' + hex(op1, 2);
		}
		while (disas.length < 10) disas += ' ';
		if (isRange) disas += '<span class="listing">';
		disas += opc || '*' + opctabIllegals[instr][0];
		// format and output to listing
		switch (adm) {
			case 'imm':
				disas+=' #$'+hex(op, 2);
				break;
			case 'zpg':
				disas+=' $'+hex(op, 2);
				break;
			case 'acc':
				disas+=' A';
				break;
			case 'abs':
				ts = hex(op, 4);
				disas += isRange && isJmpOp()? ' <span data-target="'+ts+'">$'+ts+'</span>' : ' $'+ts;
				break;
			case 'zpx':
				disas+=' $'+hex(op, 2)+',X';
				break;
			case 'zpy':
				disas+=' $'+hex(op, 2)+',Y';
				break;
			case 'abx':
				disas+=' $'+hex(op, 4)+',X';
				break;
			case 'aby':
				disas+=' $'+hex(op, 4)+',Y';
				break;
			case 'iny':
				disas+=' ($'+hex(op, 2)+'),Y';
				break;
			case 'inx':
				disas+=' ($'+hex(op, 2)+',X)';
				break;
			case 'rel':
				var ofs = op0 & 128? -((op0 ^ 255)+1):op0,
					target = (pc+2 + ofs) & 0xffff;
				ts = hex(target, 4);
				disas += isRange? ' <span data-relative="true" data-target="'+ts+'" title="'+(ofs < 0? '&uarr; ':'&darr; +')+ofs+'">$'+ts+'</span>' : ' $'+ts;
				break;
			case 'ind' :
				ts = hex(op, 4);
				disas += isRange? ' (<span data-indirect="true" data-target="'+ts+'">$'+ts+'</span>)' : ' ($'+ts+')';
				break;
		}
		if (isRange) disas += '</span>';
	}
	return {
		'addr': pc,
		'listing': disas,
		'step': step
	};
}

function disassembleCodeRange(pc, range) {
	function getVectorData(addr, vec, d0, d1) {
		var lb = hex(d0,2),
			hb = hex(d1,2),
			s = lb + ' ' + hb;
		while (s.length < 10) s += ' ';
		s += '<span class="listing"><span data-target="'+hb+lb+'">$'+hb+lb+'</span> ;'+vec+' vector</span>';
		return {
			'addr': addr,
			'listing': s,
			'step': 2
		};
	}
	var q = [], max = range.length, i = 0;
	while (true) {
		if (pc === 0xfffa) { // asured to extend to 0xffff
			q.push(getVectorData(0xfffa, 'NMI', range[i], range[i+1]));
			q.push(getVectorData(0xfffc, 'RST', range[i+2], range[i+3]));
			q.push(getVectorData(0xfffe, 'IRQ', range[i+4], range[i+5]));
			break;
		}
		if (i >= max) break;
		var opNext = opctab[range[i]],
			stNext = opNext[0]? steptab[opNext[1]]:1;
		if (pc+stNext > 0xfffa) {
			for (; pc < 0xfffa; pc++, i++) {
				q.push({
					'addr': pc,
					'listing': hex(range[i],2) + '        <span class="listing">.</span>',
					'step': 2
				});
			}
			continue;
		}
		if (i+stNext>max) break;
		var  d = disassembleInstruction(pc, range[i], range[i+1], range[i+2], true);
		q.push(d);
		pc += d.step;
		i += d.step;
	}
	return q;
}

function disassembleBasic(mem, startAddr, endAddr, romVersion, textOptions) {

	function out(addr, bytes, txt) {
		var s = hex(addr, 4) + ' ';
		for (var i=0; i<6; i++) s+= i<bytes.length? ' '+hex(bytes[i], 2):'   ';
		if (txt) s += '   '+txt;
		disas += s + '\n';
	}
	function flush() {
		out(curAddr, bytes, 'ascii «'+txt+'»');
		bytes.length = 0;
		txt = '';
	}
	function stringFor(c) {
		//if (petsciiLabels[c]) return '{'+petsciiLabels[c]+'}';
		if (isJapaneseRom && (isJapaneseLC && petsciiToKana[c]) || c==0x5c) return String.fromCharCode(petsciiToKana[c]);
		if (c < 0x20 || c > 0x7D) return '{$'+hex(c, 2)+'}';
		var s;
		if (switchCase) {
			if (c >= 0x41 && c <= 0x5A) s = String.fromCharCode(c + 0x20);
			else if (c >= 0xC1 && c <= 0xDA) s = String.fromCharCode(c - 0x80);
			else s = String.fromCharCode(c);
		}
		else {
			if (c >= 0xC1 && c <= 0xDA) s = String.fromCharCode(c - 0x60);
			else s = String.fromCharCode(c);
		}
		return s;
	}

	if (!startAddr) {
		var basicList = getBasicLinks(mem);
		if (basicList.length == 0) return '';
		startAddr = 0x401;
	}

	var keywords = basicKeywords,
		keywordsForRom = getBasicKeywordsForRomVersion(romVersion),
		disas = '                         .[tokenized BASIC text]\n\n',
		addr = startAddr,
		state = 0,
		bytes = [],
		curAddr,
		txt,
		quote = false,
		foundEnd = false,
		switchCase = false,
		isJapaneseRom = textOptions? textOptions.isJapaneseRom : false,
		isJapaneseLC = textOptions && isJapaneseRom? textOptions.charsetTag == 'rom2':false;
	if (!endAddr) endAddr = mem.length -1;
	disasLoop: while (addr <= endAddr) {
		if (state == 0) {
			var ll = mem[addr],
				lh = mem[addr+1],
				link = ll | (lh << 8);
			if (link == 0) {
				out(addr, [ll, lh], '-EOP- (link = null)');
				addr += 2;
				foundEnd = true;
				break disasLoop;
			}
			if (link <= addr) {
				out(addr, [ll, lh], 'link: $' + hex(link, 4) + " !reverse link: ending.");
				addr += 2;
				break disasLoop;
			}
			out(addr, [ll, lh], 'link: $' + hex(link, 4));
			addr += 2;
			var al = mem[addr],
				ah = mem[addr+1],
				lno = al | (ah << 8);
			out(addr, [al, ah], 'line# ' + lno);
			addr += 2;
			state++;
		}
		bytes.length = 0;
		curAddr = addr;
		txt = '';
		quote = false;
		while (state == 1) {
			var c = mem[addr];
			if (c == 0 || ((c & 0x80) && !quote)) {
				if (bytes.length) flush();
				if (c == 0) {
					out(addr++, [0], '-EOL-');
					state = 0;
				}
				else {
					var tid = c & 0x7f,
						kwd = tid < keywords.length?
							keywords[tid]:
							keywordsForRom[tid%keywordsForRom.length];
					if (tid >= keywordsForRom.length) kwd += '*';
					out(addr++, [c], 'token '+kwd);
					curAddr = addr;
				}
			}
			else {
				if (c == 0x22) quote = !quote;
				txt += stringFor(c);
				bytes.push(c);
				addr++;
			}
			if (bytes.length == 6) {
				flush();
				curAddr = addr;
			}
			if (addr > endAddr) {
				if (bytes.length) flush();
				break disasLoop;
			}
		}
	}
	if (foundEnd) disas += '\n                         .[end of BASIC text]\n'
	return disas;
}

function getBasicLinks(mem) {
	var linkTable = [],
		addr = 0x401,
		maxLineNo = 36999,
		link = mem[addr] | (mem[addr+1] << 8),
		line = mem[addr+2] | (mem[addr+3] << 8),
		maxAddr = mem.length - 4;
	if ((link >> 8) == 0x04 && line <+ maxLineNo) {
		linkTable.push(addr);
		addr = link;
		while (link && addr < maxAddr) {
			link = mem[addr] | (mem[addr+1] << 8),
			line = mem[addr+2] | (mem[addr+3] << 8);
			linkTable.push(addr);
			if (link <= addr || line > maxLineNo) break;
			addr = link;
		}
	}
	return linkTable;
}

function disassembleProgram(mem, start, end, romVersion, textOptions, addressToSymbolDict) {
	var basicList = getBasicLinks(mem);
	if (basicList.length) {
		var basicEnd = basicList[basicList.length - 1] + 1;
		if (basicEnd > end) end = basicEnd;
	}
	if (end >= mem.length) end = mem.length-1;
	if (end - start < 3) return '';
	return disassemble(mem, start, end, romVersion, textOptions, addressToSymbolDict);
}

function disassembleVideoRam(mem, start, end, textOptions) {

	function out(addr, bytes, txt) {
		if (isFirstLn) isFirstLn = false;
		else if ((addr & 0x03ff) % 40 == 0) disas += '\n';
		var s = hex(addr, 4) + ' ';
		for (var i=0; i<5; i++) s+= i<bytes.length? ' '+hex(bytes[i], 2):'   ';
		if (txt) s += '     .scr «'+txt+'»';
		disas += s + '\n';
	}

	var charsetTag = textOptions? textOptions.charsetTag : 'rom1',
		isNewCharRom = textOptions? textOptions.isNewCharRom : false,
		isJapaneseRom = textOptions? textOptions.isJapaneseRom : false;
	if (!charsetTag || (charsetTag != 'rom1' && charsetTag != 'rom2')) charsetTag = 'rom1';
	var ct = screenCodesToUnicode[charsetTag],
		cj = screenCodesKana[charsetTag],
		swapCase = isNewCharRom && charsetTag == 'rom2',
		e0 = end;
	if (!start || start < 0x8000) start = 0x8000;
	if (!end || end > 0x8fff) end = 0x8fff;
	if (start > end) return '';

	var curAddr = start,
		bytes = [],
		txt = '',
		isFirstLn = true,
		disas = '                         .[video ram]\n\n';
	for (var addr = start; addr <= end; addr++) {
		if (bytes.length == 4) {
			out(curAddr, bytes, txt);
			curAddr = addr;
			txt = '';
			bytes.length = 0;
		}
		var c = mem[addr];
		bytes.push(c);
		if (isJapaneseRom && cj[c & 127]) {
			txt += String.fromCharCode(cj[c & 127]);
		}
		else {
			if (swapCase) {
				var t = c & 127;
				if ((t >= 1 && t <= 0x1a) || (t >= 0x41 && t <= 0x5a)) c = t ^ 0x40;
			}
			txt += String.fromCharCode(ct[c] || ct[c & 127]);
		}
	}
	if (bytes.length) out(curAddr, bytes, txt);
	if (e0 >= addr) disas += '\n                         .[end of video ram]\n'

	return disas;
}

function disassembleSystemRam(mem, start, end, swapCase) {

	function stringFor(c) {
		var s;
		if (swapCase) {
			if (c >= 0x41 && c <= 0x5A) s = String.fromCharCode(c + 0x20);
			else if (c >= 0xC1 && c <= 0xDA) s = String.fromCharCode(c - 0x80);
			else s = c < 0x20 || c > 0x7D? '.' : String.fromCharCode(c);
		}
		else {
			if (c >= 0xC1 && c <= 0xDA) s = String.fromCharCode(c - 0x60);
			else s = c < 0x20 || c > 0x7D? '.' : String.fromCharCode(c);
		}
		return s;
	}

	function out(addr, bytes, txt) {
		var s = hex(addr, 4) + ' ';
		for (var i=0; i<5; i++) s+= i<bytes.length? ' '+hex(bytes[i], 2):'   ';
		if (txt) s += '     ;«'+txt+'»';
		disas += s + '\n';
	}

	var e0 = end;
	if (!start || start < 0) start = 0;
	if (!end || end > 0x0400) end = 0x03FF;
	if (start < 0x0279 && end > 0x0279) end = 0x0279; // exit out on tape buffers
	if (start >= 0x03E8 && end > 0x03FF) end = 0x03FF;
	if (start >= end) return '';

	var curAddr = start,
		bytes = [],
		txt = '',
		disas = '                         .[system ram]\n\n';
	for (var addr = start; addr <= end; addr++) {
		if (bytes.length == 4) {
			out(curAddr, bytes, txt);
			curAddr = addr;
			txt = '';
			bytes.length = 0;
		}
		var c = mem[addr];
		bytes.push(c);
		txt += stringFor(c);
	}
	if (bytes.length) out(curAddr, bytes, txt);
	if (e0 >= addr) disas += '\n                         .[end of system ram]\n'

	return disas;
}

function parseVariables(ram, romVersion, lowercase, isNewCharRom, isJapaneseRom) {
	var swapCase = lowercase && isNewCharRom,
		p2m8  = Math.pow(2,-8),
		p2m16 = Math.pow(2,-16),
		p2m24 = Math.pow(2,-24),
		p2m32 = Math.pow(2,-32);

	function read(addr, data, len) {
		for (var i = 0; i < len; i++) data[i] = ram[addr + i];
	}

	function getFloat(exp, m0, m1, m2, m3) {
		if (!exp) return ' 0';
		var s = (m0 & 0x80)? '-':' ',
			m = (m0 | 0x80) * p2m8 + m1 * p2m16 + m2 * p2m24 + m3  * p2m32,
			n = m * Math.pow(2, exp-128),
			f;
		if (n == 0) return ' 0';
		else if (n > 999999999 || n < 0.01) {
			f = n.toExponential(8).replace(/\.?0+e/, 'e');
			f = f.replace(/\b([0-9])$/, '0$1');
			if (!swapCase) f = f.toUpperCase();
		}
		else {
			var f = n >= 1? n.toFixed(8-Math.floor(Math.log10(n))) : n.toFixed(9);
			if (f.indexOf('.') >= 0) f = f.replace(/^0/, '').replace(/\.?0+$/, '');
			if (!f) f = '0';
		}
		return s + f;
	}
	function getString(l, a0, a1) {
		if (l == 0) return '';
		var smem = [];
		read(a0 | (a1 << 8), smem, l);
		return getEscapedPetscii(smem, false, lowercase, swapCase, isJapaneseRom);
	}
	function getInteger(d0, d1) {
		var d = (d0 << 8) | d1;
		if (d0 & 0x80) return '-' + ((d ^ 0xffff)+1);
		return ' ' + d;
	}
	function getFn(addr) {
		var s = '', quote = false;
		for (var i=addr, max = addr+255; i<max; i++) {
			var c = ram[i];
			if (c == 0x22) {
				s += '"';
				quote = !quote;
			}
			else if (!quote && (c & 0x80)) {
				s += basicKeywords[c & 0x7f];
			}
			else if (c == 0 || (c == 0x3A && !quote)) {
				break;
			}
			else {
				s += getEscapedPetscii([c], false, lowercase, swapCase, isJapaneseRom);
			}
		}
		return s;
	}

	var txttab = romVersion == 1? 0x7A:0x28,
		mem = [],
		out = [];
	read(txttab + 2, mem, 6);
	var vartab = Math.max(0x403, mem[0] | (mem[1] << 8)),
		arytab = Math.max(0x403, mem[2] | (mem[3] << 8)),
		strend = Math.max(0x403, mem[4] | (mem[5] << 8)),
		varlength = arytab-vartab,
		arylength = strend-arytab,
		maxRAM = ram.length;
	if (varlength < 0 || vartab > arytab || vartab >= strend || vartab >= maxRAM || vartab + varlength > strend || vartab + varlength > maxRAM) varlength = 0;
	if (arylength < 0 || vartab > arytab || arytab >= strend || arytab >= maxRAM || arytab + arylength > strend || arytab + arylength > maxRAM) arylength = 0;

	if (varlength > 0) {
		mem.length = 0;
		read(vartab, mem, varlength);
		out.push('- simple variables ($' + hex(vartab,4) + '-$' + hex(vartab + varlength - 1,4) + ') -\n');
		for (var i = 0; i < varlength; i += 7) {
			var id1 = mem[i], id2 = mem[i+1],
				c1 = String.fromCharCode(id1 & 0x7f),
				c2 = String.fromCharCode(id2 & 0x7f),
				type = (id1 >> 7) | ((id2 >> 6) & 2),
				name, value;
			if (c1 < 'A' && c1 > 'Z') {
				out.push('-- encountered illegal variable name, ending. --');
				arylength = 0;
				break;
			}
			name = c1;
			if ((c2 >= 'A' && c2 <= 'Z') || (c2 >= '0' && c2 <= '9')) name += c2;
			if (swapCase) name = name.toLowerCase();
			if (type == 0) { //float
				value = getFloat(mem[i+2], mem[i+3], mem[i+4], mem[i+5], mem[i+6]);
			}
			else if (type == 3) { //integer
				name += '%';
				value = getInteger(mem[i+2], mem[i+3]);
			}
			else if (type == 2) {  //string
				name += '$';
				value = '"' + getString(mem[i+2], mem[i+3], mem[i+4]) + '"';
			}
			else if (type == 1) {  //fn
				name = 'FN' + name;
				value = '«' + getFn(mem[i+2] | (mem[i+3] << 8)) + '»';
			}
			while (name.length < 4) name += ' ';
			out.push(name + '= ' + value);
		}
	}

	if (arylength > 0) {
		mem.length = 0;
		read(arytab, mem, arylength);
		if (out.length) out.push('');
		out.push('- array variables ($' + hex(arytab,4) + '-$' + hex(arytab + arylength - 1,4) + ') -');
		var addr = 0;
		while (addr < arylength) {
			var id1 = mem[addr++], id2 = mem[addr++],
				ofs = mem[addr++] | (mem[addr++] << 8),
				dimensions = mem[addr++],
				dims = [],
				cntr = [],
				c1 = String.fromCharCode(id1 & 0x7f),
				c2 = String.fromCharCode(id2 & 0x7f),
				type = (id1 >> 7) | ((id2 >> 6) & 2),
				name, value;
			if (c1 < 'A' && c1 > 'Z') {
				out.push('-- encountered illegal variable name, ending. --');
				break;
			}
			name = c1;
			if ((c2 >= 'A' && c2 <= 'Z') || (c2 >= '0' && c2 <= '9')) name += c2;
			for (var d = 0; d < dimensions; d++) {
				dims.push((mem[addr++] << 8) | mem[addr++]);
				cntr.push(0);
			}
			if (swapCase) name = name.toLowerCase();
			if (type == 2) name += '$';
			else if (type == 3) name += '%';
			else if (type != 0) {
				out.push('-- encountered illegal variable type, ending. --');
				break;
			}
			if (out.length) out.push('');
			name += '(';
			var totalLength = 1, d;
			for (d = 0; d < dimensions; d++) totalLength *= dims[d];
			dims.reverse();
			d = 0;
			for (var k = 0; k < totalLength; k++) {
				if (type == 0) { //float
					value = getFloat(mem[addr++], mem[addr++], mem[addr++], mem[addr++], mem[addr++]);
				}
				else if (type == 3) { //integer {
					value = getInteger(mem[addr++], mem[addr++]);
				}
				else if (type == 2) {  //string
					value = '"' + getString(mem[addr++], mem[addr++], mem[addr++]) + '"';
				}
				out.push(name + cntr.join(',') + ') = ' + value);
				// advance index counters
				if (++cntr[d] == dims[d]) {
					cntr[d] = 0;
					while (++d < dimensions) {
						if (++cntr[d] == dims[d]) cntr[d] = 0;
						else break;
					}
					d = 0;
				}
			}
		}
	}

	if (!varlength && !arylength) out.push('- no variables found -');
	return out.join('\n');
}

function disassembleVariablesOnly(ram, romVersion, lowercase, isNewCharRom) {
	return disassembleVariables(ram, 0x401, ram.length, romVersion, lowercase, isNewCharRom);
}

function disassembleVariables(ram, start, end, romVersion, lowercase, isNewCharRom) {
	var swapCase = lowercase && isNewCharRom,
		p2m8  = Math.pow(2,-8),
		p2m16 = Math.pow(2,-16),
		p2m24 = Math.pow(2,-24),
		p2m32 = Math.pow(2,-32);

	function read(addr, data, len) {
		for (var i = 0; i < len; i++) data[i] = ram[addr + i];
	}

	function getFloat(exp, m0, m1, m2, m3) {
		if (!exp) return ' 0';
		var s = (m0 & 0x80)? '-':' ',
			m = (m0 | 0x80) * p2m8 + m1 * p2m16 + m2 * p2m24 + m3  * p2m32,
			n = m * Math.pow(2, exp-128),
			f;
		if (n == 0) return ' 0';
		else if (n > 999999999 || n < 0.01) {
			f = n.toExponential(8).replace(/\.?0+e/, 'e');
			f = f.replace(/\b([0-9])$/, '0$1');
			if (!swapCase) f = f.toUpperCase();
		}
		else {
			var f = n >= 1? n.toFixed(8-Math.floor(Math.log10(n))) : n.toFixed(9);
			if (f.indexOf('.') >= 0) f = f.replace(/^0/, '').replace(/\.?0+$/, '');
			if (!f) f = '0';
		}
		return s + f;
	}
	function getInteger(d0, d1) {
		var d = (d0 << 8) | d1;
		if (d0 & 0x80) return '-' + ((d ^ 0xffff)+1);
		return ' ' + d;
	}

	var txttab = romVersion == 1? 0x7A:0x28,
		mem = [],
		out = [],
		aryOut = [];
	read(txttab + 2, mem, 6);
	var vartab = Math.max(0x403, mem[0] | (mem[1] << 8)),
		arytab = Math.max(0x403, mem[2] | (mem[3] << 8)),
		strend = Math.max(0x403, mem[4] | (mem[5] << 8)),
		varlength = arytab-vartab,
		arylength = strend-arytab,
		maxRAM = ram.length;
	if (varlength < 0 || vartab > arytab || vartab >= strend || vartab >= maxRAM || vartab + varlength > strend || vartab + varlength > maxRAM) varlength = 0;
	if (arylength < 0 || vartab > arytab || arytab >= strend || arytab >= maxRAM || arytab + arylength > strend || arytab + arylength > maxRAM) arylength = 0;

	if (varlength > 0 && start < arytab) {
		mem.length = 0;
		read(vartab, mem, varlength);
		var startOfs = Math.max(0, start - vartab), endOfs = end - vartab;
		out.push('                         .[simple BASIC variables]\n');
		for (var i = startOfs - startOfs % 7; i < varlength && i <= endOfs; i += 7) {
			var id1 = mem[i], id2 = mem[i+1],
				c1 = String.fromCharCode(id1 & 0x7f),
				c2 = String.fromCharCode(id2 & 0x7f),
				type = (id1 >> 7) | ((id2 >> 6) & 2),
				name, value;
			if (c1 < 'A' && c1 > 'Z') {
				out.push('-- encountered illegal variable name, ending. --');
				arylength = 0;
				break;
			}
			name = c1;
			if ((c2 >= 'A' && c2 <= 'Z') || (c2 >= '0' && c2 <= '9')) name += c2;
			if (swapCase) name = name.toLowerCase();
			var disas = hex(vartab + i, 4) + '  ' +hex(id1,2) + ' ' +hex(id2,2) + '               ';
			if (type == 0) { //float
				value = '= '+ getFloat(mem[i+2], mem[i+3], mem[i+4], mem[i+5], mem[i+6]);
			}
			else if (type == 3) { //integer
				name += '%';
				value = '= '+ getInteger(mem[i+2], mem[i+3]);
			}
			else if (type == 2) {  //string
				name += '$';
				value = 'len: ' + mem[i+2] + ', @ $' + hex(mem[i+3] | (mem[i+4] << 8), 4);
			}
			else if (type == 1) {  //fn
				name = 'FN' + name + '()';
				value = '@ $' + hex(mem[i+2] | (mem[i+3] << 8), 4)
					+ ', arg @ $' + hex(mem[i+4] | (mem[i+5] << 8),4)
					+ ", " + ((mem[i+6] & 0x80)? '‘' + basicKeywords[mem[i+6] & 0x7f] + '’':'«' + String.fromCharCode(mem[i+6]) + '»');
			}
			disas += name + '\n' + hex(vartab + i + 2, 4) + '  '
				+ hex(mem[i+2],2) + ' ' + hex(mem[i+3],2) + ' ' + hex(mem[i+4],2) + ' '
				+ hex(mem[i+5],2) + ' ' + hex(mem[i+6],2)
				+ '      ' + value;
			out.push(disas);
		}
		out.push('');
	}

	if (arylength > 0 && start < strend && end >= arytab) {
		mem.length = 0;
		read(arytab, mem, arylength);
		out.push('                         .[subscripted variables]\n');
		var startOfs = Math.max(0, start - arytab), endOfs = end - arytab, addr = 0;
		while (addr < arylength && addr <= endOfs) {
			var a0 = addr,
				id1 = mem[addr++], id2 = mem[addr++],
				ofs = mem[addr++] | (mem[addr++] << 8),
				dimensions = mem[addr++],
				dims = [],
				cntr = [],
				c1 = String.fromCharCode(id1 & 0x7f),
				c2 = String.fromCharCode(id2 & 0x7f),
				type = (id1 >> 7) | ((id2 >> 6) & 2),
				nextVar = a0 + ofs
				name, value;
			if (nextVar < startOfs && nextVar < endOfs) {
				addr = nextVar;
				continue;
			}
			if (c1 < 'A' && c1 > 'Z') {
				out.push('-- encountered illegal variable name, ending. --');
				break;
			}
			name = c1;
			if ((c2 >= 'A' && c2 <= 'Z') || (c2 >= '0' && c2 <= '9')) name += c2;
			var disas = hex(arytab + a0,4) + '  ' + hex(id1,2) + ' ' + hex(id2,2) + ' '
					+ hex(mem[a0+2],2) + ' ' + hex(mem[a0+3],2) + ' ' + hex(dimensions,2);
			if (swapCase) name = name.toLowerCase();
			if (type == 2) name += '$';
			else if (type == 3) name += '%';
			else if (type != 0) {
				out.push('-- encountered illegal variable type, ending. --');
				break;
			}
			out.push(disas + '     ' +  name + ', size: $' + hex(ofs,4) + ', dims: ' + dimensions);
			disas = '';
			for (var d = 0, dcnt = dimensions - 1; d <= dcnt; d++) {
				disas += (d == 0? '':'\n') +hex(arytab + addr, 4) + '  ' + hex(mem[addr],2) + ' ' + hex(mem[addr+1],2) + '              ';
				var size = (mem[addr++] << 8) | mem[addr++];
				dims.push(size);
				disas += 'dimension #'+(dcnt - d)+' (n-' + (d+1)+'): ' + size;
				cntr.push(0);
			}
			out.push(disas);
			var totalLength = 1, d;
			for (d = 0; d < dimensions; d++) totalLength *= dims[d];
			dims.reverse();
			d = 0;
			for (var k = 0; k < totalLength; k++) {
				disas = hex(arytab + addr, 4) + '  ';
				if (type == 0) { //float
					disas += hex(mem[addr],2) + ' ' + hex(mem[addr+1],2) + ' ' + hex(mem[addr+2],2)
						+ ' ' + hex(mem[addr+3],2) + ' ' + hex(mem[addr+4],2);
					value = ' = '+ getFloat(mem[addr++], mem[addr++], mem[addr++], mem[addr++], mem[addr++]);
				}
				else if (type == 3) { //integer {
					disas += hex(mem[addr],2) + ' ' + hex(mem[addr+1],2);
					value = ' = '+ getInteger(mem[addr++], mem[addr++]);
				}
				else if (type == 2) {  //string
					disas += hex(mem[addr],2) + ' ' + hex(mem[addr+1],2) + ' ' + hex(mem[addr+2],2);
						value = ' len: ' + mem[addr++] + ', @ $' + hex(mem[addr++] | (mem[addr++] << 8), 4);
				}
				while (disas.length < 25) disas += ' ';
				out.push(disas + '(' + cntr.join(',') + ') ' + value);
				// advance index counters
				if (++cntr[d] == dims[d]) {
					cntr[d] = 0;
					while (++d < dimensions) {
						if (++cntr[d] == dims[d]) cntr[d] = 0;
						else break;
					}
					d = 0;
				}
			}
		}
		out.push('');
	}
	if (end >= strend && out.length) out.push('                         .[end of BASIC variables]\n');
	return out.join('\n');
}

function getVariableSpace(mem, romVersion) {
	var txttab = romVersion == 1? 0x7A:0x28;
	var vartab = Math.max(0x403, mem[txttab + 2] | (mem[txttab + 3] << 8)),
		arytab = Math.max(0x403, mem[txttab + 4] | (mem[txttab + 5] << 8)),
		strend = Math.max(0x403, mem[txttab + 6] | (mem[txttab + 7] << 8)),
		varlength = arytab-vartab,
		arylength = strend-arytab,
		maxRAM = mem.length;
	if (varlength < 0 || vartab > arytab || vartab >= strend || vartab >= maxRAM || vartab + varlength > strend || vartab + varlength > maxRAM) varlength = 0;
	if (arylength < 0 || vartab > arytab || arytab >= strend || arytab >= maxRAM || arytab + arylength > strend || arytab + arylength > maxRAM) arylength = 0;

	return { 'start': vartab, 'length': varlength + arylength };
}


// 6502 assembler
// (c) 2005-2023  Norbert Landsteiner, mass:werk; www.masswerk.at/pet/
// like <https://www.masswerk.at//6502/assembler.html>, but without BBC options

var assembler = (function() {

// lookup tables

var hextab= ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'],
	instrLegals = {
		'ADC': [  -1,  -1,0x69,0x6d,0x7d,0x79,0x65,0x75,  -1,  -1,0x61,0x71,  -1],
		'AND': [  -1,  -1,0x29,0x2d,0x3d,0x39,0x25,0x35,  -1,  -1,0x21,0x31,  -1],
		'ASL': [  -1,0x0a,  -1,0x0e,0x1e,  -1,0x06,0x16,  -1,  -1,  -1,  -1,  -1],
		'BCC': [  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,0x90],
		'BCS': [  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,0xb0],
		'BEQ': [  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,0xf0],
		'BIT': [  -1,  -1,  -1,0x2c,  -1,  -1,0x24,  -1,  -1,  -1,  -1,  -1,  -1],
		'BMI': [  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,0x30],
		'BNE': [  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,0xd0],
		'BPL': [  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,0x10],
		'BRK': [0x00,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'BVC': [  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,0x50],
		'BVS': [  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,0x70],
		'CLC': [0x18,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'CLD': [0xd8,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'CLI': [0x58,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'CLV': [0xb8,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'CMP': [  -1,  -1,0xc9,0xcd,0xdd,0xd9,0xc5,0xd5,  -1,  -1,0xc1,0xd1,  -1],
		'CPX': [  -1,  -1,0xe0,0xec,  -1,  -1,0xe4,  -1,  -1,  -1,  -1,  -1,  -1],
		'CPY': [  -1,  -1,0xc0,0xcc,  -1,  -1,0xc4,  -1,  -1,  -1,  -1,  -1,  -1],
		'DEC': [  -1,  -1,  -1,0xce,0xde,  -1,0xc6,0xd6,  -1,  -1,  -1,  -1,  -1],
		'DEX': [0xca,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'DEY': [0x88,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'EOR': [  -1,  -1,0x49,0x4d,0x5d,0x59,0x45,0x55,  -1,  -1,0x41,0x51,  -1],
		'INC': [  -1,  -1,  -1,0xee,0xfe,  -1,0xe6,0xf6,  -1,  -1,  -1,  -1,  -1],
		'INX': [0xe8,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'INY': [0xc8,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'JMP': [  -1,  -1,  -1,0x4c,  -1,  -1,  -1,  -1,  -1,0x6c,  -1,  -1,  -1],
		'JSR': [  -1,  -1,  -1,0x20,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'LDA': [  -1,  -1,0xa9,0xad,0xbd,0xb9,0xa5,0xb5,  -1,  -1,0xa1,0xb1,  -1],
		'LDX': [  -1,  -1,0xa2,0xae,  -1,0xbe,0xa6,  -1,0xb6,  -1,  -1,  -1,  -1],
		'LDY': [  -1,  -1,0xa0,0xac,0xbc,  -1,0xa4,0xb4,  -1,  -1,  -1,  -1,  -1],
		'LSR': [  -1,0x4a,  -1,0x4e,0x5e,  -1,0x46,0x56,  -1,  -1,  -1,  -1,  -1],
		'NOP': [0xea,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'ORA': [  -1,  -1,0x09,0x0d,0x1d,0x19,0x05,0x15,  -1,  -1,0x01,0x11,  -1],
		'PHA': [0x48,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'PHP': [0x08,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'PLA': [0x68,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'PLP': [0x28,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'ROL': [  -1,0x2a,  -1,0x2e,0x3e,  -1,0x26,0x36,  -1,  -1,  -1,  -1,  -1],
		'ROR': [  -1,0x6a,  -1,0x6e,0x7e,  -1,0x66,0x76,  -1,  -1,  -1,  -1,  -1],
		'RTI': [0x40,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'RTS': [0x60,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'SBC': [  -1,  -1,0xe9,0xed,0xfd,0xf9,0xe5,0xf5,  -1,  -1,0xe1,0xf1,  -1],
		'SEC': [0x38,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'SED': [0xf8,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'SEI': [0x78,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'STA': [  -1,  -1,  -1,0x8d,0x9d,0x99,0x85,0x95,  -1,  -1,0x81,0x91,  -1],
		'STX': [  -1,  -1,  -1,0x8e,  -1, -18,0x86,  -1,0x96,  -1,  -1,  -1,  -1],
		'STY': [  -1,  -1,  -1,0x8c, -17,  -1,0x84,0x94,  -1,  -1,  -1,  -1,  -1],
		'TAX': [0xaa,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'TAY': [0xa8,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'TSX': [0xba,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'TXA': [0x8a,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'TXS': [0x9a,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'TYA': [0x98,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1]
	},
	instrIllegals = {
		'ALR': [  -1,  -1,0x4b,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'ANC': [  -1,  -1,0x0b,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'ANC2':[  -1,  -1,0x2b,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'ANE': [  -1,  -1,0x8b,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'ARR': [  -1,  -1,0x6b,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'DCP': [  -1,  -1,  -1,0xcf,0xdf,0xdb,0xc7,0xd7,  -1,  -1,0xc3,0xd3,  -1],
		'ISC': [  -1,  -1,  -1,0xef,0xff,0xfb,0xe7,0xf7,  -1,  -1,0xe3,0xf3,  -1],
		'LAS': [  -1,  -1,  -1,  -1,  -1,0xbb,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'LAX': [  -1,  -1,0xab,0xaf,  -1,0xbf,0xa7,  -1,0xb7,  -1,0xa3,0xb3,  -1],
		'LXA': [  -1,  -1,0xab,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'NOP': [0xea,  -1,0x80,0x0c,0x1c,  -1,0x04,0x14,  -1,  -1,  -1,  -1,  -1],
		'RLA': [  -1,  -1,  -1,0x2f,0x3f,0x3b,0x27,0x37,  -1,  -1,0x23,0x33,  -1],
		'RRA': [  -1,  -1,  -1,0x6f,0x7f,0x7b,0x67,0x77,  -1,  -1,0x63,0x73,  -1],
		'SAX': [  -1,  -1,  -1,0x8f,  -1,  -1,0x87,  -1,0x97,  -1,0x83,  -1,  -1],
		'USBC':[  -1,  -1,0xeb,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'SBX': [  -1,  -1,0xcb,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'SHA': [  -1,  -1,  -1,  -1,  -1,0x9f,  -1,  -1,  -1,  -1,  -1,0x93,  -1],
		'SHX': [  -1,  -1,  -1,  -1,  -1,0x9e,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'SHY': [  -1,  -1,  -1,  -1,0x9c,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'SLO': [  -1,  -1,  -1,0x0f,0x1f,0x1b,0x07,0x17,  -1,  -1,0x03,0x13,  -1],
		'SRE': [  -1,  -1,  -1,0x4f,0x5f,0x5b,0x47,0x57,  -1,  -1,0x43,0x53,  -1],
		'TAS': [  -1,  -1,  -1,  -1,  -1,0x9b,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'JAM': [0x02,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1],
		'DOP': [  -1,  -1,0x80,  -1,  -1,  -1,0x04,0x14,  -1,  -1,  -1,  -1,  -1],
		'TOP': [  -1,  -1,  -1,0x0c,0x1c,  -1,  -1,  -1,  -1,  -1,  -1,  -1,  -1]
	},
	instrSynonyms = {
		'ASO': 'SLO',
		'LSE': 'SRE',
		'AXS': 'SAX',
		'AAX': 'SAX',
		'DCM': 'DCP',
		'ISB': 'ISC',
		'INS': 'ISC',
		'LAR': 'LAS',
		'LAE': 'LAS',
		'SHS': 'TAS',
		'XAS': 'TAS',
		'AXA': 'SHA',
		'AHX': 'SHA',
		'SAY': 'SHY',
		'SYA': 'SHY',
		'ASR': 'ALR',
		'XAA': 'ANE',
		'ATX': 'LAX',
		'HLT': 'JAM',
		'KIL': 'JAM',
		'SKB': 'DOP',
		'SKW': 'TOP'
	},
	steptab = [1,1,2,3,3,3,2,2,2,3,2,2,2],
	addrtab = {
		'imp':0,
		'acc':1,
		'imm':2,
		'abs':3,
		'abx':4,
		'aby':5,
		'zpg':6,
		'zpx':7,
		'zpy':8,
		'ind':9,
		'inx':10,
		'iny':11,
		'rel':12
	};


// statics

var codesrc, code, codeStart, codeEnd, srcl, srcc, pc, symtab,
	listing, srcLnNo,
	optAutoZpg, comment, rawLine, charEncoding,
	instrtab, instrAll, useIllegals=false, codeStore, unifiedPETSCII = true,
	hexPrefix='$', commentChar=';', pcSymbol='*', redefSyms=false,
	pass, isHead, repeatCntr, repeatStep, convertPi, cbmStartAddr,
	anonymousTargets, anonymousTargetsFwd, anonymousTargetsBwd, warnings,
	setupDone = false, minCodeAddr = 0, noList=false, longSymbolNames=false;

var identMaxLength = 12,
	logAddrStop=17,
	logLblStop=19,
	logAsmStop=logLblStop+identMaxLength+1;

var ET_S='syntax error',
	ET_P='parse error',
	ET_C='compile error',
	ADDR_MAX = 0x7fff;

// functions

function setup() {
	var p;
	instrAll = {};
	for (p in instrLegals) instrAll[p]=instrLegals[p];
	for (p in instrIllegals) instrAll[p]=instrIllegals[p];
	for (p in instrSynonyms) instrAll[p]=instrIllegals[instrSynonyms[p]];
	instrtab = useIllegals? instrAll:instrLegals;
	setupDone = true;
}

function assemble(_src, _initialAddress) {
	function getHeading(t1, t2, t3, t4) {
		var s = t1 + ' ';
		while (s.length<6) s+=' ';
		s+=t2+ ' ';
		while (s.length<logAddrStop) s+=' ';
		s+='  '+t3+ ' ';
		while (s.length<=logAsmStop) s+=' ';
		return 'pass '+pass+'\n\n'+s+t4+'\n\n';
	}
	if (!setupDone) setup();
	symtab={};
	codeStore=null;
	var empty=true;
	if (typeof _src === 'string') {
		if (_src.indexOf('\r\n')>=0) {
			codesrc=_src.split('\r\n');
		}
		else if (_src.indexOf('\r')>=0) {
			codesrc=_src.split('\r');
		}
		else {
			codesrc=_src.split('\n');
		}
		for (var i=0; i<codesrc.length; i++) {
			if ((/\S/).test(codesrc[i])) {
				empty=false;
				break;
			}
		}
	}
	if (empty) {
		if (minCodeAddr) { // recieved a valid initial address
			return {
				'error': false,
				'message': 'No source.',
				'listing': listing,
				'code': [0x60], // just RTS
				'start': minCodeAddr,
				'end': minCodeAddr + 1
			};
		}
		return {
			'error': true,
			'message': 'No source.',
			'listing': listing,
			'code': null,
			'start': 0,
			'end': 0
		};
	}
	var pass1=false, pass2=false, range;
	code=[];
	codeStart=0x10000;
	codeEnd=0;
	cbmStartAddr=0;
	warnings=0;
	pass=1;
	listing=getHeading('LINE','LOC','LABEL','PICT');
	pass1=asmPass(_initialAddress);
	if (pass1) {
		listing+='\n';
		listSymbols();
		pass=2;
		listing+=getHeading('LOC','CODE','LABEL','INSTRUCTION');
		pass2=asmPass(_initialAddress);
		if (pass2) {
			if (codeStart==0x10000) codeStart=0;
			range=getHexWord(codeStart)+'..'+getHexWord(codeEnd);
			if (code.length) {
				listing+='\ndone (code: '+range+').';
			}
			else {
				listing+='\ndone.\nno code generated.';
			}
		}
	}
	if (pass1 && pass2) {
		if (typeof _initialAddress === 'number' && codeStart > _initialAddress) codeStart = _initialAddress;
		var status = warnings==1? '1 warning':warnings>1? warnings+' warnings':'ok';
		return {
			'error': false,
			'warnings': warnings,
			'message': code.length? 'Assembly complete ('+range+'), '+status+'.':'No code generated.',
			'listing': listing,
			'code': code.slice(codeStart),
			'start': codeStart & 0xffff,
			'end': codeEnd,
			'cbmStart': cbmStartAddr
		};
	}
	else {
		return {
			'error': true,
			'message': 'Assembly failed.',
			'listing': listing,
			'code': null,
			'start': codeStart & 0xffff,
			'end': 0
		};
	}
}

function getHexByte(v) {
	return ''+hextab[(v>>4)&0x0f]+hextab[v&0x0f];
}

function getHexWord(v) {
	return ''+hextab[(v>>12)&0x0f]+hextab[(v>>8)&0x0f]+hextab[(v>>4)&0x0f]+hextab[v&0x0f];
}

function compile(addr, b) {
	addr&=0xffff;
	code[addr]=b;
	if (addr<codeStart) codeStart=addr;
	if (addr>codeEnd) codeEnd=addr;
}

function fill(addr, pc, b) {
	addr&=0xffff;
	b&=0xff;
	var start = Math.min(pc,codeStart),
		end = Math.max(pc, codeEnd);
	if (start < minCodeAddr) start = minCodeAddr;
	if (addr<start) {
		for (var i=addr; i<start; i++) {
			if (typeof code[i]=='undefined') code[i]=b;
		}
		if (codeEnd<start) codeEnd=Math.max(0,start-1);
		codeStart=addr;
	}
	else if (addr>end) {
		if (typeof code[end]=='undefined') code[end]=b;
		for (var i=end+1; i<addr; i++) code[i]=b;
		if (end<codeStart) codeStart=end;
		codeEnd=Math.max(0,addr-1);
	}
}

function listSymbols() {
	var keys=[];
	for (var k in symtab) keys.push(k);
	keys.sort();
	if (keys.length) {
		listing+='symbols\n';
		var offset = logLblStop-2;
		for (var i=0; i<keys.length; i++) {
			var n = keys[i],
				sym = symtab[n];
			while (n.length<offset) n+=' ';
			listing+=' '+n+' '+(sym.isWord ||sym.v>0xff? hexPrefix+getHexWord(sym.v):'  '+hexPrefix+getHexByte(sym.v))+'\n';
		}
		listing+='\n';
	}
}

function getChar(isQuote) {
	if (srcl>=codesrc.length) return 'EOF';
	if (srcc>=codesrc[srcl].length) {
		srcc=0;
		srcl++;
		return '\n';
	}
	else {
		var c=codesrc[srcl].charAt(srcc++);
		if (!isQuote && c==';') {
			comment=pass==1? c:commentChar;
			while (srcc<codesrc[srcl].length) {
				comment+=codesrc[srcl].charAt(srcc++);
			}
		}
		else {
			rawLine+=c;
		}
		return c;
	}
}

function getSym() {
	if (comment) {
		if (!noList) listing+=comment+'\n';
		comment='';
	}
	rawLine='';
	srcLnNo=srcl+1;
	var c=getChar();
	if (c=='EOF') return null;
	var sym=[''],
		s=0,
		m=0,
		quote='';
	while ((c!=';' || quote) && c!='\n' && c!='EOF') {
		if (m<2 && (c==' ' || c=='\t')) {
			if (m>0) {
				m=0;
				if (sym[s] && sym[s].length) {
					sym[++s]='';
				}
			}
		}
		else if (m<2 && c=='=') {
			if (m>0) s++;
			sym[s]=c;
			m=0;
			sym[++s]='';
		}
		else if (m==2) {
			if (c==quote) {
				sym[s]+='"';
				quote='';
				m=1;
			}
			else {
				sym[s]+=c;
			}
		}
		else if (c=='"') {
			sym[s]+='"';
			m=2;
			quote=c;
		}
		else if (c=='\'') {
			sym[s]+=c;
			quote=c;
			m=3;
		}
		else if (m==0 && c=='!') {
			if (sym[s].length) s++;
			sym[s]=c;
			m=1;
			if (s>1) {
				var c1=getChar(false);
				while (c1=='+' || c1=='-') {
					sym[s]+=c1;
					c1=getChar(false);
				}
				c=c1;
				continue;
			}
		}
		else {
			if (m==3) {
				sym[s]+=c;
				quote='';
			}
			else {
				sym[s]+=c.toUpperCase();
			}
			m=1;
		}
		c=getChar(m>=2);
	}
	while (sym.length && sym[sym.length-1]=='') sym.length--;
	return c=='EOF'? null: sym;
}

function encodePetscii(b) {
	if (b >= 0x41 && b <= 0x5A) return b | 0x80; // A..Z
	if (b >= 0x61 && b <= 0x7A) return b - 0x20; // a..z
	return b;
}

function encodeCommodoreScreenCode(b) {
	if (b >= 0x61 && b <= 0x7A) return b-0x60; // a..z
	if (b >= 0x5B && b <= 0x5F) return b-0x40; // [\]^_
	if (b == 0x60) return 0x40;                // `
	if (b == 0x40) return 0;                   // @
	return b;
}

function encodeAscii(b) {
	return b;
}

function getNumber(s, idx) {
	var c0=s.charAt(idx),
		size=0xffff;
	if (c0=='$' || c0=='&') {
		for (var i=idx+1; i<s.length; i++) {
			var c=s.charAt(i);
			if ((c<'A' || c>'F') && (c<'0' || c>'9')) break;
		}
		if (i==idx+1) return {'v': -1, 'idx': i, 'error': true, 'et': ET_P};
		var n=s.substring(idx+1, i),
			isWord=(n.length>=4 && n.indexOf('00')==0);
		return {'v': parseInt(n,16)&size, 'idx': i, 'error': false, 'isWord': isWord};
	}
	else if (c0=='%') {
		for (var i=idx+1; i<s.length; i++) {
			var c=s.charAt(i);
			if (c!='1' && c!='0') break;
		}
		if (i==idx+1) return {'v': -1, 'idx': i, 'error': true, 'et': ET_P};
		return {'v': parseInt(s.substring(idx+1, i),2)&size, 'idx': i, 'error': false};
	}
	else if (c0=='@') {
		for (var i=idx+1; i<s.length; i++) {
			var c=s.charAt(i);
			if (c<'0' || c>'7') break;
		}
		if (i==idx+1) return {'v': -1, 'idx': i, 'error': true};
		return {'v': parseInt(s.substring(idx+1, i),8)&size, 'idx': i, 'error': false};
	}
	else if (c0=='\'') {
		idx++;
		var quote=c0;
		if (idx<s.length) {
			var v=s.charCodeAt(idx);
			if (convertPi && v==0x03C0) v=0xff; //CBM pi
			if (v>0xff) return {'v': v, 'idx': idx, 'error': true, 'et': ET_P};
			idx++;
			return {'v': charEncoding(v), 'idx': idx, 'error': false};
		}
		return {'v': -1, 'idx': idx, 'error': true};
	}
	else if (c0=='0') {
		if (s.length==idx+1) return {'v': 0, 'idx': idx+1};
		var ofs=idx+1, base=8, c=s.charAt(ofs);
		if (c=='X') {
			base=16;
			ofs++;
		}
		else if (c=='O') {
			base=8;
			ofs++;
		}
		else if (c=='B') {
			base=2;
			ofs++;
		}
		else if (c=='D') {
			base=10;
			ofs++;
		}
		if (ofs>=s.length) return {'v': -1, 'idx': s.length, 'error': true, 'et': ET_P};
		for (var i=ofs; i<s.length; i++) {
			c=s.charAt(i);
			if (base==2 && (c!='0' && c!='1')) break;
			if (base==8 && (c<'0' || c>'7')) break;
			if (base==10 && (c<'0' || c>'9')) break;
			if (base==16 && (c<'0' || c>'9') && (c<'A' || c>'F')) break;
		}
		var n=s.substring(ofs, i),
			isWord=(base==16 && n.length>=4 && n.indexOf('00')==0);
		return {'v': parseInt(n,base)&size, 'idx': i, 'error': false, 'isWord': isWord, 'lc': base!=8? ofs-1:-1 };
	}
	else {
		for (var i=idx; i<s.length; i++) {
			var c=s.charAt(i);
			if (c<'0' || c>'9') break;
		}
		if (i==idx) return {'v': -1, 'idx': i, 'error': true};
		return {'v': parseInt(s.substring(idx, i),10)&size, 'idx': i, 'error': false };
	}
	return {'v': -1, 'idx': idx, 'error': true};
}

function getIdentifier(s, idx, stripColon) {
	var start = s.charAt(idx) === '@'? idx:idx + 1;
	for (var i=start; i<s.length; i++) {
		var c=s.charAt(i);
		if ((c<'A' || c>'Z') && (c<'0' || c>'9') && c!='_') break;
	}
	var end=i;
	if (stripColon && i<s.length && s.charAt(i)==':') i++;
	var l=longSymbolNames? end-idx:Math.min(end-idx, identMaxLength);
	return { 'v': s.substr(idx, l), 'idx': i };
}

function getExpression(s, pc) {
	var idx=0, c, v, r, state=0, max=s.length, root=[], stack=root, parent=[], pict='', last='', lvl=0, size=0xffff;
	while (idx < max) {
		c=s.charAt(idx);
		if (state==0) {
			if (c=='-') {
				pict+=c;
				stack.push({'type': 'sign'});
				idx++;
				if (idx<max) {
					c=s.charAt(idx);
					if (c=='>'||c=='<') {
						stack.push({'type': 'mod', 'v': c});
						idx++;
					}
				}
				state++;
				continue;
			}
			else if (c=='>'||c=='<') {
				pict+=c;
				stack.push({'type': 'mod', 'v': c});
				idx++;
				if (idx<max) {
					c=s.charAt(idx);
					if (c=='-') {
						pict+=c;
						stack.push({'type': 'sign'});
						idx++;
					}
				}
				state++;
				continue;
			}
			state++;
		}
		if (state==1) {
			if (c === '@') {
				pict += c;
				c = s.charAt(++idx);
			}
			if (c=='$' || c=='%' || c=='@' || c=='&' || (c>='0' && c<='9') || c=='\'') {
				r=getNumber(s, idx);
				var ns=(r.lc && r.lc>0)?
					s.substring(idx, r.lc)+s.charAt(r.lc).toLowerCase()+s.substring(r.lc+1, r.idx):
					s.substring(idx, r.idx);
				if (ns && ns.charAt(0)=='"') ns='\''+ns.substring(1,2);
				pict+=ns;
				if (r.error) {
					if (!(c>='0' && c<='9') && r.idx-idx<=1 && r.idx<s.length) pict+=s.charAt(r.idx);
					if (c=='\'' && r.v>=0) return { 'v': -1, 'pict': pict, 'error': 'illegal quantity', 'et': ET_P };
					return { 'v': -1, 'pict': pict, 'error': 'number character expected', 'et': ET_P };
				}
				stack.push({'type': 'num', 'v': r.v, 'isWord': r.isWord||false});
				idx=r.idx;
				last='figure';
			}
			else if ((c>='A' && c<='Z') || c=='_') {
				if (c=='P' && idx+1<max && s.charAt(idx+1)=='%') {
					pict+='P%';
					stack.push({'type': 'num', 'v': pc});
					idx+=2;
					last='';
				}
				else if (c=='R' && idx+1<max && s.charAt(idx+1)=='%') {
					pict+='R%';
					stack.push({'type': 'num', 'v': repeatCntr*repeatStep});
					idx+=2;
					last='';
				}
				else {
					r=getIdentifier(s, idx);
					pict+=r.v;
					if (instrtab[r.v]) return {'v': -1, 'pict': pict, 'error': 'illegal identifier (opcode '+r.v+')', 'et': ET_P};
					if (pass==2 && typeof symtab[r.v] == 'undefined') return { 'v': -1, 'pict': pict, 'error': 'undefined symbol', 'undef': r.v, 'et': ET_C };
					stack.push({'type': 'ident', 'v': r.v});
					idx=r.idx;
					last='name character';
				}
			}
			else if (c=='.') {
				pict+='.';
				stack.push({'type': 'num', 'v': pc});
				idx++;
				last='';
			}
			else if (c=='*') {
				pict+='*';
				stack.push({'type': 'num', 'v': pc});
				idx++;
				last='';
			}
			else if (c=='[' || c=='(') {
				pict+=c;
				parent[lvl]=stack;
				stack=[];
				parent[lvl++].push({'type': 'paren', 'stack': stack, 'pict': pict, 'chr': c});
				state=0;
				idx++;
				continue;
			}
			else {
				pict+=c;
				return { 'v': -1, 'pict': pict, 'error': 'number or identifier expected', 'et': ET_P };
			}
			state++;
		}
		else if (state==2) {
			pict+=c;
			if (c=='+' || c=='-' || c=='*' || c=='/') {
				stack.push({'type': 'op', 'v': c});
				idx++;
				state=0;
			}
			else if (c==']' || c==')') {
				lvl--;
				if (lvl<0) return { 'v': -1, 'pict': pict, 'error': 'non matching parenthesis "'+c+'"', 'et': ET_P };
				stack=parent[lvl];
				stack[stack.length-1].pict=pict;
				idx++;
				state=2;
			}
			else {
				var message = last? last+' or operator expected':'operator expected';
				return { 'v': -1, 'pict': pict, 'error': 'unexpected token, '+message, 'et': ET_P };
			}
		}
	}
	if (state != 2)
		return { 'v': -1, 'pict': pict, 'error': 'number or identifier expected', 'et': ET_P };
	if (lvl != 0)
		return { 'v': -1, 'pict': pict, 'error': 'non matching parenthesis, "]" expected.', 'et': ET_S };
	return resolveExpression(root, pict);
}

function resolveExpression(stack, pict) {
	var result=0, item, pr, op='', sign=false, mod=false, modSign=false, isWord=false, size=0xffff;
	for (var i=0; i<stack.length; i++) {
		item=stack[i];
		switch (item.type) {
			case 'sign':
				sign=true;
				break;
			case 'mod':
				mod=item.v;
				modSign=sign;
				sign=false;
				break;
			case 'num':
			case 'ident':
			case 'paren':
				if (item.type=='paren') {
					if (item.stack.length==0) return { 'v': -1, 'pict': exp.pict+item.chr, 'error': 'unexpected token "]"', 'et': ET_P };
					var exp=resolveExpression(item.stack, item.pict);
					if (exp.error || exp.undef) return exp;
					if (exp.isWord && !mod) isWord=true;
					pr=exp.v;
				}
				else if (item.type=='num') {
					pr=item.v;
					if (item.isWord && !mod) isWord=true;
				}
				else {
					var sym=symtab[item.v];
					if (!sym) {
						if (pass==1) sym = { 'v': -1, 'isWord': true, 'pc': 0xffff };
						else return { 'v': -1, 'pict': pict, 'error': true, 'isWord': true, 'undef': item.v, 'et': ET_C };
					}
					if (!mod && (sym.isWord || sym.pc>pc)) isWord=true;
					pr=sym.v;
				}
				if (sign) {
					if (pr >= 0) pr=size&(-pr);
					sign=false;
					isWord = true;
				}
				if (mod) {
					if (mod=='>') {
						if (pr >= 0) pr=(pr>>8)&0xff;
					}
					else {
						if (pr >= 0) pr&=0xff;
					}
					isWord = false;
					if (modSign && pr >= 0) pr=size&(-pr);
					modSign=false;
				}
				if (op=='+') result=(result<0 || pr<0)?-1:size&(result+pr);
				else if (op=='-') result=(result<0 || pr<0)?-1:size&(result-pr);
				else if (op=='*') result=(result<0 || pr<0)?-1:size&(result*pr);
				else if (op=='/') {
					if (pr==0) return { 'v': -1, 'pict': pict, 'error': 'division by zero', 'et': ET_C };
					result=(result<0 || pr<0)?-1:size&(result/pr);
				}
				else if (result >= 0) result=pr;
				if (!mod && (result<0 || result>255)) isWord=true;
				op='';
				break;
			case 'op':
				op=item.v;
				break;
		}
	}
	return { 'v': result, 'pict': pict, 'error': false, 'isWord': isWord, 'pc': pc };
}

function hasZpgMode(opc) {
	var instr=instrtab[opc];
	return instr && (instr[6]>=0 || instr[7]>=0 || instr[8]>=0);
}

function hasWordMode(opc) {
	var instr=instrtab[opc];
	return instr && (instr[3]>=0 || instr[4]>=0 || instr[5]>=0);
}

function symToArgs(sym, ofs) {
	var args=[], chunk;
	for (var i=ofs; i<sym.length; i++) {
		var s=sym[i], quote=false, k=0;
		chunk='';
		while (k<s.length) {
			var c=s.charAt(k++);
			if (c=='"') {
				chunk+='"';
				quote=!quote;
				if (!quote) {
					args.push(chunk);
					chunk='';
				}
			}
			else if (!quote) {
				if (c==' ' || c=='\t') continue;
				if (c==',') {
					if (chunk.length) args.push(chunk);
					chunk='';
				}
				else {
					chunk+=c;
				}
			}
			else {
				chunk+=c;
			}
		}
		if (chunk.length) args.push(chunk);
	}
	return args;
}

function asmPass(_initialAddress) {
	var sym, pict, asm, addrStr, labelStr, srcLnStr,
		headComments=false,
		expressionStartChars = "$%@&'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_*-<>[]().",
		labelStartChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_',
		operatorChars = '+-*/',
		pageHead='',
		pageCnt=1,
		lastDlrPpct=-1,
		repeatInterval,
		repeatSym,
		repeatLine,
		anonMark,
		pragmaMark,
		pragmaLiteral,
		warning;

	if (pass==1) {
		anonymousTargets=[];
		anonymousTargetsFwd=[];
		anonymousTargetsBwd=[];
	}
	noList=false;
	optAutoZpg=true;
	convertPi=unifiedPETSCII? true:false;
	charEncoding=unifiedPETSCII? encodePetscii:encodeAscii;
	srcl=srcc=pc=srcLnNo=0;
	isHead=true;
	longSymbolNames=false;
	comment='';
	labelStr='';
	anonMark='';
	repeatCntr=repeatStep=repeatInterval=0;
	sym=getSym();

	function setRepeat(interval, step) {
		repeatSym=[];
		for (var i=0; i<sym.length; i++) repeatSym.push(sym[i]);
		repeatInterval=interval||0;
		repeatStep=step||1;
		repeatCntr=-1;
		repeatLine=rawLine.replace(/^.*?\.REPEAT\s+\S+\s*(STEP\s+\S+\s*)?/i, '');
	}
	function nextSyms() {
		if (repeatInterval>0) {
			if (++repeatCntr>=repeatInterval) {
				repeatInterval=repeatStep=repeatCntr=0;
			}
			else {
				sym=[];
				for (var i=0; i<repeatSym.length; i++) sym.push(repeatSym[i]);
				rawLine=repeatLine;
				return;
			}
		}
		sym=getSym();
	}
	function getAnonymousTarget(targetSym) {
		var offset=0,
			acmeMode = targetSym.charAt(0)=='+' || targetSym.charAt(0)=='-',
			pict;
		if (acmeMode) pict='';
		else pict=pass==1? targetSym.charAt(0):'!';
		while (targetSym.charAt(0)=='!' || targetSym.charAt(0)==':') targetSym=targetSym.substring(1);
		for (var i=0; i<targetSym.length; i++) {
			var c=targetSym.charAt(i);
			pict+=c;
			if (c=='+') {
				if (offset<0) return { 'pict': pict, 'error': 'illegal sign reversal in offset operand' };
				offset++;
			}
			else if (c=='-') {
				if (offset>0) return { 'pict': pict, 'error': 'illegal sign reversal in offset operand' };
				offset--;
			}
			else {
				return { 'pict': pict, 'error': 'unexpected character in offset operand' };
			}
		}
		if (offset==0) return { 'pict': pict, 'error': 'missing qualifier in offset operand, "+" or "-" expected' };
		if (pass==1) return { 'pict': pict, 'error': false };
		var idx = 0, targetList, listName;
		if (acmeMode) {
			if (offset<0) {
				targetList = anonymousTargetsBwd;
				listName = ' backward';
			}
			else {
				targetList = anonymousTargetsFwd;
				listName = ' forward';
			}
		}
		else {
			targetList = anonymousTargets;
			listName = '';
		}
		if (targetList.length==0) return { 'pict': pict, 'error': 'out of range, no anonymous'+listName+' targets defined' };
		while (idx<targetList.length && targetList[idx]<=pc) idx++;
		idx--;
		if (offset<0) offset++;
		idx+=offset;
		if (idx<0 || idx>=targetList.length) {
			return { 'pict': pict, 'error': 'anonymous offset out of range,\nno such anonymous'+listName+' label.' };
		}
		return { 'pict': pict, 'error': false, 'address': targetList[idx] };
	}
	function logError(e, message, isWarning) {
		var lines=message.split('\n'),
			prefix = isWarning? '####  ':'****  ',
			separator = isWarning? ' ## ':' ** ';
		if (isWarning && !warning) warnings++;
		logLine(!isWarning, true);
		listing+=prefix+e+separator+lines[0]+'\n';
		for (var i=1; i<lines.length; i++) {
			listing+=prefix+lines[i]+'\n';
		}
	}
	function logLine(excludeComments, isError) {
		if (!noList || isError || warning) {
			var s;
			while (addrStr.length<6) addrStr+=' ';
			if (pass==2) {
				s=addrStr+asm;
			}
			else {
				srcLnStr=''+srcLnNo;
				while (srcLnStr.length<4) srcLnStr=' '+srcLnStr;
				s=srcLnStr+'  '+addrStr;
			}
			while (s.length<logAddrStop) s+=' ';
			if (anonMark) s+=anonMark;
			while (s.length<logLblStop) s+=' ';
			s+=labelStr;
			while (s.length<logAsmStop) s+=' ';
			listing+=s+' '+pict;
			if (comment && !excludeComments) {
				if (pict) listing+=' ';
				listing+= comment;
				comment='';
			}
			listing+='\n';
		}
		addrStr=asm=pict='';
		labelStr='';
		anonMark='';
		if (warning) {
			listing+='####  warning: '+warning+'\n      \u203E\u203E\u203E\u203E\u203E\u203E\u203E\n';
			warning='';
			warnings++;
		}
	}

	if (typeof _initialAddress === 'number') pc = minCodeAddr = _initialAddress & 0xffff;
	else minCodeAddr = 0;
	if (minCodeAddr) {
		var startAddrString = getHexWord(pc);
		listing+='>>>>  '+startAddrString+'                   ;entering at $'+startAddrString+'\n';
	}

	while (sym) {
		addrStr=pict=asm='';
		if (sym.length==0) {
			if (comment) {
				if (isHead) {
					if (pass==1) {
						srcLnStr=''+srcLnNo;
						while (srcLnStr.length<4) srcLnStr=' '+srcLnStr;
						listing+=srcLnStr+'               '+comment+'\n';
					}
					else {
						listing+='                   '+comment+'\n';
					}
					if (!pageHead) pageHead=comment;
					headComments=true;
				}
				else if (!noList) logLine();
				comment='';
			}
			nextSyms();
			continue;
		}
		if (isHead) {
			if (headComments) listing+='\n';
			isHead=false;
		}
		pc&=0xffff;
		if (pc > ADDR_MAX ) {
			logError(ET_C,'program out of bounds at $' + getHexWord(pc)
				+ '.\n(max. RAM address: $' + getHexWord(ADDR_MAX)+')');
			return false;
		}
		if (pc < minCodeAddr) {
			logError(ET_C,'program out of bounds at $' + getHexWord(pc)
				+ '.\n(min. code address in context: $' + getHexWord(minCodeAddr)+')');
			return false;
		}
		var ofs=0,
			c0=sym[0].charAt(0),
			v,
			pragma = '',
			hasLabel = '';

		if ((c0=='!' || c0==':' || c0=='+' || c0=='-') && sym[ofs].length==1) {
			addrStr=getHexWord(pc);
			anonMark=(pass==1 || c0=='+' || c0=='-'? c0:'!');
			if (pass==1) {
				if (c0=='-') anonymousTargetsBwd.push(pc);
				else if (c0=='+') anonymousTargetsFwd.push(pc);
				else anonymousTargets.push(pc);
			}
			if (sym.length>ofs+1 && sym[ofs+1]!='.OPT') {
				rawLine=rawLine.replace(c0,'');
				sym.shift();
				c0=sym[ofs].charAt(0);
			}
			else {
				logLine();
				nextSyms();
				continue;
			}
		}

		if (/^[A-Z_@]/.test(c0) && sym.length > ofs+1 && /^(\.|\*|P%)/.test(sym[ofs+1])) {
			var identRaw=sym[ofs], labelPrefix='';
			if (c0=='@') {labelPrefix=c0;identRaw=identRaw.substr(1);}
			if (instrtab[identRaw.replace(/\.\w+$/,'')]==null) {
				var r=getIdentifier(identRaw, 0, true);
				ident=r.v;
				if (pass==1) {
					if (r.idx!=identRaw.length) {
						var parsed=identRaw.substring(0,r.idx),
							illegalChar=identRaw.charAt(r.idx),
							message = 'illegal character "'+illegalChar+'"';
						pict+=labelPrefix+parsed+illegalChar;
						logError(ET_P,message);
						return false;
					}
					if (ident=='') {
						pict=sym[ofs];
						logError(ET_S,'invalid identifier');
						return false;
					}
					if (symtab[ident] && !redefSyms) {
						pict+=c0=sym[ofs].charAt(0);;
						logError(ET_P,'label already defined');
						return false;
					}
				}
				addrStr=getHexWord(pc);
				labelStr=labelPrefix+ident+' ';
				if (ident.length && ident.indexOf('%')==ident.length-1) {
					logError(ET_S,'assignment expected');
					return false;
				}
				rawLine=rawLine.replace(new RegExp(sym[ofs], 'i'),'');
				if (pass==1) {
					symtab[ident]={ 'v': pc, 'isWord': false, 'pc': pc, 'labeled': true };
					hasLabel=ident;
				}
				sym.shift();
				c0=sym[ofs].charAt(0);
				if (sym[ofs] === '.OPT' || sym[ofs] === '!OPT') {
					logLine();
					pict=labelStr=anonMark='';
				}
			}
		}

		pragmaMark=pragmaLiteral='';
		if (c0=='.' || c0=='!') {
			pragmaLiteral=c0;
			pragmaMark=pass==1? c0:'.';
			pict+=pragmaMark;
			pragma=sym[0].substr(1);
			if (!pragma) {
				logError(ET_S,'pragma expected');
				return false;
			}
		}
		else if (sym[0]=='*' || sym[0]=='P%') {
			pragma=sym[0];
		}
		else if (code.length==0 && sym[0]=='PROCESSOR' && (sym[1]=='6502' || sym[1]=='6510')) {
			pict=sym.join(' ');
			asm='-IGNORED';
			logLine();
			nextSyms();
			continue;
		}
		if (pragma=='PETSTART' || pragma=='BASICSTART') {
			if (code.length) {
				logError(ET_C, '"'+pragmaMark+pragma+'" must be the first instruction.');
				return false;
			}
			if (typeof _initialAddress === 'number') {
				logError(ET_C, 'illegal context for "'+pragmaMark+pragma+'", already in continuation mode.');
				return false;
			}
			var basicLineNo='',
				remText='',
				lineLengthMax=88,
				lineNumberMax='63999',
				//basicAddr=pragma=='PETSTART'? 0x0401:0x0801,
				basicAddr = 0x0401;
				var rem=[],
				linkAddr,
				ofs=1;
			pc=basicAddr;
			addrStr=getHexWord(pc);
			pict=pragmaMark+pragma;
			if (sym[1] && (/^[0-9]+$/).test(sym[1])) {
				basicLineNo=sym[1];
				ofs++;
				pict+=' '+basicLineNo;
			}
			if (sym[ofs] && sym[ofs].charAt(0)!='"') {
				pict+=' '+sym[ofs].charAt(0);
				logError(ET_S, basicLineNo? 'string expected':'line number or string expected');
				return false;
			}
			while (sym[ofs]) {
				remText+=sym[ofs++].replace(/^"/,'').replace(/"\s*,?$/,'').replace(/","/g, '\\n');
				if (sym[ofs]==',') ofs++;
				if (sym[ofs]) {
					sym[ofs]=sym[ofs].replace(/^,\s*/,'');
					if (sym[ofs].charAt(0)!='"') {
						pict+=' "'+remText.replace(/\\n/g, '", "')+'", '+sym[ofs].charAt(0);
						logError(ET_S,'string expected');
						return false;
					}
					remText+='\\n';
				}
			}
			if (!basicLineNo || basicLineNo>lineNumberMax) basicLineNo=''+(new Date()).getFullYear();
			if (remText) {
				pict+=' "';
				var cnt=0, t=[];
				for (var i=0; i<remText.length; i++) {
					var c=remText.charAt(i), cc=remText.charCodeAt(i);
					pict+=c;
					if (cc==0x03C0) cc=0xff; //pi
					if (cc>0xff) {
						logError(ET_P, 'illegal character');
						return false;
					}
					if (c=='\\' && remText.charAt(i+1)=='n') {
						pict+='n';
						i++;
						cnt=0;
						rem.push(t);
						t=[];
						continue;
					}
					if (++cnt>80) {
						logError(ET_C, 'REM line too long (80 characters max.)');
						return false;
					}
					t.push(encodePetscii(cc));
				}
				if (t.length) rem.push(t);
				pict+='"';
				if (parseInt(basicLineNo,10)<rem.length) basicLineNo=''+rem.length;
			}
			logLine();
			if (pass==2) listing+='>>>>  COMPILING BASIC PREAMBLE...\n';
			if (rem.length) {
				for (var ln=0; ln<rem.length; ln++) {
					var remLine=rem[ln];
					linkAddr=pc+7+remLine.length;
					if (pass==2) {
						var linkLo=linkAddr&0xff,
							linkHi=linkAddr>>8
							lnLo=ln&0xff,
							lnHi=ln>>8,
						addrStr=getHexWord(pc);
						compile(pc++, linkLo);
						compile(pc++, linkHi);
						asm=getHexByte(linkLo)+' '+getHexByte(linkHi);
						pict='$'+getHexWord(linkAddr)+' ;LINE LINK';
						logLine();
						addrStr=getHexWord(pc);
						compile(pc++, lnLo);
						compile(pc++, lnHi);
						asm=getHexByte(lnLo)+' '+getHexByte(lnHi);
						pict='$'+getHexWord(ln)+' ;LINE NO. ("'+ln+'")';
						logLine();
						addrStr=getHexWord(pc);
						compile(pc++, 0x8f);
						compile(pc++, 0x20);
						asm='8F 20';
						pict=';TOKEN REM, " "';
						logLine();
						addrStr=getHexWord(pc);
						asm='';
						pict=';TEXT "';
						for (var i=0; i<remLine.length; i++) {
							var remchr=remLine[i];
							compile(pc++, remchr);
							asm+=(asm? ' ':'')+getHexByte(remchr);
							pict+=remchr>=0x20 && remchr<=0x7E? String.fromCharCode(remchr):'.';
							if ((i+1)%3==0) {
								pict+='"';
								logLine();
								addrStr=getHexWord(pc);
								asm='';
								pict=';TEXT "';
							}
						}
						if (asm) {
							pict+='"';
							logLine();
						}
						addrStr=getHexWord(pc);
						compile(pc++, 0);
						asm='00';
						pict='$00   ;EOL';
						logLine();
					}
					pc=linkAddr;
				}
			}
			addrStr=getHexWord(pc);
			linkAddr=pc+11;
			cbmStartAddr=linkAddr+2;
			if (pass==2) {
				var linkLo=linkAddr&0xff,
					linkHi=linkAddr>>8,
					ln=parseInt(basicLineNo,10),
					lnLo=ln&0xff,
					lnHi=ln>>8,
					saStr=''+cbmStartAddr;
				addrStr=getHexWord(pc);
				compile(pc++, linkLo);
				compile(pc++, linkHi);
				asm=getHexByte(linkLo)+' '+getHexByte(linkHi);
				pict='$'+getHexWord(linkAddr)+' ;LINE LINK';
				logLine();
				addrStr=getHexWord(pc);
				compile(pc++, lnLo);
				compile(pc++, lnHi);
				asm=getHexByte(lnLo)+' '+getHexByte(lnHi);
				pict='$'+getHexWord(ln)+' ;LINE NO. ("'+basicLineNo+'")';
				logLine();
				addrStr=getHexWord(pc);
				compile(pc++, 0x9e);
				compile(pc++, 0x20);
				asm='9E 20';
				pict=';TOKEN SYS, " "';
				logLine();
				addrStr=getHexWord(pc);
				asm='';
				pict=';TEXT "';
				for (var i=0, max=saStr.length-1; i<=max; i++) {
					var c=saStr.charAt(i), cc=saStr.charCodeAt(i);
					compile(pc++, cc);
					asm+=(asm? ' ':'')+getHexByte(cc);
					pict+=c;
					if ((i+1)%3==0) {
						if (i==max) pict+='"';
						logLine();
						addrStr=getHexWord(pc);
						asm='';
						pict=';TEXT "';
					}
				}
				if (asm) {
					pict+='"';
					logLine();
				}
				addrStr=getHexWord(pc);
				compile(pc++, 0);
				asm='00';
				pict='$00   ;EOL';
				logLine();
				addrStr=getHexWord(pc);
				compile(pc++, 0);
				compile(pc++, 0);
				asm='00 00';
				pict='$0000 ;END OF BASIC TEXT (EMPTY LINK)';
				logLine();
			}
			pc=cbmStartAddr;
			if (pass==2) listing+='>>>>  START OF ASSEMBLY AT $'+getHexWord(pc)+' ("SYS '+cbmStartAddr+'")\n';
			else if (hasLabel) symtab[hasLabel]={ 'v': pc, 'isWord': true, 'pc': pc };
			nextSyms();
			continue;
		}

		if ((pragma=='*' || pragma=='ORG' || pragma=='RORG') || pragma=='P%') {
			// set pc
			pict=(pragma=='ORG' || pragma=='RORG'? pragmaMark:'')+pragma;
			var assignmentRequired = (pragma=='*' || pragma=='P%');
			ofs=1;
			if (sym.length>1 && (sym[1]=='=' || sym[1]=='EQU')) {
				pict+=' '+sym[1];
				ofs++;
			}
			else if (assignmentRequired) {
				if (sym.length>1) pict+=' '+sym[1].charAt(0);
				logError(ET_S, 'assignment expected');
				return false;
			}
			if (sym.length<=ofs) {
				logError(ET_S, 'expression expected');
				return false;
			}
			pict+=' ';
			var expr=sym[ofs];
			var r=getExpression(expr, pc), fillbyte=-1;
			pict+=r.pict;
			if (r.undef) { logError(r.et||ET_P, 'undefined symbol "'+r.undef+'"'); return false; }
			if (r.error) { logError(r.et||ET_P, r.error); return false; }
			if (sym.length > ofs+1) {
				var flbr=getExpression(sym[++ofs], pc);
				pict+=' '+flbr.pict;
				if (flbr.error) { logError(flbr.et||ET_P, flbr.error); return false; }
				fillbyte=flbr.v&0xff;
			}
			if (sym.length > ofs+1) {
				pict+=' '+sym[ofs+1].charAt(0);
				logError(ET_S, 'unexpected extra characters'); return false;
			}
			addrStr=getHexWord(r.v);
			if (pass==2) {
				if (r.error) { logError(r.et||'error', r.error); return false; }
				pict=pcSymbol+' = '+hexPrefix+addrStr;
				if (fillbyte>=0) pict+=' '+hexPrefix+getHexByte(fillbyte);
				asm='';
				if (fillbyte>=0) fill(r.v, pc, fillbyte);
			}
			pc=r.v;
			if (pass==1 && hasLabel) {
				symtab[hasLabel]={ 'v': pc, 'isWord': pc<0x100, 'pc': pc };
			}
			logLine();
			nextSyms();
			continue;
		}

		if (pragma) {
			if (pragma=='END') {
				pict+=pragma;
				logLine();
				return true;
			}
			else if (pragma=='OPT') {
				pict+='OPT';
				if (sym.length >= 2) {
					var opt=sym[1];
					pict+=' '+opt;
					if (opt=='ZPGA' || opt=='ZPA' || opt=='ZPG') {
						optAutoZpg=true;
						asm='-AUTO-ZPG ON';
					}
					else if (opt=='WORDA') {
						optAutoZpg=false;
						asm='-AUTO-ZPG OFF';
					}
					else if (opt=='PETSCII' || opt=='PETSCI' || opt=='PET') {
						charEncoding=encodePetscii;
						convertPi=true;
						asm='-ENC. PETSCII';
						if (pass==2) pragma='PETSCII';
					}
					else if (opt=='ASCII') {
						if (unifiedPETSCII) {
							asm='-IGNORED (always PETSCII)';
						}
						else {
							charEncoding=encodeAscii;
							convertPi=false;
							asm='-ENC. ASCII';
						}
					}
					else if (opt=='PETSCR' || opt=='C64SCR' || opt=='SCR' || opt=='SCREEN') {
						charEncoding=encodeCommodoreScreenCode;
						convertPi=true;
						asm='-ENC. '+opt;
					}
					else if (
						opt=='ILLEGALS' || opt=='NOILLEGALS' || opt=='NOILLEGA' ||
						opt=='LEGALS' || opt=='LEGALSONLY' || opt=='LEGALSON'
					) {
						useIllegals=opt=='ILLEGALS';
						instrtab = useIllegals? instrAll:instrLegals;
						asm='-ILLEGALS '+(useIllegals? 'ON':'OFF');
					}
					else if (opt=='REDEF' || opt=='NOREDEF') {
						redefSyms=opt=='REDEF';
						asm='-REDEF SYMBOLS '+(redefSyms? 'ON':'OFF');
					}
					else if (opt=='LIST' || opt=='NOLIST') {
						if (opt=='NOLIST') {
							asm='-LIST OFF';
							logLine();
							noList=true;
							nextSyms();
							continue;
						}
						else {
							asm='-LIST ON';
							noList=false;
						}
					}
					else if (opt=='LONGNAMES') {
						asm='-LONG NAMES ON';
						longSymbolNames = true;
					}
					else if (
						opt=='XREF' || opt=='NOXREF' ||
						opt=='COUNT' || opt=='NOCOUNT' ||
						opt=='CNT' || opt=='NOCNT' ||
						opt=='MEMORY' || opt=='NOMEMORY' ||
						opt=='GENERATE' || opt=='NOGENERATE' || opt=='NOGENERA'
					) {
						// MOS cross-assembler directives
						asm='-IGNORED';
					}
					else if (opt=='TO') {
						// ACME
						asm='-IGNORED';
					}
					else {
						logError(ET_S, 'invalid option');
						return false;
					}
					if (sym.length > 2) {
						pict+=' '+sym[2].charAt(0);
						logError(ET_S, 'unexpected extra characters');
						return false;
					}
					logLine();
				}
				else {
					logError(ET_S, 'option expected');
					return false;
				}
				nextSyms();
				continue;
			}
			else if (
				(pragma=='WORD' || pragma=='DBYTE' || pragma=='DBYT' || pragma=='WO' ||
				 pragma=='BYTE' || pragma=='BYT' || pragma=='DCB' || pragma=='DB' || pragma=='BY') && sym.length>=2 && sym[1].charAt(0)!='"'
			) {
				if (sym.length>=2) {
					var isFirst=true;
					var args=symToArgs(sym,1);
					for (var j=0; j<args.length; j++) {
						var arg=args[j];
						if (!arg) continue;
						if (isFirst) isFirst=false;
						v=0;
						addrStr=getHexWord(pc);
						pict=pragmaMark+pragma+' ';
						var a1=arg.charAt(0);
						if (a1=='#') {
							// ignore literal value prefix
							pict+='#';
							arg=arg.substr(1);
							a1=arg.charAt(0);
						}
						if (arg=='*' || arg=='P%') {
							pict+=arg;
							v=pc;
						}
						if (arg) {
							var r=getExpression(arg, pc);
							pict+=r.pict;
							if (r.error) {
								if (a1=='\'' && r.pict.length==3 && r.error=='unexpected token, figure or operator expected')
										r.error+='\n(use double quotes to embed strings)';
								logError(r.et||ET_P, r.error);
								return false;
							}
							v=r.v;
						}
						if (pass==2) {
							v&=0xffff;
							var lb=(v>>8)&0xff;
							var rb=v&0xff;
							if (pragma=='WORD' || pragma=='WO') { // big endian
								compile(pc, rb);
								compile(pc+1, lb);
								asm=getHexByte(rb)+' '+getHexByte(lb);
								pict=pragmaMark+'WORD '+hexPrefix+getHexWord(v);
							}
							else if (pragma=='DBYTE' || pragma=='DBYT') { // little endian
								compile(pc, lb);
								compile(pc+1, rb);
								asm=getHexByte(lb)+' '+getHexByte(rb);
								pict=pragmaMark+'DBYTE '+hexPrefix+getHexWord(v);
							}
							else { // single byte
								compile(pc, rb);
								asm=getHexByte(rb);
								pict=pragmaMark+'BYTE '+hexPrefix+getHexByte(rb);
							}
						}
						logLine();
						pc+=(pragma=='BYTE' || pragma=='BYT' || pragma=='DCB' || pragma=='DB' || pragma=='BY')? 1:2;
					}
					nextSyms();
					continue;
				}
				else if (sym.length==1) {
					addrStr=getHexWord(pc);
					pict+=pragma;
					logError(ET_S,'expression expected');
					return false;
				}
			}
			else if ((pragma=='BYTE' || pragma=='BYT' || pragma=='DCB' || pragma=='DB' || pragma=='BY') && sym.length==1) {
				addrStr=getHexWord(pc);
				pict+=pragma;
				logError(ET_S,'expression expected');
				return false;
			}
			else if (
					pragma=='TEXT' || pragma=='TX' || pragma=='ASCII' || pragma=='PET' ||
					pragma=='PETSCII' || pragma=='SCR' || pragma=='SCREEN' ||
					pragma=='PETSCR' || pragma=='C64SCR' ||
					pragma=='BYTE' || pragma=='BYT' ||
					pragma=='DCB' || pragma=='DB' || pragma=='BY' ||
					pragma=='IMG' || pragma=='IMAGE'
			) {
				var cbBuffer=[],
					enc,
					convertPiLocal,
					re= new RegExp('^\\s*'+(pragmaLiteral=='.'?'\\.':pragmaLiteral)+pragma+'\\s*(.*?)\\s*$', 'i'),
					matches=rawLine.match(re),
					txt;
				if (pass==2) {
					if (pragma=='PETSCII' || pragma=='PET' ||(unifiedPETSCII && (pragma=='ASCII' || pragma=='EQUS'))) {
						enc=encodePetscii;
						convertPiLocal=true;
						pragma='PETSCII';
					}
					else if (pragma=='ASCII' || pragma=='EQUS') {
						enc=encodeAscii;
						convertPiLocal=false;
					}
					else if (pragma=='PETSCR' || pragma=='C64SCR' || pragma=='SCR' || pragma=='SCREEN') {
						enc=encodeCommodoreScreenCode;
						convertPiLocal=true;
					}
					else {
						enc=charEncoding;
						convertPiLocal=convertPi;
					}
					if (pragma=='BYT' || pragma=='DCB' || pragma=='DB' || pragma=='BY') pragma='BYTE';
					else if (pragma=='TX') pragma='TEXT';
					else if (pragma=='IMG') pragma='IMAGE';
				}
				else if (unifiedPETSCII && (pragma=='ASCII' || pragma=='EQUS')) {
					pragma='PETSCII';
				}
				addrStr=getHexWord(pc);
				pict+=pragma+' ';
				if (!matches || matches[1].charAt(0)!='"') {
					pict+=matches[1].charAt(0);
					logError(ET_S,'double quote expected');
					return false;
				}
				txt=matches[1].substring(1);
				pict+='"';
				if (pragma=='IMAGE' || pragma=='IMG') {
					var b=0;
					txt=txt.replace(/"$/,'');
					if (pass==1) {
						if (txt.length<8) {
							warning='shifting right for missing bits ('+(8-txt.length)+'), image="';
							for (var k=0; k<8-txt.length; k++) warning+='.';
							warning+=txt+'"';
						}
						else if (txt.length>8) warning='extra ignored ('+(txt.length-8)+'): "'+txt.substring(8)+'"';
					}
					else {
						while (txt.length<8) txt='.'+txt;
					}
					for (var i=0, tmax=Math.min(txt.length,8); i<tmax; i++) {
						var c=txt.charAt(i).toUpperCase();
						if (pass==1) pict+=c;
						else {
							if (c=='X' || c=='#') {
								b|=1<<(7-i);
								pict+='X';
							}
							else {
								pict+='.';
							}
						}
					}
					pict+='"';
					if (pass==2) {
						compile(pc, b);
						asm=getHexByte(b);
					}
					logLine();
				}
				else {
					for (var i=0, tmax=txt.length-1; i<=tmax; i++) {
						var c=txt.charAt(i), cc=c.charCodeAt(0);
						if (convertPiLocal && v==0x03C0) v=0xff; //CBM pi
						if (c=='"') {
							if (i!=tmax) {
								pict+=txt.substring(i+1).replace(/^(\s)?\s*(.).*/,'$1"$2');
								logError(ET_S,'unexpected extra character');
								return false;
							}
							break;
						}
						pict+=c;
						if (cc>0xff) {
							logError(ET_P, 'illegal character');
							return false;
						}
						if (pass==2) {
							cc=enc(cc);
							cbBuffer.push(getHexByte(cc));
							compile(pc, cc);
							if (cbBuffer.length==3) {
								asm=cbBuffer.join(' ');
								cbBuffer.length=0;
								if (i==tmax-1 && txt.charAt(tmax)=='"') pict+='"';
								logLine();
								addrStr=getHexWord(pc+1);
								pict+=pragmaMark+pragma+' "';
							}
						}
						else if (i%40==39) {
							logLine();
							addrStr=getHexWord(pc);
							pict+=pragmaMark+pragma+' "';
						}
						pc++;
					}
					pict+='"';
					if (pass==1 && i%40!=39) logLine();
					if (pass==2 && cbBuffer.length) {
						asm=cbBuffer.join(' ');
						logLine();
					}
				}
				nextSyms();
				continue;
			}
			else if (pragma=='ALIGN' || pragma=='FILL') {
				var pcOffset=2,
					fillbyte=0,
					delta;
				pict+=pragma;
				if (sym.length>ofs+1) {
					pict+=' ';
					var r=getExpression(sym[++ofs], pc);
					if (r.error) {
						pict+=r.pict;
						logError(r.et||ET_P, r.error);
						return false;
					}
					pcOffset=r.v&0xffff;
					pict+=pass==1?r.pict:hexPrefix+(r.v<0x100? getHexByte(pcOffset):getHexWord(pcOffset));
					if (sym.length>ofs+1) { // fill-byte
						pict+=' ';
						var r=getExpression(sym[++ofs], pc);
						if (r.error) {
							pict+=r.pict;
							logError(r.et||ET_P, r.error);
							return false;
						}
						fillbyte=r.v&0xff;
						pict+=pass==1?r.pict:hexPrefix+getHexByte(fillbyte);
					}
				}
				else if (pragma=='FILL') {
					logError(ET_S,'expression expected');
					return false;
				}
				if (sym.length > ofs+1) {
					pict+=' '+sym[ofs+1].charAt(0);
					logError(ET_S, 'unexpected extra characters');
					return false;
				}
				else if (pragma=='FILL') {
					if (pcOffset<0) {
						logError(ET_C, 'negative offset value');
						return false;
					}
					delta=pcOffset;
				}
				else {
					delta=pcOffset-(pc%pcOffset);
				}
				addrStr=getHexWord(pc);
				if (delta) {
					var pc1=pc+delta;
					if (pass==2) {
						if (codeStart>=0x10000) codeStart=pc;
						fill(pc1, pc, fillbyte);
					}
					pc=pc1;
				}
				logLine();
				nextSyms();
				continue;
			}
			else if (pragma=='REPEAT') {
				pict+=pragma;
				if (repeatInterval>0) {
					logError(ET_P,'already repeating');
					return false;
				}
				var interval=0, step=1;
				sym.shift();
				var temp=sym.shift();
				if (!temp) {
					logError(ET_S,'expression expected');
					return false;
				}
				pict+=' ';
				var rt=getExpression(temp, pc);
				if (rt.error || rt.undef) {
					pict+=rt.pict;
					if (rt.undef) logError(ET_P, 'undefined symbol "'+rt.undef+'"');
					else logError(rt.et||ET_P, rt.error);
					return false;
				}
				if (rt.v<0) {
					pict+=temp;
					logError(ET_C, 'illegal interval (n<0)');
					return false;
				}
				if (pass==1) pict+=temp;
				else pict+=' '+hexPrefix+(rt.v<0x100? getHexByte(rt.v):getHexWord(rt.v));
				interval=temp;
				if (sym[0]=='STEP') {
					pict+=' STEP';
					sym.shift();
					temp=sym.shift();
					if (!temp) {
						logError(ET_S,'expression expected');
						return false;
					}
					pict+=' ';
					rt=getExpression(temp, pc);
					if (rt.error || rt.undef) {
						pict+=rt.pict;
						if (rt.undef) logError(ET_P, 'undefined symbol "'+rt.undef+'"');
						else logError(rt.et||ET_P, rt.error);
						return false;
					}
					if (rt.v<1) {
						pict+=temp;
						logError(ET_C, 'illegal step increment (n<1)');
						return false;
					}
					if (pass==1) pict+=temp;
					else pict+=' '+hexPrefix+(rt.v<0x100? getHexByte(rt.v):getHexWord(rt.v));
					step=temp;
				}
				if (sym.length==0) {
					if (pass==1) logError('warning', 'nothing to repeat', true);
				}
				else {
					logLine();
					setRepeat(interval, step);
				}
				nextSyms();
				continue;
			}
			else if (pragma=='SKIP' || pragma=='PAGE') {
				if (pass==1) {
					pict+=pragma;
					logLine();
				}
				else {
					if (comment) logLine();
					else listing+='\n';
					if (pragma=='PAGE') {
						listing+='                   '+(pageHead||commentChar+'page')+'  ';
						listing+='('+(++pageCnt)+')\n\n';
					}
				}
				nextSyms();
				continue;
			}
			else if (pragma=='LIST' || pragma=='NOLIST') {
				if (pragma=='LIST') {
					pict+=pragma;
					noList=false;
					logLine();
				}
				if (pragma=='NOLIST') {
					pict+=pragma;
					logLine();
					noList=true;
				}
				nextSyms();
				continue;
			}
			else if (pragma=='DATA') {
				if (pass==1) {
					pict+=sym.join(' ');
					labelStr='-ignored';
					logLine();
				}
				nextSyms();
				continue;
			}
			else {
				pict+=pragma;
				if (pragmaLiteral == '!' && pragma.charAt(0)=='!') logError(ET_S,'invalid pragma or anonymous label');
				else logError(ET_S,'invalid pragma');
				return false;
			}
		}

		var identRaw, identCooked, labelPrefix='';
		if ((sym.length-ofs<2 || sym[ofs+1].charAt(0)!='=') && c0=='@') {
			if (pass == 1) labelPrefix=c0;
			identRaw=sym[ofs].substr(1);
			if (!identRaw) {
				pict+=c0;
				logError(ET_S, 'name character expected');
				return false;
			}
		}
		else identRaw = sym[ofs];

		identCooked=identRaw.indexOf('.')==0? '.'+identRaw.substring(1).split(/[\.\+]/)[0]:identRaw.split(/[\.\+]/)[0];
		if (identCooked && instrtab[identCooked]==null) {
			// identifier
			var r=getIdentifier(identRaw, 0, true),
				ident=r.v;
			if (pass==1) {
				if (r.idx!=identRaw.length) {
					var parsed=identRaw.substring(0,r.idx),
						illegalChar=identRaw.charAt(r.idx),
						message = 'illegal character "'+illegalChar+'"';
					pict+=labelPrefix+parsed+illegalChar;
					if (parsed=='P' && illegalChar=='%') message+='\n\nmeant assignment to P%?';
					logError(ET_P,message);
					return false;
				}
				if (ident=='' || identCooked!=identRaw) {
					pict=sym[0];
					logError(ET_S,'invalid identifier');
					return false;
				}
				if (symtab[ident] && !redefSyms) {
					pict+=sym[0];
					if (sym[1]=='=') {
						pict+=' =';
						logError(ET_P,'symbol already defined');
					}
					else {
						logError(ET_P,'label already defined');
					}
					return false;
				}
			}
			ofs++;
			if (sym.length>1 && sym[ofs]=='=') {
				pict=ident+' '+sym[ofs]+' ';
				ofs++;
				if (sym.length<=ofs) {
					logError(ET_S, 'unexpected end of line, expression expected');
					return false;
				}
				var arg=sym[ofs],
					a1=arg.charAt(0);
				if (arg=='*' || arg=='P%') {
					pict+=pass==1?arg:pcSymbol;
					r={ 'v': pc, 'isWord': false, 'pc': pc };
				}
				else {
					var r=getExpression(arg, pc);
					pict+=r.pict;
					if (r.error) {
						logError(r.et||ET_P, r.error);
						return false;
					}
					if (r.undef) {
						logError(r.et||ET_C, 'undefined symbol "'+r.undef+'"');
						return false;
					}
				}
				ofs++;
				if (sym.length>ofs) {
					if (sym.length==ofs+1 && sym[ofs]=='W') { // ignore 'W' suffix
						pict+=' '+commentChar+'w';
					}
					else {
						pict+=' '+sym[ofs].charAt(0);
						logError(ET_S,'unexpected extra characters');
						return false;
					}
				}
				if (pass==1) {
					symtab[ident]=r;
				}
				else {
					if (r.isWord || r.v>0xff) {
						asm=ident+' = '+hexPrefix+getHexWord(r.v);
					}
					else {
						asm=ident+' = '+hexPrefix+getHexByte(r.v);
					}
					pict=asm;
					asm='';
				}
				if (ident=='A' && pass==1) logError('warning', 'symbol "A" may be ambiguous in address context.', true);
				else logLine();
				nextSyms();
				continue;
			}
			else {
				addrStr=getHexWord(pc);
				labelStr=labelPrefix+ident+' ';
				if (ident.length && ident.indexOf('%')==ident.length-1) {
					logError(ET_S,'assignment expected');
					return false;
				}
				if (pass==1) symtab[ident]={ 'v': pc, 'isWord': false, 'pc': pc, 'labeled': true };
				if (sym.length>=ofs+1) {
					c0=sym[ofs].charAt(0);
				}
				else {
					logLine();
					nextSyms();
					continue;
				}
			}
		}

		if (sym.length<ofs) {
			// end of line
			logLine();
			nextSyms();
			continue;
		}

		if (ofs==0) addrStr=getHexWord(pc);

		if (c0<'A' || c0>'Z') {
			if (!useIllegals && instrAll[sym[Math.max(0,ofs-1)]]) {
				pict+=sym[ofs];
				logError(ET_S,'character expected.\n\nmeant to activate illegal opcodes?\n-> use ".OPT ILLEGALS"');
			}
			else {
				pict+=c0;
				if (ofs>0) logError(ET_S,'character or assignment operator expected');
				else logError(ET_S,'character expected');
			}
			return false;
		}
		else {
			// opcode
			var opc=sym[ofs], extParts=sym[ofs].split(/([\.\+\-])/), ext='', opctab, instr, addr, mode=0;
			if (extParts.length>1) {
				var lsym=extParts.shift(),
					rsym=extParts.join('');
				if ((rsym=='.B' || rsym=='.BYTE' || rsym=='.BY' || rsym=='+1') && hasZpgMode(lsym)) {
					pict+=(pass==1)?lsym+rsym.toLowerCase():lsym;
					ext='byte';
					opc=lsym;
				}
				else if ((rsym=='.W' || rsym=='.WORD' || rsym=='.WO' || rsym=='+2') && hasWordMode(lsym)) {
					pict+=(pass==1)?lsym+rsym.toLowerCase():lsym;
					ext='word';
					opc=lsym;
				}
				else {
					pict+=opc;
					if (rsym.length==1) {
						logError(ET_C,'invalid extension: quantifyer expected');
					}
					if (rsym=='.B' || rsym=='.BYTE' || rsym=='.W' || rsym=='.WORD' || rsym=='.BY' || rsym=='.WO' || rsym=='+2' || rsym=='+3') {
						logError(ET_C,'invalid extension '+rsym+' for opcode '+lsym);
					}
					else {
						logError(ET_S, 'invalid extension format: '+opc);
					}
					return false;
				}
			}
			else pict+=opc;
			opctab=instrtab[opc];
			if (opctab==null) {
				if (!useIllegals && instrAll[opc]) {
					logError(ET_S,'opcode expected.\nmeant to activate illegal opcodes?\n-> use ".OPT ILLEGALS"');
				}
				else {
					logError(ET_S, ofs==0? 'opcode or label expected':'opcode or pragma expected');
				}
				return false;
			}
			addr=sym[ofs+1];
			if (typeof addr=='undefined') {
				// implied
				var addrmode = (opctab[0]<0 && opctab[1]>=0)? 1:0;
				if (addrmode==1 && pass==2) pict+=' A';
				if (opctab[addrmode]<0) {
					logError(ET_S,'unexpected end of line, operand expected');
					return false;
				}
				else if (pass==2) {
					// compile
					asm=getHexByte(opctab[addrmode]);
					compile(pc, opctab[addrmode]);
				}
				logLine();
				pc++;
			}
			else {
				var a1=addr.charAt(0),
					b1=0,
					b2=addr.length,
					coda='';
				if (addr=='A' && opctab[1]>=0) {
					pict+=' A';
					b1=1;
					mode=1;
				}
				else if (a1=='#') {
					pict+=' #';
					b1=1;
					mode=2;
				}
				else if (a1=='*') {
					if ((b2>1 && operatorChars.indexOf(addr.charAt(1))<0) || addr=='**') {
						pict+=' *';
						b1=1;
						mode=6;
					}
					else {
						pict+=' ';
						mode=(opctab[12]<0)? 3:12;
					}
				}
				else if (a1=='(' && (/(,X\)|\),?Y)$/.test(addr) || (opc == 'JMP' && /\)$/.test(addr)))) {
					pict+=' (';
					b1=1;
					mode=9;
				}
				else {
					pict+=' ';
					mode=(opctab[12]<0)? 3:12;
				}
				if (ext) {
					if (ext=='byte' && (mode==3 || mode==6)) {
						mode=6;
					}
					else if (mode!=3) {
						logError(ET_P,'extension conflicts with operand type');
						return false;
					}
				}
				if (mode==9) {
					var b3=addr.lastIndexOf(',X)');
					if (b3>0 && b3==b2-3) {
						mode+=1;
						coda=',X)';
					}
					else {
						b3=addr.lastIndexOf('),Y');
						if (b3>0 && b3==b2-3) {
							mode+=2;
							coda='),Y';
						}
						else {
							b3=addr.lastIndexOf(')Y');
							if (b3>=0 && b3==b2-2) {
								mode+=2;
								coda=pass==1? ')Y':'),Y';
							}
						}
					}
					if (mode==9 && addr.lastIndexOf(')')==b2-1) {
						b3=b2-1;
						coda=')';
					}
					else if (b3<0) {
						pict+=addr;
						logError(ET_S,'invalid address format');
						return false;
					}
					b2=b3;
				}
				else if (mode>2) {
					var b3=addr.indexOf(',X');
					if (b3>0 && b3==b2-2) {
						mode+=1;
						coda=',X';
					}
					else {
						b3=addr.indexOf(',Y');
						if (b3>0 && b3==b2-2) {
							mode+=2;
							coda=',Y';
						}
					}
					if (b3>0) b2=b3;
				}

				instr=opctab[mode];
				if (instr<=-10) {
					// redirect to implicit fallback
					mode = -instr - 10;
					instr=opctab[mode];
				}
				if (instr<0) {
					if (opctab[addrtab.rel]>=0 && mode == addrtab.imm) { //offset literal
						instr=opctab[12];
						mode=13;
					}
					else {
						pict+=addr.substr(b1);
						logError(ET_C,'invalid address mode for '+opc);
						return false;
					}
				}

				// operand
				if ((mode==12 || (opc=='JMP' && mode==3)) && addr && (/^[!\:]/.test(addr) || /^[\-\+]+$/.test(addr))) {
					// anonymous target
					var target=getAnonymousTarget(addr);
					if (target.error) {
						pict+=target.pict;
						logError(pass==1? ET_S:ET_C, target.error);
						return false;
					}
					if (pass==1) {
						pict+=target.pict;
					}
					else {
						oper=target.address;
						pict+=''+hexPrefix+getHexWord(oper);
					}
				}
				else if (mode>1) {
					var expr=addr.substring(b1,b2),
						e0=expr.charAt(0),
						oper=0,
						autoZpg = optAutoZpg && !ext && mode>=3 && mode<=5 && hasZpgMode(opc);
					if (expressionStartChars.indexOf(e0)<0) {
						pict+=e0;
						logError(ET_S,'illegal character');
						return false;
					}
					var r=getExpression(expr, pc);
					if (r.error) {
						pict+=r.pict;
						if (r.undef) {
							logError(r.et||ET_C,'undefined symbol "'+r.undef+'"');
						}
						else {
							logError(r.et||ET_P,r.error);
						}
						return false;
					}
					oper=r.v;
					if (r.isWord) autoZpg=false;
					if (pass===1 && mode===3 && (/^[<>][A-Z]\w*$/).test(expr)) {
						var tempSym=expr.substring(1);
						if (oper<0 || (symtab[tempSym] && symtab[tempSym].labeled)) warning='do you mean "'+opc+' #'+expr+'"?';
					}
					if (autoZpg && oper<0x100 && opctab[mode+3]>=0) mode+=3;
					if (pass==1) {
						pict+=r.pict;
					}
					else if (mode==12) {
						pict+=hexPrefix+getHexWord(oper);
					}
					else if (mode==13) {
						oper&=0xff;
						var opAddr = oper >= 0x80? (pc+2-(0xff-oper+1))&0xffff:(pc+2+oper)&0xffff;
						pict=pict.substring(0,pict.length-1)+hexPrefix+getHexWord(opAddr);
					}
					else {
						pict+=(steptab[mode]>2)? hexPrefix+getHexWord(oper):hexPrefix+getHexByte(oper);
					}
					pict+=coda;
				}
				if (sym.length>ofs+2) {
					pict+=' '+sym[ofs+2].charAt(0);
					logError(ET_S,'unexpected extra characters');
					return false;
				}

				if (pass==2) {
					if (mode==12) {
						// rel
						oper=oper-((pc+2)&0xffff);
						if (oper>127 || oper<-128) {
							logError(ET_C,'branch target out of range');
							return false;
						}
					}
					else if (mode==13) {
						mode=12;
					}
					instr=opctab[mode];
					// compile
					compile(pc, instr);
					asm=getHexByte(instr);
					if (mode>1) {
						var op=oper&0xff;
						compile(pc+1, op);
						asm+=' '+getHexByte(op);
						if (steptab[mode]>2) {
							op=(oper>>8)&0xff;
							compile(pc+2, op);
							asm+=' '+getHexByte(op);
						}
						else if (mode>2 && steptab[mode]==2 && oper>0xff) {
							warning = '16-bit operand '+hexPrefix+getHexWord(oper)+' truncated in single-byte context to '+hexPrefix+getHexByte(oper)+'.';
						}
					}
				}
				logLine();
				pc+=steptab[mode];
			}
		}
		nextSyms();
	}
	return true;
}

return {
	'assemble': assemble
};

})();


//// ARICHIVE FORMATS & PARSING ////

// P00 single file archives

function parseP00(data) {
	var signature = [0x43, 0x36, 0x34, 0x46, 0x69, 0x6C, 0x65, 0]; // "C64File"
	if (data.byteLength < 0x1C) return { 'prg': null, 'addr': 0, 'name': '', 'error': 'Not a P00 file: file too short.' };
	for (var i = 0, l = signature.length; i < l; i++) {
		if (data.getUint8(i) !== signature[i]) return { 'prg': null, 'addr': 0, 'name': '', 'error': 'Not a P00 file: file signature mismatch.' };
	}
	var fName = '';
	for (var i = 8; i < 0x17; i++) {
		var c = data.getUint8(i);
		if (c === 0) break;
		//if (c >= 0x20 && c < 0x80) fName += String.fromCharCode(c);
		//else if (c >= 0xA0) fName += ' ';
		if (c >= 0x20 && c < 0xFF) fName += String.fromCharCode(c);
		else if (c === 0xFF) fName += '\u03C0';
	}
	var addr = data.getUint8(0x1A) | (data.getUint8(0x1B) << 8),
		bytes = [];
	for (var i = 0x1c, l = data.byteLength; i < l; i++) bytes.push(data.getUint8(i));
	return { 'prg': bytes, 'addr': addr, 'name': fName, 'error': null };
}

// D64, D80, D82 disk image parser

function normalizeFileName(fileName) {
	var fileName = fileName.replace(/\.prg$/i, ''),
		upperCaseCnt = (fileName.match(/[A-Z]/g) || []).length,
		lowerCaseCnt = (fileName.match(/[a-z]/g) || []).length;
	if (lowerCaseCnt && lowerCaseCnt >= upperCaseCnt) {
		var t = '';
		for (var i=0; i<fileName.length; i++) {
			var c = fileName.charAt(i);
			if (c >= 'A' && c <= 'Z') t += c.toLowerCase();
			else if (c >= 'a' && c <= 'z') t += c.toUpperCase();
			else t += c;
		}
		return t;
	}
	return fileName;
}

var FDD = (function() {

	var prgPath = 'prgs/',
		data = null,
		dsize = 0,
		sectorsSeen = [],
		dir = [],
		diskImgType,
		diskImgName,
		diskName,
		diskId,
		diskDosType,
		diskDosVersion,
		trackMap,
		dirMap,
		debugInfo = false;

	var trackMaps = { // #track: [sectors, byte-offset]
		'd64': {
			'1':  [21, 0x00000],
			'2':  [21, 0x01500],
			'3':  [21, 0x02A00],
			'4':  [21, 0x03F00],
			'5':  [21, 0x05400],
			'6':  [21, 0x06900],
			'7':  [21, 0x07E00],
			'8':  [21, 0x09300],
			'9':  [21, 0x0A800],
			'10': [21, 0x0BD00],
			'11': [21, 0x0D200],
			'12': [21, 0x0E700],
			'13': [21, 0x0FC00],
			'14': [21, 0x11100],
			'15': [21, 0x12600],
			'16': [21, 0x13B00],
			'17': [21, 0x15000],
			'18': [19, 0x16500],
			'19': [19, 0x17800],
			'20': [19, 0x18B00],
			'21': [19, 0x19E00],
			'22': [19, 0x1B100],
			'23': [19, 0x1C400],
			'24': [19, 0x1D700],
			'25': [18, 0x1EA00],
			'26': [18, 0x1FC00],
			'27': [18, 0x20E00],
			'28': [18, 0x22000],
			'29': [18, 0x23200],
			'30': [18, 0x24400],
			'31': [17, 0x25600],
			'32': [17, 0x26700],
			'33': [17, 0x27800],
			'34': [17, 0x28900],
			'35': [17, 0x29A00],
			'36': [17, 0x2AB00], // non-standard
			'37': [17, 0x2BC00],
			'38': [17, 0x2CD00],
			'39': [17, 0x2DE00],
			'40': [17, 0x2EF00],
			'41': [17, 0x30000], // extended non-standard
			'42': [17, 0x31100]
			},
		'd80': {
			'1': [29, 0x0000],
			'2': [29, 0x1D00],
			'3': [29, 0x3A00],
			'4': [29, 0x5700],
			'5': [29, 0x7400],
			'6': [29, 0x9100],
			'7': [29, 0xAE00],
			'8': [29, 0xCB00],
			'9': [29, 0xE800],
			'10': [29, 0x10500],
			'11': [29, 0x12200],
			'12': [29, 0x13F00],
			'13': [29, 0x15C00],
			'14': [29, 0x17900],
			'15': [29, 0x19600],
			'16': [29, 0x1B300],
			'17': [29, 0x1D000],
			'18': [29, 0x1ED00],
			'19': [29, 0x20A00],
			'20': [29, 0x22700],
			'21': [29, 0x24400],
			'22': [29, 0x26100],
			'23': [29, 0x27E00],
			'24': [29, 0x29B00],
			'25': [29, 0x2B800],
			'26': [29, 0x2D500],
			'27': [29, 0x2F200],
			'28': [29, 0x30F00],
			'29': [29, 0x32C00],
			'30': [29, 0x34900],
			'31': [29, 0x36600],
			'32': [29, 0x38300],
			'33': [29, 0x3A000],
			'34': [29, 0x3BD00],
			'35': [29, 0x3DA00],
			'36': [29, 0x3F700],
			'37': [29, 0x41400],
			'38': [29, 0x43100],
			'39': [29, 0x44E00],
			'40': [27, 0x46B00],
			'41': [27, 0x48600],
			'42': [27, 0x4A100],
			'43': [27, 0x4BC00],
			'44': [27, 0x4D700],
			'45': [27, 0x4F200],
			'46': [27, 0x50D00],
			'47': [27, 0x52800],
			'48': [27, 0x54300],
			'49': [27, 0x55E00],
			'50': [27, 0x57900],
			'51': [27, 0x59400],
			'52': [27, 0x5AF00],
			'53': [27, 0x5CA00],
			'54': [25, 0x5E500],
			'55': [25, 0x5FE00],
			'56': [25, 0x61700],
			'57': [25, 0x63000],
			'58': [25, 0x64900],
			'59': [25, 0x66200],
			'60': [25, 0x67B00],
			'61': [25, 0x69400],
			'62': [25, 0x6AD00],
			'63': [25, 0x6C600],
			'64': [25, 0x6DF00],
			'65': [23, 0x6F800],
			'66': [23, 0x70F00],
			'67': [23, 0x72600],
			'68': [23, 0x73D00],
			'69': [23, 0x75400],
			'70': [23, 0x76B00],
			'71': [23, 0x78200],
			'72': [23, 0x79900],
			'73': [23, 0x7B000],
			'74': [23, 0x7C700],
			'75': [23, 0x7DE00],
			'76': [23, 0x7F500],
			'77': [23, 0x80C00],
			'78': [29, 0x82300],
			'79': [29, 0x84000],
			'80': [29, 0x85D00],
			'81': [29, 0x87A00],
			'82': [29, 0x89700],
			'83': [29, 0x8B400],
			'84': [29, 0x8D100],
			'85': [29, 0x8EE00],
			'86': [29, 0x90600],
			'87': [29, 0x92800],
			'88': [29, 0x94500],
			'89': [29, 0x96200],
			'90': [29, 0x97F00],
			'91': [29, 0x99C00],
			'92': [29, 0x9B900],
			'93': [29, 0x9D600],
			'94': [29, 0x9F300],
			'95': [29, 0xA1000],
			'96': [29, 0xA2D00],
			'97': [29, 0xA4A00],
			'98': [29, 0xA6700],
			'99': [29, 0xA8400],
			'100': [29, 0xAA100],
			'101': [29, 0xA6E00],
			'102': [29, 0xADB00],
			'103': [29, 0xAF800],
			'104': [29, 0xB1500],
			'105': [29, 0xB3200],
			'106': [29, 0xB4F00],
			'107': [29, 0xB6C00],
			'108': [29, 0xB8900],
			'109': [29, 0xBA600],
			'110': [29, 0xBC300],
			'111': [29, 0xBE000],
			'112': [29, 0xBFD00],
			'113': [29, 0xC1A00],
			'114': [29, 0xC3700],
			'115': [29, 0xC5400],
			'116': [29, 0xC7100],
			'117': [27, 0xC8E00],
			'118': [27, 0xCA900],
			'119': [27, 0xCC400],
			'120': [27, 0xCDF00],
			'121': [27, 0xCFA00],
			'122': [27, 0xD1500],
			'123': [27, 0xD3000],
			'124': [27, 0xD4B00],
			'125': [27, 0xD6600],
			'126': [27, 0xD8100],
			'127': [27, 0xD9C00],
			'128': [27, 0xDB700],
			'129': [27, 0xDD200],
			'130': [27, 0xDED00],
			'131': [25, 0xE0800],
			'132': [25, 0xE2100],
			'133': [25, 0xE3A00],
			'134': [25, 0xE5300],
			'135': [25, 0xE6C00],
			'136': [25, 0xE8500],
			'137': [25, 0xE9E00],
			'138': [25, 0xE6700],
			'139': [25, 0xED000],
			'140': [25, 0xEE900],
			'141': [25, 0xF0200],
			'142': [23, 0xF1B00],
			'143': [23, 0xF3200],
			'144': [23, 0xF4900],
			'145': [23, 0xF6000],
			'146': [23, 0xF7700],
			'147': [23, 0xF8E00],
			'148': [23, 0xFA500],
			'149': [23, 0xFBC00],
			'150': [23, 0xFD300],
			'151': [23, 0xFEA00],
			'152': [23, 0x100100],
			'153': [23, 0x101800],
			'154': [23, 0x102F00]
			}
		},
		dirMaps = {
			'd64': {
				'startTrack':    18,
				'dosVersion':  0x02,
				'id':          0xA2,
				'dosType':     0xA5,
				'defaultType': '2A',
				'name':        0x90
			},
			'd80': {
				'startTrack':    39,
				'dosVersion':  0x02,
				'id':          0x18,
				'dosType':     0x1B,
				'defaultType': '2C',
				'name':        0x06
			}
		},
		typeMap = ['DEL','SEQ','PRG','USR','REL'],
		typeFilter = {
			'DEL': false,
			'SEQ': false,
			'PRG': true,
			'USR': false,
			'REL': false
		};

	function loadDiskImage(diskImageName, fileName, asBasic, autorun, fromLibrary) {
		if (!diskImageName) return;
		diskImageName = String(diskImageName).replace(/\//g, '');
		if (diskImageName === '') return;
		diskImgName = diskImageName;
		diskImgType = (/\.d(80|82)$/i).test(diskImgName)? 'd80':'d64';
		trackMap = trackMaps[diskImgType];
		dirMap = dirMaps[diskImgType];
		var xhr = new XMLHttpRequest();
		xhr.open('GET', prgPath + encodeURIComponent(diskImageName) + '?uid=' + Date.now().toString(36), true);
		if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
		if (xhr.overrideMimeType) xhr.overrideMimeType('text/plain; charset=x-user-defined');
		xhr.onload = function xhr_onload() {
			if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
				data = new DataView(xhr.response);
				dsize = data.byteLength;
				if (dsize) {
					parseDirectory();
					if (fileName) fileName = normalizeFileName(fileName);
					if (fileName && getFileIndexForName(fileName) >= 0) {
						if (typeof autorun === 'undefined') autorun = true;
						petCtrl.setMountedMedia('fdd', diskImageName, fileName, asBasic, autorun, undef, fromLibrary);
					}
					else {
						displayDirectory(asBasic, fromLibrary);
					}
				}
				else {
					data = null;
					console.warn('File "'+diskImageName+'" is empty.');
				}
			}
			else {
				xhr.onerror();
			}
		}
		xhr.onerror = function xhr_onerror() {
			var msg = 'PET: Unable to load file "'+diskImageName+'"';
			if (xhr.status) msg += ' ('+xhr.status+')';
			msg +=  (xhr.statusText? ': '+xhr.statusText:'.');
			console.warn(msg);
		}
		xhr.send(null);
	}

	function readDiskImage(file, presetAsBasic) {
		diskImgName = file.name;
		if (diskImgName.indexOf('\\')) diskImgName = diskImgName.replace(/^.*\\/, '');
		if (diskImgName.indexOf('/')) diskImgName = diskImgName.replace(/^.*\//, '');
		if (!diskImgName) diskImgName = '*';
		diskImgType = (/\.d(80|82)$/i).test(diskImgName)? 'd80':'d64';
		trackMap = trackMaps[diskImgType];
		dirMap = dirMaps[diskImgType];
		var fread = new FileReader();
		fread.readAsArrayBuffer(file);
		fread.onload = function(levent) {
			data = new DataView(levent.target.result);
			dsize = levent.target.result.byteLength;
			if (dsize) {
				parseDirectory();
				displayDirectory(presetAsBasic);
			}
		}
	}

	function parseDirectory() {
		dir.length = sectorsSeen.length = 0;
		var offset;
		// get disk name, id
		offset = getSectorOffset(dirMap.startTrack, 0);
		diskDosVersion = String.fromCharCode(data.getUint8(offset + dirMap.dosVersion));
		diskDosType = String.fromCharCode(data.getUint8(offset + dirMap.dosType) & 0x7f) + String.fromCharCode(data.getUint8(offset + dirMap.dosType + 1) & 0x7f);
		if (!diskDosType) diskDosType = dirMap.defaultType;
		diskName = '';
		var fnc = 0;
		for (var n = offset + dirMap.name, max = n + 16; n < max; n++) {
			var ch = data.getUint8(n);
			if (ch !== 0xA0) fnc++;
			diskName += String.fromCharCode(ch);
		}
		diskId = String.fromCharCode(Math.max(32, data.getUint8(offset + dirMap.id) & 0x7f)) + String.fromCharCode(Math.max(32, data.getUint8(offset + dirMap.id + 1) & 0x7f));
		if (!fnc) {
			diskName = diskImgName.toUpperCase().replace(/\.D[0-9]+$/, '');
			if (diskName.length > 16) diskName = diskName.substring(0, 17);
			while (diskName.length < 16) diskName += '\u00A0';
		}
		if (debugInfo) console.info('---- DISK: "' + diskName.replace(/\s+$/, '') + '" ----');
		// read & parse directory
		sectorsSeen.length = 0;
		var t=dirMap.startTrack, s=1, idx=0;
		while (t) {
			offset = getSectorOffset(t, s);
			if (offset < 0) break;
			t =  data.getUint8(offset);
			s =  data.getUint8(offset+1);
			for (var i = 0; i < 0xff; i+=0x20) {
				var entry = {},
					c = offset + i,
					fname = '',
					rawType = data.getUint8(c+2),
					type = rawType&7,
					locked = rawType&0x40 == 0x40,
					splat = rawType&0x80 != 0x80;
				entry.type = typeMap[type] || '???';
				entry.track = data.getUint8(c+3);
				entry.sector = data.getUint8(c+4);
				entry.blocks = data.getUint8(c+0x1e) | (data.getUint8(c+0x1f) << 8),
				entry.fsize = entry.blocks*254;
				entry.size = 0;
				entry.locked = locked;
				entry.splat = splat;
				entry.relTrack = data.getUint8(c+0x15);
				entry.relSector = data.getUint8(c+0x16);
				entry.relSize = data.getUint8(c+0x17);
				for (var n = c+5, l = c+21; n < l; n++) {
					var ch = data.getUint8(n);
					if (ch == 0) break;
					if (ch === 0xFF) fname += '\u03C0';
					else if (ch >= 0x20 && ch != 0xa0) fname += String.fromCharCode(ch);

				}
				if (debugInfo) console.info('\u2022',
					'"'+fname+'"',
					'- type:', type, typeMap[type],
					'-> track:', entry.track, 'sector:', entry.sector, 'blocks:', entry.blocks
				);
				if (fname == '' || type == 0 || entry.fsize == 0) continue;
				entry.index = idx++;
				entry.name = fname;
				entry.display = (!typeFilter || (typeof typeMap[type] !== 'undefined' && typeFilter[typeMap[type]]));
				dir.push(entry);
			}
		}
		if (debugInfo) console.info('---- END OF DIRECTORY ----');
		// fix-up exact file length in KB
		for (var i = 0; i < dir.length; i++) {
			var entry = dir[i];
			entry.size = (getExactFileSize(entry.track, entry.sector)/1024).toFixed(2);
		}
	}

	function getExactFileSize(track , sector) {
		var size = 0;
		sectorsSeen.length = 0;
		while (track) {
			if (track == 75) console.info('getExactFileSize: encountered track 75!');
			var offset = getSectorOffset(track, sector);
			if (offset < 0) break;
			track =  data.getUint8(offset);
			sector =  data.getUint8(offset+1);
			if (track == 0) size += sector? Math.max(0, sector-2) : 254;
			else size += 254;
		}
		return size;
	}

	function getFileIndexForName(entry) {
		var index = -1;
		if (entry === '*') {
			index = 0;
		}
		else {
			entry = entry.replace(/^[0-9]:/, ''); // discard drive number
			var re = new RegExp( '^' + quoteWildCardExpr(entry) + '$');
			for (var i=0; i<dir.length; i++) {
				if (re.test(dir[i].name)) {
					index = i;
					break;
				}
			}
			if (index < 0 && /\.PRG$/.test(entry)) { // retry without extension
				re = new RegExp( '^' + quoteWildCardExpr(entry.replace(/\.PRG$/, '')) + '$');
				for (var i=0; i<dir.length; i++) {
					if (re.test(dir[i].name)) {
						index = i;
						break;
					}
				}
			}
		}
		return index;
	}

	function getFile(entry) {
		var index = -1;
		if (typeof entry === 'string') {
			// directory is either "$[drive]" (old drives)
			// or "$[drive:][search][=type]" (1541, etc)
			var matches = entry.match(/^\$(([0-9])?|(([0-9])\:)?(.*?)(=(.*))?)$/);
			if (matches) {
				var drive = matches[2] || matches [4],
					search = matches[5] || '',
					type = matches[7];
				return { 'address': 0x0401, 'bytes': getDirectoryFile(search, type), 'name': '$' };
			}
			index = getFileIndexForName(entry);
		}
		else if (typeof entry === 'number') {
			index = entry;
		}
		if (index < 0 || index >= dir.length) {
			console.warn('disk image error: no such file ("'+entry+'").');
			return false;
		}
		sectorsSeen.length = 0;
		var f = dir[index], bytes = [], t = f.track, s = f.sector, sectorLength = 256;
		while (t) {
			var offset = getSectorOffset(t, s);
			if (offset < 0) return;
			t =  data.getUint8(offset);
			s =  data.getUint8(offset+1);
			if (t == 0) sectorLength = s? s + 1 : 256;
			for (var j = offset+2, l = offset + sectorLength; j < l; j++) bytes.push(data.getUint8(j));
		}
		var addr = bytes.shift() | (bytes.shift() << 8);
		return { 'address': addr, 'bytes': bytes, 'name': f.name };
	}

	function getSectorOffset(track, sector) {
		var t = trackMap[track];
		if (t && t[0]>sector && dsize >= t[1]+256*(sector+1)) {
			if (sectorsSeen[track]) {
				if (sectorsSeen[track][sector]) {
					console.error('disk image error: circular track link at track '+track+', sector '+sector+'.');
					return -1;
				}
			}
			else {
				sectorsSeen[track] = [];
			}
			sectorsSeen[track][sector] = true;
			return t[1] + 256 * sector;
		}
		console.error('disk image error: no such track or sector, track '+track+', sector '+sector+'.');
		return -1;
	}

	function displayDirectory(presetAsBasic, fromLibrary) {
		petCtrl.displayDirectoryList('FDD', dir, diskImgName, presetAsBasic, undef, fromLibrary);
	}

	function getDirectoryFile(nameFilter, typeFilter) {
		function pushLine(ln, s, pad) {
			while (s.length < pad) s = s + ' ';
			var link = addr + s.length + 5;
			code.push(link & 0xff, link >> 8, ln & 0xff, ln >> 8);
			for (var n = 0; n < s.length; n++) {
				var c = s.charCodeAt(n);
				code.push(c == 0x03C0? 0xff:c);
			}
			code.push(0);
			addr = link;
		}
		var code = [],
			addr = 0x0401,
			filterRE,
			typeRE,
			hideDEL = true;
		if (data && diskImgName) {
			if (nameFilter) {
				var parts = nameFilter.split(/,/g);
				for (var i = 0; i < parts.length; i++) {
					parts[i] = quoteWildCardExpr(parts[i]);
				}
				filterRE = new RegExp( '^' + (parts.length > 1? '('+parts.join('|')+')':parts[0]) + '$');
			}
			if (typeFilter) {
				typeFilter = typeFilter.replace(/[^A-W]/gi, '');
				hideDEL = !(/D/i).test(typeFilter);
				if (typeFilter) typeRE = new RegExp('^[' + typeFilter +']');
			}
			pushLine(0, '\u0012"' + diskName.replace(/\xa0/g,' ') + '" ' + diskId + ' ' + diskDosType, 0);
			for (var i = 0; i < dir.length; i++) {
				var entry = dir[i];
				if (hideDEL && entry.type === 'DEL') continue;
				if (typeRE && !typeRE.test(entry.type)) continue;
				if (filterRE && !filterRE.test(entry.name)) continue;
				var s = '"' + entry.name + '"';
				while(s.length < 18) s += ' ';
				s += entry.splat? '*':' ';
				s += entry.type;
				s += entry.locked? '<':' ';
				for (var n = entry.blocks <= 0? 0:Math.floor(Math.log10(entry.blocks)); n < 3; n++) s = ' ' + s;
				pushLine(entry.blocks, s, 27);
			}
			pushLine(0, 'BLOCKS FREE.', 25);
			code.push(0, 0);
		}
		return code;
	}

	function unload() {
		dir.length = 0;
		diskImgName = '';
		data = null;
	}

	return {
		'readDiskImage': readDiskImage,
		'loadDiskImage': loadDiskImage,
		'unload': unload,
		'displayDirectory': displayDirectory,
		'getFile': getFile
	};

})();

// T64 parser

var T64 = (function() {
	var prgPath = 'prgs/',
		data = null,
		dsize = 0,
		dir = [],
		tapeImgName, tapeName, signature, tapeVersion,
		debugInfo = false;

	var fileTypes = {
			'0': 'FRE',   // free
			'1': 'PRG',
			//'2': 'SAV', // memory snapshot, v. 10x
			'2': 'HDR',   // file with header, v. 200
			'3': 'SAV',   // memory snapshot
			'4': 'BLK',   // tape block
			'5': 'SEQ'    // stream
		},
		typeFilter = {
			'1': true // prgs
		};

	function loadImage(imageName, fileName, asBasic, autorun, fromLibrary) {
		if (!imageName) return;
		imageName = String(imageName).replace(/^.*[\/\\]/, '');
		if (imageName === '') return;
		tapeImgName = imageName;
		tapeName = imageName.toUpperCase().replace(/\.T64$/, '');
		var xhr = new XMLHttpRequest();
		xhr.open('GET', prgPath + encodeURIComponent(imageName) + '?uid=' + Date.now().toString(36), true);
		if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
		if (xhr.overrideMimeType) xhr.overrideMimeType('text/plain; charset=x-user-defined');
		xhr.onload = function xhr_onload() {
			if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
				data = new DataView(xhr.response);
				dsize = data.byteLength;
				if (dsize) {
					parseTape();
					if (fileName) fileName = normalizeFileName(fileName);
					if (fileName && getFileIndexForName(fileName) >= 0) {
						if (typeof autorun === 'undefined') autorun = true;
						petCtrl.setMountedMedia('t64', tapeName, fileName, asBasic, autorun, undef, fromLibrary);
					}
					else {
						displayDirectory(asBasic, fromLibrary);
					}
				}
				else {
					data = null;
					console.warn('File "'+imageName+'" is empty.');
				}
			}
			else {
				xhr.onerror();
			}
		}
		xhr.onerror = function xhr_onerror() {
			var msg = 'PET: Unable to load file "'+imageName+'"';
			if (xhr.status) msg += ' ('+xhr.status+')';
			msg +=  (xhr.statusText? ': '+xhr.statusText:'.');
			console.warn(msg);
		}
		xhr.send(null);
	}

	function readImage(file, presetAsBasic) {
		tapeImgName = file.name.replace(/^.*[\/\\]/, '');
		tapeName = file.name.toUpperCase().replace(/\.T64$/, '').replace(/^.*[\/\\]/, '');
		if (!tapeName) tapeName = '*';
		var fread = new FileReader();
		fread.readAsArrayBuffer(file);
		fread.onload = function(levent) {
			data = new DataView(levent.target.result);
			dsize = levent.target.result.byteLength;
			if (dsize) {
				parseTape();
				displayDirectory(presetAsBasic);
			}
		}
	}

	function parseTape() {
		var maxEntries, totalEntries, archiveName = '';
		dir.length = 0;
		signature = '';
		if (dsize < 64 || data.getUint8(0) !== 0x43 || data.getUint8(1) !== 0x36 || data.getUint8(2) !== 0x34) {
			console.warn('Not a T64 file.');
			return;
		}
		for (var i = 0; i < 0x20; i++) {
			var b = data.getUint8(i);
			if (b > 31) signature += String.fromCharCode(b);
		}
		tapeVersion = data.getUint8(0x20) | (data.getUint8(0x21) << 8);
		maxEntries = data.getUint8(0x22) | (data.getUint8(0x23) << 8);
		totalEntries = data.getUint8(0x24) | (data.getUint8(0x25) << 8);
		for (var i = 0x28; i < 0x40; i++) {
			var b = data.getUint8(i);
			if (b > 31) archiveName += String.fromCharCode(b);
		}
		archiveName = archiveName.replace(/[\x20\xA0]+$/, '');
		if (archiveName && archiveName !=='ASS PRESENTS:') tapeName = archiveName;
		if (tapeName.length > 16) tapeName = tapeName.substring(0, 16);
		while (tapeName.length < 16) tapeName += '\u00A0';
		if (totalEntries > maxEntries) totalEntries = maxEntries;
		if (debugInfo) console.info('---- TAPE: "' + tapeName.replace(/\s+$/, '') + '" ----');
		for (var n = 0; n < totalEntries; n++) {
			var ofs = 0x40 + n * 0x20,
				type = data.getUint8(ofs),
				type1541Raw = data.getUint8(ofs+1),
				startAddr = data.getUint8(ofs+2) | (data.getUint8(ofs+3) << 8),
				endAddr = data.getUint8(ofs+4) | (data.getUint8(ofs+5) << 8),
				fileOffset = data.getUint8(ofs+8) | (data.getUint8(ofs+9) << 8) | (data.getUint8(ofs+10) << 16) | (data.getUint8(ofs+11) << 24),
				fileName = '',
				type1541 = type1541Raw & 7,
				locked1541 = type1541Raw&0x40 === 0x40,
				splat1541 = type1541Raw&0x80 !== 0x80;
			for (var i = ofs + 0x10, l = ofs + 0x20; i < l; i++) {
				var b = data.getUint8(i);
				if (b === 0xFF) fileName += '\u03C0';
				else if (b > 31) fileName += String.fromCharCode(b);
			}
			fileName = fileName.replace(/[\x20\xA0]+$/, '');

			dir.push({
				'type': fileTypes[type],
				'typeRaw': type,
				'type1541': type1541,
				'locked1541': locked1541,
				'splat1541': splat1541,
				'start': startAddr,
				'end': endAddr,
				'offset': fileOffset,
				'name': fileName,
				'fsize': endAddr - startAddr,
				'size': ((endAddr - startAddr)/1024).toFixed(2),
				'index': n,
				'display': !!typeFilter[type]
			});
			if (debugInfo) console.info('\u2022',
				'"'+fileName+'"',
				'- type:', typeRaw, fileTypes[typeRaw],
				'-> startaddr:', ('$'+(0x10000 | startAddr).toString(16).substring(1).toUpperCase()),
				'length:', endAddr - startAddr
			);
		}
		if (debugInfo) console.info('---- END OF TAPE ----');
		if (dir.length) {
			var list = [];
			for (var n = 0, l = dir.length; n < l; n++) {
				var entry = dir[n];
				if (entry.typeRaw > 0 || entry.offset > 0) {
					list.push(entry);
				}
			}
			if (list.length) {
				list.sort(function(a,b) {
					return a.offset - b.offset;
				});
				for (var i = 0, l = list.length-1; i <= l; i++) {
					var entry = list[i],
						nextOffset = i < l? list[i+1].offset:dsize;
					if (entry.typeRaw > 0) {
						var diff = nextOffset - entry.offset;
						if (diff < entry.fsize) {
							entry.end = entry.start + diff;
							entry.fsize = diff;
							entry.size = (diff/1024).toFixed(2);
							console.log('Corrected files size for tape entry #'+entry.index+'.');
						}
					}
				}
			}
			dir = list;
		}
	}

	function displayDirectory(presetAsBasic, fromLibrary) {
		/*
		function hex(n) {
			return '$'+n.toString(16).toUpperCase();
		}
		var s = 'Signature: '+signature + '\n' +
			'Tape Version: '+ hex(tapeVersion) + '\n' +
			'Tape Name: "' + tapeName + '"\n' +
			'-----------\n';
		for (var i = 0; i<dir.length; i++) {
			var item = dir[i];
			s+= ' type: ' +item.typeRaw +' ('+fileTypes[item.typeRaw]+')\n';
			s+= ' type1541: ' +hex(item.type1541,2)+'\n';
			if (item.typeRaw > 0) {
				s+=' name:   "'+item.name+'"\n';
				s+=' start:  '+hex(item.start)+'\n';
				s+=' end:    '+hex(item.end)+'\n';
				s+=' offset: '+hex(item.end)+'\n';
				s+=' size:   '+item.size+'K\n';
			}
			s+='-----------\n';
		}
		console.log(s);
		*/
		petCtrl.displayDirectoryList('T64', dir, tapeImgName, presetAsBasic, false, fromLibrary);
	}

	function getFileIndexForName(entry) {
		var index = -1;
		if (entry === '*') {
			index = 0;
		}
		else {
			entry = entry.replace(/^[0-9]:/, ''); // discard drive number
			var re = new RegExp( '^' + quoteWildCardExpr(entry) +'$');
			for (var i=0; i<dir.length; i++) {
				if (re.test(dir[i].name)) {
					index = i;
					break;
				}
			}
			if (index < 0 && /\.PRG$/.test(entry)) { // retry without extension
				re = new RegExp( '^' + quoteWildCardExpr(entry.replace(/\.PRG$/, '')) + '$');
				for (var i=0; i<dir.length; i++) {
					if (re.test(dir[i].name)) {
						index = i;
						break;
					}
				}
			}
		}
		return index;
	}

	function getFile(entry) {
		var index = -1;
		if (typeof entry === 'string') {
			var matches = entry.match(/^\$(([0-9])?|(([0-9])\:)?(.*?)(=(.*))?)$/);
			if (matches) {
				var drive = matches[2] || matches [4],
					search = matches[5] || '',
					type = matches[7];
				return { 'address': 0x0401, 'bytes': getDirectoryFile(search, type), 'name': '$' };
			}
			else index = getFileIndexForName(entry);
		}
		else if (typeof entry === 'number') {
			index = entry;
		}
		if (index < 0 || index >= dir.length) {
			console.warn('tape image error: no such file ("'+entry+'").');
			return false;
		}
		if (dir[index].typeRaw !== 1) {
			alert('Sorry, can\'t load.\nRequested item is not a regular program file.');
			return;
		}
		var item = dir[index],
			offset = item.offset,
			end = offset + item.fsize,
			bytes = [];
		if (end > dsize) {
			console.warn('tape image error: out of bounds. (file end: '+end +', tape length: '+dsize+')');
			return;
		}
		for (var i = offset; i < end; i++) bytes.push(data.getUint8(i));
		return { 'address': item.start, 'bytes': bytes, 'name': item.name };
	}

	// compile a floppy disk like directory
	function getDirectoryFile(nameFilter, typeFilter) {
		function pushLine(ln, s, pad) {
			while (s.length < pad) s = s + ' ';
			var link = addr + s.length + 5;
			code.push(link & 0xff, link >> 8, ln & 0xff, ln >> 8);
			for (var n = 0; n < s.length; n++) {
				var c = s.charCodeAt(n);
				code.push(c == 0x03C0? 0xff:c);
			}
			code.push(0);
			addr = link;
		}
		var code = [],
			addr = 0x0401,
			filterRE,
			typeRE,
			typeMap1541 = ['DEL','SEQ','PRG','USR','REL'],
			hideDEL = true;
		if (data && tapeName) {
			if (nameFilter) {
				var parts = nameFilter.split(/,/g);
				for (var i = 0; i < parts.length; i++) {
					parts[i] = quoteWildCardExpr(parts[i]);
				}
				filterRE = new RegExp( '^' + (parts.length > 1? '('+parts.join('|')+')':parts[0]) + '$');
			}
			if (typeFilter) {
				typeFilter = typeFilter.replace(/[^A-W]/gi, '');
				hideDEL = !(/D/i).test(typeFilter);
				if (typeFilter) typeRE = new RegExp('^[' + typeFilter +']');
			}
			pushLine(0, '\u0012"' + tapeName.replace(/\xa0/g,' ') + '" T64 '+hex(tapeVersion>>8,2), 0);
			for (var i = 0; i < dir.length; i++) {
				var entry = dir[i],
					type = typeMap1541[entry.type1451] || fileTypes[entry.typeRaw] || '???',
					blockSize = Math.ceil(entry.fsize/254);
				if (hideDEL && type === 'DEL') continue;
				if (typeRE && !typeRE.test(type)) continue;
				if (filterRE && !filterRE.test(entry.name)) continue;
				var s = '"' + entry.name + '"';
				while(s.length < 18) s += ' ';
				s += entry.splat1451? '*':' ';
				s += type;
				s += entry.locked1451? '<':' ';
				for (var n = blockSize <= 0? 0:Math.floor(Math.log10(blockSize)); n < 3; n++) s = ' ' + s;
				pushLine(blockSize, s, 27);
			}
			pushLine(0, 'BLOCKS FREE.', 0);
			code.push(0, 0);
		}
		return code;
	}

	function unload() {
		dir.length = 0;
		tapeName = '';
		data = null;
	}

	return {
		'readImage': readImage,
		'loadImage': loadImage,
		'getFile': getFile,
		'unload': unload,
		'displayDirectory': displayDirectory
	};
})();

// a a general wrapper for single file
var VirtualDirectory = (function() {
	function isDirectory(entry) {
		if (typeof entry === 'string') {
			// directory is either "$[drive]" (old drives)
			// or "$[drive:][search][=type]" (1541, etc)
			var matches = entry.match(/^\$(([0-9])?|(([0-9])\:)?(.*?)(=(.*))?)$/);
			return matches != null;
		}
		return false;
	}
	function getDirectoryFile(mediaType, filename, size, filetype) {
		var typeMap = ['DEL','SEQ','PRG','USR','REL']
		function pushLine(ln, s, pad) {
			while (s.length < pad) s = s + ' ';
			var link = addr + s.length + 5;
			code.push(link & 0xff, link >> 8, ln & 0xff, ln >> 8);
			for (var n = 0; n < s.length; n++) {
				var c = s.charCodeAt(n);
				code.push(c == 0x03C0? 0xff:c);
			}
			code.push(0);
			addr = link;
		}
		var code = [],
			typeMap = ['DEL','SEQ','PRG','USR','REL'],
			addr = 0x0401,
			mediaName = 'PET MOUNT POINT';
		if (!mediaType) mediaType = '    ';
		while (mediaName.length < 16) mediaName += ' ';
		pushLine(0, '\u0012"' + mediaName + '"   '+mediaType.toUpperCase(), 0);
		if (filename) {
			if (typeof filetype === 'undefined' || !typeMap[filetype]) filetype = 2;
			filename = filename.replace(/\.\w+$/,'');
			if (filename.length>16) filename + filename.substr(16);
			var s = '"' + filename.toUpperCase() + '"';
			while(s.length < 18) s += ' ';
			s += ' ' + typeMap[filetype]+'<';
			var blocks = size>0? Math.ceil(size/254):0;
			for (var n = blocks <= 0? 0:Math.floor(Math.log10(blocks)); n < 3; n++) s = ' ' + s;
			pushLine(blocks, s, 27);
		}
		pushLine(0, 'BLOCKS FREE.', 25);
		code.push(0, 0);
		return code;
	}
	return {
		'isDirectory': isDirectory,
		'getDirectoryFile': getDirectoryFile
	};
})();

return {
	'setSysConfig': setSysConfig,
	'txt2Basic': txt2Basic,
	'basic2Txt': basic2Txt,
	'qbTransform': qbTransform,
	'screen2Txt': screen2Txt,
	'markupCodeToPetscii': srcTextUtil.markupCodeToPetscii,
	'unescapePetscii': srcTextUtil.unescapePetscii,
	'normalizeSrcText': srcTextUtil.normalize,
	'transcodeToPetsciiStream': srcTextUtil.transcode,
	'getEscapedPetscii': getEscapedPetscii,
	'convertToPrg': convertToPrg,
	'ScreenGenerator': ScreenGenerator,
	'hexDumpProgram': hexDumpProgram,
	'hexDump': hexDump,
	'disassemble': disassemble,
	'disassembleProgram': disassembleProgram,
	'parseVariables': parseVariables,
	'disassembleVariables': disassembleVariablesOnly,
	'disassembleInstruction': disassembleInstruction,
	'disassembleCodeRange': disassembleCodeRange,
	'assemble': assembler.assemble,
	'renumber': renumberBasic,
	'FDD': FDD,
	'T64': T64,
	'parseP00': parseP00,
	'VirtualDirectory': VirtualDirectory
};
})();