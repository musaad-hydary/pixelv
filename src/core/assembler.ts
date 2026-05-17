export interface AssemblyResult {
  binary: Uint32Array;
  base: number;
  labels: Record<string, number>;
  lineCount: number;
}

export interface AssemblyError {
  line: number;
  message: string;
}

type LabelMap = Record<string, number>;

// register table that maps every valid register name to its number 0-31
const REGS: Record<string, number> = {
  x0: 0,
  x1: 1,
  x2: 2,
  x3: 3,
  x4: 4,
  x5: 5,
  x6: 6,
  x7: 7,
  x8: 8,
  x9: 9,
  x10: 10,
  x11: 11,
  x12: 12,
  x13: 13,
  x14: 14,
  x15: 15,
  x16: 16,
  x17: 17,
  x18: 18,
  x19: 19,
  x20: 20,
  x21: 21,
  x22: 22,
  x23: 23,
  x24: 24,
  x25: 25,
  x26: 26,
  x27: 27,
  x28: 28,
  x29: 29,
  x30: 30,
  x31: 31,
  zero: 0,
  ra: 1,
  sp: 2,
  gp: 3,
  tp: 4,
  t0: 5,
  t1: 6,
  t2: 7,
  s0: 8,
  fp: 8,
  s1: 9,
  a0: 10,
  a1: 11,
  a2: 12,
  a3: 13,
  a4: 14,
  a5: 15,
  a6: 16,
  a7: 17,
  s2: 18,
  s3: 19,
  s4: 20,
  s5: 21,
  s6: 22,
  s7: 23,
  s8: 24,
  s9: 25,
  s10: 26,
  s11: 27,
  t3: 28,
  t4: 29,
  t5: 30,
  t6: 31,
};

// helper functions

function reg(token: string): number {
  const name = token.trim().toLowerCase();
  if (name in REGS) {
    return REGS[name];
  }
  throw new Error(`Unknown register: '${token}'`);
}

function imm(token: string, labels: LabelMap): number {
  const s = token.trim();
  if (s in labels) {
    return labels[s];
  }
  if (s.startsWith("0x") || s.startsWith("0X")) {
    return parseInt(s, 16);
  }
  if (s.startsWith("-0x")) {
    return -parseInt(s.slice(1), 16);
  }
  const n = parseInt(s, 10);
  if (isNaN(n)) {
    throw new Error(`Invalid immediate: '${token}`);
  }
  return n;
}

// sign extend: takes a value with x significant bits and extends the sign bit to fill 32 bits
// ex) 0xFFF as 12 bits is -1 in 32 bits
export function signExtend(value: number, bits: number): number {
  const shift = 32 - bits;
  return (value << shift) >> shift;
}

// memory operand that parses offset(register) to [regNum, offset]
function memOp(token: string): [number, number] {
  const m = token.trim().match(/^(-?(?:0x[0-9a-fA-F]+|\d+))?\(([^)]+)\)$/);
  if (!m) {
    throw new Error(`Invalid memory operand: '${token}'`);
  }
  const offset = m[1] ? parseInt(m[1], m[1].startsWith("0x") ? 16 : 10) : 0;
  return [reg(m[2]), offset];
}

// branch/jump targets are PC-relative offsets
// if it is a label, subtract the current PC to get the offset
function branchTarget(token: string, labels: LabelMap, pc: number): number {
  const s = token.trim();
  if (s in labels) {
    return labels[s] - pc;
  }
  return imm(s, {});
}

// instruction encoders: each function packs args into a 32-bit word

// R-type: [funct7|rs2|rs1|funct3|rd|opcode]
function encR(
  funct7: number,
  rs2: number,
  rs1: number,
  funct3: number,
  rd: number,
  op: number,
): number {
  return (
    ((funct7 & 0x7f) << 25) |
    ((rs2 & 0x1f) << 20) |
    ((rs1 & 0x1f) << 15) |
    ((funct3 & 0x7) << 12) |
    ((rd & 0x1f) << 7) |
    (op & 0x7f)
  );
}

// I-type: [imm[11:0]|rs1|funct3|rd|opcode]
function encI(
  immediate: number,
  rs1: number,
  funct3: number,
  rd: number,
  op: number,
): number {
  return (
    ((immediate & 0xfff) << 20) |
    ((rs1 & 0x1f) << 15) |
    ((funct3 & 0x7) << 12) |
    ((rd & 0x1f) << 7) |
    (op & 0x7f)
  );
}

// S-type: immediate is split across two fields
// [imm[11:5]|rs2|rs1|funct3|imm[4:0]|opcode]
function encS(
  immediate: number,
  rs2: number,
  rs1: number,
  funct3: number,
  op: number,
): number {
  return (
    (((immediate >> 5) & 0x7f) << 25) |
    ((rs2 & 0x1f) << 20) |
    ((rs1 & 0x1f) << 15) |
    ((funct3 & 0x7) << 12) |
    ((immediate & 0x1f) << 7) |
    (op & 0x7f)
  );
}

