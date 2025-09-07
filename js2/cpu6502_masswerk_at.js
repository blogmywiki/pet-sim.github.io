//
// 6502 JavaScript emulator
// by Norbert Landsteiner	2005-2024, masswerk.at
// compare: <https://www.masswerk.at/6502/>
// extended for read and write timing
//
// initially loosely based -- and since rewritten -- on an
// original C source by
//
//   Earle F. Philhower III, Commodore 64 Emulator v0.3, (c) 1993/94
//
// license / disclaimer of original C source:
//
// > This program is free software; you can redistribute it and/or modify
// > it under the terms of the GNU General Public License as published by
// > the Free Software Foundation; either version 2 of the License, or
// > (at your option) any later version.
// > 
// > This program is distributed in the hope that it will be useful,
// > but WITHOUT ANY WARRANTY; without even the implied warranty of
// > MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// > GNU General Public License for more details.
// > 
// > For the GNU General Public License see the Free Software Foundation,
// > Inc., 675 Mass Ave, Cambridge, MA 02139, USA.
// > 
// > https://www.gnu.org/licenses/licenses.en.html#GPL
//

"use strict";

function Cpu6502(hw) {

// global conf

var stopOnIterrupt=true,
	internalCycleDelay=0,
	fillByte=0,			   // byte value to fill empty RAM with on reset
	useIllegalOPCs = true,
	magicConstANE  = 0xef,	// constant used for ANE
	magicConstLXA  = 0xee,	// constant used for LXA immediate
	emulateRORBug  = false, // emulate bug of pre-1976 series
	emulate65C02   = false, // emulate 65C02 (clears decimal flag on interrupt)
	emulateJams	   = true; // emulate CPU jamming

// constants

var vecReset = 0xfffc,
	vecIRQ	 = 0xfffe,
	vecNMI	 = 0xfffa;

var fCAR = 0x01,
	fZER = 0x02,
	fINT = 0x04,
	fDEC = 0x08,
	fBRK = 0x10,
	fOVF = 0x40,
	fNEG = 0x80,
	srMask = 0xef;

// regs & memory & status

var ac, xr, yr, flags, sp, pc, pc0,
	extracycles,
	addcycles,
	cpuCycles,
	jammed,
	was3CycleBranch,
	hwWriteAddr,
	hwWriteVal,
	hwWriteBackAddr,
	hwWriteBackVal,
	deferredReadInst,
	deferredAddrMode,
	jamData,
	instrLogCursor=0,
	instrLogSize = 1000,
	instrLogByteLength = instrLogSize * 10,
	instrLog = new Uint8Array(instrLogByteLength);


// basic memory access

function byteAt(addr) {
	return hw.read(addr) || 0;
}
function wordAt(addr) {
	return (hw.read(addr) || 0)|((hw.read(0xffff&(addr+1)) || 0)<<8);
}

// address mode accessors (compare table "addressModes")

function mImm() {
	return pc++;
}
function mZpg() {
	return byteAt(pc++);
}
function mZpX() {
	return 0xff&(xr+byteAt(pc++));
}
function mZpY() {
	return 0xff&(yr+byteAt(pc++));
}
function mInd() {
	var al=wordAt(pc),
		ah=(al&0xff00)|(0xff&(al+1));
	pc+=2;
	return byteAt(al)|(byteAt(ah)<<8);
}
function mInX() {
	var a=0xff&(byteAt(pc++)+xr);
	return byteAt(a)|(byteAt(0xff&(a+1))<<8);
}
function mInY() {
	var a0=byteAt(pc++),
		a1=byteAt(a0)|(byteAt(0xff&(a0+1))<<8),
		a2=(a1+yr)&0xffff;
	if (addcycles && (a1&0xff00)!=(a2&0xff00)) extracycles++;
	return a2;
}
function mAbs() {
	var a=wordAt(pc);
	pc+=2;
	return a;
}
function mAbX() {
	var a1=wordAt(pc),
		a2=(a1+xr)&0xffff;
	pc+=2;
	if (addcycles && (a1&0xff00)!=(a2&0xff00)) extracycles++;
	return a2;
}
function mAbY() {
	var a1=wordAt(pc),
		a2=(a1+yr)&0xffff;
	pc+=2;
	if (addcycles && (a1&0xff00)!=(a2&0xff00)) extracycles++;
	return a2;
}
function mRel() { pc++; } // dummy, see "opGetBranchAddress()"

// constant modes (not a function)
var mAcc = 'ACC',
	mImp = 'IMP';

// stack

function stPush(z) {
	hw.write(sp+0x0100, z&0xff);
	sp--;
	sp&=0xff;
}
function stPop() {
	sp++;
	sp&=0xff;
	return byteAt(sp+0x0100);
}
function stPushWord(z) {
	stPush((z>>8)&0xff);
	stPush(z&0xff);
}
function stPopWord() {
	var z=stPop();
	z |=stPop()<<8;
	return z;
}
function stPushSR(addBreakFlag) {
	var sr = (flags | 0x20) & srMask;
	if (addBreakFlag) sr |= fBRK;
	stPush(sr);
}
function stPullSR() {
	flags = (stPop() & srMask) | 0x20;
}

// interrupt operations

function opInterrupt(iLevel) {
	// iLevel: 0 = BRK, 1 = IRQ, 2 = NMI, 3 = jammed
	//if (iLevel == 1 && (flags & fINT)) return;
	if (iLevel >= 3) {
		if (emulateJams) {
			jammed=true;
			jamData = {
				'address': pc,
				'instruction': byteAt(pc)
			};
		}
		return;
	}
	if (iLevel == 0) { // break
		stPushWord(pc+1); // return-addr = addr + 2, 1 byte padding
		stPushSR(true);
		pc=wordAt(vecIRQ);
	}
	else {
		stPushWord(pc);
		stPushSR(false);
		pc=wordAt(iLevel==1? vecIRQ:vecNMI);
		cpuCycles = 6;	// 7-1
		debugCycles = 7;
		if (iLevel > 0 && was3CycleBranch) cpuCycles++;
	}
	flags |= fINT;
	if (emulate65C02) flags &= ~fDEC;
}

function opIRQ() {
	opInterrupt(1);
}

function opNMI() {
	opInterrupt(2);
}

// internal operations (flag related)

function opGetBranchAddress() { // increments extracycles
	var a1=byteAt(pc),
		a2=(pc+1)&0xffff;
	a1= a1&0x80? a2-((a1^0xff)+1) : a2+a1;
	extracycles++;
	if ((a2&0xff00)!=(a1&0xff00)) extracycles++;
	else was3CycleBranch = true;
	return a1&0xffff;
}

function opBranchOnFlagClr(c) {
	if (flags&c) {
		pc++;
	}
	else {
		pc=opGetBranchAddress();
	}
}
function opBranchOnFlagSet(c) {
	if (flags&c) {
		pc=opGetBranchAddress();
	}
	else {
		pc++;
	}
}

function opClrFlag(c) {
	flags &=~c;
}
function opSetFlag(c) {
	flags |= c;
}

function opSetNZFlags(z) {
	flags &=~(fZER|fNEG);
	if (z==0) {
		flags|=fZER;
	}
	else {
		flags|=z&0x80;
	}
}

function opAdd(oper) {
	var r;
	if (flags&fDEC) {
		var l=(ac&15)+(oper&15)+((flags&fCAR)?1:0),
			h1=(ac>>4)&15,
			h2=(oper>>4)&15,
			h=h1+h2,
			s1=(h1&8)? h1-0x0f:h1,
			s2=(h2&8)? h2-0x0f:h2,
			s=s1+s2;
		flags &= ~(fCAR|fOVF|fNEG|fZER);
		if (h&8) flags|=fNEG;
		if ((h | l)&15 == 0) flags|=fZER;
		if (l>9) {
			l=(l+6)&15;
			h++;
		}
		if (h>9) {
			h=(h+6)&15;
			flags|=fCAR;
		}
		r=(h<<4)|l;
	}
	else {
		r = oper+ac+((flags&fCAR)?1:0);
		flags &= ~(fCAR|fOVF|fNEG|fZER);
		if (r>0xff) {
			flags|=fCAR;
			r&=0xff;
		}
		if (r==0) {
			flags|=fZER;
		}
		else {
			flags|=r&0x80;
		}
	}
	if ((ac^r)&(oper^r)&0x80) flags|=fOVF;
	ac=r;
}

function opSub(oper) {
	var r=ac-oper-((flags&fCAR)?0:1),
		rb=r&0xff;
	if (flags&fDEC) {
		var l=(ac&15)-(oper&15)-((flags&fCAR)?0:1),
			h1=(ac>>4)&15,
			h2=(oper>>4)&15,
			h=h1-h2;
		flags &= ~(fCAR|fZER|fOVF|fNEG);
		if (r>=0) flags |=fCAR;
		if (l<0) {
			l+=10;
			h--;
		}
		else if (l>9) {
			l=(l+6)&15;
		}
		if (h<0) {
			h+=10;
		}
		else if (h>9) {
			h=(h+6)&15;
		}
		if (rb==0) flags|=fZER;
		if (rb&0x80) flags|=fNEG;
		r=(h<<4)|l;
	}
	else {
		flags &= ~(fCAR|fZER|fOVF|fNEG);
		if (r>=0) flags|=fCAR;
		r=rb;
		if (r==0) flags|=fZER;
		flags |=r&0x80;
	}
	if ((ac^rb)&((0xff-oper)^rb)&0x80) flags|=fOVF;
	ac=r;
}

function opComp(r, b) {
	flags &=~(fCAR|fZER|fNEG);
	if (r==b) {
		flags |=fCAR|fZER;
	}
	else if (r>b) {
		flags |=fCAR;
	}
	if (0x80&(r-b)) flags|=fNEG;
}

// instructions

function iBPL() { opBranchOnFlagClr(fNEG); }
function iBMI() { opBranchOnFlagSet(fNEG); }
function iBVC() { opBranchOnFlagClr(fOVF); }
function iBVS() { opBranchOnFlagSet(fOVF); }
function iBCC() { opBranchOnFlagClr(fCAR); }
function iBCS() { opBranchOnFlagSet(fCAR); }
function iBNE() { opBranchOnFlagClr(fZER); }
function iBEQ() { opBranchOnFlagSet(fZER); }

function iCLC() { opClrFlag(fCAR); }
function iSEC() { opSetFlag(fCAR); }
function iCLI() { opClrFlag(fINT); }
function iSEI() { opSetFlag(fINT); }
function iCLV() { opClrFlag(fOVF); }
function iCLD() { opClrFlag(fDEC); }
function iSED() { opSetFlag(fDEC); }

function iORA(m) {
	ac|=byteAt(m());
	opSetNZFlags(ac);
}
function iAND(m) {
	ac &= byteAt(m());
	opSetNZFlags(ac);
}
function iEOR(m) {
	ac^=byteAt(m());
	opSetNZFlags(ac);
}
function iBIT(m) {
	var b=byteAt(m());
	flags &=~(fZER|fNEG|fOVF);
	if ((ac&b)==0) flags |=fZER;
	flags |=b&(0x80|0x40);
}
function iASL(m) {
	var a, b, isAcc = (m === mAcc);
	if (isAcc) {
		b=ac;
	}
	else {
		a=m();
		b=byteAt(a);
		hwWriteBackAddr=a;
		hwWriteBackVal=b;
	}
	flags &=~(fCAR|fNEG|fZER);
	if (b&0x80) flags |= fCAR;
	if (b=(b<<1)&0xff) {
		flags |=b&0x80;
	}
	else {
		flags |=fZER;
	}
	if (isAcc) {
		ac=b;
	}
	else {
		hwWriteAddr=a;
		hwWriteVal=b;
	}
}
function iLSR(m) {
	var a, b, isAcc = (m === mAcc);
	if (isAcc) {
		b=ac;
	}
	else {
		a=m();
		b=byteAt(a);
		hwWriteBackAddr=a;
		hwWriteBackVal=b;
	}
	flags &=~(fCAR|fNEG|fZER);
	flags |=b&1;
	b=b>>1;
	if (b==0) flags|=fZER;
	if (isAcc) {
		ac=b;
	}
	else {
		hwWriteAddr=a;
		hwWriteVal=b;
	}
}
function iROL(m) {
	var a, b, isAcc = (m === mAcc);
	if (isAcc) {
		b=ac;
	}
	else {
		a=m();
		b=byteAt(a);
		hwWriteBackAddr=a;
		hwWriteBackVal=b;
	}
	if (flags&fCAR) {
		if ((b&0x80)==0) flags&=~fCAR;
		b=(b<<1)|1;
	}
	else {
		if (b&0x80) flags|=fCAR;
		b=b<<1;
	}
	b&=0xff;
	opSetNZFlags(b);
	if (isAcc) {
		ac=b;
	}
	else {
		hwWriteAddr=a;
		hwWriteVal=b;
	}
}
function iROR(m) {
	if (emulateRORBug) {
		// pre-June 1976 series bug
		// behaves like ASL, but shifts in 0 and preserves carry
		var c=flags&fCAR;
		flags&=~fCAR;
		iASL(m);
		flags|=c;
		return;
	}
	var a, b, isAcc = (m === mAcc);
	if (isAcc) {
		b=ac;
	}
	else {
		a=m();
		b=byteAt(a);
		hwWriteBackAddr=a;
		hwWriteBackVal=b;
	}
	if (flags&fCAR) {
		if ((b&1)==0) flags&=~fCAR;
		b=(b>>1)|0x80;
	}
	else {
		if (b&1) flags|=fCAR;
		b=b>>1;
	}
	opSetNZFlags(b);
	if (isAcc) {
		ac=b;
	}
	else {
		hwWriteAddr=a;
		hwWriteVal=b;
	}
}
function iADC(m) {
	opAdd(byteAt(m()));
}
function iSBC(m) {
	opSub(byteAt(m()));
}
function iSTA(m) {
	hwWriteAddr=m();
	hwWriteVal=ac;
}
function iSTY(m) {
	hwWriteAddr=m();
	hwWriteVal=yr;
}
function iSTX(m) {
	hwWriteAddr=m();
	hwWriteVal=xr;
}
function iCPY(m) {
	opComp(yr, byteAt(m()));
}
function iCPX(m) {
	opComp(xr, byteAt(m()));
}
function iCMP(m) {
	opComp(ac, byteAt(m()));
}
function iDEY() {
	yr = 0xff&(yr-1);
	opSetNZFlags(yr);
}
function iDEX() {
	xr = 0xff&(xr-1);
	opSetNZFlags(xr);
}
function iDEC(m) {
	var a=m(),
		b=(byteAt(a)-1)&0xff;
	hwWriteBackAddr=a;
	hwWriteBackVal=b;
	flags &=~(fZER|fNEG);
	if (b) {
		flags |=b&0x80;
	}
	else {
		flags|=fZER;
	}
	hwWriteAddr=a;
	hwWriteVal=b;
}
function iINY() {
	yr = 0xff&(yr+1);
	opSetNZFlags(yr);
}
function iINX() {
	xr = 0xff&(xr+1);
	opSetNZFlags(xr);
}
function iINC(m) {
	var a=m(),
		b=(byteAt(a)+1)&0xff;
	hwWriteBackAddr=a;
	hwWriteBackVal=b;
	flags &=~(fZER|fNEG);
	if (b) {
		flags |=b&0x80;
	}
	else {
		flags|=fZER;
	}
	hwWriteAddr=a;
	hwWriteVal=b;
}
function iLDA(m) {
	ac=byteAt(m());
	opSetNZFlags(ac);
}
function iLDY(m) {
	yr=byteAt(m());
	opSetNZFlags(yr);
}
function iLDX(m) {
	xr=byteAt(m());
	opSetNZFlags(xr);
}
function iTXA() {
	ac=xr;
	opSetNZFlags(ac);
}
function iTYA() {
	ac=yr;
	opSetNZFlags(ac);
}
function iTAY() {
	yr=ac;
	opSetNZFlags(yr);
}
function iTAX() {
	xr=ac;
	opSetNZFlags(xr);
}
function iTXS() { sp=xr; }
function iTSX() {
	xr=sp;
	opSetNZFlags(xr);
}
function iPHP() {
	stPushSR(true);
}
function iPLP() {
	stPullSR();
}
function iPHA() {
	stPush(ac);
}
function iPLA() {
	ac=stPop();
	opSetNZFlags(ac);
}
function iJMP(m) {
	pc=m();
}
function iJSR() {
	stPushWord((pc+1)&0xffff);
	pc=wordAt(pc);
}
function iRTS() {
	pc=0xffff&(1+stPopWord());
}
function iRTI() {
	stPullSR();
	pc=stPopWord();
}
function iBRK() {
	opInterrupt(0);
}
function iNOP(m) {
	if (typeof m=='function') m(); // advance pc, if required
}

// illegals
function iJAM() {
	pc=pc0;
	opInterrupt(3);
}
function iALR(m) {
	flags &=~(fCAR|fZER|fNEG);
	ac=byteAt(m())&ac;
	if (ac&1) flags|=fCAR;
	ac=ac>>1;
	if (ac==0) flags|=fZER;
}
function iANC(m) {
	ac &=byteAt(m());
	flags &=~(fCAR|fZER|fNEG);
	if (ac&0x80) {
		flags|=fCAR|fNEG;
	}
	else if (ac==0) {
		flags|=fNEG;
	}
}
function iANE(m) {
	opSetNZFlags(ac);
	ac = (ac | magicConstANE) & xr & byteAt(m());
}
function iARR(m) {
	var b=byteAt(m()),
		c=(flags&fCAR)? 1:0;
	flags &= ~(fCAR|fZER|fOVF|fNEG);
	if (flags&fDEC) {
		var r = (ac & 0x0f) + (b & 0x0f) + c;
		if (r>9) r += 6;
		if (r<=0xf) {
			r = (r & 0x0f) + (ac & 0xf0) + (b & 0xf0);
		}
		else {
			r = (r & 0x0f) + (ac & 0xf0) + (r & 0xf0) + 0x10;
		}
		if (((ac + b + c) & 0xff)==0) flags|=fZER;
		if (r & 0x80) flags|=fNEG;
		if (((ac ^ r) & 0x80) && !((ac ^ r) & 0x80)) flags|=fOVF;
		if ((r & 0x1f0) > 0x90)	 r += 0x60;
		if (r & 0xff0) flags|=fCAR;
		ac = r & 0xff;
	}
	else {
		var r = ac & b,
			b7 = (r&0x80)>>7,
			b6 = (r&0x40)>>6;
		if (b7) flags|=fCAR;
		if (b6^b7) flags|=fOVF;
		ac = (r>>1)|(c<<7);
		if (ac&0x80) flags|=fNEG;
		if (ac==0) flags|=fZER;
	}
}
function iDCP(m) {
	var a=m(),
		b=byteAt(a);
	hwWriteBackAddr=a;
	hwWriteBackVal=b;
	b=(b-1)&0xff;
	hwWriteAddr=a;
	hwWriteVal=b;
	flags &=~(fCAR|fZER|fNEG);
	if (ac==b) {
		flags |=fCAR|fZER;
	}
	else if (ac>b) {
		flags |=fCAR;
	}
	if (0x80&(ac-b)) flags|=fNEG;
}
function iISC(m) {
	var a=m(),
		b=byteAt(a);
	hwWriteBackAddr=a;
	hwWriteBackVal=b;
	b=(b+1)&0xff;
	hwWriteAddr=a;
	hwWriteVal=b;
	opSub(b);
}
function iLAS(m) {
	ac = xr = sp = sp & byteAt(m());
	opSetNZFlags(ac);
}
function iLAX(m) {
	ac=xr=byteAt(m());
	opSetNZFlags(ac);
}
function iLXA(m) {
	opSetNZFlags(ac);
	ac=xr= (ac | magicConstLXA) & byteAt(m());
}
function iRLA(m) {
	var a=m(),
		b=byteAt(a),
		c=flags&fCAR? 1:0;
	flags &=~(fCAR|fNEG|fZER);
	if (b&1) flags |= fCAR;
	hwWriteBackAddr=a;
	hwWriteBackVal=b;
	b=(0xff&(b<<1))|c;
	hwWriteAddr=a;
	hwWriteVal=b;
	ac&=b;
	if (ac==0) {
		flags|=fZER;
	}
	else if (ac&0x80) {
		flags|=fNEG;
	}
}
function iRRA(m) {
	var a=m(),
		b=byteAt(a);
	hwWriteBackAddr=a;
	hwWriteBackVal=b;
	if (flags&fCAR) {
		if (b&1==0) flags&=~fCAR;
		b=(b>>1)|0x80;
	}
	else{
		if (b&1) flags|=fCAR;
		b=b>>1;
	}
	hwWriteAddr=a;
	hwWriteVal=b;
	opAdd(b);
}
function iSAX(m) {
	hwWriteAddr=m();
	hwWriteVal=ac&xr;
}
function iSBX(m) {
	var b=byteAt(m()),
		t=ac,
		f=flags&(~(fCAR|fNEG|fZER)),
		r=ac&xr;
	ac=r;
	flags = (flags&(~fDEC))|fCAR;
	opSub(b);
	xr=ac;
	ac=t;
	flags=f;
	if (r>=b) flags|=fCAR;
	if (xr&0x80) flags|=fNEG;
	if (xr==0) flags|=fZER;
}
function iSHA(m) {
	var a=m(),
		h=a>>8,
		r=ac&xr;
	if (extracycles) {
		// we assume no DMA
		r&=h;
		hwWriteAddr=(r<<8)|(a&0xff);
		hwWriteVal=r;
	}
	else {
		hwWriteAddr=a;
		hwWriteVal=r&(h+1);
	}
}
function iSHX(m) {
	var a=m(),
		h=a>>8,
		r=xr;
	if (extracycles) {
		// we assume no DMA
		r&=h;
		hwWriteAddr=(r<<8)|(a&0xff);
		hwWriteVal=r;
	}
	else {
		hwWriteAddr=a;
		hwWriteVal=r&(h+1);
	}
}
function iSHY(m) {
	var a=m(),
		h=a>>8,
		r=yr;
	if (extracycles) {
		// we assume no DMA
		r&=h;
		hwWriteAddr=(r<<8)|(a&0xff);
		hwWriteVal=r;
	}
	else {
		hwWriteAddr=a;
		hwWriteVal=r&(h+1);
	}
}
function iSLO(m) {
	var a=m(),
		b=byteAt(a);
	flags &=~(fCAR|fNEG|fZER);
	if (b&0x80) flags |= fCAR;
	hwWriteBackAddr=a;
	hwWriteBackVal=b;
	b=(b<<1)&0xff;
	hwWriteAddr=a;
	hwWriteVal=b;
	ac|=b;
	if (ac==0) {
		flags|=fZER;
	}
	else {
		flags|=ac&0x80;
	}
}
function iSRE(m) {
	var a=m(),
		b=byteAt(a);
	flags &=~(fCAR|fNEG|fZER);
	if (b&1) flags |= fCAR;
	hwWriteBackAddr=a;
	hwWriteBackVal=b;
	b=(b>>1)&0x7f;
	hwWriteAddr=a;
	hwWriteVal=b;
	ac^=b;
	if (ac==0) {
		flags|=fZER;
	}
	else {
		flags|=ac&0x80;
	}
}
function iTAS(m) {
	sp = ac&xr;
	var a=m(),
		h=a>>8,
		r=sp;
	if (extracycles) {
		// we assume no DMA
		r&=h;
		hwWriteAddr=(r<<8)|(a&0xff);
		hwWriteVal=r;
	}
	else {
		hwWriteAddr=a;
		hwWriteVal=r&(h+1);
	}
}

// code tables

var instructionsLegal = [
	iBRK, iORA, null, null, null, iORA, iASL, null,	 // 00
	iPHP, iORA, iASL, null, null, iORA, iASL, null,	 // 08
	iBPL, iORA, null, null, null, iORA, iASL, null,	 // 10
	iCLC, iORA, null, null, null, iORA, iASL, null,	 // 18
	iJSR, iAND, null, null, iBIT, iAND, iROL, null,	 // 20
	iPLP, iAND, iROL, null, iBIT, iAND, iROL, null,	 // 28
	iBMI, iAND, null, null, null, iAND, iROL, null,	 // 30
	iSEC, iAND, null, null, null, iAND, iROL, null,	 // 38
	iRTI, iEOR, null, null, null, iEOR, iLSR, null,	 // 40
	iPHA, iEOR, iLSR, null, iJMP, iEOR, iLSR, null,	 // 48
	iBVC, iEOR, null, null, null, iEOR, iLSR, null,	 // 50
	iCLI, iEOR, null, null, null, iEOR, iLSR, null,	 // 58
	iRTS, iADC, null, null, null, iADC, iROR, null,	 // 60
	iPLA, iADC, iROR, null, iJMP, iADC, iROR, null,	 // 68
	iBVS, iADC, null, null, null, iADC, iROR, null,	 // 70
	iSEI, iADC, null, null, null, iADC, iROR, null,	 // 78
	null, iSTA, null, null, iSTY, iSTA, iSTX, null,	 // 80
	iDEY, null, iTXA, null, iSTY, iSTA, iSTX, null,	 // 88
	iBCC, iSTA, null, null, iSTY, iSTA, iSTX, null,	 // 90
	iTYA, iSTA, iTXS, null, null, iSTA, null, null,	 // 98
	iLDY, iLDA, iLDX, null, iLDY, iLDA, iLDX, null,	 // A0
	iTAY, iLDA, iTAX, null, iLDY, iLDA, iLDX, null,	 // A8
	iBCS, iLDA, null, null, iLDY, iLDA, iLDX, null,	 // B0
	iCLV, iLDA, iTSX, null, iLDY, iLDA, iLDX, null,	 // B8
	iCPY, iCMP, null, null, iCPY, iCMP, iDEC, null,	 // C0
	iINY, iCMP, iDEX, null, iCPY, iCMP, iDEC, null,	 // C8
	iBNE, iCMP, null, null, null, iCMP, iDEC, null,	 // D0
	iCLD, iCMP, null, null, null, iCMP, iDEC, null,	 // D8
	iCPX, iSBC, null, null, iCPX, iSBC, iINC, null,	 // E0
	iINX, iSBC, iNOP, null, iCPX, iSBC, iINC, null,	 // E8
	iBEQ, iSBC, null, null, null, iSBC, iINC, null,	 // F0
	iSED, iSBC, null, null, null, iSBC, iINC, null	 // F8
],
instructionsAll = [
	iBRK, iORA, iJAM, iSLO, iNOP, iORA, iASL, iSLO,	 // 00
	iPHP, iORA, iASL, iANC, iNOP, iORA, iASL, iSLO,	 // 08
	iBPL, iORA, iJAM, iSLO, iNOP, iORA, iASL, iSLO,	 // 10
	iCLC, iORA, iNOP, iSLO, iNOP, iORA, iASL, iSLO,	 // 18
	iJSR, iAND, iJAM, iRLA, iBIT, iAND, iROL, iRLA,	 // 20
	iPLP, iAND, iROL, iANC, iBIT, iAND, iROL, iRLA,	 // 28
	iBMI, iAND, iJAM, iRLA, iNOP, iAND, iROL, iRLA,	 // 30
	iSEC, iAND, iNOP, iRLA, iNOP, iAND, iROL, iRLA,	 // 38
	iRTI, iEOR, iJAM, iSRE, iNOP, iEOR, iLSR, iSRE,	 // 40
	iPHA, iEOR, iLSR, iALR, iJMP, iEOR, iLSR, iSRE,	 // 48
	iBVC, iEOR, iJAM, iSRE, iNOP, iEOR, iLSR, iSRE,	 // 50
	iCLI, iEOR, iNOP, iSRE, iNOP, iEOR, iLSR, iSRE,	 // 58
	iRTS, iADC, iJAM, iRRA, iNOP, iADC, iROR, iRRA,	 // 60
	iPLA, iADC, iROR, iARR, iJMP, iADC, iROR, iRRA,	 // 68
	iBVS, iADC, iJAM, iRRA, iNOP, iADC, iROR, iRRA,	 // 70
	iSEI, iADC, iNOP, iRRA, iNOP, iADC, iROR, iRRA,	 // 78
	iNOP, iSTA, iNOP, iSAX, iSTY, iSTA, iSTX, iSAX,	 // 80
	iDEY, iNOP, iTXA, iANE, iSTY, iSTA, iSTX, iSAX,	 // 88
	iBCC, iSTA, iJAM, iSHA, iSTY, iSTA, iSTX, iSAX,	 // 90
	iTYA, iSTA, iTXS, iTAS, iSHY, iSTA, iSHX, iSHA,	 // 98
	iLDY, iLDA, iLDX, iLAX, iLDY, iLDA, iLDX, iLAX,	 // A0
	iTAY, iLDA, iTAX, iLXA, iLDY, iLDA, iLDX, iLAX,	 // A8
	iBCS, iLDA, iJAM, iLAX, iLDY, iLDA, iLDX, iLAX,	 // B0
	iCLV, iLDA, iTSX, iLAS, iLDY, iLDA, iLDX, iLAX,	 // B8
	iCPY, iCMP, iNOP, iDCP, iCPY, iCMP, iDEC, iDCP,	 // C0
	iINY, iCMP, iDEX, iSBX, iCPY, iCMP, iDEC, iDCP,	 // C8
	iBNE, iCMP, iJAM, iDCP, iNOP, iCMP, iDEC, iDCP,	 // D0
	iCLD, iCMP, iNOP, iDCP, iNOP, iCMP, iDEC, iDCP,	 // D8
	iCPX, iSBC, iNOP, iISC, iCPX, iSBC, iINC, iISC,	 // E0
	iINX, iSBC, iNOP, iSBC, iCPX, iSBC, iINC, iISC,	 // E8
	iBEQ, iSBC, iJAM, iISC, iNOP, iSBC, iINC, iISC,	 // F0
	iSED, iSBC, iNOP, iISC, iNOP, iSBC, iINC, iISC	 // F8
],
addressModes = [
	mImp, mInX, null, mInX, mZpg, mZpg, mZpg, mZpg,	 // 00
	mImp, mImm, mAcc, mImm, mAbs, mAbs, mAbs, mAbs,	 // 08
	mRel, mInY, null, mInY, mZpX, mZpX, mZpX, mZpX,	 // 10
	mImp, mAbY, mImp, mAbY, mAbX, mAbX, mAbX, mAbX,	 // 18
	mAbs, mInX, null, mInX, mZpg, mZpg, mZpg, mZpg,	 // 20
	mImp, mImm, mAcc, mImm, mAbs, mAbs, mAbs, mAbs,	 // 28
	mRel, mInY, null, mInY, mZpX, mZpX, mZpX, mZpX,	 // 30
	mImp, mAbY, mImp, mAbY, mAbX, mAbX, mAbX, mAbX,	 // 38
	mImp, mInX, null, mInX, mZpg, mZpg, mZpg, mZpg,	 // 40
	mImp, mImm, mAcc, mImm, mAbs, mAbs, mAbs, mAbs,	 // 48
	mRel, mInY, null, mInY, mZpX, mZpX, mZpX, mZpX,	 // 50
	mImp, mAbY, mImp, mAbY, mAbX, mAbX, mAbX, mAbX,	 // 58
	mImp, mInX, null, mInX, mZpg, mZpg, mZpg, mZpg,	 // 60
	mImp, mImm, mAcc, mImm, mInd, mAbs, mAbs, mAbs,	 // 68
	mRel, mInY, null, mInY, mZpX, mZpX, mZpX, mZpX,	 // 70
	mImp, mAbY, mImp, mAbY, mAbX, mAbX, mAbX, mAbX,	 // 78
	mImm, mInX, mImm, mInX, mZpg, mZpg, mZpg, mZpg,	 // 80
	mImp, mImm, mImp, mImm, mAbs, mAbs, mAbs, mAbs,	 // 88
	mRel, mInY, null, mInY, mZpX, mZpX, mZpY, mZpY,	 // 90
	mImp, mAbY, mImp, mAbY, mAbX, mAbX, mAbY, mAbY,	 // 98
	mImm, mInX, mImm, mInX, mZpg, mZpg, mZpg, mZpg,	 // A0
	mImp, mImm, mImp, mImm, mAbs, mAbs, mAbs, mAbs,	 // A8
	mRel, mInY, null, mInY, mZpX, mZpX, mZpY, mZpY,	 // B0
	mImp, mAbY, mImp, mAbY, mAbX, mAbX, mAbY, mAbY,	 // B8
	mImm, mInX, mImm, mInX, mZpg, mZpg, mZpg, mZpg,	 // C0
	mImp, mImm, mImp, mImm, mAbs, mAbs, mAbs, mAbs,	 // C8
	mRel, mInY, null, mInY, mZpX, mZpX, mZpX, mZpX,	 // D0
	mImp, mAbY, mImp, mAbY, mAbX, mAbX, mAbX, mAbX,	 // D8
	mImm, mInX, mImm, mInX, mZpg, mZpg, mZpg, mZpg,	 // E0
	mImp, mImm, mImp, mImm, mAbs, mAbs, mAbs, mAbs,	 // E8
	mRel, mInY, null, mInY, mZpX, mZpX, mZpX, mZpX,	 // F0
	mImp, mAbY, mImp, mAbY, mAbX, mAbX, mAbX, mAbX	 // F8
],
cycles = [
	7, 6, 0, 8, 3, 3, 5, 5, 3, 2, 2, 2, 4, 4, 6, 6,	 // 00
	2, 5, 0, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,	 // 10
	6, 6, 0, 8, 3, 3, 5, 5, 4, 2, 2, 2, 4, 4, 6, 6,	 // 20
	2, 5, 0, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,	 // 30
	6, 6, 0, 8, 3, 3, 5, 5, 3, 2, 2, 2, 3, 4, 6, 6,	 // 40
	2, 5, 0, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,	 // 50
	6, 6, 0, 8, 3, 3, 5, 5, 4, 2, 2, 2, 5, 4, 6, 6,	 // 60
	2, 5, 0, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,	 // 70
	2, 6, 2, 6, 3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 4,	 // 80
	2, 6, 0, 6, 4, 4, 4, 4, 2, 5, 2, 5, 5, 5, 5, 5,	 // 90
	2, 6, 2, 6, 3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 4,	 // A0
	2, 5, 0, 5, 4, 4, 4, 4, 2, 4, 2, 4, 4, 4, 4, 4,	 // B0
	2, 6, 2, 8, 3, 3, 5, 5, 2, 2, 2, 2, 4, 4, 6, 6,	 // C0
	2, 5, 0, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,	 // D0
	2, 6, 2, 8, 3, 3, 5, 5, 2, 2, 2, 2, 4, 4, 6, 6,	 // E0
	2, 5, 0, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7	 // F0
],
extraCycles = [
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,	 // 00
	2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0,	 // 10
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,	 // 20
	2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0,	 // 30
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,	 // 40
	2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0,	 // 50
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,	 // 60
	2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0,	 // 70
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,	 // 80
	2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,	 // 90
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,	 // A0
	2, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1,	 // B0
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,	 // C0
	2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0,	 // D0
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,	 // E0
	2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0	 // F0
],
memAccess = [
	false, true,  false, true,  true,  true,  true,  true, 	 // 00
	false, false, false, false, true,  true,  true,  true, 	 // 08
	false, true,  false, true,  true,  true,  true,  true, 	 // 10
	false, true,  false, true,  true,  true,  true,  true, 	 // 18
	true,  true,  false, true,  true,  true,  true,  true, 	 // 20
	false, false, false, false, true,  true,  true,  true, 	 // 28
	false, true,  false, true,  true,  true,  true,  true, 	 // 30
	false, true,  false, true,  true,  true,  true,  true, 	 // 38
	false, true,  false, true,  true,  true,  true,  true, 	 // 40
	false, false, false, false, true,  true,  true,  true, 	 // 48
	false, true,  false, true,  true,  true,  true,  true, 	 // 50
	false, true,  false, true,  true,  true,  true,  true, 	 // 58
	false, true,  false, true,  true,  true,  true,  true, 	 // 60
	false, false, false, false, true,  true,  true,  true, 	 // 68
	false, true,  false, true,  true,  true,  true,  true, 	 // 70
	false, true,  false, true,  true,  true,  true,  true, 	 // 78
	false, true,  false, true,  true,  true,  true,  true, 	 // 80
	false, false, false, false, true,  true,  true,  true, 	 // 88
	false, true,  false, true,  true,  true,  true,  true, 	 // 90
	false, true,  false, true,  true,  true,  true,  true, 	 // 98
	false, true,  false, true,  true,  true,  true,  true, 	 // A0
	false, false, false, false, true,  true,  true,  true, 	 // A8
	false, true,  false, true,  true,  true,  true,  true, 	 // B0
	false, true,  false, true,  true,  true,  true,  true, 	 // B8
	false, true,  false, true,  true,  true,  true,  true, 	 // C0
	false, false, false, false, true,  true,  true,  true, 	 // C8
	false, true,  false, true,  true,  true,  true,  true, 	 // D0
	false, true,  false, true,  true,  true,  true,  true, 	 // D8
	false, true,  false, true,  true,  true,  true,  true, 	 // E0
	false, false, false, false, true,  true,  true,  true, 	 // E8
	false, true,  false, true,  true,  true,  true,  true, 	 // F0
	false, true,  false, true,  true,  true,  true,  true	 // F8
],
instructions= useIllegalOPCs? instructionsAll:instructionsLegal;

var debug_OFF = 0,
	debug_CONT = 1,
	debug_NEXT = 2,
	debug_STEP = 3,
	debugStops = {
		0x00: true, // BRK
		0x20: true,	// JSR
		0x4c: true, // JMP abs
		0x6c: true  // JMP ind
	},
	debug_RTI = 0x40,
	debug_RTS = 0x60,
	$debugger = null,
	hasDebugger = false,
	debugReentrant, debugIgnore, debugCycles,
	debugData, debugTrace, debugHalt, debugInterrupt;

// main

function cycle() {
	if (jammed && emulateJams) {
		hw.cpuJammed = true;
		if (hasDebugger) $debugger.jammed(pc0);
		return true;
	}
	if (cpuCycles) {
		if (deferredReadInst) {
			deferredReadInst(deferredAddrMode);
			pc &= 0xffff;
			cpuCycles += extracycles;
			deferredReadInst = null;
		}
		// last phase
		if (--cpuCycles == 0) {
			// execute any deferred writes to hardware
			if (hwWriteAddr >= 0) {
				hw.write(hwWriteAddr, hwWriteVal);
				hwWriteAddr = -1;
			}
			if (hasDebugger) {
				if (debugInterrupt) {
					$debugger.interrupt(debugInterrupt, debugData, pc0, pc, debugCycles + extracycles);
					debugTrace = debugReentrant = debugInterrupt = false;
				}
				else if (debugTrace) {
					$debugger.trace(debugData, debugCycles + extracycles);
					debugTrace = false;
				}
			}
			return true;
		}
		if (cpuCycles == 1 && hwWriteBackAddr >=0) {
			hw.write(hwWriteBackAddr, hwWriteBackVal);
			hwWriteBackAddr = -1;
		}
	}
	else if (hw.nmi_signal || (hw.irq_signal && ((flags & fINT) == 0))) {
		pc0 = pc;
		extracycles = 0;
		opInterrupt(hw.nmi_signal? 2:1);
		if (hasDebugger && ($debugger.runLevel == debug_STEP || $debugger.runLevel == debug_NEXT)) {
			if ($debugger.ignoreInterrupts) {
				debugIgnore = true;
				debugHalt = debugTrace = debugReentrant = false;
				debugData = null;
			}
			else {
				debugData = getStatus();
				debugData.pc = pc;
				debugInterrupt = hw.nmi_signal? 'NMI':'IRQ';
				debugHalt = true;
			}
		}
	}
	else {
		var opc = byteAt(pc),
			inst = instructions[opc],
			defer = memAccess[opc],
			debugBreakReason = undefined;
		was3CycleBranch = debugInterrupt = false;
		if (hasDebugger && !debugReentrant && !debugIgnore && $debugger.runLevel != debug_OFF && $debugger.brackets) {
			for (var i=0; i<$debugger.brackets.length; i++) {
				var brkt = $debugger.brackets[i];
				if (brkt[0]) { //active
					if (brkt[3]) { //enter
						if (brkt[1] <= pc && brkt[2] >= pc && (brkt[1] > pc0 || brkt[2] < pc0)) {
							debugBreakReason = 'bracket-enter';
							break;
						}
					}
					else { //leave
						if (brkt[1] <= pc0 && brkt[2] >= pc0 && (brkt[1] > pc || brkt[2] < pc)) {
							debugBreakReason = 'bracket-exit';
							break;
						}
					}
				}
			}
		}
		pc0 = pc;
		if (!debugReentrant) {
			instrLog[instrLogCursor++]=pc & 0xff;
			instrLog[instrLogCursor++]=pc >> 8;
			instrLog[instrLogCursor++]=opc;
			instrLog[instrLogCursor++]=byteAt(pc+1);
			instrLog[instrLogCursor++]=byteAt(pc+2);
			instrLog[instrLogCursor++]=ac;
			instrLog[instrLogCursor++]=xr;
			instrLog[instrLogCursor++]=yr;
			instrLog[instrLogCursor++]=sp;
			instrLog[instrLogCursor++]=flags | 0x20;
			if (instrLogCursor >= instrLogByteLength) instrLogCursor=0;
		}
		if (hasDebugger) {
			if (debugReentrant) debugReentrant = false;
			else {
				if (!debugHalt && !debugIgnore && $debugger.runLevel == debug_NEXT && debugStops[opc]) debugHalt = debugTrace = true;
				if ($debugger.runLevel != debug_OFF && $debugger.breakpoints[pc]) debugBreakReason = 'breakpoint';
				else if (!debugIgnore && $debugger.runLevel != debug_OFF && $debugger.trapIllegals && !instructionsLegal[opc]) debugBreakReason = 'illegal';
				if (debugHalt || debugBreakReason) {
					debugData = getStatus();
					$debugger.haltOnInstr(debugData, debugBreakReason);
					debugHalt = false;
					debugTrace = true;
					debugReentrant = true;
					debugIgnore = false;
					return true;
				}
			}
		}
		pc = 0xffff&(pc+1);
		if (inst) {
			extracycles = 0;
			cpuCycles = cycles[opc] - 1;
			debugCycles = cycles[opc];
			addcycles = extraCycles[opc];
			if (hasDebugger) {
				if (debugIgnore) {
					if (opc === debug_RTI) debugIgnore = false;
				}
				else if ($debugger.runLevel == debug_STEP ||
					($debugger.runLevel == debug_NEXT && (opc === debug_RTS || (opc === debug_RTI && !$debugger.ignoreInterrupts)))
				) {
					debugHalt = debugTrace = true;
					debugData = getStatus();
					debugCycles = cycles[opc];
				}
			}
			if (defer) {
				deferredReadInst = inst;
				deferredAddrMode = addressModes[opc];
			}
			else {
				inst( addressModes[opc] );
				pc &= 0xffff;
				cpuCycles += extracycles;
				debugCycles += extracycles;
			}
		}
	}
	return false;
}

function reset() {
	pc = wordAt(vecReset);
	sp=0xff;
	ac=xr=yr=0;
	flags=0x16;
	was3CycleBranch=jammed=false;
	cpuCycles=0;
	hwWriteAddr=hwWriteBackAddr=-1;
	deferredReadInst = null;
	deferredAddrMode = null;
	jamData = null;
	debugData = null;
	debugTrace = debugHalt = debugReentrant = debugIgnore = debugInterrupt = false;
	debugCycles = 0;
	instrLogCursor = 0;
	for (var i=0; i<instrLogByteLength; i++) instrLog[i]=0;
}

// external access

function getHexString(n, d) {
	return ((1 << (d || 8)) | n).toString(16).substring(1);
}

function toString() {
	return 'PC=' + getHexString(pc,16) +
		' A=' + getHexString(ac,8) +
		' X=' + getHexString(xr,8) +
		' Y=' + getHexString(yr,8) +
		' SP=' + getHexString(sp,8) +
		' SR=' + (0x100 | flags | 0x30).toString(2).substring(1);
}
	
function getA() { return ac; }
function getX() { return xr; }
function getY() { return yr; }
function getP() { return flags | 0x30; }
function getPC() { return pc; }
function getSP() { return sp; }
function getJamData() { return jamData; }
function getStatus() {
	return {
		'pc': pc0,
		'a': ac,
		'x': xr,
		'y': yr,
		'sp': sp,
		'sr': flags | 0x20,
		'c': flags & fCAR? 1:0,
		'z': flags & fZER? 1:0,
		'i': flags & fINT? 1:0,
		'd': flags & fDEC? 1:0,
		'b': flags & fBRK? 1:0,
		'v': flags & fOVF? 1:0,
		'n': flags & fNEG? 1:0
	}
}

function setRegister(r, v) {
	if (isNaN(v)) return;
	switch (r) {
		case 'pc': pc0 = pc = v & 0xffff; break;
		case 'a': ac = v & 0xff; break;
		case 'x': xr = v & 0xff; break;
		case 'y': yr = v & 0xff; break;
		case 'sp': sp = v & 0xff; break;
		case 'sr': flags = (v & srMask) | 0x20; break;
	}
}
function setFlag(f, v) {
	var b;
	switch (f) {
		case 'c': b = fCAR; break;
		case 'z': b = fZER; break;
		case 'i': b = fINT; break;
		case 'd': b = fDEC; break;
		case 'b': b = fBRK; break;
		case 'v': b = fOVF; break;
		case 'n': b = fNEG; break;
		default: return;
	}
	if (v) flags |= b;
	else flags &= ~b;
}
function getRegister(r) {
	switch (r) {
		case 'pc': return pc;
		case 'a': return ac;
		case 'x': return xr;
		case 'y': return yr;
		case 'sp': return sp;
		case 'sr': return flags | 0x20;
	}
}
function getFlag(f) {
	switch (f) {
		case 'c': return flags & fCAR? 1:0;
		case 'z': return flags & fZER? 1:0;
		case 'i': return flags & fINT? 1:0;
		case 'd': return flags & fDEC? 1:0;
		case 'b': return flags & fBRK? 1:0;
		case 'v': return flags & fOVF? 1:0;
		case 'n': return flags & fNEG? 1:0;
	}
}

function attachDebugger(dbg) {
	switch (typeof dbg) {
		case 'object':
		case 'function':
			$debugger = dbg;
			hasDebugger = true;
			break;
		default:
			$debugger = null;
			hasDebugger = false;
			break;
	}
}

function getLog() {
	return {'data': instrLog, 'size': instrLogSize, 'cursor': instrLogCursor};
}

// external API

return {
	'cycle': cycle,
	'reset': reset,
	'toString': toString,
	'getA': getA,
	'getX': getX,
	'getY': getY,
	'getP': getP,
	'getPC': getPC,
	'getSP': getSP,
	'getJamData': getJamData,
	'getStatus': getStatus,
	'setRegister': setRegister,
	'getRegister': getRegister,
	'setFlag': setFlag,
	'getFlag': getFlag,
	'getLog': getLog,
	'attachDebugger': attachDebugger
};

}