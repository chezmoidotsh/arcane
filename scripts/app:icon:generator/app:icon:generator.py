#!/usr/bin/env python3
"""
App Icon Generator

This script generates SVG icons with an optional glitch animation effect.
It uses FreeType to render text into SVG paths, generating a main letter
with a subscript representing the word length.
"""

import argparse
import os
import random
import sys
from dataclasses import dataclass
from typing import List, Tuple

import freetype

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Design Constants
MAIN_SIZE = 120
SUBSCRIPT_RATIO = 0.3
SUBSCRIPT_Y_FACTOR = 10
LETTER_SPACING = 0.15
DIGIT_SPACING = 0.1


@dataclass
class BBox:
    """Bounding box for an SVG path."""
    xMin: float
    xMax: float
    yMin: float
    yMax: float


def outline_to_svg_path(outline: freetype.Outline, dx: float = 0, dy: float = 0) -> str:
    """
    Convert a FreeType outline to an SVG path string.

    Args:
        outline: The FreeType outline of a glyph.
        dx: X-axis offset.
        dy: Y-axis offset.

    Returns:
        A string representation of the SVG path.
    """
    path = []
    start = 0
    for end in outline.contours:
        points = outline.points[start : end + 1]
        tags = outline.tags[start : end + 1]
        
        # Close the contour
        points.append(points[0])
        tags.append(tags[0])
        
        x0, y0 = points[0]
        path.append(f"M {x0+dx} {-y0+dy}")
        
        i = 1
        while i < len(points):
            x, y = points[i]
            tag = tags[i] & 1
            if tag:
                # Straight line
                path.append(f"L {x+dx} {-y+dy}")
                i += 1
            else:
                # Quadratic bezier curve
                x1, y1 = x, y
                if i + 1 < len(points):
                    x2, y2 = points[i + 1]
                    tag2 = tags[i + 1] & 1
                    if tag2:
                        path.append(f"Q {x1+dx} {-y1+dy}, {x2+dx} {-y2+dy}")
                        i += 2
                    else:
                        xm, ym = (x1 + x2) // 2, (y1 + y2) // 2
                        path.append(f"Q {x1+dx} {-y1+dy}, {xm+dx} {-ym+dy}")
                        points.insert(i + 1, (xm, ym))
                        tags.insert(i + 1, 1)
                        i += 1
                else:
                    i += 1
        path.append("Z")
        start = end + 1
        
    return " ".join(path) + " "


def glyph_to_path(face: freetype.Face, char: str, size: int, dx: float = 0, dy: float = 0) -> Tuple[str, float, freetype.BBox]:
    """
    Render a single character to an SVG path.

    Args:
        face: The initialized FreeType face.
        char: The character to render.
        size: The font size.
        dx: X-axis offset.
        dy: Y-axis offset.

    Returns:
        A tuple containing the SVG path string, the advance width, and the bounding box.
    """
    face.set_char_size(size * 64)
    face.load_char(char, freetype.FT_LOAD_NO_BITMAP)
    outline = face.glyph.outline
    path = outline_to_svg_path(outline, dx, dy)
    advance = face.glyph.advance.x / 64
    bbox = outline.get_bbox()
    return path, advance, bbox


def generate_main_letter(face: freetype.Face, letter: str, size: int, dx: float = 0, dy: float = 0) -> Tuple[str, BBox]:
    """
    Generate the SVG path and bounding box for the main letter.

    Args:
        face: The FreeType face.
        letter: The main letter to render.
        size: Font size.
        dx: X-axis offset.
        dy: Y-axis offset.

    Returns:
        A tuple of the path string and the adjusted bounding box.
    """
    path, _, bbox = glyph_to_path(face, letter, size, dx, dy)
    adjusted_bbox = BBox(
        xMin=bbox.xMin + dx,
        xMax=bbox.xMax + dx,
        yMin=-bbox.yMax + dy,
        yMax=-bbox.yMin + dy
    )
    return path, adjusted_bbox


