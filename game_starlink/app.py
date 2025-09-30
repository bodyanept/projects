from flask import Flask, render_template, request, jsonify
import json
import os

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


# Simple JSON file storage for leaderboard
SCORES_FILE = os.path.join(app.root_path, "scores.json")


def load_scores():
    if not os.path.exists(SCORES_FILE):
        return []
    try:
        with open(SCORES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            return []
    except Exception:
        return []


def save_scores(items):
    tmp = SCORES_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    os.replace(tmp, SCORES_FILE)


@app.get("/api/leaderboard")
def api_leaderboard():
    scores = load_scores()
    # Sort by score desc, then date desc
    scores.sort(key=lambda x: (float(x.get("score_mb", 0)), x.get("ts", "")), reverse=True)
    top = scores[:20]
    return jsonify({"items": top})


@app.post("/api/score")
def api_score():
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"ok": False, "error": "invalid_json"}), 400

    name = (payload.get("name") or "").strip()
    try:
        score_mb = float(payload.get("score_mb", 0))
    except Exception:
        score_mb = 0.0
    mode = (payload.get("mode") or "").strip() or "timed"
    ts = payload.get("ts") or ""

    if not name or len(name) > 40:
        return jsonify({"ok": False, "error": "bad_name"}), 400
    if score_mb < 0:
        return jsonify({"ok": False, "error": "bad_score"}), 400

    scores = load_scores()
    scores.append({
        "name": name,
        "score_mb": round(score_mb, 3),
        "mode": mode,
        "ts": ts,
    })
    save_scores(scores)
    return jsonify({"ok": True})


if __name__ == "__main__":
    # Запустить локальный сервер
    app.run(host="127.0.0.1", port=5000, debug=True)
