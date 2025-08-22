#!/usr/bin/env python3
"""
Application Icon Generator

Generates SVG icons consisting of the first letter of a word (large) followed by 
the word length as subscript digits (small). Designed for creating consistent 
application icons across a project.

Example: "arcane" produces an icon with "A" and subscript "5"

Dependencies:
- freetype-py: TrueType font rendering
- nasalization-rg.ttf: Futuristic font for styling

Usage:
    python app:icon:generator.py <word> [--dark] [--animated] [--width WIDTH]
"""

import sys
import os
import freetype
import random

# Configuration
# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = os.path.join(SCRIPT_DIR, "nasalization-rg.ttf")
MAIN_SIZE = 120           # Base font size for main letter
SUBSCRIPT_RATIO = 0.3     # Subscript size as ratio of main size
SUBSCRIPT_Y_FACTOR = 10   # How far down to position subscripts
LETTER_SPACING = 0.2      # Space between main letter and subscripts
DIGIT_SPACING = 0.1       # Space between subscript digits

def outline_to_svg_path(outline, dx=0, dy=0):
    """
    Convert TrueType font outline to SVG path data.
    
    TrueType fonts store glyphs as a series of contours (closed shapes) made up of 
    points that are either "on-curve" (endpoints/corners) or "off-curve" (control points 
    for quadratic Bézier curves).
    
    Args:
        outline: FreeType glyph outline containing points, tags, and contour endpoints
        dx, dy: Translation offsets to apply to all coordinates
        
    Returns:
        SVG path string with Move, Line, Quadratic, and ClosePath commands
        
    Technical notes:
    - Y coordinates are flipped (-y) because TrueType uses bottom-up coordinates 
      while SVG uses top-down
    - Tags indicate point type: bit 0 = 1 for on-curve, 0 for off-curve
    - Off-curve points between two off-curve points get an implied on-curve point 
      at their midpoint (TrueType quadratic curve interpolation)
    """
    path = ""
    start = 0
    
    # Process each contour (closed shape) in the glyph
    for end in outline.contours:
        # Extract points and tags for this contour
        points = outline.points[start:end+1]
        tags = outline.tags[start:end+1]
        
        # Close the contour by duplicating the first point
        points.append(points[0])
        tags.append(tags[0])

        # Start the path at the first point
        x0, y0 = points[0]
        path += f"M {x0+dx} {-y0+dy} "

        i = 1
        while i < len(points):
            x, y = points[i]
            tag = tags[i] & 1  # Extract on-curve bit
            
            if tag:  # On-curve point: draw straight line
                path += f"L {x+dx} {-y+dy} "
                i += 1
            else:  # Off-curve point: start quadratic curve
                x1, y1 = x, y  # Control point
                
                if i+1 < len(points):
                    x2, y2 = points[i+1]
                    tag2 = tags[i+1] & 1
                    
                    if tag2:  # Next point is on-curve: complete quadratic
                        path += f"Q {x1+dx} {-y1+dy}, {x2+dx} {-y2+dy} "
                        i += 2
                    else:  # Next point is also off-curve: insert implied midpoint
                        xm = (x1+x2)//2
                        ym = (y1+y2)//2
                        path += f"Q {x1+dx} {-y1+dy}, {xm+dx} {-ym+dy} "
                        # Insert the implied point for next iteration
                        points.insert(i+1, (xm, ym))
                        tags.insert(i+1, 1)
                        i += 1
                else:
                    i += 1
                    
        path += "Z "  # Close the path
        start = end+1
        
    return path

def glyph_to_path(face, char, size, dx=0, dy=0):
    """
    Render a single character to SVG path with positioning.
    
    Args:
        face: FreeType face object (loaded font)
        char: Character to render (string or unicode)
        size: Font size in points
        dx, dy: Translation offsets for positioning
        
    Returns:
        tuple: (svg_path_string, advance_width, bounding_box)
        
    Technical notes:
    - FreeType uses 1/64th point units internally (size * 64)
    - FT_LOAD_NO_BITMAP forces vector outline loading (not bitmap)
    - Advance width is the horizontal space the character occupies
    - Bounding box defines the minimal rectangle containing the glyph
    """
    # Set font size (FreeType uses 1/64th point units)
    face.set_char_size(size * 64)
    
    # Load character outline (no bitmap rasterization)
    face.load_char(char, freetype.FT_LOAD_NO_BITMAP)
    
    # Extract glyph outline and convert to SVG path
    outline = face.glyph.outline
    path = outline_to_svg_path(outline, dx, dy)
    
    # Get character metrics
    advance = face.glyph.advance.x / 64  # Horizontal advance in points
    bbox = outline.get_bbox()            # Tight bounding box
    
    return path, advance, bbox