def generate_subscript_digits(
    face: freetype.Face, 
    count_str: str, 
    sub_size: int, 
    letter_bbox: BBox, 
    base_size: int, 
    y_offset: float
) -> Tuple[List[str], List[BBox]]:
    """
    Generate the SVG paths and bounding boxes for the subscript digits.

    Args:
        face: The FreeType face.
        count_str: A string of digits to render as a subscript.
        sub_size: Font size for the subscript digits.
        letter_bbox: The bounding box of the main letter.
        base_size: The font size of the main letter (used for spacing).
        y_offset: The vertical offset for the subscript.

    Returns:
        A tuple of path strings and bounding boxes.
    """
    paths = []
    bboxes = []
    x_offset = letter_bbox.xMax + base_size * LETTER_SPACING
    
    for digit in count_str:
        path, _, bbox = glyph_to_path(face, digit, sub_size, dx=x_offset, dy=y_offset)
        paths.append(path)
        adjusted_bbox = BBox(
            xMin=bbox.xMin + x_offset,
            xMax=bbox.xMax + x_offset,
            yMin=-bbox.yMax + y_offset,
            yMax=-bbox.yMin + y_offset
        )
        bboxes.append(adjusted_bbox)
        x_offset = adjusted_bbox.xMax + sub_size * DIGIT_SPACING
        
    return paths, bboxes


def generate_random_glitch_timings() -> Tuple[float, float]:
    """
    Generate random timings for the glitch animations.

    Returns:
        A tuple containing the start percentages for the first and second glitches.
    """
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


def get_keyframes_for_glitch(group_index: int, glitch_offset: int, duration_sec: float) -> str:
    """
    Generate CSS keyframes for the glitch effect of a specific path group.

    Args:
        group_index: Index of the path group (for class naming).
        glitch_offset: Horizontal offset in pixels for the glitch effect.
        duration_sec: Duration of the animation loop in seconds.

    Returns:
        A formatted CSS string containing the classes and keyframes.
    """
    glitch1_start, glitch2_start = generate_random_glitch_timings()
    glitch_duration_percent = 0.25 / 30.0 * 100
    glitch_both_top_duration = 0.3 / 30.0 * 100
    glitch_both_bottom_duration = 0.1 / 30.0 * 100
    glitch_both_bottom_delay = 0.15 / 30.0 * 100
    
    first_glitch_bottom = glitch1_start < glitch2_start
    
    if first_glitch_bottom:
        first_start, first_end = glitch1_start, glitch1_start + glitch_duration_percent
        both_top_start, both_top_end = glitch2_start, glitch2_start + glitch_both_top_duration
        both_bottom_start = glitch2_start + glitch_both_bottom_delay
        both_bottom_end = both_bottom_start + glitch_both_bottom_duration
        second_start, second_end = 0, 0
    else:
        second_start, second_end = glitch1_start, glitch1_start + glitch_duration_percent
        both_top_start, both_top_end = glitch2_start, glitch2_start + glitch_both_top_duration
        both_bottom_start = glitch2_start + glitch_both_bottom_delay
        both_bottom_end = both_bottom_start + glitch_both_bottom_duration
        first_start, first_end = 0, 0

    css_lines = [
        f"      .band-top-{group_index} {{ animation: glitch-top-{group_index} {duration_sec}s infinite; }}",
        f"      .band-middle-{group_index} {{ animation: none; }}",
        f"      .band-bottom-{group_index} {{ animation: glitch-bottom-{group_index} {duration_sec}s infinite; }}",
        f"      @keyframes glitch-bottom-{group_index} {{",
        "        0% { transform: translateX(0); }"
    ]

    def add_glitch_keyframe(start: float, end: float):
        if start > 0:
            css_lines.append(f"        {start - 0.01:.2f}% {{ transform: translateX(0); }}")
        css_lines.append(f"        {start:.2f}% {{ transform: translateX({glitch_offset}px); }}")
        css_lines.append(f"        {end:.2f}% {{ transform: translateX({glitch_offset}px); }}")
        css_lines.append(f"        {end + 0.01:.2f}% {{ transform: translateX(0); }}")

    if first_glitch_bottom:
        add_glitch_keyframe(first_start, first_end)
        add_glitch_keyframe(both_bottom_start, both_bottom_end)
    else:
        add_glitch_keyframe(both_bottom_start, both_bottom_end)
        add_glitch_keyframe(second_start, second_end)
        
    css_lines.append("        100% { transform: translateX(0); }")
    css_lines.append("      }")
    
    css_lines.append(f"      @keyframes glitch-top-{group_index} {{")
    css_lines.append("        0% { transform: translateX(0); }")
    
    if both_top_start > 0:
        css_lines.append(f"        {both_top_start - 0.01:.2f}% {{ transform: translateX(0); }}")
    css_lines.append(f"        {both_top_start:.2f}% {{ transform: translateX(-{glitch_offset}px); }}")
    css_lines.append(f"        {both_top_end:.2f}% {{ transform: translateX(-{glitch_offset}px); }}")
    css_lines.append(f"        {both_top_end + 0.01:.2f}% {{ transform: translateX(0); }}")
    css_lines.append("        100% { transform: translateX(0); }")
    css_lines.append("      }")
    
    return "\n".join(css_lines)


