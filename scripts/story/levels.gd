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
		_:
			return LevelTest.new()
