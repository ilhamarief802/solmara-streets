#!/usr/bin/env python3
"""Tiny PNG reader + coarse frame report, for checking a screenshot is not empty.

Prints the size, mean colour, an ASCII luminance map and the mean colour of a few vertical
bands. Written for Playwright's 8-bit RGBA/RGB non-interlaced PNGs; no dependencies.
"""
import struct
import sys
import zlib


def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a png'
    pos = 8
    width = height = depth = ctype = None
    idat = b''
    while pos < len(data):
        length, kind = struct.unpack('>I4s', data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + length]
        if kind == b'IHDR':
            width, height, depth, ctype, comp, filt, inter = struct.unpack('>IIBBBBB', chunk)
            assert depth == 8 and inter == 0, (depth, inter)
        elif kind == b'IDAT':
            idat += chunk
        elif kind == b'IEND':
            break
        pos += 12 + length
    channels = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    raw = zlib.decompress(idat)
    stride = width * channels
    out = bytearray(width * height * channels)
    prev = bytearray(stride)
    offset = 0
    for y in range(height):
        f = raw[offset]
        offset += 1
        line = bytearray(raw[offset:offset + stride])
        offset += stride
        if f == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif f == 3:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif f == 4:
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                b = prev[i]
                c = prev[i - channels] if i >= channels else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else b if pb <= pc else c
                line[i] = (line[i] + pr) & 0xFF
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return width, height, channels, out


def main(path, box=None):
    width, height, channels, pixels = read_png(path)
    step = 4
    mean = [0, 0, 0]
    count = 0
    for y in range(0, height, step):
        for x in range(0, width, step):
            i = (y * width + x) * channels
            mean[0] += pixels[i]
            mean[1] += pixels[i + 1]
            mean[2] += pixels[i + 2]
            count += 1
    mean = [v / count for v in mean]
    print(f'{path}: {width}x{height}, channels {channels}, mean rgb {mean[0]:.0f},{mean[1]:.0f},{mean[2]:.0f}')

    cols, rows = 32, 12
    ramp = ' .:-=+*#%@'
    print('luminance map (dark " " to bright "@"):')
    for row in range(rows):
        line = ''
        for col in range(cols):
            x0 = col * width // cols
            x1 = (col + 1) * width // cols
            y0 = row * height // rows
            y1 = (row + 1) * height // rows
            total = 0
            n = 0
            for y in range(y0, y1, 6):
                for x in range(x0, x1, 6):
                    i = (y * width + x) * channels
                    total += (pixels[i] * 3 + pixels[i + 1] * 6 + pixels[i + 2]) / 10
                    n += 1
            value = total / max(1, n) / 255
            line += ramp[min(len(ramp) - 1, int(value * len(ramp)))]
        print('  ' + line)

    for name, (x0, x1) in {'left': (0, width // 3), 'centre': (width // 3, 2 * width // 3), 'right': (2 * width // 3, width)}.items():
        total = [0, 0, 0]
        n = 0
        for y in range(0, height, 6):
            for x in range(x0, x1, 6):
                i = (y * width + x) * channels
                total[0] += pixels[i]
                total[1] += pixels[i + 1]
                total[2] += pixels[i + 2]
                n += 1
        print(f'  {name}: rgb {total[0] // n},{total[1] // n},{total[2] // n}')

    if box:
        x0, y0, x1, y1 = box
        total = [0, 0, 0]
        n = 0
        for y in range(max(0, y0), min(height, y1), 3):
            for x in range(max(0, x0), min(width, x1), 3):
                i = (y * width + x) * channels
                total[0] += pixels[i]
                total[1] += pixels[i + 1]
                total[2] += pixels[i + 2]
                n += 1
        print(f'  box {box}: rgb {total[0] // n},{total[1] // n},{total[2] // n}')


if __name__ == '__main__':
    box = None
    paths = []
    args = sys.argv[1:]
    while args:
        value = args.pop(0)
        if value == '--box':
            box = tuple(int(part) for part in args.pop(0).split(','))
        else:
            paths.append(value)
    for path in paths:
        main(path, box)
