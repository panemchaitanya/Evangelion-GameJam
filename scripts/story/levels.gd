class_name Levels
extends RefCounted

static func create(id: String) -> Level:
	match id:
		"test":
			return LevelTest.new()
		"act1":
			return LevelAct1.new()
		"act2_gate":
			return LevelAct2Gate.new()
		"act2_day2":
			return LevelDay2.new()
		"act2_night2":
			return LevelNight2.new()
		"finale":
			return LevelFinale.new()
		"credits":
			return LevelCredits.new()
		"title":
			var t := LevelCredits.new()
			t.title_mode = true
			return t
		_:
			return LevelTest.new()
