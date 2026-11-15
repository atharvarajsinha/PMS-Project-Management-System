import json

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.common import choices

FRONTEND_FILE = settings.BASE_DIR.parent / "frontend" / "src" / "config" / "choices.generated.js"

HEADER = """\
// GENERATED FILE — do not edit by hand.
// Source: backend/apps/common/choices.py
// Regenerate: cd backend && python manage.py export_choices
"""


def render():
    data = choices.as_dict()
    lines = [HEADER]
    lines.append("/** Every choice list: { Group: [{ value, label }] } */")
    lines.append(f"export const CHOICES = Object.freeze({json.dumps(data, indent=2)});")
    lines.append("")
    lines.append("/** Value constants, e.g. PhaseStatus.OPEN === \"OPEN\" */")
    for name, items in data.items():
        body = ", ".join(f"{item['value']}: {json.dumps(item['value'])}" for item in items)
        lines.append(f"export const {name} = Object.freeze({{ {body} }});")
    return "\n".join(lines) + "\n"


class Command(BaseCommand):
    help = "Write the frontend copy of apps/common/choices.py (frontend/src/config/choices.generated.js)."

    def add_arguments(self, parser):
        parser.add_argument("--check", action="store_true", help="Exit 1 if the file is out of date; don't write.")

    def handle(self, *args, check=False, **options):
        content = render()
        current = FRONTEND_FILE.read_text(encoding="utf-8") if FRONTEND_FILE.exists() else None
        if check:
            if current != content:
                self.stderr.write("choices.generated.js is out of date. Run: python manage.py export_choices")
                raise SystemExit(1)
            self.stdout.write("choices.generated.js is up to date.")
            return
        FRONTEND_FILE.parent.mkdir(parents=True, exist_ok=True)
        FRONTEND_FILE.write_text(content, encoding="utf-8", newline="\n")
        self.stdout.write(self.style.SUCCESS(f"Wrote {FRONTEND_FILE}"))
