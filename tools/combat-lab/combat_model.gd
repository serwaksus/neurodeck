class_name CombatModel
extends RefCounted

# NeuroDeck 2.0 "Crucible" — чистая модель боя (словари зеркалят будущий JS-порт).
# Зафиксированный дизайн: босс-ран из 3 боёв, телеграфы интентов,
# жёсткое наказание (смерть = провал рана), фляги только за осколки.

const BOSSES := {
	"snake": {"stages": [100, 150, 200], "attack": [9, 11, 13], "special": "poison"},
	"demon": {"stages": [120, 180, 250], "attack": [10, 12, 14], "special": "burn"},
	"chimera": {"stages": [90, 130, 175], "attack": [12, 14, 16], "special": "guard"},
}

const FLASK_HEAL := 0.5
const BREATHE_HEAL := 0.6
const FOCUS_MAX_BASE := 2
const GEAR_BONUS := 10

static func level_scale(level: int) -> float:
	var base := 1.0 + float(level - 1) * 0.10
	if level > 10:
		base += float(level - 10) * 0.18
	return base

static func dominant_stat(stats: Dictionary) -> String:
	var best := "str"
	for k in ["str", "end", "int", "cha", "wil", "agi"]:
		if int(stats.get(k, 0)) > int(stats.get(best, 0)):
			best = k
	return best

static func new_state(boss_type: String, stats: Dictionary, ap_total: int, flasks: int, level: int) -> Dictionary:
	var s := float(level_scale(level))
	var b: Dictionary = BOSSES[boss_type]
	var hp0: int = int(round(float(b["stages"][0]) * s))
	return {
		"level": level,
		"hero": {
			"stats": stats, "deck_stat": dominant_stat(stats),
			"max_hp": 80 + int(stats.get("end", 0)) * 2, "hp": 80 + int(stats.get("end", 0)) * 2,
			"ap": ap_total, "flasks": flasks,
			"shield": 0, "focus": 0, "focus_max": FOCUS_MAX_BASE + (1 if dominant_stat(stats) == "int" else 0),
			"flask_used": false, "stance_count": 0, "poison_ticks": 0, "poison_dmg": 0,
		},
		"boss": {"type": boss_type, "stage": 0, "hp": hp0, "max_hp": hp0,
			"rage": 0, "intent": "", "shield": 0, "round": 0},
		"fight": 0, "result": "ongoing", "rounds": 0, "flasks_used": 0,
	}

static func start_fight(st: Dictionary) -> void:
	var h: Dictionary = st["hero"]
	var b: Dictionary = st["boss"]
	b["stage"] = mini(int(st["fight"]), 2)
	if st["fight"] > 0:
		h["hp"] = mini(h["max_hp"], h["hp"] + int(round(float(h["max_hp"]) * BREATHE_HEAL)))
		h["ap"] += 3
	h["shield"] = 0
	h["focus"] = 0
	h["flask_used"] = false
	h["poison_ticks"] = 0
	b["rage"] = 0
	b["shield"] = 0
	b["round"] = 0
	var data: Dictionary = BOSSES[b["type"]]
	var hp0: int = int(round(float(data["stages"][b["stage"]]) * level_scale(_level_of(st))))
	b["hp"] = hp0
	b["max_hp"] = hp0
	b["intent"] = roll_intent(st, true)

static func _level_of(st: Dictionary) -> int:
	return int(st.get("level", 8))

static func roll_intent(st: Dictionary, first: bool, rng: RandomNumberGenerator = null) -> String:
	var b: Dictionary = st["boss"]
	if first:
		return "quick"
	var r := rng.randf() if rng != null else randf()
	var special: String = BOSSES[b["type"]]["special"]
	if b["round"] > 0 and b["round"] % 5 == 0:
		return "special"
	if r < 0.30:
		return "heavy"
	if r < 0.65:
		return "quick"
	if r < 0.80:
		return "enrage"
	return "special" if special != "" else "quick"

static func stance_shield(stats: Dictionary, deck_stat: String) -> int:
	var sh := float(stats.get("wil", 0)) * 1.6 + float(stats.get("end", 0)) * 0.9
	if deck_stat == "end":
		sh *= 1.5
	return int(round(sh))

