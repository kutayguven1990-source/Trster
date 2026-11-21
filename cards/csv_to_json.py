"""songs.csv -> ../songs.json (kartsız oyunun şarkı listesi)."""
import csv, json, pathlib
here = pathlib.Path(__file__).parent
rows = list(csv.DictReader(open(here / "songs.csv", encoding="utf-8")))
out = [{"artist": r["artist"], "title": r["title"], "year": int(r["year"]), "spotify_id": r["spotify_id"]} for r in rows]
(here.parent / "songs.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(len(out), "şarkı -> songs.json")
