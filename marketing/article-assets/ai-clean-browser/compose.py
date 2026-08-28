from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
FONT = "/System/Library/Fonts/SFNS.ttf"
MONO = "/System/Library/Fonts/SFNSMono.ttf"
INK = (17, 17, 18, 255)
PAPER = (248, 247, 243, 255)
MUTED = (96, 95, 93, 255)
LAVENDER = (135, 118, 255, 255)


def font(size: int, mono: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(MONO if mono else FONT, size)


def rounded_image(image: Image.Image, radius: int) -> Image.Image:
    image = image.convert("RGBA")
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.width - 1, image.height - 1), radius, fill=255)
    image.putalpha(mask)
    return image


def paste_shadow(canvas: Image.Image, image: Image.Image, xy: tuple[int, int], radius: int = 34) -> None:
    x, y = xy
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_mask = image.getchannel("A").filter(ImageFilter.GaussianBlur(radius))
    shadow_patch = Image.new("RGBA", image.size, (15, 15, 18, 70))
    shadow_patch.putalpha(shadow_mask.point(lambda p: int(p * 0.36)))
    shadow.alpha_composite(shadow_patch, (x, y + 18))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(image, (x, y))


def fit_crop(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    ratio = max(target_w / image.width, target_h / image.height)
    resized = image.resize((round(image.width * ratio), round(image.height * ratio)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def draw_multiline(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, face: ImageFont.FreeTypeFont,
                   fill, spacing: int) -> None:
    draw.multiline_text(xy, text, font=face, fill=fill, spacing=spacing)


backdrop = fit_crop(Image.open(ROOT / "generated-backdrop.png").convert("RGBA"), (2500, 1000))
expanded_source = Image.open(ROOT / "expanded-source.jpeg").convert("RGBA")
resting_source = Image.open(ROOT / "resting-clean-source.jpeg").convert("RGBA")
logo = Image.open(ROOT.parents[2] / "src/renderer/pages/icon-ink.png").convert("RGBA")

# Exact live UI crops. These are composited without generative alteration.
expanded = expanded_source.crop((307, 0, 923, 177))
expanded = expanded.resize((1260, 362), Image.Resampling.LANCZOS)
expanded = rounded_image(expanded, 38)

resting = resting_source.crop((396, 0, 830, 68))
resting = resting.resize((960, 150), Image.Resampling.LANCZOS)
resting = rounded_image(resting, 64)


# 5:2 article header shared by X and Substack.
hero = backdrop.copy()
overlay = Image.new("RGBA", hero.size, (255, 255, 255, 0))
od = ImageDraw.Draw(overlay)
for x in range(760, 2500):
    alpha = int(224 * min(1, (x - 760) / 650))
    od.line((x, 0, x, 1000), fill=(250, 249, 246, alpha))
hero = Image.alpha_composite(hero, overlay)
draw = ImageDraw.Draw(hero)

logo_small = logo.resize((56, 56), Image.Resampling.LANCZOS)
hero.alpha_composite(logo_small, (1010, 84))
draw.text((1088, 100), "BLANC  /  FIELD NOTE 02", font=font(28, mono=True), fill=MUTED)
draw_multiline(
    draw,
    (1010, 182),
    "a clean workspace\nshouldn't be an\nAI exclusive.",
    font(91),
    INK,
    8,
)
draw.text(
    (1014, 512),
    "user-directed groups and Patron workspaces. no AI required.",
    font=font(34),
    fill=MUTED,
)
paste_shadow(hero, expanded, (1110, 610), radius=28)
hero.convert("RGB").save(ROOT / "ai-clean-workspace-header-5x2.jpg", quality=94, subsampling=0)


# 3:2 Substack thumbnail. The composition is rebuilt for the crop rather than
# allowing the platform to cut down the wide X header.
cover = fit_crop(Image.open(ROOT / "generated-backdrop.png").convert("RGBA"), (1800, 1200))
veil = Image.new("RGBA", cover.size, (250, 249, 246, 168))
cover = Image.alpha_composite(cover, veil)
cd = ImageDraw.Draw(cover)
cover.alpha_composite(logo.resize((54, 54), Image.Resampling.LANCZOS), (170, 110))
cd.text((246, 124), "BLANC  /  FIELD NOTE 02", font=font(26, mono=True), fill=MUTED)
draw_multiline(
    cd,
    (170, 215),
    "a clean workspace\nshouldn't be an\nAI exclusive.",
    font(90),
    INK,
    10,
)
cd.text((174, 560), "user-directed groups and Patron workspaces. no AI required.", font=font(34), fill=MUTED)
paste_shadow(cover, expanded, (270, 735), radius=30)
cover.convert("RGB").save(ROOT / "ai-clean-workspace-cover-3x2.jpg", quality=94, subsampling=0)


# Supporting image: the product's compact Island surrounded by unfinished context,
# presented as task material rather than as user failure.
support = Image.new("RGBA", (1600, 1000), (16, 16, 18, 255))
sd = ImageDraw.Draw(support)
sd.text((112, 84), "WHAT TABS ACTUALLY ARE", font=font(26, mono=True), fill=(165, 163, 158, 255))
sd.text((112, 132), "unfinished context.", font=font(86), fill=(246, 245, 241, 255))

cards = [
    ("COMPARE", 110, 300, 290, 120),
    ("READ", 420, 280, 230, 100),
    ("DECIDE", 1180, 295, 280, 118),
    ("RETURN", 1270, 470, 220, 96),
    ("REPLY", 130, 655, 220, 102),
    ("REFERENCE", 1110, 690, 330, 112),
]
for i, (label, x, y, w, h) in enumerate(cards):
    fill = (33, 33, 37, 255) if i % 2 == 0 else (28, 28, 32, 255)
    stroke = (91, 88, 101, 255)
    sd.rounded_rectangle((x, y, x + w, y + h), radius=26, fill=fill, outline=stroke, width=2)
    sd.text((x + 24, y + 20), label, font=font(21, mono=True), fill=(185, 181, 198, 255))
    sd.rounded_rectangle((x + 24, y + h - 34, x + w - 64, y + h - 24), radius=5, fill=(82, 79, 90, 255))

# A few task-thread strokes converge toward the Island without pretending to be UI.
for start, end in [((350, 360), (535, 505)), ((650, 330), (710, 500)), ((1180, 355), (1040, 505)),
                   ((1270, 520), (1080, 550)), ((350, 705), (560, 620)), ((1110, 740), (1010, 640))]:
    sd.line((*start, *end), fill=(76, 71, 103, 180), width=3)

paste_shadow(support, resting, (320, 500), radius=36)
sd.text((112, 890), "you name the groups. blanc keeps them together.", font=font(35), fill=(206, 203, 214, 255))
support.convert("RGB").save(ROOT / "tabs-are-unfinished-context.jpg", quality=94, subsampling=0)

print(ROOT / "ai-clean-workspace-header-5x2.jpg")
print(ROOT / "ai-clean-workspace-cover-3x2.jpg")
print(ROOT / "tabs-are-unfinished-context.jpg")