static func strike_damage(st: Dictionary, rng: RandomNumberGenerator) -> Dictionary:
	var h: Dictionary = st["hero"]
	var s: Dictionary = h["stats"]
	var stacks: int = int(h["focus"])
	var base := 5.0 + float(s.get("str", 0)) * 1.0 + float(GEAR_BONUS) + float(s.get("int", 0)) * 0.5 * stacks
	var crit_p: float = min(0.5, float(s.get("cha", 0)) * 0.02 + 0.05 * stacks)
	var crit_mult := 2.5 if h["deck_stat"] == "cha" else 2.0
	var crit := rng.randf() < crit_p
	var dmg := base * (crit_mult if crit else 1.0)
	if h["deck_stat"] == "agi" and rng.randf() < 0.25:
		dmg *= 2.0
	h["focus"] = 0
	return {"dmg": int(round(dmg)), "crit": crit}

static func hero_action(st: Dictionary, action: String, rng: RandomNumberGenerator) -> Dictionary:
	var h: Dictionary = st["hero"]
	var b: Dictionary = st["boss"]
	var ev := {"action": action, "dmg": 0, "blocked": false}
	match action:
		"strike":
			var hit := strike_damage(st, rng)
			var dmg: int = hit["dmg"]
			if h["deck_stat"] == "str" and b["shield"] > 0:
				b["shield"] -= 1
			if b["shield"] > 0:
				b["shield"] -= 1
				b["hp"] -= int(round(float(dmg) * 0.3))
				ev["blocked"] = true
			else:
				b["hp"] -= dmg
			ev["dmg"] = dmg
			ev["crit"] = hit["crit"]
		"stance":
			var cost := 1
			if h["deck_stat"] == "wil":
				h["stance_count"] += 1
				if h["stance_count"] % 2 == 0:
					cost = 0
			if h["ap"] < cost:
				ev["action"] = "focus"
				return hero_action(st, "focus", rng)
			h["ap"] -= cost
			h["shield"] = stance_shield(h["stats"], h["deck_stat"])
			if int(h["poison_ticks"]) > 0:
				h["poison_ticks"] -= 1
		"focus":
			h["focus"] = mini(int(h["focus"]) + 1, int(h["focus_max"]))
		"flask":
			if h["flasks"] > 0 and not bool(h["flask_used"]):
				h["flasks"] -= 1
				st["flasks_used"] += 1
				h["flask_used"] = true
				h["hp"] = mini(int(h["max_hp"]), int(h["hp"]) + int(round(float(h["max_hp"]) * FLASK_HEAL)))
	return ev

static func boss_turn(st: Dictionary, rng: RandomNumberGenerator) -> Dictionary:
	var h: Dictionary = st["hero"]
	var b: Dictionary = st["boss"]
	var ev := {"intent": b["intent"], "dmg": 0, "shield_broken": false}
	var data: Dictionary = BOSSES[b["type"]]
	var base := float(data["attack"][b["stage"]]) + float(b["rage"]) * 2.0
	match b["intent"]:
		"heavy":
			_apply_hit(st, ev, base * 1.6, false)
		"quick":
			_apply_hit(st, ev, base * 0.9, false)
		"enrage":
			b["rage"] = int(b["rage"]) + 2
		"special":
			match data["special"]:
				"burn":
					_apply_hit(st, ev, 4.0 + float(b["stage"]), true)
				"guard":
					b["shield"] = 2
				"poison":
					h["poison_ticks"] = 3
					h["poison_dmg"] = 2 + int(b["stage"])
	b["round"] = int(b["round"]) + 1
	b["rage"] = maxi(0, int(b["rage"]) - 1)
	if int(h["poison_ticks"]) > 0:
		h["poison_ticks"] -= 1
		h["hp"] -= int(h["poison_dmg"])
	b["intent"] = roll_intent(st, false, rng)
	if int(b["hp"]) <= 0:
		ev["boss_down"] = true
	elif int(h["hp"]) <= 0:
		ev["hero_down"] = true
	return ev

static func _apply_hit(st: Dictionary, ev: Dictionary, raw: float, ignore_shield: bool) -> void:
	var h: Dictionary = st["hero"]
	var dmg := int(round(raw))
	if not ignore_shield and int(h["shield"]) > 0:
		if int(h["shield"]) >= dmg:
			h["shield"] -= dmg
			var s: Dictionary = h["stats"]
			var reflect := int(round(float(s.get("agi", 0)) * 0.4))
			st["boss"]["hp"] -= reflect
			ev["dmg"] = dmg
			ev["blocked"] = true
			return
		dmg -= int(h["shield"])
		h["shield"] = 0
		ev["shield_broken"] = true
	h["hp"] -= dmg
	ev["dmg"] = dmg