def add_glitch_animation_per_group(
    path_groups: List[List[str]], 
    width: float, 
    height: float, 
    min_x: float, 
    min_y: float, 
    text_color: str, 
    duration_sec: float, 
    glitch_offset: int = 200
) -> str:
    """
    Wrap the SVG paths with animated glitch bands.

    Args:
        path_groups: A list of path groups (each group represents a word).
        width: Total width of the graphic.
        height: Total height of the graphic.
        min_x: Minimum X bounds.
        min_y: Minimum Y bounds.
        text_color: Color to fill the SVG paths.
        duration_sec: Duration of the animation loop in seconds.
        glitch_offset: Intensity (offset) of the glitch.

    Returns:
        The animated SVG markup as a string.
    """
    band_height_20 = height * 0.2
    band_height_60 = height * 0.6
    
    band_top_y = min_y
    band_middle_y = min_y + band_height_20
    band_bottom_y = min_y + band_height_20 + band_height_60
    
    extended_min_x = min_x - glitch_offset
    extended_width = width + (2 * glitch_offset)
    
    css_content = "\n".join(
        get_keyframes_for_glitch(i, glitch_offset, duration_sec) 
        for i in range(len(path_groups))
    )
        
    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{int(width)}" height="{int(height)}" viewBox="{int(extended_min_x)} {int(min_y)} {int(extended_width)} {int(height)}">',
        "  <defs>",
        "    <style>",
        css_content,
        "    </style>",
        '    <clipPath id="band-top">',
        f'      <rect x="{int(extended_min_x)}" y="{int(band_top_y)}" width="{int(extended_width)}" height="{int(band_height_20 + 5)}"/>',
        "    </clipPath>",
        '    <clipPath id="band-middle">',
        f'      <rect x="{int(extended_min_x)}" y="{int(band_middle_y - 2)}" width="{int(extended_width)}" height="{int(band_height_60 + 4)}"/>',
        "    </clipPath>",
        '    <clipPath id="band-bottom">',
        f'      <rect x="{int(extended_min_x)}" y="{int(band_bottom_y - 2)}" width="{int(extended_width)}" height="{int(band_height_20 + 5)}"/>',
        "    </clipPath>",
        "  </defs>"
    ]

    for i, group_paths in enumerate(path_groups):
        for band, clip_id in [('top', 'band-top'), ('middle', 'band-middle'), ('bottom', 'band-bottom')]:
            svg_parts.append(f'  <g class="band-{band}-{i}" clip-path="url(#{clip_id})">')
            for path in group_paths:
                svg_parts.append(f'    <path d="{path}" fill="{text_color}"/>')
            svg_parts.append('  </g>')

    svg_parts.append("</svg>\n")
    return "\n".join(svg_parts)


