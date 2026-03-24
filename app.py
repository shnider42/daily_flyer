from daily_flyer.orchestrator import build_daily_page
from daily_flyer.renderer import render_html_to_file
from daily_flyer.utils import parse_args


def main() -> None:
    args = parse_args()

    context = build_daily_page(
        theme_name=args.theme,
        date_str=args.date,
        seed=args.seed,
    )

    render_html_to_file(
        context=context,
        outfile=args.outfile,
    )

    print(f"✅ Wrote {args.outfile}")


if __name__ == "__main__":
    main()