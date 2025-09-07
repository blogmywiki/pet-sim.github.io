//
// Copyright (c) 2012,2014,2020 Thomas Skibo. <thomas@skibo.net>
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
// pet2001io.js
// Modelling PET I/O hardware (PIA 6520, VIA 6522).
//
// Modified by Norbert Landsteiner 2017-2024
// additional video and audio hooks, SNES adapter 2023.
// changed PA & PB implementation to pull-up/active low.
// reorganized for enhanced address decoding and chip select 2024.

function PetIO(hw) {

	'use strict';

	var ieee = null;
	var video = null;
	var audio = null;
	var keyboard = null;
	var keyrow = new Uint8Array(10);

	this.connect = function(components) {
		video = components.video;
		audio = components.audio;
		ieee = components.ieee;
		keyboard = components.keyboard;
	};

	// line addresses
	var PIA1_PA  = 0x0,
		PIA1_CRA = 0x1,
		PIA1_PB  = 0x2,
		PIA1_CRB = 0x3,

		PIA2_PA  = 0x0,
		PIA2_CRA = 0x1,
		PIA2_PB  = 0x2,
		PIA2_CRB = 0x3,

		VIA_DRB  = 0x0,
		VIA_DRA  = 0x1,
		VIA_DDRB = 0x2,
		VIA_DDRA = 0x3,
		VIA_T1CL = 0x4,
		VIA_T1CH = 0x5,
		VIA_T1LL = 0x6,
		VIA_T1LH = 0x7,
		VIA_T2CL = 0x8,
		VIA_T2CH = 0x9,
		VIA_SR   = 0xa,
		VIA_ACR  = 0xb,
		VIA_PCR  = 0xc,
		VIA_IFR  = 0xd,
		VIA_IER  = 0xe,
		VIA_ANH  = 0xf;

	// internal state
	var pia1_pa_in =   0xf0,
		pia1_pa_out =  0,
		pia1_ddra =    0,
		pia1_cra =     0,
		pia1_pb_in =   0xff,
		pia1_pb_out =  0,
		pia1_ddrb =    0,
		pia1_crb =     0,
		pia1_ca2 =     0,
		pia1_cb1 =     0,

		pia2_pa_in =   0,
		pia2_pa_out =  0,
		pia2_ddra =    0,
		pia2_cra =     0,
		pia2_pb_in =   0,
		pia2_pb_out =  0,
		pia2_ddrb =    0,
		pia2_crb =     0,

		via_drb_in =   0xff,
		via_drb_out =  0,
		via_dra_in =   0xff,
		via_dra_out =  0,
		via_ddrb =     0,
		via_ddra =     0,
		via_t1cl =     0xff,
		via_t1ch =     0xff,
		via_t1_1shot = 0,
		via_t1_undf =  0,
		via_t1ll =     0xff,
		via_t1lh =     0xff,
		via_t2cl =     0xff,
		via_t2ch =     0xff,
		via_t2ll =     0xff,
		via_t2_1shot = 0,
		via_t2_undf =  0,
		via_sr =       0,
		via_sr_cntr =  0,
		via_sr_start = 0,
		via_acr =      0,
		via_pcr =      0,
		via_ifr =      0,
		via_ier =      0x80,
		via_cb1 =      1,
		via_cb2 =      1;

	var audioSignal =  0,
		video_cycle =  0,
		snesData =     0xffff,
		snesLatch =    0xffff;


	this.reset = function() {
		for (var i = 0; i < 10; i++) keyrow[i] = 0xff;

		pia1_pa_in =   0xf0;
		pia1_pa_out =  0;
		pia1_ddra =    0;
		pia1_cra =     0;
		pia1_pb_in =   0xff;
		pia1_pb_out =  0;
		pia1_ddrb =    0;
		pia1_crb =     0;
		pia1_ca2 =     0;
		pia1_cb1 =     0;

		pia2_pa_in =   0;
		pia2_pa_out =  0;
		pia2_ddra =    0;
		pia2_cra =     0;
		pia2_pb_in =   0;
		pia2_pb_out =  0;
		pia2_ddrb =    0;
		pia2_crb =     0;

		via_drb_in =   0xff;
		via_drb_out =  0;
		via_dra_in =   0xff;
		via_dra_out =  0;
		via_ddrb =     0;
		via_ddra =     0;
		via_t1cl =     (1 + Math.random() * 254) & 0xff;
		via_t1ch =     (1 + Math.random() * 254) & 0xff;
		via_t1_1shot = 0;
		via_t1_undf =  0;
		via_t1ll =     (1 + Math.random() * 254) & 0xff;
		via_t1lh =     (1 + Math.random() * 254) & 0xff;
		via_t2cl =     (1 + Math.random() * 254) & 0xff;
		via_t2ch =     (1 + Math.random() * 254) & 0xff;
		via_t2ll =     (1 + Math.random() * 254) & 0xff;
		via_t2_1shot = 0;
		via_t2_undf =  0;
		via_sr =       (Math.random() * 255) & 0xff;
		via_sr_cntr =  0;
		via_sr_start = 0;
		via_acr =      0;
		via_pcr =      0;
		via_ifr =      0;
		via_ier =      0x80;
		via_cb1 =      1;
		via_cb2 =      1;

		audioSignal =  0;
		video_cycle =  0;
		video.setCharset(false);
		snesData = snesLatch = 0xffff;

		ieee.reset();
	};

	// Update the IRQ level based upon PIA and VIA.
	this.updateIrq = function() {
		var irq = 0;

		if ((pia1_cra & 0x81) == 0x81 || (pia1_cra & 0x48) == 0x48 ||
			(pia1_crb & 0x81) == 0x81 || (pia1_crb & 0x48) == 0x48)
			irq = 1;
		if ((via_ifr & via_ier & 0x7f) != 0) {
			via_ifr |= 0x80;
			irq = 1;
		}
		else
			via_ifr &= ~0x80;

		hw.irq_signal = irq;
	};

	this.setKeyrows = function(rows) {
		for (var i = 0; i < 10; i++)
			keyrow[i] = rows[i] | 0;

		// Update pia1_pb.
		if ((pia1_pa_out & 15) < 10)
			pia1_pb_in = keyrow[pia1_pa_out & 15];
		else
			pia1_pb_in = 0xff;
	};

	this.sync = function(sig) {
		// SYNC signal is wired to PIA1.CB1 and VIA.PB[5]
		if (sig != pia1_cb1) {
			if (((pia1_crb & 0x02) != 0 && sig) ||
				((pia1_crb & 0x02) == 0 && !sig)) {
				pia1_crb |= 0x80;
				if ((pia1_crb & 0x01) != 0)
					this.updateIrq();
			}
			pia1_cb1 = sig;
		}

		/* Set/clr VIA.PB[5] */
		via_drb_in = sig ? (via_drb_in | 0x20) : (via_drb_in & ~0x20);
	};


	/* CHIP IMPLEMENTATION */

	this.PIA1_read = function(line) {
		switch (line) {
		case PIA1_PA:
			if ((pia1_cra & 0x04) != 0) {
				/* Clear IRQs in CRA as side-effect of reading PA. */
				if ((pia1_cra & 0xC0) != 0) {
					pia1_cra &= 0x3F;
					this.updateIrq();
				}
				if ((pia1_ddra & 0x40) == 0) {
					if (ieee.EOIin())
						pia1_pa_in |= 0x40;
					else
						pia1_pa_in &= 0xbf;
				}
				return (pia1_pa_in & ~pia1_ddra) |
					(pia1_pa_out & pia1_ddra);
			}
			else
				return pia1_ddra;
		case PIA1_CRA:
			return pia1_cra;
		case PIA1_PB:
			if ((pia1_crb & 0x04) != 0) {
				/* Clear IRQs in CRB as side-effect of reading PB. */
				if ((pia1_crb & 0xC0) != 0) {
					pia1_crb &= 0x3F;
				}
					this.updateIrq();
				return (pia1_pb_in & ~pia1_ddrb) |
					(pia1_pb_out & pia1_ddrb);
			}
			else
				return pia1_ddrb;
		case PIA1_CRB:
			return pia1_crb;
		}
	};

	this.PIA1_write = function(line, d8) {
		switch (line) {
		case PIA1_PA:
			if ((pia1_cra & 0x04) != 0) {
				pia1_pa_out = d8;
				// Which keyrow are we accessing?
				if ((pia1_pa_out & 15) < 10)
					pia1_pb_in = keyrow[pia1_pa_out & 15];
				else
					pia1_pb_in = 0xff;
			}
			else
				pia1_ddra = d8;
			break;
		case PIA1_CRA:
			pia1_cra = (pia1_cra & 0xc0) | (d8 & 0x3f);
			// Change in CA2? (screen blank)
			if ((pia1_cra & 0x38) == 0x38 && !pia1_ca2) {
				// CA2 transitioning high. (Screen On)
				pia1_ca2 = 1;
				video.setVideoBlank(0);
				ieee.EOIout(true);
			}
			else if ((pia1_cra & 0x38) == 0x30 && pia1_ca2) {
				// CA2 transitioning low. (Screen Blank)
				pia1_ca2 = 0;
				video.setVideoBlank(1);
				ieee.EOIout(false);
			}
			break;
		case PIA1_PB:
			if ((pia1_crb & 0x04) != 0)
				pia1_pb_out = d8;
			else
				pia1_ddrb = d8;
			break;
		case PIA1_CRB:
			pia1_crb = (pia1_crb & 0xc0) | (d8 & 0x3f);
			this.updateIrq();
			break;
		}
	};

	this.PIA2_read = function(line) {
		switch (line) {
		case PIA2_PA:
			if ((pia2_cra & 0x04) != 0) {
				/* Clear IRQs in CRA as side-effect of reading PA. */
				if ((pia2_cra & 0xC0) != 0) {
					pia2_cra &= 0x3F;
					this.updateIrq();
				}
				if (pia2_ddra == 0)
					pia2_pa_in = ieee.DIOin();
				return (pia2_pa_in & ~pia2_ddra) |
					(pia2_pa_out & pia2_ddra);
			}
			else
				return pia2_ddra;
		case PIA2_CRA:
			return pia2_cra;
		case PIA2_PB:
			if ((pia2_crb & 0x04) != 0) {
				/* Clear IRQs in CRB as side-effect of reading PB. */
				if ((pia2_crb & 0x3F) != 0) {
					pia2_crb &= 0x3F;
					this.updateIrq();
				}
				return (pia2_pb_in & ~pia2_ddrb) |
					(pia2_pb_out & pia2_ddrb);
			}
			else
				return pia2_ddrb;
		case PIA2_CRB:
			if (ieee.SRQin())
				pia2_crb |= 0x80;
			else
				pia2_crb &= 0x7f;
			return pia2_crb;
		}
	};

	this.PIA2_write = function(line, d8) {
		switch (line) {
		case PIA2_PA:
			if ((pia2_cra & 0x04) != 0)
				pia2_pa_out = d8;
			else
				pia2_ddra = d8;
			break;
		case PIA2_CRA:
			pia2_cra = (pia2_cra & 0xc0) | (d8 & 0x3f);
			ieee.NDACout((pia2_cra & 0x08) != 0x00);
			break;
		case PIA2_PB:
			if ((pia2_crb & 0x04) != 0) {
				pia2_pb_out = d8;
				if (pia2_ddrb == 0xff)
					ieee.DIOout(pia2_pb_out);
			}
			else
				pia2_ddrb = d8;
			break;
		case PIA2_CRB:
			pia2_crb = (pia2_crb & 0xc0) | (d8 & 0x3f);
			ieee.DAVout((pia2_crb & 0x08) != 0x00);
			break;
		}
	};

	this.VIA_read = function(line) {
		switch (line) {
		case VIA_DRB:
			/* Clear CB2 interrupt flag IFR3 (if not "independent"
			 * interrupt)
			 */
			if ((via_pcr & 0xa0) != 0x20) {
				if ((via_ifr & 0x08) != 0) {
					via_ifr &= ~0x08;
					if ((via_ier & 0x08) != 0)
						this.updateIrq();
				}
			}
			/* Clear CB1 interrupt flag IFR4 */
			if ((via_ifr & 0x10) != 0) {
				via_ifr &= ~0x10;
				if ((via_ier & 0x10) != 0)
					this.updateIrq();
			}
			if ((via_ddrb & 0x80) == 0) {
				if (ieee.DAVin())
					via_drb_in |= 0x80;
				else
					via_drb_in &= 0x7f;
			}
			if ((via_ddrb & 0x40) == 0) {
				if (ieee.NRFDin())
					via_drb_in |= 0x40;
				else
					via_drb_in &= 0xbf;
			}
			if ((via_ddrb & 0x01) == 0) {
				if (ieee.NDACin())
					via_drb_in |= 0x01;
				else
					via_drb_in &= 0xfe;
			}
			return (via_drb_in & ~via_ddrb) |
				(via_drb_out & via_ddrb);
		case VIA_DRA:
			/* Clear CA2 interrupt flag IFR0 (if not "independent"
			 * interrupt)
			 */
			if ((via_pcr & 0x0a) != 0x02) {
				if ((via_ifr & 0x01) != 0) {
					via_ifr &= ~0x01;
					if ((via_ier & 0x01) != 0)
						this.updateIrq();
				}
			}
			/* Clear CA1 interrupt flag IFR1 */
			if ((via_ifr & 0x02) != 0) {
				via_ifr &= ~0x02;
				if ((via_ier & 0x02) != 0)
					this.updateIrq();
			}
			return (via_dra_in & ~via_ddra) | (via_dra_out & via_ddra);
		case VIA_DDRB:
			return via_ddrb;
		case VIA_DDRA:
			return via_ddra;
		case VIA_T1CL:
			/* Clear T1 interrupt flag IFR6 as side-effect of read T1CL. */
			if ((via_ifr & 0x40) != 0) {
				via_ifr &= ~0x40;
				if ((via_ier & 0x40) != 0)
					this.updateIrq();
			}
			return via_t1cl;
		case VIA_T1CH:
			return via_t1ch;
		case VIA_T1LL:
			return via_t1ll;
		case VIA_T1LH:
			return via_t1lh;
		case VIA_T2CL:
			/* Clear T2 interrupt flag IFR5 as side-effect of reading T2CL */
			if ((via_ifr & 0x20) != 0) {
				via_ifr &= ~0x20;
				if ((via_ier & 0x20) != 0)
					this.updateIrq();
			}
			return via_t2cl;
		case VIA_T2CH:
			return via_t2ch;
		case VIA_SR:
			/* Clear SR int flag IFR2 */
			if ((via_ifr & 0x04) != 0) {
				via_ifr &= ~0x04;
				if ((via_ier & 0x04) != 0)
					this.updateIrq();
			}
			/* Start SR counter. */
			if ((via_acr & 0x1c) != 0 && via_sr_cntr == 0)
				via_sr_start = 1;
			return via_sr;
		case VIA_ACR:
			return via_acr;
		case VIA_PCR:
			return via_pcr;
		case VIA_IFR:
			return via_ifr;
		case VIA_IER:
			return via_ier;
		case VIA_ANH:
			/* VIA_PA with no handshake. */
			return (via_dra_in & ~via_ddra) | (via_dra_out & via_ddra);
		}
	};

	this.VIA_write = function(line, d8) {
		switch (line) {
		case VIA_DRB:
			/* Clear CB2 interrupt flag IFR3 (if not "independent"
			 * interrupt)
			 */
			if ((via_pcr & 0xa0) != 0x20) {
				if ((via_ifr & 0x08) != 0) {
					via_ifr &= ~0x08;
					if ((via_ier & 0x08) != 0)
						this.updateIrq();
				}
			}
			/* Clear CB1 interrupt flag IFR4 */
			if ((via_ifr & 0x10) != 0) {
				via_ifr &= ~0x10;
				if ((via_ier & 0x10) != 0)
					this.updateIrq();
			}
			via_drb_out = d8;
			// Cass write change?
			// if (((via_drb_out ^ d8) &0x08) != 0)
			//	   pet2001io_cass_write(io, (d8 & 0x08) != 0);

			// IEEE outputs
			if ((via_ddrb & 0x04) != 0)
				ieee.ATNout((via_drb_out & 0x04) != 0x00);
			if ((via_ddrb & 0x02) != 0)
				ieee.NRFDout((via_drb_out & 0x02) != 0x00);
			break;
		case VIA_DRA:
			if ((via_ddra & 0x68) == 0x28) pollSNESAdapter(d8);
			/* Clear CA2 interrupt flag IFR0 (if not "independent"
			 * interrupt)
			 */
			if ((via_pcr & 0x0a) != 0x02) {
				if ((via_ifr & 0x01) != 0) {
					via_ifr &= ~0x01;
					if ((via_ier & 0x01) != 0)
						this.updateIrq();
				}
			}
			/* Clear CA1 interrupt flag IFR1 */
			if ((via_ifr & 0x02) != 0) {
				via_ifr &= ~0x02;
				if ((via_ier & 0x02) != 0)
					this.updateIrq();
			}
			via_dra_out = d8;
			break;
		case VIA_DDRB:
			via_ddrb = d8;
			break;
		case VIA_DDRA:
			via_ddra = d8;
			break;
		case VIA_T1CL:
			via_t1ll = d8;		/* LATCH */
			break;
		case VIA_T1CH:
			/* Clear T1 interrupt flag IFR6 as side-effect of writing T1CH */
			if ((via_ifr & 0x40) != 0) {
				via_ifr &= ~0x40;
				if ((via_ier & 0x40) != 0)
					this.updateIrq();
			}
			/* Write to T1LH and set via_t1_undf to set T1 next cycle. */
			via_t1lh = d8;
			via_t1_undf = 1;
			via_t1_1shot = 1;
			break;
		case VIA_T1LL:
			via_t1ll = d8;
			break;
		case VIA_T1LH:
			/* Clear T1 interrupt flag IFR6 as side-effect of writing T1LH */
			if ((via_ifr & 0x40) != 0) {
				via_ifr &= ~0x40;
				if ((via_ier & 0x40) != 0)
					this.updateIrq();
			}
			via_t1lh = d8;
			break;
		case VIA_T2CL:
			via_t2ll = d8;		/* LATCH */
			break;
		case VIA_T2CH:
			/* Clear T2 interrupt flag IFR5 as side-effect of writing T2CH */
			if ((via_ifr & 0x20) != 0) {
				via_ifr &= ~0x20;
				if ((via_ier & 0x20) != 0)
					this.updateIrq();
			}
			if ((via_acr & 0x20) == 0)
				via_t2_1shot = 1;
			via_t2cl = via_t2ll;
			via_t2ch = d8;
			/*
			 * Increment counter to take into account cycle() will
			 * decrement it in the same cycle.
			 */
			if ((via_acr & 0x20) == 0 && ++via_t2cl == 0x100) {
				via_t2cl = 0;
				if (++via_t2ch == 0x100)
					via_t2ch = 0;
			}
			break;
		case VIA_SR:
			/* Clear SR int flag IFR2 */
			if ((via_ifr & 0x04) != 0) {
				via_ifr &= ~0x04;
				if ((via_ier & 0x04) != 0)
					this.updateIrq();
			}
			/* Start the SR counter. */
			if ((via_acr & 0x1c) != 0)
				via_sr_start = 1;
			via_sr = d8;
			break;
		case VIA_ACR:
			if ((d8 & 0x1c) == 0) {
				via_sr_cntr = 0;
				via_cb1 = 1;
			}
			via_acr = d8;
			break;
		case VIA_PCR:
			/* Did we change CA2 output? */
			if ((via_pcr & 0x0e) != (d8 & 0x0e)) {
				video.setCharset((d8 & 0x0e) != 0x0c);
			}
			if ((d8 & 0xc0) == 0xc0) {
				// CB2 output under manual control (N.L.)
				via_cb2 = (d8 >> 5) & 1;
			}
			else if ((via_pcr & 0xc0) == 0xc0 && (!via_t2ll || !via_t2cl)) {
				// fix possible miss of T2CL going low in free running mode
				audioSignal = 0;
			}
			via_pcr = d8;
			break;
		case VIA_IFR:
			/* Clear interrupt flags by writing 1s to the bits. */
			via_ifr &= ~(d8 & 0x7f);
			this.updateIrq();
			break;
		case VIA_IER:
			if ((d8 & 0x80) != 0)
				via_ier |= d8;
			else
				via_ier &= ~d8;
			this.updateIrq();
			break;
		case VIA_ANH:
			/* VIA_PA with no handshake. */
			if ((via_ddra & 0x68) == 0x28) pollSNESAdapter(d8);
			via_dra_out = d8;
			break;
		}
	};

	this.VIA_cycle = function() {
		/* Handle VIA.TIMER1 */
		if (via_t1_undf) {
			/* T1 underflow.  Reload. */
			via_t1cl = via_t1ll;
			via_t1ch = via_t1lh;
			via_t1_undf = 0;
		}
		else if (via_t1cl-- == 0) {
			if (via_t1ch-- == 0) {

				via_t1_undf = 1;

				/* Interrupt? */
				if (via_t1_1shot) {
					via_ifr |= 0x40;
					if ((via_ier & 0x40) != 0)
						this.updateIrq();
					if ((via_acr & 0x40) == 0)
						via_t1_1shot = 0;
				}
			}
		}
		via_t1cl &= 0xff;
		via_t1ch &= 0xff;

		/* Handle VIA.TIMER2 */
		if (via_t2_undf) {
			via_t2cl = via_t2ll;
			if ((via_acr & 0x1c) == 0x10 && via_sr_cntr > 0) {
				/* Free-running shift register. */
				via_cb1 = !via_cb1;
				if (via_cb1) {
					via_sr = ((via_sr >> 7) | (via_sr << 1)) & 0xff;
					via_cb2 = via_sr & 1;
				}
			}
			else if ((via_acr & 0x0c) == 4 && via_sr_cntr > 0) {
				/* Other SR modes clocked by T2. */
				via_cb1 = !via_cb1;
				if (via_cb1) {
					if ((via_acr & 0x10) != 0)
						via_sr = ((via_sr >> 7) | (via_sr << 1)) & 0xff;
					else
						via_sr = ((via_sr << 1) | 1) & 0xff;
					via_cb2 = via_sr & 1;
					if (--via_sr_cntr == 0) {
						via_ifr |= 0x04;
						if ((via_ier & 0x04) != 0)
							this.updateIrq();
					}
				}
			}
			via_t2_undf = 0;
		}
		else if ((via_acr & 0x20) == 0 && via_t2cl-- == 0) {
			/* Reload T2L on next cycle? */
			if ((via_acr & 0x14) != 0)
				via_t2_undf = 1;

			if (via_t2ch-- == 0) {
				/* T2 underflow. */
				if (via_t2_1shot) {
					via_ifr |= 0x20;
					if ((via_ier & 0x20) != 0)
						this.updateIrq();
					via_t2_1shot = 0;
				}
			}
		}
		via_t2cl &= 0xff;
		via_t2ch &= 0xff;

		/* Handle VIA_SR when in system clock mode. */
		if (via_sr_cntr > 0 && (via_acr & 0xc) == 8) {
			via_cb1 = !via_cb1;
			if (via_cb1) {
				if ((via_acr & 0x10) != 0)
					via_sr = ((via_sr >> 7) | (via_sr << 1)) & 0xff;
				else
					via_sr = ((via_sr << 1) | 1) & 0xff;
				via_cb2 = via_sr & 1;
				if (--via_sr_cntr == 0) {
					via_ifr |= 0x04;
					if ((via_ier & 0x04) != 0)
						this.updateIrq();
				}
			}
		}
		if (via_sr_start) {
			via_sr_start = 0;
			via_sr_cntr = (via_acr & 0x10) == 0 ? 8 : 9;
		}

		/* Sample audio signal (N.L.) */
		if (audio) {
			if ((via_t2ll | via_t2cl) && (via_acr & 0x1c) == 0x10) {
				// CB2 output and "free running" mode (overwrites PCR manual control)
				// (check for via_t2cl is a fix for Space Invaders)
				if (!via_t2_undf) audioSignal = via_cb2;
			}
			else if ((via_pcr & 0xc0) == 0xc0) {
				// CB2 under "manual" control
				audioSignal = via_cb2;
			}
			else {
				audioSignal = 0;
			}
			audio.writeSignal(audioSignal);
		}
	};

	/* CHIP SELECT / EXTERNAL INTERFACE */

	this.read = function(addr) {
		var cs = (addr >> 4) & 7;
		switch (cs) {
			case 0: return addr >> 8; // N/C: return hi-byte of address
			case 1: return this.PIA1_read(addr & 3);
			case 2: return this.PIA2_read(addr & 3);
			case 3: return this.PIA1_read(addr & 3) & this.PIA2_read(addr & 3);
			case 4: return this.VIA_read(addr & 0xf);
			case 5: return this.PIA1_read(addr & 3) & this.VIA_read(addr & 0xf);
			case 6: return this.PIA2_read(addr & 3) & this.VIA_read(addr & 0xf);
			case 7: return this.PIA1_read(addr & 3) & this.PIA2_read(addr & 3) & this.VIA_read(addr & 0xf);
		}
	};

	this.write = function(addr, d8) {
		var cs = (addr >> 4) & 7;
		switch (cs) {
			case 1: this.PIA1_write(addr & 3, d8); break;
			case 2: this.PIA2_write(addr & 3, d8); break;
			case 3: this.PIA1_write(addr & 3, d8) || this.PIA2_write(addr & 3, d8); break;
			case 4: this.VIA_write(addr & 0xf, d8); break;
			case 5: this.PIA1_write(addr & 3, d8) || this.VIA_write(addr & 0xf, d8); break;
			case 6: this.PIA2_write(addr & 3, d8) || this.VIA_write(addr & 0xf, d8); break;
			case 7: this.PIA1_write(addr & 3, d8) || this.PIA2_write(addr & 3, d8) || this.VIA_write(addr & 0xf, d8); break;
		}
	};

	this.cycle = function () {
		// Synthesisze a SYNC signal at 60.1hz and 76.9% duty cycle.
		if (++video_cycle == 3840) {
			this.sync(1);
			keyboard.sync();
		}
		else if (video_cycle == 16640) {
			this.sync(0);
			video_cycle = 0;
		}
		video.cycle(video_cycle);

		this.VIA_cycle();
		ieee.checkTimeout();
	};

	function pollSNESAdapter(port) {
		/* SNES serial adapter, PA3: clock, PA5: latch, PA6: data */
		port &= 0x28;
		if (port & 0x20) snesData = snesLatch;
		else if (port & 0x08) snesData = (snesData >> 1) | 0x8000;
		else via_dra_in = 0xbf | ((snesData & 1) << 6);
	}

	this.setSNESAdapter = function(d16) {
		snesLatch = d16;
	};
	this.resetSNESAdapter = function() {
		snesData = snesLatch = 0xffff;
	};
	this.setDRAin = function(d8) {
		via_dra_in = d8;
	};


/*
 * dump for debbugger
 * like read(), but without side effects on state (NL 2024)
 */

	this.PIA1_dump = function(line) {
		switch (line) {
		case PIA1_PA:
			if ((pia1_cra & 0x04) != 0) {
				var _pa_in = pia1_pa_in;
				if ((pia1_ddra & 0x40) == 0) {
					if (ieee.EOIin()) _pa_in |= 0x40;
					else _pa_in &= 0xbf;
				}
				return (_pa_in & ~pia1_ddra) | (pia1_pa_out & pia1_ddra);
			}
			return pia1_ddra;
		case PIA1_CRA:
			return pia1_cra;
		case PIA1_PB:
			if ((pia1_crb & 0x04) != 0)
				return (pia1_pb_in & ~pia1_ddrb) | (pia1_pb_out & pia1_ddrb);
			return pia1_ddrb;
		case PIA1_CRB:
			return pia1_crb;
		}
	};
	this.PIA2_dump = function(line) {
		switch (line) {
		case PIA2_PA:
			if ((pia2_cra & 0x04) != 0) {
				var _pa_in = pia2_pa_in;
				if (pia2_ddra == 0) _pa_in = ieee.DIOin();
				return (_pa_in & ~pia2_ddra) | (pia2_pa_out & pia2_ddra);
			}
			return pia2_ddra;
		case PIA2_CRA:
			return pia2_cra;
		case PIA2_PB:
			if ((pia2_crb & 0x04) != 0)
				return (pia2_pb_in & ~pia2_ddrb) | (pia2_pb_out & pia2_ddrb);
			return pia2_ddrb;
		case PIA2_CRB:
			if (ieee.SRQin()) return pia2_crb | 0x80;
			return pia2_crb & 0x7f;
		}
	};
	this.VIA_dump = function(line) {
		switch (line) {
		case VIA_DRB:
			var _drb_in = via_drb_in;
			if ((via_ddrb & 0x80) == 0) {
				if (ieee.DAVin())
					_drb_in |= 0x80;
				else
					_drb_in &= 0x7f;
			}
			if ((via_ddrb & 0x40) == 0) {
				if (ieee.NRFDin())
					_drb_in |= 0x40;
				else
					_drb_in &= 0xbf;
			}
			if ((via_ddrb & 0x01) == 0) {
				if (ieee.NDACin())
					_drb_in |= 0x01;
				else
					_drb_in &= 0xfe;
			}
			return (_drb_in & ~via_ddrb) | (via_drb_out & via_ddrb);
		case VIA_DRA:
			return (via_dra_in & ~via_ddra) | (via_dra_out & via_ddra);
		case VIA_DDRB:
			return via_ddrb;
		case VIA_DDRA:
			return via_ddra;
		case VIA_T1CL:
			return via_t1cl;
		case VIA_T1CH:
			return via_t1ch;
		case VIA_T1LL:
			return via_t1ll;
		case VIA_T1LH:
			return via_t1lh;
		case VIA_T2CL:
			return via_t2cl;
		case VIA_T2CH:
			return via_t2ch;
		case VIA_SR:
			return via_sr;
		case VIA_ACR:
			return via_acr;
		case VIA_PCR:
			return via_pcr;
		case VIA_IFR:
			return via_ifr;
		case VIA_IER:
			return via_ier;
		case VIA_ANH:
			return (via_dra_in & ~via_ddra) | (via_dra_out & via_ddra);
		}
	};

	this.dump = function(addr) {
		var cs = (addr >> 4) & 7;
		switch (cs) {
			case 0: return addr >> 8; // N/C: return hi-byte of address
			case 1: return this.PIA1_dump(addr & 3);
			case 2: return this.PIA2_dump(addr & 3);
			case 3: return this.PIA1_dump(addr & 3) & this.PIA2_dump(addr & 3);
			case 4: return this.VIA_dump(addr & 0xf);
			case 5: return this.PIA1_dump(addr & 3) & this.VIA_dump(addr & 0xf);
			case 6: return this.PIA2_dump(addr & 3) & this.VIA_dump(addr & 0xf);
			case 7: return this.PIA1_dump(addr & 3) & this.PIA2_dump(addr & 3) & this.VIA_dump(addr & 0xf);
		}
	};

}
