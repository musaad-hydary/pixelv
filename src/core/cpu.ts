import { signExtend } from "./assembler";

export const FB_WIDTH = 256;
export const FB_HEIGHT = 256;

const MEM_SIZE = 1 << 20;
const FB_BASE = 0xff000000;
const FB_PIXELS = FB_WIDTH * FB_HEIGHT;

export interface CPUState {
  registers: Int32Array;
  pc: number;
  cycles: number;
  halted: boolean;
}

export class RV32CPU {
  public regs = new Int32Array(32);
  public mem = new Uint8Array(MEM_SIZE);
  public pc: number;
  public halted = false;
  public cycles = 0;
  public fb = new Uint32Array(FB_PIXELS);

  private view: DataView;

  constructor(binary: Uint32Array, base: number) {
    this.pc = base;
    this.view = new DataView(this.mem.buffer);

    // stack pointer starts at top of memory and grows down
    this.regs[2] = (base & ~(MEM_SIZE - 1)) + MEM_SIZE - 4;

    // load program into memory
    const offset = base & (MEM_SIZE - 1);
    for (let i = 0; i < binary.length; i++) {
      this.view.setUint32(offset + i * 4, binary[i], true);
    }
  }

  // memory
  private isFramebuffer(addr: number): boolean {
    const a = addr >>> 0;
    return a >= FB_BASE && a < FB_BASE + FB_PIXELS * 4;
  }

  private mo(addr: number): number {
    return (addr >>> 0) & (MEM_SIZE - 1);
  }

  readWord(addr: number): number {
    if (this.isFramebuffer(addr))
      return this.fb[((addr >>> 0) - FB_BASE) >>> 2];
    return this.view.getInt32(this.mo(addr), true);
  }

  readHalf(addr: number): number {
    return this.view.getInt16(this.mo(addr), true);
  }
  readHalfU(addr: number): number {
    return this.view.getUint16(this.mo(addr), true);
  }
  readByte(addr: number): number {
    return this.view.getInt8(this.mo(addr));
  }
  readByteU(addr: number): number {
    return this.mem[this.mo(addr)];
  }

  writeWord(addr: number, val: number): void {
    if (this.isFramebuffer(addr)) {
      const idx = ((addr >>> 0) - FB_BASE) >>> 2;
      if (idx < FB_PIXELS) this.fb[idx] = (val >>> 0) | 0xff000000;
      return;
    }
    this.view.setUint32(this.mo(addr), val >>> 0, true);
  }

  writeHalf(addr: number, val: number): void {
    this.view.setUint16(this.mo(addr), val & 0xffff, true);
  }

  writeByte(addr: number, val: number): void {
    this.mem[this.mo(addr)] = val & 0xff;
  }

  // drawing primitives

  setPixel(x: number, y: number, color: number): void {
    if (x < 0 || x >= FB_WIDTH || y < 0 || y >= FB_HEIGHT) return;
    this.fb[y * FB_WIDTH + x] = (color >>> 0) | 0xff000000;
  }