def generate_main_letter(face, letter, size):
    """
    Generate the main letter (first character of word, uppercase, large size).
    
    Args:
        face: FreeType face object
        letter: Character to render
        size: Font size for the main letter
        
    Returns:
        tuple: (svg_path, adjusted_bounding_box)
        
    Note: Bounding box Y coordinates are flipped to match SVG coordinate system
    """
    path, advance, bbox = glyph_to_path(face, letter, size)
    
    # Create adjusted bounding box with flipped Y coordinates for SVG
    # (TrueType: Y+ up, SVG: Y+ down)
    adjusted_bbox = type('BBox', (), {
        'xMin': bbox.xMin,
        'xMax': bbox.xMax,
        'yMin': -bbox.yMax,  # Flip Y coordinate
        'yMax': -bbox.yMin   # Flip Y coordinate
    })()
    
    return path, adjusted_bbox

def generate_subscript_digits(face, count_str, sub_size, letter_bbox, base_size, y_offset):
    """
    Generate subscript digits showing the word length.
    
    Args:
        face: FreeType face object
        count_str: String representation of the word length (e.g., "25")
        sub_size: Font size for subscript digits
        letter_bbox: Bounding box of the main letter for positioning
        base_size: Size of main letter (for spacing calculations)
        y_offset: Vertical offset for subscript positioning
        
    Returns:
        tuple: (list_of_svg_paths, list_of_adjusted_bounding_boxes)
        
    Technical approach:
    - Position digits horizontally side-by-side after the main letter
    - Each digit gets its own SVG path for individual styling/animation
    - Spacing is calculated from actual character widths to prevent overlap
    """
    paths = []
    bboxes = []
    
    # Start positioning after the main letter with some spacing
    x_offset = letter_bbox.xMax + base_size * LETTER_SPACING
    
    for digit in count_str:
        # Render digit with current positioning
        path, advance, bbox = glyph_to_path(face, digit, sub_size, 
                                           dx=x_offset, dy=y_offset)
        paths.append(path)
        
        # Create adjusted bounding box that includes the positioning offsets
        # This ensures accurate global bounding box calculation
        adjusted_bbox = type('BBox', (), {
            'xMin': bbox.xMin + x_offset,
            'xMax': bbox.xMax + x_offset,
            'yMin': -bbox.yMax + y_offset,  # Flip Y and apply offset
            'yMax': -bbox.yMin + y_offset   # Flip Y and apply offset
        })()
        bboxes.append(adjusted_bbox)
        
        # Move to next digit position using actual character width
        # This prevents overlap and ensures proper side-by-side placement
        x_offset = adjusted_bbox.xMax + sub_size * DIGIT_SPACING
    
    return paths, bboxes

def generate_random_glitch_timings():
    """
    Generate random timing for two glitch effects in a 30s cycle.
    
    Ensures minimum 7.5s separation between the two glitches.
    
    Returns:
        tuple: (glitch1_start_percent, glitch2_start_percent) as percentages of 30s cycle
    """
    # Convert to percentages of 30s cycle
    min_separation = 7.5 / 30.0 * 100  # 25% of cycle
    glitch_duration = 0.25 / 30.0 * 100  # ~0.83% of cycle
    
    # Generate first glitch position (anywhere in first 75% to ensure room for second)
    max_first_position = 100 - min_separation - glitch_duration
    glitch1_start = random.uniform(0, max_first_position)
    
    # Generate second glitch position (at least 7.5s after first glitch ends)
    glitch1_end = glitch1_start + glitch_duration
    min_second_start = glitch1_end + min_separation
    
    # If we can't fit the second glitch after the first, put it before
    if min_second_start + glitch_duration > 100:
        # Put second glitch before first, with minimum separation
        max_second_position = glitch1_start - min_separation - glitch_duration
        if max_second_position < 0:
            # Fallback: put them as far apart as possible
            glitch2_start = 0
            glitch1_start = min_separation + glitch_duration
        else:
            glitch2_start = random.uniform(0, max_second_position)
    else:
        glitch2_start = random.uniform(min_second_start, 100 - glitch_duration)
    
    return glitch1_start, glitch2_start