def generate_icon_svg(
    words: List[str], 
    font_name: str = "fonts/bmf10-rg.ttf", 
    dark_mode: bool = False, 
    animated: bool = False, 
    target_width: int = None, 
    duration_sec: float = 30.0
) -> None:
    """
    Generate the definitive SVG for the app icon, writing to stdout.

    Args:
        words: The input words to render (each first letter will be a main character).
        font_name: Path to the TTF font file.
        dark_mode: If true, renders black text, otherwise white.
        animated: If true, includes glitch animation.
        target_width: Optional pixel width to scale the output to.
        duration_sec: Duration of animation playback.
    """
    font_path = font_name if os.path.isabs(font_name) else os.path.join(SCRIPT_DIR, font_name)
    
    if not os.path.exists(font_path):
        print(f"Error: Font file not found at {font_path}", file=sys.stderr)
        sys.exit(1)
        
    face = freetype.Face(font_path)
    sub_size = int(MAIN_SIZE * SUBSCRIPT_RATIO)
    ascender = face.ascender / face.units_per_EM * MAIN_SIZE
    subscript_y_offset = int(ascender * SUBSCRIPT_Y_FACTOR)
    
    path_groups = []
    all_bboxes = []
    
    x_offset = 0.0
    for word in words:
        main_letter = word[0].upper()
        word_length_str = str(len(word) - 1)
        
        main_path, main_bbox = generate_main_letter(face, main_letter, MAIN_SIZE, dx=x_offset)
        group = [main_path]
        all_bboxes.append(main_bbox)
        
        sub_paths, sub_bboxes = generate_subscript_digits(
            face, word_length_str, sub_size, main_bbox, MAIN_SIZE, subscript_y_offset
        )
        group.extend(sub_paths)
        all_bboxes.extend(sub_bboxes)
        
        path_groups.append(group)
        
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
        output_width = float(target_width)
        output_height = height * scale_factor
    else:
        output_width = width
        output_height = height
        
    text_color = "black" if dark_mode else "white"
    
    if animated:
        animated_svg = add_glitch_animation_per_group(
            path_groups, width, height, min_x, min_y, text_color, duration_sec
        )
        if target_width:
            animated_svg = animated_svg.replace(
                f'width="{int(width)}" height="{int(height)}"',
                f'width="{int(output_width)}" height="{int(output_height)}"'
            )
        sys.stdout.write(animated_svg)
    else:
        svg_lines = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{int(output_width)}" height="{int(output_height)}" viewBox="{int(min_x)} {int(min_y)} {int(width)} {int(height)}">'
        ]
        
        for group in path_groups:
            for path in group:
                svg_lines.append(f'  <path d="{path}" fill="{text_color}"/>')
                
        svg_lines.append('</svg>\n')
        sys.stdout.write("\n".join(svg_lines))


def main() -> None:
    """Main CLI entrypoint."""
    parser = argparse.ArgumentParser(
        description="Generate a stylized, optionally animated SVG icon from input words."
    )
    
    # We use nargs='*' to allow manual checking and custom error message
    parser.add_argument('words', nargs='*', help='The input word(s) to process')
    parser.add_argument('--dark', action='store_true', help='Use dark mode (black text)')
    parser.add_argument('--animated', action='store_true', help='Include a CSS glitch animation effect')
    parser.add_argument('--width', type=int, default=None, help='Target width in pixels')
    parser.add_argument('--duration', type=float, default=30.0, help='Animation duration loop in seconds (default: 30.0)')
    parser.add_argument('--font', type=str, default='fonts/bmf10-rg.ttf', help='Font file name or absolute path')
    
    args = parser.parse_args()
    
    if not args.words:
        parser.print_usage(sys.stderr)
        print("Error: at least one word must be provided.", file=sys.stderr)
        sys.exit(1)
        
    generate_icon_svg(
        words=args.words, 
        font_name=args.font, 
        dark_mode=args.dark, 
        animated=args.animated, 
        target_width=args.width, 
        duration_sec=args.duration
    )


if __name__ == "__main__":
    main()