// B-type: bits are scrambled to keep rs1/rs2/funct3 in standard positions
// [imm[12]|imm[10:5]|rs2|rs1|funct3|imm[4:1]|imm[11]|opcode]
function encB(
  immediate: number,
  rs2: number,
  rs1: number,
  funct3: number,
  op: number,
): number {
  const i12 = (immediate >> 12) & 1;
  const i11 = (immediate >> 11) & 1;
  const i10_5 = (immediate >> 5) & 0x3f;
  const i4_1 = (immediate >> 1) & 0xf;
  return (
    (i12 << 31) |
    (i10_5 << 25) |
    ((rs2 & 0x1f) << 20) |
    ((rs1 & 0x1f) << 15) |
    ((funct3 & 0x7) << 12) |
    (i4_1 << 8) |
    (i11 << 7) |
    (op & 0x7f)
  );
}

// U-type: [imm[31:12]|rd|opcode]
function encU(immediate: number, rd: number, op: number): number {
  return ((immediate & 0xfffff) << 12) | ((rd & 0x1f) << 7) | (op & 0x7f);
}

// J-type: bits scrambled like B-type
// [imm[20]|imm[10:1]|imm[11]|imm[19:12]|rd|opcode]
function encJ(immediate: number, rd: number, op: number): number {
  const i20 = (immediate >> 20) & 1;
  const i19_12 = (immediate >> 12) & 0xff;
  const i11 = (immediate >> 11) & 1;
  const i10_1 = (immediate >> 1) & 0x3ff;
  return (
    (i20 << 31) |
    (i10_1 << 21) |
    (i11 << 20) |
    (i19_12 << 12) |
    ((rd & 0x1f) << 7) |
    (op & 0x7f)
  );
}

// main assembler

