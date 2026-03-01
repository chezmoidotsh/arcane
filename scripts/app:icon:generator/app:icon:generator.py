#!/usr/bin/env python3
import sys
import os
import freetype
import random
import argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MAIN_SIZE = 120           
SUBSCRIPT_RATIO = 0.3     
SUBSCRIPT_Y_FACTOR = 10   
LETTER_SPACING = 0.15     
DIGIT_SPACING = 0.1       

def outline_to_svg_path(outline, dx=0, dy=0):
    path = ""
    start = 0
    for end in outline.contours:
        points = outline.points[start:end+1]
        tags = outline.tags[start:end+1]
        points.append(points[0])
        tags.append(tags[0])
        x0, y0 = points[0]
        path += f"M {x0+dx} {-y0+dy} "
        i = 1
        while i < len(points):
            x, y = points[i]
            tag = tags[i] & 1
            if tag:
                path += f"L {x+dx} {-y+dy} "
                i += 1
            else:
                x1, y1 = x, y
                if i+1 < len(points):
                    x2, y2 = points[i+1]
                    tag2 = tags[i+1] & 1
                    if tag2:
                        path += f"Q {x1+dx} {-y1+dy}, {x2+dx} {-y2+dy} "
                        i += 2
                    else:
                        xm = (x1+x2)//2
                        ym = (y1+y2)//2
                        path += f"Q {x1+dx} {-y1+dy}, {xm+dx} {-ym+dy} "
                        points.insert(i+1, (xm, ym))
                        tags.insert(i+1, 1)
                        i += 1
                else:
                    i += 1
        path += "Z "
        start = end+1
    return path

def glyph_to_path(face, char, size, dx=0, dy=0):
    face.set_char_size(size * 64)
    face.load_char(char, freetype.FT_LOAD_NO_BITMAP)
    outline = face.glyph.outline
    path = outline_to_svg_path(outline, dx, dy)
    advance = face.glyph.advance.x / 64
    bbox = outline.get_bbox()
    return path, advance, bbox

def generate_main_letter(face, letter, size, dx=0, dy=0):
    path, advance, bbox = glyph_to_path(face, letter, size, dx, dy)
    adjusted_bbox = type('BBox', (), {
        'xMin': bbox.xMin + dx,
        'xMax': bbox.xMax + dx,
        'yMin': -bbox.yMax + dy,
        'yMax': -bbox.yMin + dy
    })()
    return path, adjusted_bbox

def generate_subscript_digits(face, count_str, sub_size, letter_bbox, base_size, y_offset):
    paths = []
    bboxes = []
    x_offset = letter_bbox.xMax + base_size * LETTER_SPACING
    for digit in count_str:
        path, advance, bbox = glyph_to_path(face, digit, sub_size, dx=x_offset, dy=y_offset)
        paths.append(path)
        adjusted_bbox = type('BBox', (), {
            'xMin': bbox.xMin + x_offset,
            'xMax': bbox.xMax + x_offset,
            'yMin': -bbox.yMax + y_offset,
            'yMax': -bbox.yMin + y_offset
        })()
        bboxes.append(adjusted_bbox)
        x_offset = adjusted_bbox.xMax + sub_size * DIGIT_SPACING
    return paths, bboxes

def generate_random_glitch_timings():
    min_separation = 7.5 / 30.0 * 100
    glitch_duration = 0.25 / 30.0 * 100
    max_first_position = 100 - min_separation - glitch_duration
    glitch1_start = random.uniform(0, max_first_position)
    glitch1_end = glitch1_start + glitch_duration
    min_second_start = glitch1_end + min_separation
    if min_second_start + glitch_duration > 100:
        max_second_position = glitch1_start - min_separation - glitch_duration
        if max_second_position < 0:
            glitch2_start = 0
            glitch1_start = min_separation + glitch_duration
        else:
            glitch2_start = random.uniform(0, max_second_position)
    else:
        glitch2_start = random.uniform(min_second_start, 100 - glitch_duration)
    return glitch1_start, glitch2_start