  fillRect(x: number, y: number, w: number, h: number, color: number): void {
    const c = (color >>> 0) | 0xff000000;
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const px = x + dx,
          py = y + dy;
        if (px >= 0 && px < FB_WIDTH && py >= 0 && py < FB_HEIGHT)
          this.fb[py * FB_WIDTH + px] = c;
      }
  }

  drawLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: number,
  ): void {
    const c = (color >>> 0) | 0xff000000;
    let dx = Math.abs(x1 - x0),
      dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1,
      sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.setPixel(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  drawCircle(
    cx: number,
    cy: number,
    r: number,
    color: number,
    fill: boolean,
  ): void {
    const c = (color >>> 0) | 0xff000000;
    if (fill) {
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++)
          if (x * x + y * y <= r * r) this.setPixel(cx + x, cy + y, c);
    } else {
      let x = r,
        y = 0,
        err = 0;
      while (x >= y) {
        this.setPixel(cx + x, cy + y, c);
        this.setPixel(cx + y, cy + x, c);
        this.setPixel(cx - y, cy + x, c);
        this.setPixel(cx - x, cy + y, c);
        this.setPixel(cx - x, cy - y, c);
        this.setPixel(cx - y, cy - x, c);
        this.setPixel(cx + y, cy - x, c);
        this.setPixel(cx + x, cy - y, c);
        y++;
        err += 2 * y + 1;
        if (2 * (err - x) + 1 > 0) {
          x--;
          err += 2 * (1 - x);
        }
      }
    }
  }

  // syscalls

  private syscall(): void {
    const num = this.regs[17];
    const a0 = this.regs[10],
      a1 = this.regs[11];
    const a2 = this.regs[12],
      a3 = this.regs[13];
    const a4 = this.regs[14];

    switch (num) {
      case 10:
        this.halted = true;
        break;
      case 200:
        this.setPixel(a0, a1, a2);
        break;
      case 201:
        this.fillRect(a0, a1, a2, a3, a4);
        break;
      case 202:
        this.fb.fill((a0 >>> 0) | 0xff000000);
        break;
      case 203:
        this.drawLine(a0, a1, a2, a3, a4);
        break;
      case 204:
        this.drawCircle(a0, a1, a2, a3, a4 !== 0);
        break;
    }
  }

  // Fetch → Decode → Execute

  step(): void {
    if (this.halted) return;

    const pc = this.pc >>> 0;
    const instr = this.readWord(pc) >>> 0;

    const opcode = instr & 0x7f;
    const rd = (instr >>> 7) & 0x1f;
    const funct3 = (instr >>> 12) & 0x07;
    const rs1 = (instr >>> 15) & 0x1f;
    const rs2 = (instr >>> 20) & 0x1f;
    const funct7 = (instr >>> 25) & 0x7f;

    const r1 = this.regs[rs1];
    const r2 = this.regs[rs2];

    const immI = signExtend(instr >>> 20, 12);
    const immS = signExtend(((instr >>> 25) << 5) | ((instr >>> 7) & 0x1f), 12);
    const immB = signExtend(
      (((instr >>> 31) & 1) << 12) |
        (((instr >>> 7) & 1) << 11) |
        (((instr >>> 25) & 0x3f) << 5) |
        (((instr >>> 8) & 0xf) << 1),
      13,
    );
    const immU = instr & 0xfffff000;
    const immJ = signExtend(
      (((instr >>> 31) & 1) << 20) |
        (((instr >>> 12) & 0xff) << 12) |
        (((instr >>> 20) & 1) << 11) |
        (((instr >>> 21) & 0x3ff) << 1),
      21,
    );

    let nextPc = (pc + 4) >>> 0;

    const setRd = (v: number) => {
      if (rd !== 0) this.regs[rd] = v | 0;
    };

    switch (opcode) {
      case 0x33: {
        // R-type
        if (funct7 === 1) {
          switch (funct3) {
            case 0:
              setRd(Math.imul(r1, r2));
              break;
            case 1:
              setRd(Number((BigInt(r1) * BigInt(r2)) >> 32n) | 0);
              break;
            case 4:
              setRd(r2 === 0 ? -1 : (r1 / r2) | 0);
              break;
            case 5:
              setRd(r2 === 0 ? -1 : ((r1 >>> 0) / (r2 >>> 0)) | 0);
              break;
            case 6:
              setRd(r2 === 0 ? r1 : r1 % r2);
              break;
            case 7:
              setRd(r2 === 0 ? r1 : ((r1 >>> 0) % (r2 >>> 0)) | 0);
              break;
          }
        } else {
          switch (funct3) {
            case 0:
              setRd(funct7 ? r1 - r2 : r1 + r2);
              break;
            case 1:
              setRd(r1 << (r2 & 31));
              break;
            case 2:
              setRd(r1 < r2 ? 1 : 0);
              break;
            case 3:
              setRd(r1 >>> 0 < r2 >>> 0 ? 1 : 0);
              break;
            case 4:
              setRd(r1 ^ r2);
              break;
            case 5:
              setRd(funct7 ? r1 >> (r2 & 31) : r1 >>> (r2 & 31));
              break;
            case 6:
              setRd(r1 | r2);
              break;
            case 7:
              setRd(r1 & r2);
              break;
          }
        }
        break;
      }

      case 0x13: {
        // I-type ALU
        switch (funct3) {
          case 0:
            setRd(r1 + immI);
            break;
          case 1:
            setRd(r1 << (immI & 31));
            break;
          case 2:
            setRd(r1 < immI ? 1 : 0);
            break;
          case 3:
            setRd(r1 >>> 0 < immI >>> 0 ? 1 : 0);
            break;
          case 4:
            setRd(r1 ^ immI);
            break;
          case 5:
            setRd(funct7 ? r1 >> (immI & 31) : r1 >>> (immI & 31));
            break;
          case 6:
            setRd(r1 | immI);
            break;
          case 7:
            setRd(r1 & immI);
            break;
        }
        break;
      }

      case 0x03: {
        // Loads
        const addr = (r1 + immI) >>> 0;
        switch (funct3) {
          case 0:
            setRd(this.readByte(addr));
            break;
          case 1:
            setRd(this.readHalf(addr));
            break;
          case 2:
            setRd(this.readWord(addr));
            break;
          case 4:
            setRd(this.readByteU(addr));
            break;
          case 5:
            setRd(this.readHalfU(addr));
            break;
        }
        break;
      }

      case 0x23: {
        // Stores
        const addr = (r1 + immS) >>> 0;
        switch (funct3) {
          case 0:
            this.writeByte(addr, r2);
            break;
          case 1:
            this.writeHalf(addr, r2);
            break;
          case 2:
            this.writeWord(addr, r2);
            break;
        }
        break;
      }

      case 0x63: {
        // Branches
        let taken = false;
        switch (funct3) {
          case 0:
            taken = r1 === r2;
            break;
          case 1:
            taken = r1 !== r2;
            break;
          case 4:
            taken = r1 < r2;
            break;
          case 5:
            taken = r1 >= r2;
            break;
          case 6:
            taken = r1 >>> 0 < r2 >>> 0;
            break;
          case 7:
            taken = r1 >>> 0 >= r2 >>> 0;
            break;
        }
        if (taken) nextPc = (pc + immB) >>> 0;
        break;
      }

      case 0x37:
        setRd(immU);
        break;
      case 0x17:
        setRd((pc + immU) | 0);
        break;
      case 0x6f:
        setRd(nextPc);
        nextPc = (pc + immJ) >>> 0;
        break;
      case 0x67:
        setRd(nextPc);
        nextPc = (r1 + immI) >>> 0;
        break;

      case 0x73:
        if (instr === 0x00100073) this.halted = true;
        else this.syscall();
        break;

      default:
        this.halted = true;
        return;
    }

    this.regs[0] = 0;
    this.pc = nextPc;
    this.cycles++;
  }

  run(maxCycles = 5_000_000): number {
    let c = 0;
    while (!this.halted && c < maxCycles) {
      this.step();
      c++;
    }
    return c;
  }

  getState(): CPUState {
    return {
      registers: new Int32Array(this.regs),
      pc: this.pc,
      cycles: this.cycles,
      halted: this.halted,
    };
  }
}
