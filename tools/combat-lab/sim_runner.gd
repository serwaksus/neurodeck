extends SceneTree

const CombatModel = preload("res://combat_model.gd")

const RUNS := 400

func _init() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 20260825
	print("boss,level,ap,strategy,runs,win_rate,avg_rounds,avg_ap_left,avg_hp_pct,avg_flasks_used")
	for boss_type in CombatModel.BOSSES.keys():
		for level in [3, 8, 15]:
			for ap_total in [20, 28, 35]:
				for strat in ["tactical", "greedy", "turtle"]:
					_run_config(boss_type, level, ap_total, strat, RUNS, rng)
	for boss_type in CombatModel.BOSSES.keys():
		for level in [8, 15]:
			for deck in ["end", "int", "cha", "wil", "agi"]:
				var stats := _stats_for_level(level)
				stats[deck] = int(stats["str"]) + 2
				_run_config_stats(boss_type, level, 28, "tac-" + deck, RUNS, stats, rng)
	quit(0)

func _stats_for_level(level: int) -> Dictionary:
	if level <= 3:
		return {"str": 6, "end": 5, "int": 4, "cha": 4, "wil": 4, "agi": 4}
	if level <= 8:
		return {"str": 10, "end": 9, "int": 8, "cha": 7, "wil": 7, "agi": 6}
	return {"str": 18, "end": 16, "int": 14, "cha": 12, "wil": 12, "agi": 10}

func _run_config(boss_type: String, level: int, ap_total: int, strat: String, runs: int, rng: RandomNumberGenerator) -> void:
	_run_config_stats(boss_type, level, ap_total, strat, runs, _stats_for_level(level), rng)

func _run_config_stats(boss_type: String, level: int, ap_total: int, strat: String, runs: int, stats: Dictionary, rng: RandomNumberGenerator) -> void:
	var wins := 0
	var rounds_sum := 0
	var ap_left_sum := 0
	var hp_pct_sum := 0.0
	var flasks_sum := 0
	for i in runs:
		var st := CombatModel.new_state(boss_type, stats, ap_total, 2, level)
		_sim_run(st, strat, rng)
		rounds_sum += int(st["rounds"])
		ap_left_sum += int(st["hero"]["ap"])
		hp_pct_sum += float(st["hero"]["hp"]) / float(st["hero"]["max_hp"]) * 100.0
		flasks_sum += int(st["flasks_used"])
		if st["result"] == "win":
			wins += 1
	print("%s,%d,%d,%s,%d,%.3f,%.1f,%.1f,%.1f,%.2f" % [
		boss_type, level, ap_total, strat, runs,
		float(wins) / runs, float(rounds_sum) / runs, float(ap_left_sum) / runs,
		hp_pct_sum / runs, float(flasks_sum) / runs])

func _sim_run(st: Dictionary, strat: String, rng: RandomNumberGenerator) -> void:
	CombatModel.start_fight(st)
	var guard := 0
	while guard < 500 and st["result"] == "ongoing":
		guard += 1
		var action := _decide(strat, st, rng)
		CombatModel.hero_action(st, action, rng)
		if _resolve_fight_end(st):
			continue
		CombatModel.boss_turn(st, rng)
		st["rounds"] = int(st["rounds"]) + 1
		if int(st["hero"]["hp"]) <= 0:
			st["result"] = "loss"
			return
		if _resolve_fight_end(st):
			continue

func _resolve_fight_end(st: Dictionary) -> bool:
	if int(st["boss"]["hp"]) > 0:
		return false
	st["fight"] = int(st["fight"]) + 1
	if int(st["fight"]) >= 3:
		st["result"] = "win"
	else:
		CombatModel.start_fight(st)
	return true

func _decide(strat: String, st: Dictionary, rng: RandomNumberGenerator) -> String:
	var h: Dictionary = st["hero"]
	var b: Dictionary = st["boss"]
	var hp_pct := float(h["hp"]) / float(h["max_hp"])
	var incoming := _expected_incoming(st)
	match strat:
		"greedy":
			if hp_pct < 0.2 and int(h["flasks"]) > 0 and not bool(h["flask_used"]):
				return "flask"
			return "strike"
		"turtle":
			if hp_pct < 0.5 and int(h["flasks"]) > 0 and not bool(h["flask_used"]):
				return "flask"
			if int(h["ap"]) >= 1 and (b["intent"] == "heavy" or int(h["shield"]) == 0):
				return "stance"
			return "strike"
		_:
			if hp_pct < 0.35 and int(h["flasks"]) > 0 and not bool(h["flask_used"]):
				return "flask"
			if b["intent"] == "heavy" and int(h["ap"]) >= 1 and _stance_shield(st) >= incoming * 0.5:
				return "stance"
			if int(h["focus"]) < int(h["focus_max"]) and rng.randf() < 0.35:
				return "focus"
			return "strike"

func _stance_shield(st: Dictionary) -> float:
	return float(CombatModel.stance_shield(st["hero"]["stats"], st["hero"]["deck_stat"]))

func _expected_incoming(st: Dictionary) -> float:
	var b: Dictionary = st["boss"]
	var base := float(CombatModel.BOSSES[b["type"]]["attack"][b["stage"]]) + float(b["rage"]) * 2.0
	return base * (1.6 if b["intent"] == "heavy" else 0.9)