def get_keyframes_for_glitch(group_index, glitch_offset, duration_sec):
    glitch1_start, glitch2_start = generate_random_glitch_timings()
    glitch_duration_percent = 0.25 / 30.0 * 100
    glitch_both_top_duration = 0.3 / 30.0 * 100
    glitch_both_bottom_duration = 0.1 / 30.0 * 100
    glitch_both_bottom_delay = 0.15 / 30.0 * 100
    
    g1_start = glitch1_start
    g1_end = glitch1_start + glitch_duration_percent
    g2_start = glitch2_start
    
    first_glitch_bottom = (glitch1_start < glitch2_start)
    if first_glitch_bottom:
        first_start, first_end = g1_start, g1_end
        both_top_start, both_top_end = g2_start, g2_start + glitch_both_top_duration
        both_bottom_start = g2_start + glitch_both_bottom_delay
        both_bottom_end = both_bottom_start + glitch_both_bottom_duration
        second_start, second_end = 0, 0
    else:
        second_start, second_end = g1_start, g1_end
        both_top_start, both_top_end = g2_start, g2_start + glitch_both_top_duration
        both_bottom_start = g2_start + glitch_both_bottom_delay
        both_bottom_end = both_bottom_start + glitch_both_bottom_duration
        first_start, first_end = 0, 0

    css = f'''
      .band-top-{group_index} {{ animation: glitch-top-{group_index} {duration_sec}s infinite; }}
      .band-middle-{group_index} {{ animation: none; }}
      .band-bottom-{group_index} {{ animation: glitch-bottom-{group_index} {duration_sec}s infinite; }}
      
      @keyframes glitch-bottom-{group_index} {{
        0% {{ transform: translateX(0); }}'''

    if first_glitch_bottom:
        if first_start > 0: css += f'\n        {first_start - 0.01:.2f}% {{ transform: translateX(0); }}'
        css += f'''
        {first_start:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {first_end:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {first_end + 0.01:.2f}% {{ transform: translateX(0); }}'''
        if both_bottom_start > first_end: css += f'\n        {both_bottom_start - 0.01:.2f}% {{ transform: translateX(0); }}'
        css += f'''
        {both_bottom_start:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {both_bottom_end:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {both_bottom_end + 0.01:.2f}% {{ transform: translateX(0); }}'''
    else:
        if both_bottom_start > 0: css += f'\n        {both_bottom_start - 0.01:.2f}% {{ transform: translateX(0); }}'
        css += f'''
        {both_bottom_start:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {both_bottom_end:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {both_bottom_end + 0.01:.2f}% {{ transform: translateX(0); }}'''
        if second_start > both_bottom_end: css += f'\n        {second_start - 0.01:.2f}% {{ transform: translateX(0); }}'
        css += f'''
        {second_start:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {second_end:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {second_end + 0.01:.2f}% {{ transform: translateX(0); }}'''
        
    css += '''\n        100% { transform: translateX(0); }\n      }'''
    css += f'''\n      @keyframes glitch-top-{group_index} {{\n        0% {{ transform: translateX(0); }}'''
    
    if both_top_start > 0: css += f'\n        {both_top_start - 0.01:.2f}% {{ transform: translateX(0); }}'
    css += f'''
        {both_top_start:.2f}% {{ transform: translateX(-{glitch_offset}px); }}
        {both_top_end:.2f}% {{ transform: translateX(-{glitch_offset}px); }}
        {both_top_end + 0.01:.2f}% {{ transform: translateX(0); }}
        100% {{ transform: translateX(0); }}
      }}'''
    return css

