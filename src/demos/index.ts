export interface Demo {
  name: string;
  description: string;
  source: string;
}

export const DEMOS: Demo[] = [
  {
    name: "Plasma Grid",
    description: "XOR color tiles",
    source: `# Plasma Grid
# Fills screen with 8x8 colored tiles
# Color = f(x XOR y)

    li   a7, 202
    li   a0, 0x080810
    ecall

    li   t0, 0           # y = 0
yloop:
    li   t1, 0           # x = 0
xloop:
    li   t2, 8
    mul  t3, t1, t2      # t3 = x * 8
    mul  t4, t0, t2      # t4 = y * 8
    xor  t5, t3, t4

    andi a4, t5, 0xFF
    slli t6, t5, 8
    or   a4, a4, t6
    slli t6, t5, 16
    or   a4, a4, t6

    mv   a0, t1
    mv   a1, t0
    li   a2, 8
    li   a3, 8
    li   a7, 201
    ecall

    addi t1, t1, 8
    li   t3, 256
    blt  t1, t3, xloop

    addi t0, t0, 8
    li   t3, 256
    blt  t0, t3, yloop

    li   a7, 10
    ecall
`,
  },

  {
    name: "Rainbow Lines",
    description: "Diagonal lines with cycling hue",
    source: `# Rainbow diagonal lines

    li   a7, 202
    li   a0, 0x060608
    ecall

    li   t0, 0
loop:
    slli t1, t0, 2
    andi a4, t1, 0xFF
    slli t2, t0, 5
    andi t2, t2, 0xFF
    slli t2, t2, 8
    or   a4, a4, t2
    slli t3, t0, 1
    andi t3, t3, 0xFF
    slli t3, t3, 16
    or   a4, a4, t3

    mv   a0, t0
    li   a1, 0
    li   a2, 255
    mv   a3, t0
    li   a7, 203
    ecall

    li   a0, 0
    mv   a1, t0
    mv   a2, t0
    li   a3, 255
    li   a7, 203
    ecall

    addi t0, t0, 3
    li   t4, 256
    blt  t0, t4, loop

    li   a7, 10
    ecall
`,
  },

  {
    name: "LCG Noise",
    description: "Pseudo-random pixels",
    source: `# LCG pseudo-random noise
# seed = seed * 1664525 + 1013904223

    li   a7, 202
    li   a0, 0x000000
    ecall

    li   s0, 0xBEEF
    lui  s1, 0x197
    addi s1, s1, -503
    lui  s2, 0x3C6EF
    addi s2, s2, 863

    li   t0, 0
yloop:
    li   t1, 0
xloop:
    mul  s0, s0, s1
    add  s0, s0, s2

    srli t2, s0, 8
    andi a2, t2, 0xFFFFFF

    mv   a0, t1
    mv   a1, t0
    li   a7, 200
    ecall

    addi t1, t1, 1
    li   t3, 256
    blt  t1, t3, xloop

    addi t0, t0, 1
    blt  t0, t3, yloop

    li   a7, 10
    ecall
`,
  },

  {
    name: "Concentric Squares",
    description: "Nested colored squares",
    source: `# Concentric squares

    li   a7, 202
    li   a0, 0x000000
    ecall

    li   t0, 0
    li   t5, 30

ringloop:
    li   t1, 9
    mul  t2, t0, t1
    andi t2, t2, 0xFF

    mv   a4, t2
    addi t3, t2, 60
    andi t3, t3, 0xFF
    slli t3, t3, 8
    or   a4, a4, t3
    addi t3, t2, 120
    andi t3, t3, 0xFF
    slli t3, t3, 16
    or   a4, a4, t3

    li   t1, 4
    mul  a0, t0, t1
    mv   a1, a0
    li   t1, 8
    mul  t2, t0, t1
    li   t3, 256
    sub  a2, t3, t2
    mv   a3, a2

    li   a7, 201
    ecall

    addi t0, t0, 1
    blt  t0, t5, ringloop

    li   a7, 10
    ecall
`,
  },

  {
    name: "Circle Burst",
    description: "Concentric circles",
    source: `# Circle burst

    li   a7, 202
    li   a0, 0x020208
    ecall

    li   t0, 120
    li   t5, 0

loop:
    li   t1, 12
    mul  t2, t5, t1
    andi t2, t2, 0xFF
    mv   a3, t2
    addi t3, t2, 80
    andi t3, t3, 0xFF
    slli t3, t3, 8
    or   a3, a3, t3
    li   t3, 0xFF
    sub  t4, t3, t2
    andi t4, t4, 0xFF
    slli t4, t4, 16
    or   a3, a3, t4

    li   a0, 128
    li   a1, 128
    mv   a2, t0
    li   a4, 0
    li   a7, 204
    ecall

    addi t0, t0, -8
    addi t5, t5, 1
    li   t6, 4
    bge  t0, t6, loop

    li   a7, 10
    ecall
`,
  },

  {
    name: "Gradient",
    description: "RGB gradient across screen",
    source: `# RGB gradient

    li   t0, 0
yloop:
    li   t1, 0
xloop:
    mv   a2, t0

    srli t2, t1, 1
    andi t2, t2, 0xFF
    slli t2, t2, 8
    or   a2, a2, t2

    li   t3, 255
    sub  t3, t3, t0
    andi t3, t3, 0xFF
    slli t3, t3, 16
    or   a2, a2, t3

    mv   a0, t1
    mv   a1, t0
    li   a7, 200
    ecall

    addi t1, t1, 1
    li   t4, 256
    blt  t1, t4, xloop

    addi t0, t0, 1
    blt  t0, t4, yloop

    li   a7, 10
    ecall
`,
  },
];