def add_glitch_animation(svg_content, width, height, min_x, min_y, glitch_offset=200):
    """
    Add Battlefield-style glitch animation to an SVG with random timing.
    
    Divides the SVG content into 3 horizontal bands (20% | 60% | 20%) and applies
    glitch effects with horizontal displacement over a 30s cycle:
    - Glitch type 1: Bottom band shifts right by glitch_offset
    - Glitch type 2: Top band shifts left + bottom band shifts right
    - Each transformation lasts 0.25s with random timing and minimum 7.5s separation
    
    Args:
        svg_content: Original SVG content (without closing </svg>)
        width, height: SVG dimensions
        min_x, min_y: SVG viewport origin
        glitch_offset: Horizontal displacement in pixels for glitch effect
        
    Returns:
        Complete animated SVG content
    """
    # Generate random glitch timings
    glitch1_start, glitch2_start = generate_random_glitch_timings()
    glitch_duration_percent = 0.25 / 30.0 * 100  # 0.83% of 30s cycle for single glitch
    glitch_both_top_duration = 0.3 / 30.0 * 100  # 1% of 30s cycle for "both" glitch top band
    glitch_both_bottom_duration = 0.1 / 30.0 * 100  # 0.33% of 30s cycle for "both" glitch bottom band
    glitch_both_bottom_delay = 0.15 / 30.0 * 100  # 0.5% of 30s cycle delay
    
    # Calculate keyframe percentages for single glitches
    g1_start = glitch1_start
    g1_end = glitch1_start + glitch_duration_percent
    g2_start = glitch2_start
    glitch2_start + glitch_duration_percent
    
    # Determine which glitch comes first to decide animation type
    if glitch1_start < glitch2_start:
        # First glitch = bottom only (0.25s), Second glitch = both (top: 0.3s, bottom: 0.1s delayed 0.15s)
        first_glitch_bottom = True
        first_start, first_end = g1_start, g1_end
        # For "both" glitch: top starts immediately, bottom starts 0.15s later
        both_top_start = g2_start
        both_top_end = g2_start + glitch_both_top_duration
        both_bottom_start = g2_start + glitch_both_bottom_delay
        both_bottom_end = g2_start + glitch_both_bottom_delay + glitch_both_bottom_duration
    else:
        # First glitch = both (top: 0.3s, bottom: 0.1s delayed 0.15s), Second glitch = bottom only (0.25s)
        first_glitch_bottom = False
        second_start, second_end = g1_start, g1_end
        # For "both" glitch: top starts immediately, bottom starts 0.15s later
        both_top_start = g2_start
        both_top_end = g2_start + glitch_both_top_duration
        both_bottom_start = g2_start + glitch_both_bottom_delay
        both_bottom_end = g2_start + glitch_both_bottom_delay + glitch_both_bottom_duration
    
    # Calculate band heights (20% | 60% | 20%)
    band_height_20 = height * 0.2
    band_height_60 = height * 0.6
    
    # Calculate Y positions for each band
    band_top_y = min_y
    band_middle_y = min_y + band_height_20
    band_bottom_y = min_y + band_height_20 + band_height_60
    
    # Extend viewport to accommodate glitch displacement
    extended_min_x = min_x - glitch_offset
    extended_width = width + (2 * glitch_offset)
    
    # Build animated SVG with random timing
    animated_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{int(width)}" height="{int(height)}"
     viewBox="{int(extended_min_x)} {int(min_y)} {int(extended_width)} {int(height)}">
  <defs>
    <style>
      .band-top {{
        animation: glitch-top 30s infinite;
      }}
      
      .band-middle {{
        animation: none;
      }}
      
      .band-bottom {{
        animation: glitch-bottom 30s infinite;
      }}
      
      @keyframes glitch-bottom {{
        0% {{ transform: translateX(0); }}'''

    if first_glitch_bottom:
        # First glitch = bottom only (0.25s)
        if first_start > 0:
            animated_svg += f'''
        {first_start - 0.01:.2f}% {{ transform: translateX(0); }}'''
        animated_svg += f'''
        {first_start:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {first_end:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {first_end + 0.01:.2f}% {{ transform: translateX(0); }}'''
        
        # Second glitch = both, but here we handle the bottom band (0.1s delayed by 0.15s)
        if both_bottom_start > first_end:
            animated_svg += f'''
        {both_bottom_start - 0.01:.2f}% {{ transform: translateX(0); }}'''
        animated_svg += f'''
        {both_bottom_start:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {both_bottom_end:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {both_bottom_end + 0.01:.2f}% {{ transform: translateX(0); }}'''
    else:
        # First glitch = both, handle bottom band (0.1s delayed by 0.15s)
        if both_bottom_start > 0:
            animated_svg += f'''
        {both_bottom_start - 0.01:.2f}% {{ transform: translateX(0); }}'''
        animated_svg += f'''
        {both_bottom_start:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {both_bottom_end:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {both_bottom_end + 0.01:.2f}% {{ transform: translateX(0); }}'''
        
        # Second glitch = bottom only (0.25s)
        if second_start > both_bottom_end:
            animated_svg += f'''
        {second_start - 0.01:.2f}% {{ transform: translateX(0); }}'''
        animated_svg += f'''
        {second_start:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {second_end:.2f}% {{ transform: translateX({glitch_offset}px); }}
        {second_end + 0.01:.2f}% {{ transform: translateX(0); }}'''
    
    animated_svg += '''
        100% { transform: translateX(0); }
      }
      
      @keyframes glitch-top {
        0% { transform: translateX(0); }'''

    # Add glitch for top band (only for the "both" glitch, 0.3s duration)
    if both_top_start > 0:
        animated_svg += f'''
        {both_top_start - 0.01:.2f}% {{ transform: translateX(0); }}'''
    animated_svg += f'''
        {both_top_start:.2f}% {{ transform: translateX(-{glitch_offset}px); }}
        {both_top_end:.2f}% {{ transform: translateX(-{glitch_offset}px); }}
        {both_top_end + 0.01:.2f}% {{ transform: translateX(0); }}
        100% {{ transform: translateX(0); }}
      }}
    </style>
    
    <!-- Clip paths for 3 horizontal bands -->
    <clipPath id="band-top">
      <rect x="{int(extended_min_x)}" y="{int(band_top_y)}" width="{int(extended_width)}" height="{int(band_height_20 + 5)}"/>
    </clipPath>
    
    <clipPath id="band-middle">
      <rect x="{int(extended_min_x)}" y="{int(band_middle_y - 2)}" width="{int(extended_width)}" height="{int(band_height_60 + 4)}"/>
    </clipPath>
    
    <clipPath id="band-bottom">
      <rect x="{int(extended_min_x)}" y="{int(band_bottom_y - 2)}" width="{int(extended_width)}" height="{int(band_height_20 + 5)}"/>
    </clipPath>
  </defs>
  
  <!-- Top band (20%) -->
  <g class="band-top" clip-path="url(#band-top)">
'''
    
    # Extract and duplicate path elements for each band
    lines = svg_content.split('\n')
    path_lines = []
    for line in lines:
        if '<path d=' in line:
            path_lines.append(line)
    
    # Add paths to each band
    for path_line in path_lines:
        animated_svg += f'    {path_line}\n'
    
    animated_svg += '''  </g>
  
  <!-- Middle band (60%) -->
  <g class="band-middle" clip-path="url(#band-middle)">
'''
    
    for path_line in path_lines:
        animated_svg += f'    {path_line}\n'
    
    animated_svg += '''  </g>
  
  <!-- Bottom band (20%) -->
  <g class="band-bottom" clip-path="url(#band-bottom)">
'''
    
    for path_line in path_lines:
        animated_svg += f'    {path_line}\n'
    
    animated_svg += '''  </g>
</svg>
'''
    
    return animated_svg

def generate_icon_svg(word, dark_mode=False, animated=False, target_width=None):
    """
    Generate an SVG icon for the given word.
    
    Creates an icon with the first letter (large) and word length as subscript (small).
    Each character gets its own SVG path for flexibility in styling and animation.
    
    Args:
        word: Input word to create icon for
        dark_mode: If True, use black text; if False, use white text
        animated: If True, add Battlefield-style glitch animation
        target_width: If specified, scale the SVG to this width (maintaining aspect ratio)
        
    Output:
        Writes SVG content to stdout
        
    Design specifications:
    - Main letter: Uppercase, large size (120pt)
    - Subscript: Word length digits, small size (30% of main)
    - Colors: White text (default) or black text (dark mode)
    - Layout: Letter followed by subscript digits, positioned low and right
    """
    # Load the custom font
    face = freetype.Face(FONT_PATH)
    
    # Calculate sizes and positioning
    main_letter = word[0].upper()
    word_length = str(len(word) - 1)
    
    sub_size = int(MAIN_SIZE * SUBSCRIPT_RATIO)
    
    # Calculate subscript vertical offset based on font metrics
    # Ascender is the height above baseline; we use it to position subscripts below
    ascender = face.ascender / face.units_per_EM * MAIN_SIZE
    subscript_y_offset = int(ascender * SUBSCRIPT_Y_FACTOR)
    
    # Generate main letter path and bounding box
    main_path, main_bbox = generate_main_letter(face, main_letter, MAIN_SIZE)
    
    # Generate subscript digit paths and bounding boxes
    subscript_paths, subscript_bboxes = generate_subscript_digits(
        face, word_length, sub_size, main_bbox, MAIN_SIZE, subscript_y_offset
    )
    
    # Calculate overall SVG dimensions from all elements
    [main_path] + subscript_paths
    all_bboxes = [main_bbox] + subscript_bboxes
    
    # Find the minimal bounding rectangle containing all elements
    min_x = min(bbox.xMin for bbox in all_bboxes)
    max_x = max(bbox.xMax for bbox in all_bboxes)
    min_y = min(bbox.yMin for bbox in all_bboxes)
    max_y = max(bbox.yMax for bbox in all_bboxes)
    
    width = max_x - min_x
    height = max_y - min_y
    
    # Handle width scaling if specified
    if target_width:
        scale_factor = target_width / width
        scaled_height = height * scale_factor
        output_width = target_width
        output_height = scaled_height
    else:
        output_width = width
        output_height = height
    
    # Choose text color based on mode
    text_color = "black" if dark_mode else "white"
    
    if animated:
        # Build basic SVG content for animation processing
        svg_content = ""
        
        # Add main letter with descriptive comment
        svg_content += f'  <!-- Main letter: {main_letter} -->\n'
        svg_content += f'  <path d="{main_path}" fill="{text_color}"/>\n'
        
        # Add each subscript digit with individual comments and paths
        for i, path in enumerate(subscript_paths):
            digit = word_length[i]
            svg_content += f'  <!-- Subscript digit: {digit} -->\n'
            svg_content += f'  <path d="{path}" fill="{text_color}"/>\n'
        
        # Apply glitch animation
        animated_svg = add_glitch_animation(svg_content, width, height, min_x, min_y)
        
        # Apply width scaling to animated SVG if specified
        if target_width:
            animated_svg = animated_svg.replace(
                f'width="{int(width)}" height="{int(height)}"',
                f'width="{int(output_width)}" height="{int(output_height)}"'
            )
        
        sys.stdout.write(animated_svg)
    else:
        # Build standard SVG document
        svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{int(output_width)}" height="{int(output_height)}"
     viewBox="{int(min_x)} {int(min_y)} {int(width)} {int(height)}">
'''
        
        # Add main letter with descriptive comment
        svg_content += f'  <!-- Main letter: {main_letter} -->\n'
        svg_content += f'  <path d="{main_path}" fill="{text_color}"/>\n'
        
        # Add each subscript digit with individual comments and paths
        for i, path in enumerate(subscript_paths):
            digit = word_length[i]
            svg_content += f'  <!-- Subscript digit: {digit} -->\n'
            svg_content += f'  <path d="{path}" fill="{text_color}"/>\n'
        
        svg_content += '</svg>\n'
        
        # Output the complete SVG
        sys.stdout.write(svg_content)

def main():
    """
    Command-line interface for the icon generator.
    """
    if len(sys.argv) < 2:
        print("Usage: python app:icon:generator.py <word> [--dark] [--animated] [--width WIDTH]", file=sys.stderr)
        print("\nExamples:", file=sys.stderr)
        print("  python app:icon:generator.py arcane > arcane.svg", file=sys.stderr)
        print("  python app:icon:generator.py rhodes --dark > rhodes-dark.svg", file=sys.stderr)
        print("  python app:icon:generator.py kazimierz --animated > kazimierz-glitch.svg", file=sys.stderr)
        print("  python app:icon:generator.py victoria --width 512 > victoria-512px.svg", file=sys.stderr)
        sys.exit(1)
        
    word = sys.argv[1]
    dark_mode = "--dark" in sys.argv
    animated = "--animated" in sys.argv
    
    # Parse width argument
    target_width = None
    if "--width" in sys.argv:
        try:
            width_index = sys.argv.index("--width")
            if width_index + 1 < len(sys.argv):
                target_width = int(sys.argv[width_index + 1])
            else:
                print("Error: --width requires a numeric value", file=sys.stderr)
                sys.exit(1)
        except ValueError:
            print("Error: --width value must be a number", file=sys.stderr)
            sys.exit(1)
    
    # Validate input
    if not word or not word.strip():
        print("Error: Word cannot be empty", file=sys.stderr)
        sys.exit(1)
        
    generate_icon_svg(word.strip(), dark_mode, animated, target_width)


if __name__ == "__main__":
    main()
