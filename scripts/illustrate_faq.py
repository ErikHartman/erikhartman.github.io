"""Regenerate the FAQ's house-price illustrations (requires matplotlib).

The SVGs are checked in; the website build does not require Python.
"""

from pathlib import Path
import os
import tempfile

os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "website-matplotlib"))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

OUTPUT = Path(__file__).resolve().parents[1] / "site" / "figures"
OUTPUT.mkdir(parents=True, exist_ok=True)


def draw_model(mobile=False):
    plt.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["Arial", "DejaVu Sans"],
        "font.size": 14,
        "svg.fonttype": "none",
        "svg.hashsalt": "faq-house-price-model",
        "axes.edgecolor": "black",
        "axes.labelcolor": "black",
        "text.color": "black",
    })
    fig, ax = plt.subplots(figsize=(4.4, 4.1) if mobile else (7.4, 4.3))
    fig.subplots_adjust(left=.28 if mobile else .19, right=.96, bottom=.19, top=.86)
    rooms = [1, 2, 3, 4, 5, 6]
    prices = [room * 50_000 for room in rooms]
    ax.plot(rooms, prices, color="black", linewidth=1.5, zorder=3)
    ax.scatter(rooms, prices, s=35, facecolor="white", edgecolor="black", linewidth=1.3, zorder=4)
    ax.scatter([4], [200_000], s=48, color="black", zorder=5)
    ax.plot([4, 4], [0, 200_000], color="#777", linewidth=1, linestyle=(0, (4, 4)), zorder=2)
    ax.plot([.5, 4], [200_000, 200_000], color="#777", linewidth=1, linestyle=(0, (4, 4)), zorder=2)
    ax.set_xlim(.5, 6.3)
    ax.set_ylim(0, 330_000)
    ax.set_xticks(rooms)
    ax.set_yticks([0, 100_000, 200_000, 300_000])
    ax.yaxis.set_major_formatter(FuncFormatter(lambda number, _: f"{number:,.0f}"))
    ax.set_xlabel("Number of rooms", labelpad=12)
    ax.set_title("Predicted price", loc="left", fontsize=14, pad=13)
    ax.tick_params(axis="both", length=4, pad=7)
    ax.spines[["top", "right"]].set_visible(False)
    ax.annotate(
        "4 rooms\n200,000", xy=(4, 200_000), xytext=(1.1, 250_000),
        ha="left", va="center", fontsize=14,
        arrowprops={"arrowstyle": "-", "color": "#777", "lw": 1, "shrinkB": 8},
        bbox={"facecolor": "white", "edgecolor": "none", "pad": 2},
        zorder=6,
    )
    filename = "house-price-model-mobile.svg" if mobile else "house-price-model.svg"
    target = OUTPUT / filename
    fig.savefig(target, format="svg", facecolor="white", metadata={
        "Date": None,
        "Title": "A simple house-price model",
        "Description": "Illustrative predictions, not sale data: price equals rooms times 50,000. One to six rooms gives 50,000 to 300,000. Four rooms gives 200,000. No currency is specified.",
    })
    plt.close(fig)
    print(target.relative_to(OUTPUT.parent.parent))


if __name__ == "__main__":
    draw_model()
    draw_model(mobile=True)
