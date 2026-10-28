"""또래 비교용 판정 비율(app/seed/peer_stats.json)이 원자료 CSV에서 그대로 다시 만들어지는지 본다."""
import json
from pathlib import Path

from app import reference as ref
from scripts import make_peer_stats

SEED = Path(__file__).resolve().parent.parent / "app" / "seed"


def test_peer_stats_match_source_csv(tmp_path):
    out = tmp_path / "peer_stats.json"
    make_peer_stats.main(str(SEED / "source" / "nhis_checkup_judgment_2022_2023.csv"), str(out))
    assert json.loads(out.read_text(encoding="utf-8")) == json.loads((SEED / "peer_stats.json").read_text(encoding="utf-8"))


def test_peer_stats_use_checkup_groups():
    stats = json.loads((SEED / "peer_stats.json").read_text(encoding="utf-8"))
    groups = {item["group"] for item in ref.CHECKUP_ITEMS.values()}
    for sex in ("M", "F"):
        assert len(stats["bands"][sex]) == 15
        for band in stats["bands"][sex].values():
            assert set(band["groups"]) == groups
            assert 0 <= band["normalA"] <= 100 and 0 <= band["anyCaution"] <= 100
