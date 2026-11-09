#!/usr/bin/env python3
"""Renders the extension icon as PNG in the sizes the stores ask for.
No dependencies. Run from the repo root: python3 icons/make-icons.py"""
import struct, zlib, os

BG = (24, 24, 27)        # near black square
FRAME = (235, 235, 240)  # window outline
PLAY = (255, 255, 255)   # play triangle
SS = 4                   # supersampling factor for anti aliasing


def in_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_rect(x, y, x0, y0, x1, y1):
    return x0 <= x <= x1 and y0 <= y <= y1


def in_tri(x, y, a, b, c):
    def sign(p, q, r):
        return (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1])
    d1, d2, d3 = sign((x, y), a, b), sign((x, y), b, c), sign((x, y), c, a)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def color_at(u, v):
    # u, v in 0..1
    if not in_round_rect(u, v, 0, 0, 1, 1, 0.2):
        return None
    t = 0.07  # outline thickness
    outer = in_round_rect(u, v, 0.14, 0.18, 0.86, 0.82, 0.08)
    inner = in_round_rect(u, v, 0.14 + t, 0.18 + t, 0.86 - t, 0.82 - t, 0.04)
    if outer and not inner:
        return FRAME
    if in_rect(u, v, 0.14, 0.18, 0.86, 0.18 + 0.12):
        return FRAME
    if in_tri(u, v, (0.42, 0.42), (0.42, 0.70), (0.66, 0.56)):
        return PLAY
    return BG


def render(size):
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    u = (px + (sx + 0.5) / SS) / size
                    v = (py + (sy + 0.5) / SS) / size
                    c = color_at(u, v)
                    if c:
                        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255
            n = SS * SS
            a = acc[3] // n
            if a:
                cov = acc[3] / 255
                row += bytes((int(acc[0] / cov), int(acc[1] / cov), int(acc[2] / cov), a))
            else:
                row += b'\0\0\0\0'
        rows.append(bytes(row))
    return b''.join(rows)


def png(size, raw):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    for s in (16, 32, 48, 128):
        with open(os.path.join(here, f'icon{s}.png'), 'wb') as f:
            f.write(png(s, render(s)))
        print(f'icon{s}.png')