export function assemble(source: string): AssemblyResult {
  const BASE = 0x00400000; // programs are loaded at this address

  // PASS 1: collect all labels

  interface CleanLine {
    text: string;
    addr: number;
    srcLine: number;
  }
  const lines: CleanLine[] = [];
  const labels: LabelMap = {};
  let pc = BASE;

  for (let i = 0; i < source.split("\n").length; i++) {
    let line = source
      .split("\n")
      [i].replace(/#.*/, "")
      .replace(/\/\/.*/, "")
      .trim();

    if (!line) continue;

    // label definition, can be optionally followed by an instruction
    const labelMatch = line.match(/^([A-Za-z_]\w*)\s*:(.*)/);
    if (labelMatch) {
      labels[labelMatch[1]] = pc; // record label to current addr
      line = labelMatch[2].trim();
      if (!line) continue; // label only line, nothing to include
    }

    lines.push({ text: line, addr: pc, srcLine: i + 1 });
    pc += 4; // every instruction is exactly 4 bytes
  }

  // PASS 2: encode
  const binary = new Uint32Array(lines.length);

  for (let i = 0; i < lines.length; i++) {
    const { text, addr, srcLine } = lines[i];

    // tokenize: split on whitespace and commmas
    const t = text.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    const op = t[0].toLowerCase();

    try {
      binary[i] = encode(op, t, labels, addr) >>> 0;
    } catch (e) {
      throw {
        line: srcLine,
        message: `Line ${srcLine}: ${text}\n  → ${(e as Error).message}`,
      } as AssemblyError;
    }
  }

  return { binary, base: BASE, labels, lineCount: lines.length };
}

// instruction dispatch

function encode(op: string, t: string[], labels: LabelMap, pc: number): number {
  // shorthand helpers bound to this instruction's context
  const r = (i: number) => reg(t[i]);
  const iv = (i: number) => imm(t[i], labels);
  const mo = (i: number) => memOp(t[i]);
  const bt = (i: number) => branchTarget(t[i], labels, pc);

  switch (op) {
    // R-type
    case "add":
      return encR(0x00, r(3), r(2), 0, r(1), 0x33);
    case "sub":
      return encR(0x20, r(3), r(2), 0, r(1), 0x33);
    case "and":
      return encR(0x00, r(3), r(2), 7, r(1), 0x33);
    case "or":
      return encR(0x00, r(3), r(2), 6, r(1), 0x33);
    case "xor":
      return encR(0x00, r(3), r(2), 4, r(1), 0x33);
    case "sll":
      return encR(0x00, r(3), r(2), 1, r(1), 0x33);
    case "srl":
      return encR(0x00, r(3), r(2), 5, r(1), 0x33);
    case "sra":
      return encR(0x20, r(3), r(2), 5, r(1), 0x33);
    case "slt":
      return encR(0x00, r(3), r(2), 2, r(1), 0x33);
    case "sltu":
      return encR(0x00, r(3), r(2), 3, r(1), 0x33);

    // M-extension (multiply/divide)
    case "mul":
      return encR(0x01, r(3), r(2), 0, r(1), 0x33);
    case "mulh":
      return encR(0x01, r(3), r(2), 1, r(1), 0x33);
    case "div":
      return encR(0x01, r(3), r(2), 4, r(1), 0x33);
    case "divu":
      return encR(0x01, r(3), r(2), 5, r(1), 0x33);
    case "rem":
      return encR(0x01, r(3), r(2), 6, r(1), 0x33);
    case "remu":
      return encR(0x01, r(3), r(2), 7, r(1), 0x33);

    // I-type ALU
    case "addi":
      return encI(iv(3), r(2), 0, r(1), 0x13);
    case "andi":
      return encI(iv(3), r(2), 7, r(1), 0x13);
    case "ori":
      return encI(iv(3), r(2), 6, r(1), 0x13);
    case "xori":
      return encI(iv(3), r(2), 4, r(1), 0x13);
    case "slti":
      return encI(iv(3), r(2), 2, r(1), 0x13);
    case "sltiu":
      return encI(iv(3), r(2), 3, r(1), 0x13);
    case "slli":
      return encI(iv(3) & 0x1f, r(2), 1, r(1), 0x13);
    case "srli":
      return encI(iv(3) & 0x1f, r(2), 5, r(1), 0x13);
    case "srai":
      return encI((0x20 << 5) | (iv(3) & 0x1f), r(2), 5, r(1), 0x13);

    // Loads
    case "lw": {
      const [b, o] = mo(2);
      return encI(o, b, 2, r(1), 0x03);
    }
    case "lh": {
      const [b, o] = mo(2);
      return encI(o, b, 1, r(1), 0x03);
    }
    case "lb": {
      const [b, o] = mo(2);
      return encI(o, b, 0, r(1), 0x03);
    }
    case "lhu": {
      const [b, o] = mo(2);
      return encI(o, b, 5, r(1), 0x03);
    }
    case "lbu": {
      const [b, o] = mo(2);
      return encI(o, b, 4, r(1), 0x03);
    }

    // Stores
    case "sw": {
      const [b, o] = mo(2);
      return encS(o, r(1), b, 2, 0x23);
    }
    case "sh": {
      const [b, o] = mo(2);
      return encS(o, r(1), b, 1, 0x23);
    }
    case "sb": {
      const [b, o] = mo(2);
      return encS(o, r(1), b, 0, 0x23);
    }

    // Branches
    case "beq":
      return encB(bt(3), r(2), r(1), 0, 0x63);
    case "bne":
      return encB(bt(3), r(2), r(1), 1, 0x63);
    case "blt":
      return encB(bt(3), r(2), r(1), 4, 0x63);
    case "bge":
      return encB(bt(3), r(2), r(1), 5, 0x63);
    case "bltu":
      return encB(bt(3), r(2), r(1), 6, 0x63);
    case "bgeu":
      return encB(bt(3), r(2), r(1), 7, 0x63);

    // Upper immediate
    case "lui":
      return encU(iv(2), r(1), 0x37);
    case "auipc":
      return encU(iv(2), r(1), 0x17);

    // Jumps
    case "jal":
      return encJ(bt(2), r(1), 0x6f);
    case "jalr":
      return encI(iv(3), r(2), 0, r(1), 0x67);

    // System
    case "ecall":
      return 0x00000073;
    case "ebreak":
      return 0x00100073;

    // Pseudoinstructions
    case "nop":
      return encI(0, 0, 0, 0, 0x13); // addi x0, x0, 0

    case "li": {
      const v = iv(2);
      if (v >= -2048 && v <= 2047) return encI(v, 0, 0, r(1), 0x13); // addi rd, x0, imm
      return encU((v >> 12) & 0xfffff, r(1), 0x37); // lui rd, upper (simplified)
    }

    case "mv":
      return encI(0, r(2), 0, r(1), 0x13); // addi rd, rs, 0
    case "not":
      return encI(-1, r(2), 4, r(1), 0x13); // xori rd, rs, -1
    case "neg":
      return encR(0x20, r(2), 0, 0, r(1), 0x33); // sub rd, x0, rs
    case "ret":
      return encI(0, 1, 0, 0, 0x67); // jalr x0, ra, 0
    case "call":
      return encJ(bt(1), 1, 0x6f); // jal ra, label
    case "j":
      return encJ(bt(1), 0, 0x6f); // jal x0, label

    case "beqz":
      return encB(bt(2), 0, r(1), 0, 0x63);
    case "bnez":
      return encB(bt(2), 0, r(1), 1, 0x63);
    case "bltz":
      return encB(bt(2), 0, r(1), 4, 0x63);
    case "bgez":
      return encB(bt(2), 0, r(1), 5, 0x63);
    case "blez":
      return encB(bt(2), r(1), 0, 5, 0x63);
    case "bgtz":
      return encB(bt(2), r(1), 0, 4, 0x63);
    case "seqz":
      return encI(1, r(2), 3, r(1), 0x13);
    case "snez":
      return encR(0, r(2), 0, 3, r(1), 0x33);

    default:
      throw new Error(`Unknown instruction: '${op}'`);
  }
}
