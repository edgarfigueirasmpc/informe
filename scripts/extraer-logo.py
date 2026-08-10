"""
Extrae el logo del mockup de pegatina y genera los ficheros que usa la app.

El original viene montado sobre un fondo gris con un halo blanco. Fondo, halo y
el reborde blanco de la pegatina son todos acromáticos (croma <= 3), mientras
que el dibujo es naranja, azul y madera (croma >= 128), así que basta con
recortar por saturación: se conservan las formas exactas del logo, sin
redibujar nada.

El monograma corporativo (MPC) va aparte: ese ya viene con transparencia y su
filo blanco forma parte del dibujo, así que sólo se recorta y se escala. Pasarlo
por el recorte de saturación se lo comería.

    python scripts/extraer-logo.py <logo-informe.png> [<logo-mpc.png>]
"""

import sys
from pathlib import Path

from PIL import Image

# Por debajo de este croma el píxel es fondo; por encima, dibujo. Entre medias
# se reparte la opacidad, que es lo que mantiene los bordes suaves.
CROMA_FONDO = 16
CROMA_DIBUJO = 58

RAIZ = Path(__file__).resolve().parent.parent

# Los logos que se pintan en la página se importan desde el código, para que
# Vite les ponga huella y respete la ruta base; los iconos del navegador van
# a public/, porque los referencia index.html por nombre.
MARCAS = RAIZ / "src" / "assets"
ICONOS = RAIZ / "public"


def extraer(origen: Path) -> Image.Image:
    im = origen.open("rb")
    img = Image.open(im).convert("RGB")
    ancho, alto = img.size
    pixeles = img.load()

    alpha = Image.new("L", img.size)
    ap = alpha.load()

    for y in range(alto):
        for x in range(ancho):
            r, g, b = pixeles[x, y]
            croma = max(r, g, b) - min(r, g, b)
            if croma <= CROMA_FONDO:
                ap[x, y] = 0
            elif croma >= CROMA_DIBUJO:
                ap[x, y] = 255
            else:
                ap[x, y] = int(
                    255 * (croma - CROMA_FONDO) / (CROMA_DIBUJO - CROMA_FONDO)
                )

    img.putalpha(alpha)
    recorte = img.crop(img.getbbox())
    print(f"recortado a {recorte.size[0]}x{recorte.size[1]}")
    return recorte


def cuadrar(img: Image.Image, lado: int, margen: float = 0.06) -> Image.Image:
    """Centra el logo en un lienzo cuadrado, que es lo que esperan los iconos."""
    util = int(lado * (1 - margen * 2))
    escala = min(util / img.width, util / img.height)
    escalado = img.resize(
        (max(1, round(img.width * escala)), max(1, round(img.height * escala))),
        Image.LANCZOS,
    )
    lienzo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    lienzo.paste(
        escalado,
        ((lado - escalado.width) // 2, (lado - escalado.height) // 2),
        escalado,
    )
    return lienzo


def a_alto(img: Image.Image, alto: int) -> Image.Image:
    return img.resize((round(img.width * alto / img.height), alto), Image.LANCZOS)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("uso: python scripts/extraer-logo.py <logo-informe.png> [<logo-mpc.png>]")

    logo = extraer(Path(sys.argv[1]))

    # En pantalla se ve a 34 px (52 en la pantalla de acceso): con 192 va
    # sobrado incluso en retina, y pesa una cuarta parte que exportarlo a 512.
    a_alto(logo, 192).save(MARCAS / "logo.png")

    for lado, nombre in [(32, "favicon-32.png"), (180, "apple-touch-icon.png"), (512, "icono.png")]:
        cuadrar(logo, lado).save(ICONOS / nombre)

    if len(sys.argv) > 2:
        mpc = Image.open(sys.argv[2]).convert("RGBA")
        recorte = mpc.crop(mpc.getbbox())
        print(f"MPC recortado a {recorte.size[0]}x{recorte.size[1]}")
        a_alto(recorte, 96).save(MARCAS / "mpc.png")

    for carpeta in (MARCAS, ICONOS):
        for f in sorted(carpeta.glob("*.png")):
            print(f"  {f.relative_to(RAIZ)}: {f.stat().st_size / 1024:.1f} kB")


if __name__ == "__main__":
    main()
