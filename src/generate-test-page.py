#!/usr/bin/env python3
"""
DRIVER HUB LINUX — Генератор фирменной калибровочной страницы проверки печати
Сайт: biblioteka33.ru
Чистый белый фон для минимального расхода тонера / краски.
Полная поддержка кириллических (русских) шрифтов через TrueType / Cairo.
"""

import sys
import os
import argparse
import cairo

def pick_cjk_or_cyrillic_font():
    fonts = ['DejaVu Sans', 'Liberation Sans', 'Noto Sans', 'FreeSans', 'sans-serif']
    for f in fonts:
        try:
            surface = cairo.PDFSurface(None, 10, 10)
            cr = cairo.Context(surface)
            cr.select_font_face(f, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
            cr.show_text('Тест')
            surface.finish()
            return f
        except Exception:
            continue
    return 'sans-serif'

def generate_test_page(output_path, printer_name='Default', os_distro='Astra Linux', kernel='Linux', arch='x86_64', hostname='astra', date_str='', is_lp_ok=True, fmt='pdf'):
    # A4 standard dimensions in PostScript points: 595.28 x 841.89
    width = 595.28
    height = 841.89
    font_family = pick_cjk_or_cyrillic_font()

    if fmt == 'ps':
        surface = cairo.PSSurface(output_path, width, height)
    else:
        surface = cairo.PDFSurface(output_path, width, height)

    cr = cairo.Context(surface)

    # 1. PURE WHITE BACKGROUND — Экономия тонера/краски
    cr.set_source_rgb(1.0, 1.0, 1.0)
    cr.paint()

    # Registration / crop corner marks (тонкие серые метки обрезки)
    cr.set_source_rgb(0.75, 0.8, 0.85)
    cr.set_line_width(0.5)
    for cx, cy in [(20, 20), (width - 20, 20), (20, height - 20), (width - 20, height - 20)]:
        cr.move_to(cx - 10, cy)
        cr.line_to(cx + 10, cy)
        cr.move_to(cx, cy - 10)
        cr.line_to(cx, cy + 10)
        cr.stroke()
        cr.arc(cx, cy, 4, 0, 6.283)
        cr.stroke()

    margin_x = 45.0
    curr_y = 55.0

    # 2. HEADER: DRIVER HUB LINUX (черный + фирменный зеленый #16D95A)
    cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    cr.set_font_size(24)
    cr.set_source_rgb(0.04, 0.07, 0.10)
    cr.move_to(margin_x, curr_y)
    cr.show_text('DRIVER HUB ')

    cr.set_source_rgb(0.09, 0.85, 0.35)  # #16D95A
    cr.show_text('LINUX')

    # Domain: biblioteka33.ru
    cr.set_font_size(14)
    cr.move_to(width - margin_x - 145, curr_y)
    cr.show_text('biblioteka33.ru')

    # Subtitle
    curr_y += 18.0
    cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
    cr.set_font_size(9.5)
    cr.set_source_rgb(0.40, 0.48, 0.55)
    cr.move_to(margin_x, curr_y)
    cr.show_text('Фирменная страница калибровки и проверки подсистемы печати Astra Linux')

    # Emerald accent line
    curr_y += 10.0
    cr.set_source_rgb(0.09, 0.85, 0.35)
    cr.set_line_width(2.5)
    cr.move_to(margin_x, curr_y)
    cr.line_to(width - margin_x, curr_y)
    cr.stroke()

    # 3. DIAGNOSTICS TABLE (Белый блок со светлой границей)
    curr_y += 20.0
    box_w = width - (margin_x * 2)
    box_h = 130.0

    cr.set_source_rgb(0.97, 0.98, 0.99)
    cr.rectangle(margin_x, curr_y, box_w, box_h)
    cr.fill()

    cr.set_source_rgb(0.78, 0.84, 0.89)
    cr.set_line_width(1.0)
    cr.rectangle(margin_x, curr_y, box_w, box_h)
    cr.stroke()

    # Table Title
    cr.set_source_rgb(0.05, 0.08, 0.12)
    cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    cr.set_font_size(11)
    cr.move_to(margin_x + 16, curr_y + 20)
    cr.show_text('СИСТЕМНЫЕ ПАРАМЕТРЫ ОБОРУДОВАНИЯ И ПОДСИСТЕМЫ ПЕЧАТИ:')

    lp_status_text = 'Включён в lp (печать разрешена) ✓' if is_lp_ok else 'Не включён в lp (требуется исправление) ⚠'

    labels = [
        ('Целевой принтер:', printer_name),
        ('Операционная система:', os_distro),
        ('Ядро Linux и архитектура:', f'{kernel} ({arch})'),
        ('Имя компьютера (хост):', hostname),
        ('Дата и время печати:', date_str),
        ('Группа печати lp:', lp_status_text)
    ]

    text_y = curr_y + 40.0
    for label, val in labels:
        cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        cr.set_font_size(9)
        cr.set_source_rgb(0.30, 0.38, 0.45)
        cr.move_to(margin_x + 16, text_y)
        cr.show_text(label)

        cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
        cr.set_font_size(9)
        if '✓' in val:
            cr.set_source_rgb(0.05, 0.65, 0.25)
        elif '⚠' in val:
            cr.set_source_rgb(0.85, 0.45, 0.05)
        else:
            cr.set_source_rgb(0.05, 0.08, 0.12)
        cr.move_to(margin_x + 200, text_y)
        cr.show_text(val)
        text_y += 15.0

    curr_y += box_h + 24.0

    # 4. GRAYSCALE TONER DENSITY PATCHES (10% — 100%)
    cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    cr.set_font_size(11)
    cr.set_source_rgb(0.05, 0.08, 0.12)
    cr.move_to(margin_x, curr_y)
    cr.show_text('КАЛИБРОВКА ОТТЕНКОВ СЕРОГО И РАСХОДА ТОНЕРА (GRAYSCALE 10% — 100%):')

    curr_y += 12.0
    patch_count = 10
    patch_w = (box_w - ((patch_count - 1) * 6)) / patch_count
    patch_h = 32.0

    for i in range(patch_count):
        pct = (i + 1) * 10
        gray_level = 1.0 - (pct / 100.0)  # 0.90 down to 0.00
        px = margin_x + i * (patch_w + 6)

        cr.set_source_rgb(gray_level, gray_level, gray_level)
        cr.rectangle(px, curr_y, patch_w, patch_h)
        cr.fill()

        cr.set_source_rgb(0.70, 0.75, 0.80)
        cr.set_line_width(0.75)
        cr.rectangle(px, curr_y, patch_w, patch_h)
        cr.stroke()

        cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
        cr.set_font_size(8)
        cr.set_source_rgb(0.30, 0.35, 0.40)
        cr.move_to(px + 6, curr_y + patch_h + 12)
        cr.show_text(f'{pct}%')

    curr_y += patch_h + 28.0

    # Continuous gradient bar
    cr.set_font_size(9)
    cr.set_source_rgb(0.30, 0.35, 0.40)
    cr.move_to(margin_x, curr_y)
    cr.show_text('Плавный градиент тонера (0% — 100%):')
    curr_y += 8.0

    pat = cairo.LinearGradient(margin_x, curr_y, margin_x + box_w, curr_y)
    pat.add_color_stop_rgb(0.0, 1.0, 1.0, 1.0)
    pat.add_color_stop_rgb(1.0, 0.0, 0.0, 0.0)
    cr.set_source(pat)
    cr.rectangle(margin_x, curr_y, box_w, 12)
    cr.fill()

    cr.set_source_rgb(0.70, 0.75, 0.80)
    cr.set_line_width(0.75)
    cr.rectangle(margin_x, curr_y, box_w, 12)
    cr.stroke()

    curr_y += 30.0

    # 5. LINE RESOLUTION TEST
    cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    cr.set_font_size(11)
    cr.set_source_rgb(0.05, 0.08, 0.12)
    cr.move_to(margin_x, curr_y)
    cr.show_text('ТЕСТ ТОЛЩИНЫ И РАЗРЕШАЮЩЕЙ СПОСОБНОСТИ ЛИНИЙ:')

    curr_y += 14.0
    lines_info = [
        (0.25, '0.25 pt (сверхтонкая калибровочная линия)'),
        (0.50, '0.50 pt (тонкая линия)'),
        (1.00, '1.00 pt (стандартная линия чертежа)'),
        (2.00, '2.00 pt (жирная разделительная линия)')
    ]
    for lw, desc in lines_info:
        cr.set_source_rgb(0.1, 0.1, 0.1)
        cr.set_line_width(lw)
        cr.move_to(margin_x, curr_y)
        cr.line_to(margin_x + 300, curr_y)
        cr.stroke()

        cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
        cr.set_font_size(8)
        cr.set_source_rgb(0.40, 0.45, 0.50)
        cr.move_to(margin_x + 315, curr_y + 3)
        cr.show_text(desc)
        curr_y += 15.0

    curr_y += 14.0

    # 6. RUSSIAN CYRILLIC TYPOGRAPHY TEST
    cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    cr.set_font_size(11)
    cr.set_source_rgb(0.05, 0.08, 0.12)
    cr.move_to(margin_x, curr_y)
    cr.show_text('ПРОВЕРКА РУССКОЯЗЫЧНЫХ ШРИФТОВ (CYRILLIC TYPOGRAPHY):')

    curr_y += 16.0
    pangram = 'Съешь же ещё этих мягких французских булок, да выпей чаю. 1234567890 №?!'

    type_tests = [
        (13.0, cairo.FONT_WEIGHT_BOLD, '13pt Полужирный:'),
        (10.5, cairo.FONT_WEIGHT_NORMAL, '10.5pt Обычный:'),
        (9.0, cairo.FONT_WEIGHT_NORMAL, '9.0pt Стандартный:'),
        (7.5, cairo.FONT_WEIGHT_NORMAL, '7.5pt Мелкий кегль:')
    ]

    for size, weight, label in type_tests:
        cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        cr.set_font_size(8)
        cr.set_source_rgb(0.40, 0.45, 0.50)
        cr.move_to(margin_x, curr_y)
        cr.show_text(label)

        cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, weight)
        cr.set_font_size(size)
        cr.set_source_rgb(0.05, 0.08, 0.12)
        cr.move_to(margin_x + 95, curr_y)
        cr.show_text(pangram)
        curr_y += size + 8.0

    # 7. 5x5mm GEOMETRY GRID
    curr_y += 8.0
    cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    cr.set_font_size(10)
    cr.set_source_rgb(0.05, 0.08, 0.12)
    cr.move_to(margin_x, curr_y)
    cr.show_text('ТЕСТ СВЕДЕНИЯ ГЕОМЕТРИИ (СЕТКА 5×5 мм):')

    curr_y += 8.0
    grid_w = box_w
    grid_h = 42.0
    cr.set_source_rgb(0.88, 0.90, 0.93)
    cr.set_line_width(0.35)
    step = 14.1732  # 5mm in pt

    x = margin_x
    while x <= margin_x + grid_w:
        cr.move_to(x, curr_y)
        cr.line_to(x, curr_y + grid_h)
        x += step
    cr.stroke()

    y = curr_y
    while y <= curr_y + grid_h:
        cr.move_to(margin_x, y)
        cr.line_to(margin_x + grid_w, y)
        y += step
    cr.stroke()

    cr.set_source_rgb(0.65, 0.70, 0.75)
    cr.set_line_width(0.75)
    cr.rectangle(margin_x, curr_y, grid_w, grid_h)
    cr.stroke()

    # 8. FOOTER
    footer_y = height - 38.0
    cr.set_source_rgb(0.80, 0.85, 0.90)
    cr.set_line_width(0.8)
    cr.move_to(margin_x, footer_y)
    cr.line_to(width - margin_x, footer_y)
    cr.stroke()

    footer_text_y = footer_y + 15.0
    cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
    cr.set_font_size(8)
    cr.set_source_rgb(0.40, 0.45, 0.50)
    cr.move_to(margin_x, footer_text_y)
    cr.show_text('DriverHub Linux v1.0 • Калибровочный тест печати')

    cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    cr.set_source_rgb(0.09, 0.85, 0.35)
    cr.move_to(width / 2.0 - 40, footer_text_y)
    cr.show_text('biblioteka33.ru')

    cr.select_font_face(font_family, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    cr.set_source_rgb(0.05, 0.65, 0.25)
    cr.move_to(width - margin_x - 130, footer_text_y)
    cr.show_text('Калибровка завершена ✓')

    surface.show_page()
    surface.finish()

def main():
    parser = argparse.ArgumentParser(description='Генератор тестовой страницы DRIVER HUB LINUX')
    parser.add_argument('--output', required=True, help='Выходной файл PDF или PS')
    parser.add_argument('--printer', default='Default-Printer', help='Имя целевого принтера')
    parser.add_argument('--os', default='Astra Linux', help='Дистрибутив ОС')
    parser.add_argument('--kernel', default='Linux', help='Версия ядра')
    parser.add_argument('--arch', default='x86_64', help='Архитектура процессора')
    parser.add_argument('--hostname', default='localhost', help='Имя хоста')
    parser.add_argument('--date', default='', help='Дата и время')
    parser.add_argument('--format', choices=['pdf', 'ps'], default='pdf', help='Формат файла')
    parser.add_argument('--lp-ok', action='store_true', default=True, help='Флаг группы lp')

    args = parser.parse_args()
    generate_test_page(
        output_path=args.output,
        printer_name=args.printer,
        os_distro=args.os,
        kernel=args.kernel,
        arch=args.arch,
        hostname=args.hostname,
        date_str=args.date,
        is_lp_ok=args.lp_ok,
        fmt=args.format
    )

if __name__ == '__main__':
    main()