def add_glitch_animation_per_group(path_groups, width, height, min_x, min_y, text_color, duration_sec, glitch_offset=200):
    band_height_20 = height * 0.2
    band_height_60 = height * 0.6
    band_top_y = min_y
    band_middle_y = min_y + band_height_20
    band_bottom_y = min_y + band_height_20 + band_height_60
    
    extended_min_x = min_x - glitch_offset
    extended_width = width + (2 * glitch_offset)
    
    css_content = ""
    for i in range(len(path_groups)):
        css_content += get_keyframes_for_glitch(i, glitch_offset, duration_sec) + "\n"
        
    animated_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{int(width)}" height="{int(height)}"
     viewBox="{int(extended_min_x)} {int(min_y)} {int(extended_width)} {int(height)}">
  <defs>
    <style>
      {css_content}
    </style>
    <clipPath id="band-top">
      <rect x="{int(extended_min_x)}" y="{int(band_top_y)}" width="{int(extended_width)}" height="{int(band_height_20 + 5)}"/>
    </clipPath>
    <clipPath id="band-middle">
      <rect x="{int(extended_min_x)}" y="{int(band_middle_y - 2)}" width="{int(extended_width)}" height="{int(band_height_60 + 4)}"/>
    </clipPath>
    <clipPath id="band-bottom">
      <rect x="{int(extended_min_x)}" y="{int(band_bottom_y - 2)}" width="{int(extended_width)}" height="{int(band_height_20 + 5)}"/>
    </clipPath>
  </defs>'''

    for i, group_paths in enumerate(path_groups):
        animated_svg += f'\n  <g class="band-top-{i}" clip-path="url(#band-top)">'
        for path in group_paths: animated_svg += f'\n    <path d="{path}" fill="{text_color}"/>'
        animated_svg += '\n  </g>'
        
        animated_svg += f'\n  <g class="band-middle-{i}" clip-path="url(#band-middle)">'
        for path in group_paths: animated_svg += f'\n    <path d="{path}" fill="{text_color}"/>'
        animated_svg += '\n  </g>'
        
        animated_svg += f'\n  <g class="band-bottom-{i}" clip-path="url(#band-bottom)">'
        for path in group_paths: animated_svg += f'\n    <path d="{path}" fill="{text_color}"/>'
        animated_svg += '\n  </g>'

    animated_svg += '\n</svg>\n'
    return animated_svg

def generate_icon_svg(words, font_name="fonts/bmf10-rg.ttf", dark_mode=False, animated=False, target_width=None, duration_sec=30.0):
    font_path = font_name
    if not os.path.isabs(font_path):
        font_path = os.path.join(SCRIPT_DIR, font_name)
    
    if not os.path.exists(font_path):
        print(f"Error: Font file not found at {font_path}", file=sys.stderr)
        sys.exit(1)
        
    face = freetype.Face(font_path)
    
    sub_size = int(MAIN_SIZE * SUBSCRIPT_RATIO)
    ascender = face.ascender / face.units_per_EM * MAIN_SIZE
    subscript_y_offset = int(ascender * SUBSCRIPT_Y_FACTOR)
    
    path_groups = []
    all_bboxes = []
    
    x_offset = 0
    for word in words:
        main_letter = word[0].upper()
        word_length = str(len(word) - 1)
        
        # Main letter path
        main_path, main_bbox = generate_main_letter(face, main_letter, MAIN_SIZE, dx=x_offset)
        
        # Start a group for this word
        group = [main_path]
        all_bboxes.append(main_bbox)
        
        # Subscript digits for this word
        sub_paths, sub_bboxes = generate_subscript_digits(
            face, word_length, sub_size, main_bbox, MAIN_SIZE, subscript_y_offset
        )
        group.extend(sub_paths)
        all_bboxes.extend(sub_bboxes)
        
        path_groups.append(group)
        
        # Move x_offset forward for the next word
        last_bbox = sub_bboxes[-1] if sub_bboxes else main_bbox
        x_offset = last_bbox.xMax + MAIN_SIZE * LETTER_SPACING * 1.5
        
    min_x = min(bbox.xMin for bbox in all_bboxes)
    max_x = max(bbox.xMax for bbox in all_bboxes)
    min_y = min(bbox.yMin for bbox in all_bboxes)
    max_y = max(bbox.yMax for bbox in all_bboxes)
    width = max_x - min_x
    height = max_y - min_y
    
    if target_width:
        scale_factor = target_width / width
        output_width, output_height = target_width, height * scale_factor
    else:
        output_width, output_height = width, height
        
    text_color = "black" if dark_mode else "white"
    
    if animated:
        animated_svg = add_glitch_animation_per_group(path_groups, width, height, min_x, min_y, text_color, duration_sec)
        if target_width:
            animated_svg = animated_svg.replace(
                f'width="{int(width)}" height="{int(height)}"',
                f'width="{int(output_width)}" height="{int(output_height)}"'
            )
        sys.stdout.write(animated_svg)
    else:
        svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{int(output_width)}" height="{int(output_height)}" viewBox="{int(min_x)} {int(min_y)} {int(width)} {int(height)}">\n'''
        
        for group in path_groups:
            for path in group:
                svg_content += f'  <path d="{path}" fill="{text_color}"/>\n'
                
        svg_content += '</svg>\n'
        sys.stdout.write(svg_content)

def main():
    if len(sys.argv) < 2:
        print("Usage: python app:icon:generator.py <word1> <word2> ... [--dark] [--animated] [--width WIDTH] [--duration SECONDS] [--font FONT_FILE]", file=sys.stderr)
        sys.exit(1)
        
    parser = argparse.ArgumentParser()
    parser.add_argument('words', nargs='+', help='The input word(s)')
    parser.add_argument('--dark', action='store_true', help='Use dark mode')
    parser.add_argument('--animated', action='store_true', help='Animated glitch effect')
    parser.add_argument('--width', type=int, default=None, help='Target width')
    parser.add_argument('--duration', type=float, default=30.0, help='Animation duration in seconds (default: 30.0)')
    parser.add_argument('--font', type=str, default='fonts/bmf10-rg.ttf', help='Font file name or path to use')
    
    args = parser.parse_args(sys.argv[1:])
    if not args.words:
        sys.exit(1)
        
    generate_icon_svg(args.words, font_name=args.font, dark_mode=args.dark, animated=args.animated, target_width=args.width, duration_sec=args.duration)

if __name__ == "__main__":
    main()
