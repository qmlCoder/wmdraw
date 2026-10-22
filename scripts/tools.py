from pathlib import Path

from PIL import Image


def cut_icon():
    path = r"E:/code/wmvdraw/raw-icons"
    for path in Path(path).glob("*.png"):
        print(path.name)
        img = Image.open(path)
        w, h = img.size
        # print(path.name)
        img.crop((20, 20, w - 20, h - 20)).save(
            rf"E:/code/wmvdraw/wmvdraw_app/public/icons/{path.name}"
        )

cut_icon()
