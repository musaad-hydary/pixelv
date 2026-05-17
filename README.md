# PIXELV

PIXELV browser-based RISC-V graphics runtime. Write RV32I assembly, hit RUN, see pixels rendered in real time!

Built with React, TypeScript, and Vite. No backend. Everything runs in the browser.

## About the Project

PIXELV simulates a complete RISC-V CPU in JavaScript. When you write assembly and run it:

1. The **assembler** parses your text and encodes every instruction into a 32-bit binary word
2. The **executor** loads those words into simulated RAM and runs the fetch → decode → execute loop
3. Your program draws to a **256×256 framebuffer** using special syscalls
4. The framebuffer is blitted to an HTML Canvas so you see the output

## Running it locally

**Requirements:** Node.js 18+

```bash
git clone https://github.com/yourname/pixelv
cd pixelv
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

**Build for production:**

```bash
npm run build
npm run preview
```

---

## Writing assembly

Programs are written in RV32I assembly — the base 32-bit RISC-V integer instruction set.

### Basic structure

```asm
# Comments start with #

    li   a7, 202        # load syscall number into a7
    li   a0, 0x000000   # argument: color = black
    ecall               # fire the syscall

    li   a7, 10         # syscall 10 = exit
    ecall
```

### Registers

RISC-V has 32 registers. The ones you'll use most:

| Register | ABI Name | Purpose                            |
| -------- | -------- | ---------------------------------- |
| x0       | zero     | Always 0. Writes are ignored.      |
| x1       | ra       | Return address for function calls  |
| x2       | sp       | Stack pointer                      |
| x5-x7    | t0-t2    | Temporaries — free to use anywhere |
| x10-x16  | a0-a6    | Function arguments                 |
| x17      | a7       | Syscall number                     |
| x28-x31  | t3-t6    | More temporaries                   |

---

### Instruction types

**R-type** — two registers in, one out:

```asm
add  t0, t1, t2     # t0 = t1 + t2
sub  t0, t1, t2     # t0 = t1 - t2
and  t0, t1, t2     # t0 = t1 & t2
or   t0, t1, t2     # t0 = t1 | t2
xor  t0, t1, t2     # t0 = t1 ^ t2
mul  t0, t1, t2     # t0 = t1 * t2
```

**I-type** — one register + immediate constant:

```asm
addi t0, t1, 4      # t0 = t1 + 4
andi t0, t1, 0xFF   # t0 = t1 & 255
ori  t0, t1, 0x01   # t0 = t1 | 1
xori t0, t1, 0xFF   # t0 = t1 ^ 255
slli t0, t1, 3      # t0 = t1 << 3
srli t0, t1, 3      # t0 = t1 >> 3 (logical)
srai t0, t1, 3      # t0 = t1 >> 3 (arithmetic, sign-fill)
```

**Branches** — conditional jumps:

```asm
beq  t0, t1, label  # jump if t0 == t1
bne  t0, t1, label  # jump if t0 != t1
blt  t0, t1, label  # jump if t0 < t1
bge  t0, t1, label  # jump if t0 >= t1
```

**Loads and stores:**

```asm
lw   t0, 0(sp)      # load word from memory at sp+0
sw   t0, 0(sp)      # store word to memory at sp+0
```

**Pseudoinstructions** — expanded by the assembler:

```asm
li   t0, 42         # load immediate (→ addi t0, x0, 42)
mv   t0, t1         # copy register (→ addi t0, t1, 0)
ret                 # return (→ jalr x0, ra, 0)
j    label          # unconditional jump (→ jal x0, offset)
nop                 # do nothing (→ addi x0, x0, 0)
```

### Big constants

The `li` pseudo-instruction only handles 12-bit values (-2048 to 2047).
For larger constants use `lui` + `addi`:

```asm
# Load 1664525 (0x196A09) into s1
lui  s1, 0x197       # upper 20 bits
addi s1, s1, -503    # lower 12 bits (signed adjust)
```

## Graphics syscalls

Draw by setting `a7` to the syscall number and arguments in `a0`–`a4`, then `ecall`.

### exit — a7 = 10

```asm
li  a7, 10
ecall
```

Stops the CPU. Always end your program with this.

### set_pixel — a7 = 200

```asm
li  a0, 128         # x
li  a1, 128         # y
li  a2, 0xFF0000    # color (RGB)
li  a7, 200
ecall
```

### fill_rect — a7 = 201

```asm
li  a0, 10          # x
li  a1, 10          # y
li  a2, 50          # width
li  a3, 50          # height
li  a4, 0x00FF00    # color
li  a7, 201
ecall
```

### clear — a7 = 202

```asm
li  a0, 0x000000    # color to fill entire screen
li  a7, 202
ecall
```

### draw_line — a7 = 203

```asm
li  a0, 0           # x0
li  a1, 0           # y0
li  a2, 255         # x1
li  a3, 255         # y1
li  a4, 0xFFFFFF    # color
li  a7, 203
ecall
```

### draw_circle — a7 = 204

```asm
li  a0, 128         # cx
li  a1, 128         # cy
li  a2, 60          # radius
li  a3, 0xFF00FF    # color
li  a4, 0           # fill: 0 = outline, 1 = filled
li  a7, 204
ecall
```

## Colors

Colors are packed as 24-bit RGB hex: `0xRRGGBB`

```asm
li  a2, 0xFF0000    # red
li  a2, 0x00FF00    # green
li  a2, 0x0000FF    # blue
li  a2, 0xFFFFFF    # white
li  a2, 0x000000    # black
li  a2, 0xFF00FF    # magenta
```

## Example program

```asm
# Diagonal gradient

    li   t0, 0           # y = 0
yloop:
    li   t1, 0           # x = 0
xloop:
    # color = pack x into green, y into red
    mv   a2, t0          # R = y
    slli t2, t1, 8
    or   a2, a2, t2      # G = x

    mv   a0, t1          # x
    mv   a1, t0          # y
    li   a7, 200
    ecall

    addi t1, t1, 1
    li   t3, 256
    blt  t1, t3, xloop

    addi t0, t0, 1
    blt  t0, t3, yloop

    li   a7, 10
    ecall
```

## Tech stack

- **Vite** — build tool and dev server
- **React 18** — UI
- **TypeScript** — fully typed throughout
- **CodeMirror 6** — code editor
- **Tailwind CSS** — styling
